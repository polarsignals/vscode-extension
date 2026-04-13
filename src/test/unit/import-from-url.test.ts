import {describe, it, expect} from 'vitest';
import {
  parsePolarSignalsUrl,
  parseExpression,
  parseTimeSelection,
  computeTimeRange,
} from '../../commands/import-from-url';

describe('parseExpression', () => {
  it('parses profile type without labels', () => {
    const result = parseExpression('parca_agent:samples:count:cpu:nanoseconds:delta');
    expect(result.profileType).toBe('parca_agent:samples:count:cpu:nanoseconds:delta');
    expect(result.labelMatchers).toEqual({});
  });

  it('parses profile type with empty braces', () => {
    const result = parseExpression('parca_agent:samples:count:cpu:nanoseconds:delta{}');
    expect(result.profileType).toBe('parca_agent:samples:count:cpu:nanoseconds:delta');
    expect(result.labelMatchers).toEqual({});
  });

  it('parses profile type with single label', () => {
    const result = parseExpression('parca_agent:samples:count:cpu:nanoseconds:delta{comm="api"}');
    expect(result.profileType).toBe('parca_agent:samples:count:cpu:nanoseconds:delta');
    expect(result.labelMatchers).toEqual({comm: 'api'});
  });

  it('parses profile type with multiple labels', () => {
    const result = parseExpression(
      'parca_agent:samples:count:cpu:nanoseconds:delta{namespace="prod",pod="api-abc"}',
    );
    expect(result.profileType).toBe('parca_agent:samples:count:cpu:nanoseconds:delta');
    expect(result.labelMatchers).toEqual({namespace: 'prod', pod: 'api-abc'});
  });

  it('handles spaces around equals', () => {
    const result = parseExpression('parca_agent:samples:count:cpu:nanoseconds:delta{comm = "api"}');
    expect(result.labelMatchers).toEqual({comm: 'api'});
  });

  it('returns full string as profileType when no braces', () => {
    const result = parseExpression('memory:alloc_space:bytes:space:bytes');
    expect(result.profileType).toBe('memory:alloc_space:bytes:space:bytes');
  });
});

describe('parseTimeSelection', () => {
  it('parses relative minutes', () => {
    expect(parseTimeSelection('relative:minute|15')).toBe('15m');
  });

  it('parses relative hours', () => {
    expect(parseTimeSelection('relative:hour|1')).toBe('1h');
  });

  it('parses relative days', () => {
    expect(parseTimeSelection('relative:day|7')).toBe('7d');
  });

  it('defaults to 15m for unknown unit', () => {
    expect(parseTimeSelection('relative:week|1')).toBe('15m');
  });

  it('defaults to 15m for absolute time selections', () => {
    expect(parseTimeSelection('absolute:1234567890')).toBe('15m');
  });

  it('defaults value to 15 when not provided', () => {
    expect(parseTimeSelection('relative:minute')).toBe('15m');
  });
});

describe('computeTimeRange', () => {
  it('returns 5m for durations <= 5 minutes', () => {
    expect(computeTimeRange(3 * 60000)).toBe('5m');
  });

  it('returns 15m for durations <= 15 minutes', () => {
    expect(computeTimeRange(10 * 60000)).toBe('15m');
  });

  it('returns 1h for durations <= 60 minutes', () => {
    expect(computeTimeRange(45 * 60000)).toBe('1h');
  });

  it('returns 24h for durations <= 24 hours', () => {
    expect(computeTimeRange(12 * 60 * 60000)).toBe('24h');
  });

  it('returns 7d for durations <= 7 days', () => {
    expect(computeTimeRange(5 * 24 * 60 * 60000)).toBe('7d');
  });

  it('returns 30d for durations > 7 days', () => {
    expect(computeTimeRange(14 * 24 * 60 * 60000)).toBe('30d');
  });
});

describe('parsePolarSignalsUrl', () => {
  it('parses expression_a parameter', () => {
    const url =
      'https://app.polarsignals.com/?expression_a=parca_agent:samples:count:cpu:nanoseconds:delta{comm="api"}';
    const result = parsePolarSignalsUrl(url);
    expect(result.profileType).toBe('parca_agent:samples:count:cpu:nanoseconds:delta');
    expect(result.labelMatchers).toEqual({comm: 'api'});
  });

  it('parses time_selection_a parameter', () => {
    const url = 'https://app.polarsignals.com/?expression_a=cpu:x&time_selection_a=relative:hour|1';
    const result = parsePolarSignalsUrl(url);
    expect(result.timeRange).toBe('1h');
  });

  it('falls back to expression parameter when expression_a missing', () => {
    const url =
      'https://app.polarsignals.com/?expression=memory:alloc_space:bytes:space:bytes{namespace="prod"}';
    const result = parsePolarSignalsUrl(url);
    expect(result.profileType).toBe('memory:alloc_space:bytes:space:bytes');
    expect(result.labelMatchers).toEqual({namespace: 'prod'});
  });

  it('computes time range from from/to when no time_selection', () => {
    const now = Date.now();
    const url = `https://app.polarsignals.com/?expression_a=cpu:x&from_a=${now - 3600000}&to_a=${now}`;
    const result = parsePolarSignalsUrl(url);
    expect(result.timeRange).toBe('1h');
  });

  it('parses source_filename parameter', () => {
    const url = 'https://app.polarsignals.com/?expression_a=cpu:x&source_filename=src/main.go';
    const result = parsePolarSignalsUrl(url);
    expect(result.sourceFilename).toBe('src/main.go');
  });

  it('parses profile_filters parameter', () => {
    // Filter format: s=stack, fn=function_name, ~=contains
    const url = 'https://app.polarsignals.com/?expression_a=cpu:x&profile_filters=s:fn:~:main';
    const result = parsePolarSignalsUrl(url);
    expect(result.profileFilters.length).toBe(1);
    expect(result.profileFilters[0].type).toBe('stack');
    expect(result.profileFilters[0].field).toBe('function_name');
    expect(result.profileFilters[0].matchType).toBe('contains');
    expect(result.profileFilters[0].value).toBe('main');
  });

  it('returns empty labelMatchers when no expression', () => {
    const url = 'https://app.polarsignals.com/?other=1';
    const result = parsePolarSignalsUrl(url);
    expect(result.labelMatchers).toEqual({});
    expect(result.profileType).toBeUndefined();
  });
});
