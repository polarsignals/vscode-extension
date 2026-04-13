import {describe, it, expect} from 'vitest';
import {tableFromArrays, tableToIPC} from 'apache-arrow';
import {
  parseSourceArrow,
  getUniqueFilenames,
  filterByFilename,
} from '../../converters/source-arrow-converter';

function buildArrow(
  rows: {filename: string; line_number: bigint; cumulative: bigint; flat: bigint}[],
): Uint8Array {
  return tableToIPC(
    tableFromArrays({
      filename: rows.map(r => r.filename),
      line_number: BigInt64Array.from(rows.map(r => r.line_number)),
      cumulative: BigInt64Array.from(rows.map(r => r.cumulative)),
      flat: BigInt64Array.from(rows.map(r => r.flat)),
    }),
  );
}

describe('parseSourceArrow', () => {
  it('parses rows with profiling data', () => {
    const data = buildArrow([
      {filename: 'main.go', line_number: 10n, cumulative: 500n, flat: 200n},
      {filename: 'main.go', line_number: 25n, cumulative: 300n, flat: 0n},
    ]);
    const result = parseSourceArrow(data);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({filename: 'main.go', lineNumber: 10, cumulative: 500, flat: 200});
    expect(result[1]).toEqual({filename: 'main.go', lineNumber: 25, cumulative: 300, flat: 0});
  });

  it('filters out rows with zero cumulative and flat', () => {
    const data = buildArrow([
      {filename: 'main.go', line_number: 10n, cumulative: 100n, flat: 0n},
      {filename: 'main.go', line_number: 20n, cumulative: 0n, flat: 0n},
      {filename: 'main.go', line_number: 30n, cumulative: 0n, flat: 50n},
    ]);
    const result = parseSourceArrow(data);
    expect(result).toHaveLength(2);
    expect(result[0].lineNumber).toBe(10);
    expect(result[1].lineNumber).toBe(30);
  });

  it('filters out rows with line_number 0', () => {
    const data = buildArrow([
      {filename: 'main.go', line_number: 0n, cumulative: 1000n, flat: 500n},
      {filename: 'main.go', line_number: 5n, cumulative: 100n, flat: 50n},
    ]);
    const result = parseSourceArrow(data);
    expect(result).toHaveLength(1);
    expect(result[0].lineNumber).toBe(5);
  });

  it('handles multiple filenames', () => {
    const data = buildArrow([
      {filename: 'a.go', line_number: 1n, cumulative: 10n, flat: 5n},
      {filename: 'b.go', line_number: 2n, cumulative: 20n, flat: 10n},
    ]);
    const result = parseSourceArrow(data);
    expect(result).toHaveLength(2);
    expect(result[0].filename).toBe('a.go');
    expect(result[1].filename).toBe('b.go');
  });

  it('returns empty array for empty Arrow table', () => {
    const data = buildArrow([]);
    const result = parseSourceArrow(data);
    expect(result).toEqual([]);
  });
});

describe('getUniqueFilenames', () => {
  it('returns unique filenames', () => {
    const lines = [
      {filename: 'a.go', lineNumber: 1, cumulative: 10, flat: 5},
      {filename: 'b.go', lineNumber: 2, cumulative: 20, flat: 10},
      {filename: 'a.go', lineNumber: 3, cumulative: 30, flat: 15},
    ];
    expect(getUniqueFilenames(lines)).toEqual(['a.go', 'b.go']);
  });

  it('returns empty array for empty input', () => {
    expect(getUniqueFilenames([])).toEqual([]);
  });

  it('returns single element for all-same filenames', () => {
    const lines = [
      {filename: 'main.go', lineNumber: 1, cumulative: 10, flat: 5},
      {filename: 'main.go', lineNumber: 2, cumulative: 20, flat: 10},
    ];
    expect(getUniqueFilenames(lines)).toEqual(['main.go']);
  });
});

describe('filterByFilename', () => {
  const lines = [
    {filename: 'src/pkg/handler.go', lineNumber: 1, cumulative: 10, flat: 5},
    {filename: 'src/main.go', lineNumber: 2, cumulative: 20, flat: 10},
    {filename: 'src/pkg/handler.go', lineNumber: 3, cumulative: 30, flat: 15},
  ];

  it('filters by exact match', () => {
    const result = filterByFilename(lines, 'src/pkg/handler.go');
    expect(result).toHaveLength(2);
    expect(result.every(r => r.filename === 'src/pkg/handler.go')).toBe(true);
  });

  it('matches by suffix (target ends with filter)', () => {
    const result = filterByFilename(lines, 'handler.go');
    expect(result).toHaveLength(2);
  });

  it('matches by suffix (filter ends with target)', () => {
    const result = filterByFilename(lines, 'pkg/handler.go');
    expect(result).toHaveLength(2);
  });

  it('returns empty for no matches', () => {
    expect(filterByFilename(lines, 'other.go')).toEqual([]);
  });
});
