import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const mocks = vi.hoisted(() => ({
  commandInc: vi.fn(),
  flush: vi.fn(),
  getAuthProvider: vi.fn(),
  getMode: vi.fn(),
  infoReset: vi.fn(),
  infoSet: vi.fn(),
  presetInc: vi.fn(),
  queryBuilderTimeRangeInc: vi.fn(),
  registerCommand: vi.fn(),
  setExtensionVersion: vi.fn(),
  vscodeEnv: {isTelemetryEnabled: true},
}));

vi.mock('vscode', () => ({
  commands: {
    registerCommand: mocks.registerCommand,
  },
  env: mocks.vscodeEnv,
  version: '1.85.0',
}));

vi.mock('../../config/settings', () => ({
  getMode: mocks.getMode,
}));

vi.mock('../../auth/oauth-provider', () => ({
  getAuthProvider: mocks.getAuthProvider,
}));

vi.mock('../../metrics', () => ({
  commandInvocations: {inc: mocks.commandInc},
  flush: mocks.flush,
  info: {set: mocks.infoSet, reset: mocks.infoReset},
  presetRuns: {inc: mocks.presetInc},
  queryBuilderTimeRangeSelections: {inc: mocks.queryBuilderTimeRangeInc},
  sessionId: 'session-1',
  setExtensionVersion: mocks.setExtensionVersion,
}));

describe('usage telemetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mocks.vscodeEnv.isTelemetryEnabled = true;
    mocks.getMode.mockReturnValue('cloud');
    mocks.getAuthProvider.mockReturnValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const lastRegisteredHandler = () => {
    const calls = mocks.registerCommand.mock.calls;
    return calls[calls.length - 1][1] as (...args: unknown[]) => unknown;
  };

  it('increments the command counter in cloud mode without requiring sign-in', async () => {
    const {registerTracked} = await import('../../usage');
    const handler = vi.fn((_arg: string) => 'done');

    registerTracked('polarSignals.fetchProfile', handler);
    const result = lastRegisteredHandler()('arg');

    expect(result).toBe('done');
    expect(handler).toHaveBeenCalledWith('arg');
    expect(mocks.commandInc).toHaveBeenCalledWith({
      session_id: 'session-1',
      command: 'polarSignals.fetchProfile',
    });
  });

  it('does not increment when telemetry is disabled or mode is not cloud', async () => {
    const {registerTracked} = await import('../../usage');
    const handler = vi.fn();

    mocks.vscodeEnv.isTelemetryEnabled = false;
    registerTracked('polarSignals.fetchProfile', handler);
    lastRegisteredHandler()();

    mocks.vscodeEnv.isTelemetryEnabled = true;
    mocks.getMode.mockReturnValue('oss');
    registerTracked('polarSignals.fetchProfile', handler);
    lastRegisteredHandler()();

    expect(handler).toHaveBeenCalledTimes(2);
    expect(mocks.commandInc).not.toHaveBeenCalled();
  });

  it('tracks built-in preset runs and buckets custom presets', async () => {
    const {trackPresetRun} = await import('../../usage');

    trackPresetRun('cpu-15m');
    trackPresetRun('production-api-custom');

    expect(mocks.presetInc).toHaveBeenCalledWith({
      session_id: 'session-1',
      preset: 'cpu-15m',
    });
    expect(mocks.presetInc).toHaveBeenCalledWith({
      session_id: 'session-1',
      preset: 'custom',
    });
  });

  it('tracks bounded query builder time range selections', async () => {
    const {trackQueryBuilderTimeRangeSelection} = await import('../../usage');

    trackQueryBuilderTimeRangeSelection('15m');
    trackQueryBuilderTimeRangeSelection('unexpected');

    expect(mocks.queryBuilderTimeRangeInc).toHaveBeenCalledWith({
      session_id: 'session-1',
      time_range: '15m',
    });
    expect(mocks.queryBuilderTimeRangeInc).toHaveBeenCalledWith({
      session_id: 'session-1',
      time_range: 'other',
    });
  });

  it('sets session info and schedules gated periodic flushes', async () => {
    mocks.getAuthProvider.mockReturnValue({getSessions: vi.fn().mockResolvedValue([])});
    const {startTelemetry, stopTelemetry} = await import('../../usage');

    await startTelemetry('1.4.1');

    expect(mocks.setExtensionVersion).toHaveBeenCalledWith('1.4.1');
    expect(mocks.infoSet).toHaveBeenCalledWith(
      {
        session_id: 'session-1',
        version: '1.4.1',
        vscode_version: '1.85.0',
        platform: process.platform,
        arch: process.arch,
        mode: 'cloud',
        signed_in: 'false',
      },
      1,
    );

    await vi.advanceTimersByTimeAsync(3 * 60_000);
    expect(mocks.flush).toHaveBeenCalledTimes(1);

    mocks.getMode.mockReturnValue('oss');
    await vi.advanceTimersByTimeAsync(3 * 60_000);
    expect(mocks.flush).toHaveBeenCalledTimes(1);

    await stopTelemetry();
    expect(mocks.flush).toHaveBeenCalledTimes(1);
  });
});
