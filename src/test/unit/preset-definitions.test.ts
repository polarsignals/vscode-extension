import {describe, it, expect} from 'vitest';
import {filterByMode, DEFAULT_PRESETS} from '../../presets/preset-definitions';
import type {QueryPreset} from '../../presets/preset-definitions';

describe('filterByMode', () => {
  const preset = (mode?: QueryPreset['mode']): QueryPreset => ({
    id: 'test',
    name: 'Test',
    profileType: 'cpu',
    timeRange: '15m',
    mode,
  });

  it('includes presets with no mode set', () => {
    expect(filterByMode(preset(undefined), 'cloud')).toBe(true);
    expect(filterByMode(preset(undefined), 'oss')).toBe(true);
    expect(filterByMode(preset(undefined), null)).toBe(true);
  });

  it('includes presets with mode "both"', () => {
    expect(filterByMode(preset('both'), 'cloud')).toBe(true);
    expect(filterByMode(preset('both'), 'oss')).toBe(true);
  });

  it('includes presets matching current mode', () => {
    expect(filterByMode(preset('cloud'), 'cloud')).toBe(true);
    expect(filterByMode(preset('oss'), 'oss')).toBe(true);
  });

  it('excludes presets not matching current mode', () => {
    expect(filterByMode(preset('cloud'), 'oss')).toBe(false);
    expect(filterByMode(preset('oss'), 'cloud')).toBe(false);
  });

  it('excludes mode-specific presets when mode is null', () => {
    expect(filterByMode(preset('cloud'), null)).toBe(false);
    expect(filterByMode(preset('oss'), null)).toBe(false);
  });
});

describe('DEFAULT_PRESETS', () => {
  it('has unique IDs', () => {
    const ids = DEFAULT_PRESETS.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all have required fields', () => {
    for (const preset of DEFAULT_PRESETS) {
      expect(preset.id).toBeTruthy();
      expect(preset.name).toBeTruthy();
      expect(preset.profileType).toBeTruthy();
      expect(preset.timeRange).toBeTruthy();
    }
  });
});
