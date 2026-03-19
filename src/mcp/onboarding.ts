import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import {PolarSignalsAuthProvider, getAuthProvider} from '../auth/oauth-provider';
import {getApiUrl, getMcpOnboardingMode, getMode} from '../config/settings';
import {detectEditorHost, type EditorHost, type EditorHostId} from './hosts';

interface RefreshOptions {
  interactive?: boolean;
  notify?: boolean;
  reason?: 'activation' | 'setup' | 'command' | 'config';
}

type InstallResult =
  | {kind: 'installed'; host: EditorHost}
  | {kind: 'available'; host: EditorHost}
  | {kind: 'guided'; host: EditorHost}
  | {kind: 'disabled'; host: EditorHost}
  | {kind: 'requires-auth'; host: EditorHost}
  | {kind: 'unsupported'; host: EditorHost; message?: string};

const VS_CODE_PROVIDER_ID = 'polarsignals.mcp';
const CURSOR_SERVER_NAME = 'Polar Signals';
const CURSOR_MCP_CONFIG_PATH = path.join(os.homedir(), '.cursor', 'mcp.json');

let vscodeProviderRegistration: vscode.Disposable | undefined;

function buildMcpUrl(apiUrl: string): string {
  return `${apiUrl.replace(/\/$/, '')}/api/mcp`;
}

function buildCursorInstallUri(apiUrl: string): vscode.Uri {
  const name = CURSOR_SERVER_NAME;
  const config = {
    url: buildMcpUrl(apiUrl),
    auth: {
      CLIENT_ID: 'polarsignals-cursor',
    },
  };
  const encodedConfig = Buffer.from(JSON.stringify(config), 'utf8').toString('base64');
  return vscode.Uri.parse(
    `cursor://anysphere.cursor-deeplink/mcp/install?name=${encodeURIComponent(name)}&config=${encodeURIComponent(encodedConfig)}`,
  );
}

async function isCursorMcpInstalled(): Promise<boolean> {
  try {
    const raw = await fs.promises.readFile(CURSOR_MCP_CONFIG_PATH, 'utf8');
    const config = JSON.parse(raw) as {mcpServers?: Record<string, unknown>};
    const servers = config.mcpServers ?? {};
    return Object.keys(servers).some(
      name => name.toLowerCase() === CURSOR_SERVER_NAME.toLowerCase(),
    );
  } catch {
    return false;
  }
}

function notificationKey(context: vscode.ExtensionContext, hostId: EditorHostId): string {
  return `polarSignals.mcpNotification.${context.extension.packageJSON.version}.${hostId}`;
}

async function getAccessToken(interactive: boolean): Promise<string | undefined> {
  const authProvider = getAuthProvider();
  const cachedToken = authProvider ? await authProvider.getAccessToken() : undefined;
  if (cachedToken || !interactive) {
    return cachedToken;
  }

  const session = await vscode.authentication.getSession(
    PolarSignalsAuthProvider.id,
    ['openid', 'profile', 'email', 'offline_access'],
    {createIfNone: true},
  );

  return session?.accessToken;
}

function getVsCodeMcpApi():
  | {
      registerMcpServerDefinitionProvider: (id: string, provider: unknown) => vscode.Disposable;
    }
  | undefined {
  return (
    vscode as unknown as {
      lm?: {
        registerMcpServerDefinitionProvider?: (id: string, provider: unknown) => vscode.Disposable;
      };
    }
  ).lm as
    | {
        registerMcpServerDefinitionProvider: (id: string, provider: unknown) => vscode.Disposable;
      }
    | undefined;
}

function getMcpHttpServerDefinitionCtor():
  | (new (
      label: string,
      uri: vscode.Uri,
      headers?: Record<string, string>,
      version?: string,
    ) => unknown)
  | undefined {
  return (
    vscode as unknown as {
      McpHttpServerDefinition?: new (
        label: string,
        uri: vscode.Uri,
        headers?: Record<string, string>,
        version?: string,
      ) => unknown;
    }
  ).McpHttpServerDefinition;
}

async function installVsCodeMcpProvider(
  context: vscode.ExtensionContext,
  host: EditorHost,
): Promise<InstallResult> {
  const mcpApi = getVsCodeMcpApi();
  const definitionCtor = getMcpHttpServerDefinitionCtor();

  if (!mcpApi?.registerMcpServerDefinitionProvider || !definitionCtor) {
    return {
      kind: 'unsupported',
      host,
      message: 'This VS Code build does not expose the MCP provider API yet.',
    };
  }

  if (!vscodeProviderRegistration) {
    const provider = {
      provideMcpServerDefinitions: () => {
        const server = new definitionCtor(
          'Polar Signals',
          vscode.Uri.parse(buildMcpUrl(getApiUrl())),
          {},
          context.extension.packageJSON.version,
        );

        return [server];
      },
      resolveMcpServerDefinition: async (server: unknown) => {
        const token = await getAccessToken(true);
        if (!token) {
          return undefined;
        }

        const resolved = server as {headers?: Record<string, string>; version?: string};
        resolved.headers = {
          ...(resolved.headers ?? {}),
          Authorization: `Bearer ${token}`,
        };
        resolved.version = context.extension.packageJSON.version;

        return resolved;
      },
    };

    vscodeProviderRegistration = mcpApi.registerMcpServerDefinitionProvider(
      VS_CODE_PROVIDER_ID,
      provider,
    );
    context.subscriptions.push(vscodeProviderRegistration);
    return {kind: 'installed', host};
  }

  return {kind: 'available', host};
}

async function installCursorServer(host: EditorHost, interactive: boolean): Promise<InstallResult> {
  if (await isCursorMcpInstalled()) {
    return {kind: 'available', host};
  }

  if (interactive) {
    await vscode.env.openExternal(buildCursorInstallUri(getApiUrl()));
  }

  return {kind: 'guided', host};
}

function cleanupRegistrations(): void {
  if (vscodeProviderRegistration) {
    vscodeProviderRegistration.dispose();
    vscodeProviderRegistration = undefined;
  }
}

async function installSupported(
  context: vscode.ExtensionContext,
  host: EditorHost,
  interactive: boolean,
): Promise<InstallResult> {
  switch (host.id) {
    case 'vscode':
      return installVsCodeMcpProvider(context, host);
    case 'cursor':
      return installCursorServer(host, interactive);
    default:
      return {kind: 'unsupported', host};
  }
}

async function maybeShowNotification(
  context: vscode.ExtensionContext,
  result: InstallResult,
  reason: RefreshOptions['reason'],
): Promise<void> {
  const shouldAlwaysNotify = reason === 'setup' || reason === 'command';
  const onceKey = notificationKey(context, result.host.id);

  if (!shouldAlwaysNotify && reason === 'activation') {
    const alreadyShown = context.globalState.get<boolean>(onceKey);
    if (alreadyShown) {
      return;
    }
  }

  if (result.kind === 'disabled' || result.kind === 'unsupported') {
    return;
  }

  const docsLabel = 'Docs';
  const optionsLabel = 'Set Up';
  const signInLabel = 'Sign In';

  if (result.kind === 'installed' || result.kind === 'available') {
    const message = `Polar Signals MCP Server is now available in ${result.host.displayName}.`;
    const selection = await vscode.window.showInformationMessage(message, docsLabel);
    if (selection === docsLabel) {
      await openMcpSetupDocs();
    }
  } else if (result.kind === 'guided' || result.kind === 'requires-auth') {
    const message =
      result.kind === 'requires-auth'
        ? `Sign in to Polar Signals to finish MCP setup in ${result.host.displayName}.`
        : `Set up the Polar Signals MCP Server in ${result.host.displayName}.`;
    const selection =
      result.kind === 'requires-auth'
        ? await vscode.window.showInformationMessage(message, signInLabel, optionsLabel, docsLabel)
        : await vscode.window.showInformationMessage(message, optionsLabel, docsLabel);
    if (selection === signInLabel) {
      await getAccessToken(true);
      await refreshMcpOnboarding(context, {
        interactive: true,
        notify: true,
        reason: 'command',
      });
    } else if (selection === optionsLabel) {
      if (result.host.id === 'cursor') {
        await vscode.env.openExternal(buildCursorInstallUri(getApiUrl()));
      } else {
        await setupMcpCommand(context);
      }
    } else if (selection === docsLabel) {
      await openMcpSetupDocs();
    }
  }

  await context.globalState.update(onceKey, true);
}

export async function refreshMcpOnboarding(
  context: vscode.ExtensionContext,
  options: RefreshOptions = {},
): Promise<void> {
  const host = detectEditorHost();
  const mode = getMode();
  const onboardingMode = getMcpOnboardingMode();
  const reason = options.reason ?? 'activation';

  if (mode !== 'cloud' || onboardingMode === 'off') {
    cleanupRegistrations();
    if (options.notify) {
      await maybeShowNotification(context, {kind: 'disabled', host}, reason);
    }
    return;
  }

  if (onboardingMode === 'guided') {
    cleanupRegistrations();
    if (options.notify) {
      await maybeShowNotification(context, {kind: 'guided', host}, reason);
    }
    return;
  }

  const result = await installSupported(context, host, options.interactive ?? false);
  if (options.notify) {
    await maybeShowNotification(context, result, reason);
  }
}

export async function setupMcpCommand(context: vscode.ExtensionContext): Promise<void> {
  await refreshMcpOnboarding(context, {
    interactive: true,
    notify: true,
    reason: 'command',
  });
}

export async function showMcpOptions(context: vscode.ExtensionContext): Promise<void> {
  const host = detectEditorHost();

  if (host.id === 'vscode') {
    if (vscodeProviderRegistration) {
      vscode.window.showInformationMessage(
        'Polar Signals MCP Server is already configured in VS Code.',
      );
    } else {
      await setupMcpCommand(context);
    }
    return;
  }

  if (host.id === 'cursor') {
    if (await isCursorMcpInstalled()) {
      vscode.window.showInformationMessage(
        'Polar Signals MCP Server is already configured in Cursor.',
      );
    } else {
      await vscode.env.openExternal(buildCursorInstallUri(getApiUrl()));
    }
    return;
  }

  const selection = await vscode.window.showInformationMessage(
    'Polar Signals MCP Server setup is available for VS Code and Cursor.',
    'Docs',
  );
  if (selection === 'Docs') {
    await openMcpSetupDocs();
  }
}

async function openMcpSetupDocs(): Promise<void> {
  const host = detectEditorHost();
  await vscode.env.openExternal(vscode.Uri.parse(host.docsUrl));
}
