import * as vscode from 'vscode';
import {getAuthProvider} from '../auth/oauth-provider';

const CONFIG_SECTION = 'polarSignals';

const configChangeCallbacks: (() => void)[] = [];

/**
 * Register a callback to be invoked when config changes.
 */
export function onConfigChange(callback: () => void): void {
  configChangeCallbacks.push(callback);
}

function notifyConfigChange(): void {
  configChangeCallbacks.forEach(cb => cb());
}

let cachedConfig: PolarSignalsConfig | null = null;
let cachedContext: vscode.ExtensionContext | null = null;

export type ProfilerMode = 'cloud' | 'oss';
export type McpOnboardingMode = 'auto' | 'guided' | 'off';

export interface PolarSignalsConfig {
  mode: ProfilerMode;
  apiUrl: string;
  oauthToken: string | null;
  projectId: string | null;
  defaultTimeRange: string;
  profileType: string;
  queryLabels: Record<string, string>;
}

export function getMode(): ProfilerMode | null {
  const mode = vscode.workspace.getConfiguration(CONFIG_SECTION).get<string>('mode');
  if (mode === 'cloud' || mode === 'oss') return mode;
  return null;
}

export async function setMode(mode: ProfilerMode): Promise<void> {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  await config.update('mode', mode, vscode.ConfigurationTarget.Global);
}

export function isFirstUse(): boolean {
  return getMode() === null;
}

export function getApiUrl(): string {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const mode = getMode();

  if (mode === 'oss') {
    const selfHostedUrl = config.get<string>('selfHostedUrl') ?? 'http://localhost:7070';
    return normalizeUrl(selfHostedUrl);
  }

  const cloudUrl = config.get<string>('cloudUrl') ?? 'https://api.polarsignals.com';
  return normalizeUrl(cloudUrl);
}

export function normalizeUrl(url: string): string {
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('localhost') || url.startsWith('127.0.0.1')) return `http://${url}`;
  return `https://${url}`;
}

export function getBrandName(): string {
  return 'Polar Signals Profiler';
}

export function getBrandNameShort(): string {
  return 'Polar Signals';
}

export async function getConfig(context: vscode.ExtensionContext): Promise<PolarSignalsConfig> {
  if (cachedConfig && cachedContext === context) {
    return cachedConfig;
  }

  const mode = getMode();

  if (!mode) {
    throw new Error('Extension not configured');
  }

  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const apiUrl = getApiUrl();
  const defaultTimeRange = config.get<string>('defaultTimeRange') ?? '15m';
  const profileType =
    config.get<string>('profileType') ?? 'parca_agent:samples:count:cpu:nanoseconds:delta';
  const queryLabels = config.get<Record<string, string>>('queryLabels') ?? {};

  let oauthToken: string | null = null;
  const projectId = config.get<string>('projectId') ?? null;

  if (mode === 'cloud') {
    const authProvider = getAuthProvider();
    if (authProvider) {
      oauthToken = (await authProvider.getAccessToken()) ?? null;
    }

    if (!oauthToken) {
      throw new Error('Please sign in to Polar Signals Cloud');
    }
  }

  const result: PolarSignalsConfig = {
    mode,
    apiUrl,
    oauthToken,
    projectId,
    defaultTimeRange,
    profileType,
    queryLabels,
  };

  cachedConfig = result;
  cachedContext = context;

  return result;
}

/**
 * Invalidate the cached config. Called when settings change.
 */
export function invalidateConfigCache(): void {
  cachedConfig = null;
  cachedContext = null;
  notifyConfigChange();
}

export function getAutoFetchOnFileOpen(): boolean {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  return config.get<boolean>('autoFetchOnFileOpen') ?? true;
}

export function getAutoScrollToAnnotation(): boolean {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  return config.get<boolean>('autoScrollToAnnotation') ?? false;
}

export function getProjectId(): string | null {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  return config.get<string>('projectId') ?? null;
}

export function getMcpOnboardingMode(): McpOnboardingMode {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  return config.get<McpOnboardingMode>('mcpOnboardingMode') ?? 'auto';
}

export async function promptForProjectId(): Promise<string | undefined> {
  const projectId = await vscode.window.showInputBox({
    prompt: 'Enter your Polar Signals Project ID',
    ignoreFocusOut: true,
    placeHolder: 'Project ID (found in Project Settings URL)',
  });

  if (projectId) {
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    await config.update('projectId', projectId.trim(), vscode.ConfigurationTarget.Global);
  }

  return projectId;
}
