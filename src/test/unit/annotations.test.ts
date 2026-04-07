import {describe, it, expect} from 'vitest';
import {formatValue, getHeatLevel} from '../../annotations/profiling-annotations';

describe('formatValue', () => {
  describe('nanoseconds', () => {
    it('formats zero', () => {
      expect(formatValue(0, 'nanoseconds')).toBe('0');
    });

    it('formats nanoseconds', () => {
      expect(formatValue(500, 'nanoseconds')).toBe('500ns');
    });

    it('formats microseconds', () => {
      expect(formatValue(5000, 'nanoseconds')).toBe('5µs');
    });

    it('formats milliseconds', () => {
      expect(formatValue(5_000_000, 'nanoseconds')).toBe('5ms');
    });

    it('formats seconds', () => {
      expect(formatValue(2_500_000_000, 'nanoseconds')).toBe('2.5s');
    });

    it('strips trailing zeros', () => {
      expect(formatValue(1_000_000_000, 'nanoseconds')).toBe('1s');
    });
  });

  describe('bytes', () => {
    it('formats bytes', () => {
      expect(formatValue(500, 'bytes')).toBe('500B');
    });

    it('formats kilobytes', () => {
      expect(formatValue(5000, 'bytes')).toBe('5kB');
    });

    it('formats megabytes', () => {
      expect(formatValue(5_000_000, 'bytes')).toBe('5MB');
    });

    it('formats gigabytes', () => {
      expect(formatValue(2_500_000_000, 'bytes')).toBe('2.5GB');
    });
  });

  describe('count', () => {
    it('formats small counts', () => {
      expect(formatValue(42, 'count')).toBe('42');
    });

    it('formats thousands', () => {
      expect(formatValue(5000, 'count')).toBe('5k');
    });

    it('formats millions', () => {
      expect(formatValue(2_500_000, 'count')).toBe('2.5M');
    });
  });

  describe('options', () => {
    it('adds space when tight=false', () => {
      expect(formatValue(5_000_000, 'nanoseconds', false)).toBe('5 ms');
    });

    it('respects digits parameter', () => {
      expect(formatValue(2_567_000_000, 'nanoseconds', true, 2)).toBe('2.57s');
    });
  });

  describe('unknown unit', () => {
    it('falls back to count format', () => {
      expect(formatValue(5000, 'unknown_unit')).toBe('5k');
    });
  });
});

describe('getHeatLevel', () => {
  it('returns hot for intensity > 0.7', () => {
    expect(getHeatLevel(0.8)).toBe('hot');
    expect(getHeatLevel(1.0)).toBe('hot');
    expect(getHeatLevel(0.71)).toBe('hot');
  });

  it('returns warm for intensity > 0.4 and <= 0.7', () => {
    expect(getHeatLevel(0.5)).toBe('warm');
    expect(getHeatLevel(0.7)).toBe('warm');
    expect(getHeatLevel(0.41)).toBe('warm');
  });

  it('returns mild for intensity > 0.1 and <= 0.4', () => {
    expect(getHeatLevel(0.2)).toBe('mild');
    expect(getHeatLevel(0.4)).toBe('mild');
    expect(getHeatLevel(0.11)).toBe('mild');
  });

  it('returns cool for intensity <= 0.1', () => {
    expect(getHeatLevel(0.1)).toBe('cool');
    expect(getHeatLevel(0.05)).toBe('cool');
    expect(getHeatLevel(0)).toBe('cool');
  });
});
