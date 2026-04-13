import {tableFromArrays, tableToIPC} from 'apache-arrow';

export interface FixtureLine {
  filename: string;
  lineNumber: bigint;
  cumulative: bigint;
  flat: bigint;
}

const DEFAULT_LINES: FixtureLine[] = [
  {filename: 'src/main.go', lineNumber: 10n, cumulative: 500n, flat: 200n},
  {filename: 'src/main.go', lineNumber: 25n, cumulative: 300n, flat: 150n},
  {filename: 'src/main.go', lineNumber: 42n, cumulative: 100n, flat: 80n},
];

/**
 * Build a valid Arrow IPC buffer matching the Parca SOURCE report schema.
 * Columns: filename (utf8), line_number (int64), cumulative (int64), flat (int64).
 */
export function buildArrowFixture(lines: FixtureLine[] = DEFAULT_LINES): Uint8Array {
  const table = tableFromArrays({
    filename: lines.map(l => l.filename),
    line_number: BigInt64Array.from(lines.map(l => l.lineNumber)),
    cumulative: BigInt64Array.from(lines.map(l => l.cumulative)),
    flat: BigInt64Array.from(lines.map(l => l.flat)),
  });

  return tableToIPC(table);
}
