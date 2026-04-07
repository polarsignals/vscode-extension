import {describe, it, expect} from 'vitest';
import {isSameQueryConfig} from '../../state/session-store';

describe('isSameQueryConfig', () => {
  it('returns true for identical configs', () => {
    const a = {
      profileType: 'parca_agent:samples:count:cpu:nanoseconds:delta',
      timeRange: '15m' as const,
      labelMatchers: {namespace: 'prod'},
    };
    const b = {
      profileType: 'parca_agent:samples:count:cpu:nanoseconds:delta',
      timeRange: '15m' as const,
      labelMatchers: {namespace: 'prod'},
    };
    expect(isSameQueryConfig(a, b)).toBe(true);
  });

  it('returns false for different profileType', () => {
    const a = {
      profileType: 'parca_agent:samples:count:cpu:nanoseconds:delta',
      timeRange: '15m' as const,
      labelMatchers: {},
    };
    const b = {
      profileType: 'memory:alloc_space:bytes:space:bytes:delta',
      timeRange: '15m' as const,
      labelMatchers: {},
    };
    expect(isSameQueryConfig(a, b)).toBe(false);
  });

  it('returns false for different label keys', () => {
    const a = {
      profileType: 'cpu',
      timeRange: '15m' as const,
      labelMatchers: {namespace: 'prod'},
    };
    const b = {
      profileType: 'cpu',
      timeRange: '15m' as const,
      labelMatchers: {env: 'prod'},
    };
    expect(isSameQueryConfig(a, b)).toBe(false);
  });

  it('returns false for different label values', () => {
    const a = {
      profileType: 'cpu',
      timeRange: '15m' as const,
      labelMatchers: {namespace: 'prod'},
    };
    const b = {
      profileType: 'cpu',
      timeRange: '15m' as const,
      labelMatchers: {namespace: 'staging'},
    };
    expect(isSameQueryConfig(a, b)).toBe(false);
  });

  it('returns false when label count differs', () => {
    const a = {
      profileType: 'cpu',
      timeRange: '15m' as const,
      labelMatchers: {namespace: 'prod', env: 'us-east'},
    };
    const b = {
      profileType: 'cpu',
      timeRange: '15m' as const,
      labelMatchers: {namespace: 'prod'},
    };
    expect(isSameQueryConfig(a, b)).toBe(false);
  });

  it('ignores timeRange differences', () => {
    const a = {
      profileType: 'cpu',
      timeRange: '15m' as const,
      labelMatchers: {},
    };
    const b = {
      profileType: 'cpu',
      timeRange: '1h' as const,
      labelMatchers: {},
    };
    expect(isSameQueryConfig(a, b)).toBe(true);
  });
});
