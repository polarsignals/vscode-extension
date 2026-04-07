import {describe, it, expect} from 'vitest';
import {encodeFilters, decodeFilters, filterToDisplayString} from '../../filters/filter-encoding';
import type {ProfileFilter} from '../../filters/filter-types';

describe('encodeFilters', () => {
  it('returns empty string for empty array', () => {
    expect(encodeFilters([])).toBe('');
  });

  it('encodes a stack filter', () => {
    const filters: ProfileFilter[] = [
      {id: '1', type: 'stack', field: 'function_name', matchType: 'contains', value: 'myFunc'},
    ];
    expect(encodeFilters(filters)).toBe('s:fn:~:myFunc');
  });

  it('encodes a frame filter', () => {
    const filters: ProfileFilter[] = [
      {id: '1', type: 'frame', field: 'binary', matchType: 'not_equal', value: 'libc.so'},
    ];
    expect(encodeFilters(filters)).toBe('f:b:!=:libc.so');
  });

  it('encodes multiple filters separated by commas', () => {
    const filters: ProfileFilter[] = [
      {id: '1', type: 'stack', field: 'function_name', matchType: 'equal', value: 'main'},
      {id: '2', type: 'frame', field: 'binary', matchType: 'not_contains', value: 'libc'},
    ];
    const encoded = encodeFilters(filters);
    expect(encoded).toBe('s:fn:=:main,f:b:!~:libc');
  });

  it('encodes preset filters', () => {
    const filters: ProfileFilter[] = [
      {id: '1', type: 'go_runtime_expected_off_cpu', value: 'enabled'},
    ];
    expect(encodeFilters(filters)).toBe('p:go_runtime_expected_off_cpu:enabled');
  });

  it('URI-encodes special characters in values', () => {
    const filters: ProfileFilter[] = [
      {id: '1', type: 'stack', field: 'function_name', matchType: 'equal', value: 'foo bar'},
    ];
    expect(encodeFilters(filters)).toBe('s:fn:=:foo%20bar');
  });

  it('skips filters with empty value', () => {
    const filters: ProfileFilter[] = [
      {id: '1', type: 'stack', field: 'function_name', matchType: 'equal', value: ''},
      {id: '2', type: 'frame', field: 'binary', matchType: 'equal', value: 'test'},
    ];
    expect(encodeFilters(filters)).toBe('f:b:=:test');
  });

  it('encodes all match types', () => {
    const matchTypes = [
      {matchType: 'equal' as const, symbol: '='},
      {matchType: 'not_equal' as const, symbol: '!='},
      {matchType: 'contains' as const, symbol: '~'},
      {matchType: 'not_contains' as const, symbol: '!~'},
      {matchType: 'starts_with' as const, symbol: '^'},
      {matchType: 'not_starts_with' as const, symbol: '!^'},
    ];

    for (const {matchType, symbol} of matchTypes) {
      const filters: ProfileFilter[] = [
        {id: '1', type: 'stack', field: 'function_name', matchType, value: 'x'},
      ];
      expect(encodeFilters(filters)).toBe(`s:fn:${symbol}:x`);
    }
  });

  it('encodes all field types', () => {
    const fields = [
      {field: 'function_name' as const, code: 'fn'},
      {field: 'binary' as const, code: 'b'},
      {field: 'system_name' as const, code: 'sn'},
      {field: 'filename' as const, code: 'f'},
      {field: 'address' as const, code: 'a'},
      {field: 'line_number' as const, code: 'ln'},
    ];

    for (const {field, code} of fields) {
      const filters: ProfileFilter[] = [
        {id: '1', type: 'frame', field, matchType: 'equal', value: 'x'},
      ];
      expect(encodeFilters(filters)).toBe(`f:${code}:=:x`);
    }
  });
});

describe('decodeFilters', () => {
  it('returns empty array for empty string', () => {
    expect(decodeFilters('')).toEqual([]);
  });

  it('decodes a stack filter', () => {
    const decoded = decodeFilters('s:fn:~:myFunc');
    expect(decoded).toHaveLength(1);
    expect(decoded[0].type).toBe('stack');
    expect(decoded[0].field).toBe('function_name');
    expect(decoded[0].matchType).toBe('contains');
    expect(decoded[0].value).toBe('myFunc');
  });

  it('decodes a frame filter', () => {
    const decoded = decodeFilters('f:b:!=:libc.so');
    expect(decoded).toHaveLength(1);
    expect(decoded[0].type).toBe('frame');
    expect(decoded[0].field).toBe('binary');
    expect(decoded[0].matchType).toBe('not_equal');
    expect(decoded[0].value).toBe('libc.so');
  });

  it('decodes preset filters', () => {
    const decoded = decodeFilters('p:go_runtime_expected_off_cpu:enabled');
    expect(decoded).toHaveLength(1);
    expect(decoded[0].type).toBe('go_runtime_expected_off_cpu');
    expect(decoded[0].value).toBe('enabled');
  });

  it('decodes URI-encoded values', () => {
    const decoded = decodeFilters('s:fn:=:foo%20bar');
    expect(decoded).toHaveLength(1);
    expect(decoded[0].value).toBe('foo bar');
  });

  it('handles invalid input gracefully', () => {
    expect(decodeFilters('invalid')).toEqual([]);
    expect(decodeFilters('x:y')).toEqual([]);
  });

  it('decodes multiple filters', () => {
    const decoded = decodeFilters('s:fn:=:main,f:b:!=:libc');
    expect(decoded).toHaveLength(2);
    expect(decoded[0].type).toBe('stack');
    expect(decoded[1].type).toBe('frame');
  });
});

describe('encodeFilters / decodeFilters roundtrip', () => {
  it('roundtrips stack filters', () => {
    const original: ProfileFilter[] = [
      {id: '1', type: 'stack', field: 'function_name', matchType: 'contains', value: 'myFunc'},
    ];
    const decoded = decodeFilters(encodeFilters(original));
    expect(decoded[0].type).toBe(original[0].type);
    expect(decoded[0].field).toBe(original[0].field);
    expect(decoded[0].matchType).toBe(original[0].matchType);
    expect(decoded[0].value).toBe(original[0].value);
  });

  it('roundtrips filters with special characters', () => {
    const original: ProfileFilter[] = [
      {
        id: '1',
        type: 'stack',
        field: 'function_name',
        matchType: 'equal',
        value: 'std::panic::catch_unwind',
      },
    ];
    const decoded = decodeFilters(encodeFilters(original));
    expect(decoded[0].value).toBe('std::panic::catch_unwind');
  });
});

describe('filterToDisplayString', () => {
  it('formats stack filter', () => {
    const filter: ProfileFilter = {
      id: '1',
      type: 'stack',
      field: 'function_name',
      matchType: 'contains',
      value: 'myFunc',
    };
    expect(filterToDisplayString(filter)).toBe('Stack function contains "myFunc"');
  });

  it('formats frame filter', () => {
    const filter: ProfileFilter = {
      id: '1',
      type: 'frame',
      field: 'binary',
      matchType: 'not_equal',
      value: 'libc.so',
    };
    expect(filterToDisplayString(filter)).toBe('Frame binary != "libc.so"');
  });

  it('formats preset filter', () => {
    const filter: ProfileFilter = {
      id: '1',
      type: 'go_runtime_expected_off_cpu',
      value: 'enabled',
    };
    expect(filterToDisplayString(filter)).toBe('Preset: go_runtime_expected_off_cpu');
  });
});
