import {describe, it, expect} from 'vitest';
import {buildFilenameCandidates, ProfilerClient} from '../../api/profiler-client';
import type {PolarSignalsConfig} from '../../config/settings';

function makeConfig(overrides: Partial<PolarSignalsConfig> = {}): PolarSignalsConfig {
  return {
    mode: 'oss',
    apiUrl: 'http://localhost:7070',
    oauthToken: null,
    projectId: null,
    defaultTimeRange: '15m',
    profileType: 'parca_agent:samples:count:cpu:nanoseconds:delta',
    queryLabels: {},
    ...overrides,
  };
}

describe('buildFilenameCandidates', () => {
  it('returns full path first, then basename, then progressively longer suffixes', () => {
    expect(buildFilenameCandidates('src/pkg/handler.go')).toEqual([
      'src/pkg/handler.go',
      'handler.go',
      'pkg/handler.go',
    ]);
  });

  it('returns single element for basename-only input', () => {
    expect(buildFilenameCandidates('main.go')).toEqual(['main.go']);
  });

  it('returns full path first for two-segment path', () => {
    expect(buildFilenameCandidates('pkg/main.go')).toEqual(['pkg/main.go', 'main.go']);
  });

  it('handles deeply nested paths', () => {
    const result = buildFilenameCandidates('a/b/c/d/e.go');
    expect(result[0]).toBe('a/b/c/d/e.go');
    expect(result[1]).toBe('e.go');
    expect(result[result.length - 1]).toBe('b/c/d/e.go');
    expect(result.length).toBe(5);
  });

  it('strips leading slashes', () => {
    expect(buildFilenameCandidates('/src/main.go')).toEqual(['src/main.go', 'main.go']);
  });

  it('returns input for empty string', () => {
    expect(buildFilenameCandidates('')).toEqual(['']);
  });
});

describe('ProfilerClient.buildQueryForFile', () => {
  it('builds query with no labels', () => {
    const client = new ProfilerClient(makeConfig());
    expect(client.buildQueryForFile('main.go')).toBe(
      'parca_agent:samples:count:cpu:nanoseconds:delta{}',
    );
  });

  it('builds query with single label', () => {
    const client = new ProfilerClient(makeConfig({queryLabels: {namespace: 'prod'}}));
    expect(client.buildQueryForFile('main.go')).toBe(
      'parca_agent:samples:count:cpu:nanoseconds:delta{namespace="prod"}',
    );
  });

  it('builds query with multiple labels', () => {
    const client = new ProfilerClient(
      makeConfig({queryLabels: {namespace: 'prod', pod: 'api-abc'}}),
    );
    const query = client.buildQueryForFile('main.go');
    expect(query).toContain('namespace="prod"');
    expect(query).toContain('pod="api-abc"');
    expect(query).toMatch(/^parca_agent:samples:count:cpu:nanoseconds:delta\{.*\}$/);
  });

  it('uses configured profile type', () => {
    const client = new ProfilerClient(
      makeConfig({profileType: 'memory:alloc_space:bytes:space:bytes:delta'}),
    );
    expect(client.buildQueryForFile('main.go')).toBe(
      'memory:alloc_space:bytes:space:bytes:delta{}',
    );
  });

  it('handles undefined queryLabels', () => {
    const config = makeConfig();
    (config as unknown as Record<string, unknown>).queryLabels = undefined;
    const client = new ProfilerClient(config);
    expect(client.buildQueryForFile('main.go')).toBe(
      'parca_agent:samples:count:cpu:nanoseconds:delta{}',
    );
  });
});
