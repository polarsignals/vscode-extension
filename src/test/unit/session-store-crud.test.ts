import {describe, it, expect, beforeEach} from 'vitest';
import {sessionStore} from '../../state/session-store';
import type {CachedProfile} from '../../state/session-store';

function makeProfile(overrides: Partial<CachedProfile> = {}): CachedProfile {
  return {
    lineData: [{filename: 'main.go', lineNumber: 10, cumulative: 100, flat: 50}],
    unit: 'nanoseconds',
    total: 1000n,
    filtered: 900n,
    queryConfig: {
      profileType: 'parca_agent:samples:count:cpu:nanoseconds:delta',
      timeRange: '15m',
      labelMatchers: {},
    },
    sourceFile: {filename: 'main.go'},
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('SessionStore CRUD', () => {
  beforeEach(() => {
    sessionStore.clear();
  });

  it('stores and retrieves a profile', () => {
    const profile = makeProfile();
    sessionStore.store('/src/main.go', profile);
    const cached = sessionStore.get('/src/main.go');
    expect(cached).toBeDefined();
    expect(cached!.unit).toBe('nanoseconds');
    expect(cached!.lineData).toHaveLength(1);
  });

  it('has() returns true for stored paths', () => {
    sessionStore.store('/src/main.go', makeProfile());
    expect(sessionStore.has('/src/main.go')).toBe(true);
    expect(sessionStore.has('/src/other.go')).toBe(false);
  });

  it('remove() deletes a stored profile', () => {
    sessionStore.store('/src/main.go', makeProfile());
    sessionStore.remove('/src/main.go');
    expect(sessionStore.has('/src/main.go')).toBe(false);
    expect(sessionStore.get('/src/main.go')).toBeUndefined();
  });

  it('clear() removes all stored profiles', () => {
    sessionStore.store('/src/a.go', makeProfile());
    sessionStore.store('/src/b.go', makeProfile());
    expect(sessionStore.size).toBe(2);
    sessionStore.clear();
    expect(sessionStore.size).toBe(0);
  });

  it('getCachedPaths() returns all stored paths', () => {
    sessionStore.store('/src/a.go', makeProfile());
    sessionStore.store('/src/b.go', makeProfile());
    const paths = sessionStore.getCachedPaths();
    expect(paths).toHaveLength(2);
    expect(paths).toContain('/src/a.go');
    expect(paths).toContain('/src/b.go');
  });

  it('normalizes path case and backslashes', () => {
    sessionStore.store('C:\\Users\\Dev\\main.go', makeProfile());
    expect(sessionStore.has('c:/users/dev/main.go')).toBe(true);
  });

  it('overwrites on duplicate store', () => {
    sessionStore.store('/src/main.go', makeProfile({unit: 'nanoseconds'}));
    sessionStore.store('/src/main.go', makeProfile({unit: 'bytes'}));
    expect(sessionStore.size).toBe(1);
    expect(sessionStore.get('/src/main.go')!.unit).toBe('bytes');
  });

  it('setLastQueryConfig() and getLastQueryConfig()', () => {
    expect(sessionStore.getLastQueryConfig()).toBeNull();

    sessionStore.setLastQueryConfig({
      profileType: 'parca_agent:samples:count:cpu:nanoseconds:delta',
      timeRange: '1h',
      labelMatchers: {namespace: 'prod'},
    });

    const last = sessionStore.getLastQueryConfig();
    expect(last).not.toBeNull();
    expect(last!.profileType).toBe('parca_agent:samples:count:cpu:nanoseconds:delta');
    expect(last!.timeRange).toBe('1h');
    expect(last!.labelMatchers).toEqual({namespace: 'prod'});
  });
});
