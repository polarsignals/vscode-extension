import * as vscode from 'vscode';
import {getMode} from './config/settings';
import {getAuthProvider} from './auth/oauth-provider';
import {DEFAULT_PRESETS} from './presets/preset-definitions';
import {
  commandInvocations,
  flush,
  info,
  presetRuns,
  queryBuilderTimeRangeSelections,
  sessionId,
  setExtensionVersion,
} from './metrics';

const FLUSH_INTERVAL_MS = 3 * 60_000;
const BUILT_IN_PRESET_IDS = new Set(DEFAULT_PRESETS.map(preset => preset.id));
const QUERY_BUILDER_TIME_RANGES = new Set(['5m', '15m', '1h', '24h', '7d', '30d']);

let timer: ReturnType<typeof setInterval> | undefined;
let currentVersion = 'unknown';

export function trackCommand<A extends unknown[], R>(
  command: string,
  handler: (...args: A) => R,
): (...args: A) => R {
  return (...args: A): R => {
    track(command);
    return handler(...args);
  };
}

export function registerTracked<A extends unknown[]>(
  id: string,
  handler: (...args: A) => unknown,
): vscode.Disposable {
  return vscode.commands.registerCommand(id, trackCommand(id, handler));
}

function enabled(): boolean {
  return vscode.env?.isTelemetryEnabled === true && getMode() === 'cloud';
}

function track(command: string): void {
  if (!enabled()) return;
  commandInvocations.inc({session_id: sessionId, command});
}

export function trackPresetRun(presetId: string): void {
  if (!enabled()) return;
  const preset = BUILT_IN_PRESET_IDS.has(presetId) ? presetId : 'custom';
  presetRuns.inc({session_id: sessionId, preset});
}

export function trackQueryBuilderTimeRangeSelection(selected: string): void {
  if (!enabled()) return;
  const timeRange = QUERY_BUILDER_TIME_RANGES.has(selected) ? selected : 'other';
  queryBuilderTimeRangeSelections.inc({session_id: sessionId, time_range: timeRange});
}

async function isSignedIn(): Promise<boolean> {
  try {
    const sessions = (await getAuthProvider()?.getSessions()) ?? [];
    return sessions.length > 0;
  } catch {
    return false;
  }
}

function setSessionInfo(signedIn: boolean): void {
  // Replace any prior series so a sign-in/out change doesn't leave a stale
  // signed_in label set behind alongside the current one.
  info.reset();
  info.set(
    {
      session_id: sessionId,
      version: currentVersion,
      vscode_version: vscode.version,
      platform: process.platform,
      arch: process.arch,
      mode: 'cloud',
      signed_in: String(signedIn),
    },
    1,
  );
}

async function refreshAndFlush(): Promise<void> {
  setSessionInfo(await isSignedIn());
  await flush();
}

export async function startTelemetry(version: string): Promise<void> {
  currentVersion = version || 'unknown';
  setExtensionVersion(version);
  if (timer) {
    clearInterval(timer);
    timer = undefined;
  }
  if (!enabled()) return;

  // Install the timer synchronously, before any await, so a concurrent restart
  // clears it deterministically instead of orphaning a live interval.
  timer = setInterval(() => {
    if (enabled()) void refreshAndFlush();
  }, FLUSH_INTERVAL_MS);
  (timer as ReturnType<typeof setInterval> & {unref?: () => void}).unref?.();

  setSessionInfo(await isSignedIn());
}

export async function stopTelemetry(): Promise<void> {
  if (timer) {
    clearInterval(timer);
    timer = undefined;
  }

  if (enabled()) await flush();
}
