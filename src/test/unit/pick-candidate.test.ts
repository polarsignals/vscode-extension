import {beforeEach, describe, expect, it, vi} from 'vitest';

const {showQuickPick} = vi.hoisted(() => ({showQuickPick: vi.fn()}));

vi.mock('vscode', () => ({
  window: {showQuickPick},
}));

vi.mock('../../config/settings', () => ({
  getBrandNameShort: () => 'Polar Signals',
}));

vi.mock('../../annotations/profiling-annotations', () => ({
  formatValue: (value: number, unit: string) => `${value} ${unit}`,
}));

import {pickCandidateAndRequery} from '../../commands/pick-candidate';
import type {SourceQueryResult} from '../../api/profiler-client';

function makeResult(candidates?: Array<{filename: string; cumulative: number}>): SourceQueryResult {
  return {
    record: new Uint8Array(),
    source: '',
    unit: 'nanoseconds',
    total: 1n,
    filtered: 1n,
    candidates,
  };
}

describe('pickCandidateAndRequery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns undefined when result has no candidates field', async () => {
    const requery = vi.fn();
    const out = await pickCandidateAndRequery(makeResult(undefined), 'foo.go', requery);
    expect(out).toBeUndefined();
    expect(requery).not.toHaveBeenCalled();
    expect(showQuickPick).not.toHaveBeenCalled();
  });

  it('returns undefined when candidates is empty', async () => {
    const requery = vi.fn();
    const out = await pickCandidateAndRequery(makeResult([]), 'foo.go', requery);
    expect(out).toBeUndefined();
    expect(requery).not.toHaveBeenCalled();
    expect(showQuickPick).not.toHaveBeenCalled();
  });

  it('returns undefined and does not requery when user cancels picker', async () => {
    showQuickPick.mockResolvedValue(undefined);
    const requery = vi.fn();
    const out = await pickCandidateAndRequery(
      makeResult([
        {filename: 'src/a/foo.go', cumulative: 200},
        {filename: 'src/b/foo.go', cumulative: 100},
      ]),
      'foo.go',
      requery,
    );
    expect(out).toBeUndefined();
    expect(requery).not.toHaveBeenCalled();
  });

  it('requeries with the picked label (full indexed path), not the basename', async () => {
    showQuickPick.mockImplementation(async (items: Array<{label: string}>) => items[0]);
    const requeryResult = makeResult();
    const requery = vi.fn().mockResolvedValue(requeryResult);

    const out = await pickCandidateAndRequery(
      makeResult([
        {filename: 'src/a/foo.go', cumulative: 200},
        {filename: 'src/b/foo.go', cumulative: 100},
      ]),
      'foo.go',
      requery,
    );

    expect(requery).toHaveBeenCalledTimes(1);
    expect(requery).toHaveBeenCalledWith('src/a/foo.go');
    expect(out).toBe(requeryResult);
  });

  it('preserves candidate ordering and formats descriptions with the result unit', async () => {
    showQuickPick.mockResolvedValue(undefined);
    const requery = vi.fn();

    await pickCandidateAndRequery(
      makeResult([
        {filename: 'src/a/foo.go', cumulative: 300},
        {filename: 'src/b/foo.go', cumulative: 200},
        {filename: 'src/c/foo.go', cumulative: 100},
      ]),
      'foo.go',
      requery,
    );

    const items = showQuickPick.mock.calls[0][0];
    expect(items).toEqual([
      {label: 'src/a/foo.go', description: '300 nanoseconds'},
      {label: 'src/b/foo.go', description: '200 nanoseconds'},
      {label: 'src/c/foo.go', description: '100 nanoseconds'},
    ]);
  });
});
