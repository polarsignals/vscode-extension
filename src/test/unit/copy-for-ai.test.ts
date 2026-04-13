import {describe, it, expect} from 'vitest';
import {
  getHumanReadableProfileType,
  formatTimeRange,
  formatValue,
  formatPercentage,
} from '../../commands/copy-for-ai';

describe('getHumanReadableProfileType', () => {
  it('returns well-known name for exact match', () => {
    expect(getHumanReadableProfileType('parca_agent:samples:count:cpu:nanoseconds:delta')).toBe(
      'On-CPU',
    );
  });

  it('returns well-known name for off-cpu', () => {
    expect(
      getHumanReadableProfileType('parca_agent:wallclock:nanoseconds:samples:count:delta'),
    ).toBe('Off-CPU');
  });

  it('returns well-known name for memory', () => {
    expect(getHumanReadableProfileType('memory:alloc_space:bytes:space:bytes')).toBe(
      'Memory Allocations (bytes)',
    );
  });

  it('falls back to flexible matching for unknown prefix', () => {
    // The normalized form 'samples:count:cpu:nanoseconds' matches 'Process CPU Samples' first
    // in the wellKnownProfiles map iteration order
    const result = getHumanReadableProfileType('custom_agent:samples:count:cpu:nanoseconds:delta');
    expect(result).not.toBe('custom_agent:samples:count:cpu:nanoseconds:delta');
    expect(typeof result).toBe('string');
  });

  it('returns raw string when no match found', () => {
    expect(getHumanReadableProfileType('totally:unknown:type')).toBe('totally:unknown:type');
  });
});

describe('formatTimeRange', () => {
  it('formats relative string', () => {
    expect(formatTimeRange('15m')).toBe('last 15m');
    expect(formatTimeRange('1h')).toBe('last 1h');
    expect(formatTimeRange('24h')).toBe('last 24h');
  });

  it('formats absolute time range', () => {
    const result = formatTimeRange({from: 1700000000000, to: 1700003600000});
    expect(result).toContain('to');
    expect(result).toContain('T');
  });
});

describe('formatValue', () => {
  it('returns 0 for zero', () => {
    expect(formatValue(0, 'nanoseconds')).toBe('0');
  });

  it('formats nanoseconds in seconds', () => {
    expect(formatValue(2_500_000_000, 'nanoseconds')).toBe('2.50s');
  });

  it('formats nanoseconds in milliseconds', () => {
    expect(formatValue(1_500_000, 'nanoseconds')).toBe('1.50ms');
  });

  it('formats nanoseconds in microseconds', () => {
    expect(formatValue(1_500, 'nanoseconds')).toBe('1.50µs');
  });

  it('formats nanoseconds in nanoseconds', () => {
    expect(formatValue(500, 'nanoseconds')).toBe('500.00ns');
  });

  it('formats bytes in GB', () => {
    expect(formatValue(2_000_000_000, 'bytes')).toBe('2.00GB');
  });

  it('formats bytes in MB', () => {
    expect(formatValue(5_000_000, 'bytes')).toBe('5.00MB');
  });

  it('formats bytes in kB', () => {
    expect(formatValue(4_000, 'bytes')).toBe('4.00kB');
  });

  it('formats small bytes', () => {
    expect(formatValue(100, 'bytes')).toBe('100.00B');
  });

  it('uses count format for unknown unit', () => {
    expect(formatValue(5_000_000, 'objects')).toBe('5.00M');
  });

  it('uses count format for count unit', () => {
    expect(formatValue(1_500, 'count')).toBe('1.50k');
  });
});

describe('formatPercentage', () => {
  it('formats percentage of total + filtered', () => {
    expect(formatPercentage(100, 500n, 500n)).toBe('10.0%');
  });

  it('returns empty string when denominator is 0', () => {
    expect(formatPercentage(100, 0n, 0n)).toBe('');
  });

  it('handles large values', () => {
    expect(formatPercentage(50000, 100000n, 0n)).toBe('50.0%');
  });

  it('handles small fractions', () => {
    expect(formatPercentage(1, 10000n, 0n)).toBe('0.0%');
  });
});
