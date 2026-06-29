import * as vscode from 'vscode';
import {CompressionType, setCompressionCodec} from '@uwdata/flechette';
import * as lz4 from 'lz4js';
import {fetchProfileCommand, restoreCachedAnnotations} from './commands/fetch-profile';
import {clearAnnotationsCommand} from './commands/clear-annotations';
import {copyLineForAI, copyFileForAI} from './commands/copy-for-ai';
import {configureDefaultsCommand} from './commands/configure-defaults';
import {selectPresetCommand} from './commands/select-preset';
import {fetchWithPresetCommand} from './commands/fetch-with-preset';
import {importFromUrlCommand} from './commands/import-from-url';
import {
  getMode,
  getBrandName,
  getAutoFetchOnFileOpen,
  invalidateConfigCache,
} from './config/settings';
import {PolarSignalsUriHandler} from './uri/uri-handler';
import {disposeAnnotations} from './annotations/annotation-manager';
import {checkAndRunSetup, showSetupWizard, showProjectPicker} from './onboarding/setup-wizard';
import {repoMappingStore} from './repository/repo-mapping-store';
import {manageRepoMappingsCommand} from './commands/manage-repo-mappings';
import {sessionStore, isSameQueryConfig} from './state/session-store';
import {silentFetchProfile} from './commands/silent-fetch';
import {registerAuthProvider, getAuthProvider} from './auth/oauth-provider';
import {refreshMcpOnboarding, setupMcpCommand, showMcpOptions} from './mcp/onboarding';
import {registerViews} from './views/register';
import {registerTracked, startTelemetry, stopTelemetry} from './usage';

export async function activate(context: vscode.ExtensionContext) {
  setCompressionCodec(CompressionType.LZ4_FRAME, {
    encode: (buf: Uint8Array) => lz4.compress(buf),
    decode: (buf: Uint8Array) => lz4.decompress(buf),
  });

  registerAuthProvider(context);

  void startTelemetry(context.extension.packageJSON.version);

  const brandName = getMode() ? getBrandName() : 'Polar Signals Profiler';
  console.log(`${brandName} extension is now active`);

  repoMappingStore.initialize(context);

  const uriHandler = new PolarSignalsUriHandler();
  context.subscriptions.push(vscode.window.registerUriHandler(uriHandler));

  const withSetupCheck = (fn: (context: vscode.ExtensionContext) => Promise<void>) => async () => {
    const isConfigured = await checkAndRunSetup(context);
    if (isConfigured) {
      await fn(context);
    }
  };

  const fetchProfile = registerTracked(
    'polarSignals.fetchProfile',
    withSetupCheck(fetchProfileCommand),
  );

  const clearAnnotations = registerTracked('polarSignals.clearAnnotations', async () => {
    await clearAnnotationsCommand();
  });

  const configureDefaults = registerTracked('polarSignals.configureDefaults', async () => {
    await configureDefaultsCommand();
  });

  const selectPreset = registerTracked(
    'polarSignals.selectPreset',
    withSetupCheck(selectPresetCommand),
  );

  const fetchWithPreset = registerTracked(
    'polarSignals.fetchWithPreset',
    async (presetId?: string) => {
      const isConfigured = await checkAndRunSetup(context);
      if (isConfigured) {
        await fetchWithPresetCommand(context, presetId);
      }
    },
  );

  const importFromUrl = registerTracked(
    'polarSignals.importFromUrl',
    withSetupCheck(importFromUrlCommand),
  );

  const setupMode = registerTracked('polarSignals.setupMode', async () => {
    await showSetupWizard(context);
  });

  const signOut = registerTracked('polarSignals.signOut', async () => {
    const authProvider = getAuthProvider();
    const sessions = authProvider ? await authProvider.getSessions() : [];

    if (sessions.length === 0) {
      vscode.window.showInformationMessage('You are not signed in to Polar Signals');
      return;
    }

    const choice = await vscode.window.showWarningMessage(
      'Are you sure you want to sign out of Polar Signals?',
      {modal: true},
      'Sign Out',
    );

    if (choice === 'Sign Out' && authProvider) {
      for (const session of sessions) {
        await authProvider.removeSession(session.id);
      }
      const config = vscode.workspace.getConfiguration('polarSignals');
      await config.update('projectId', undefined, vscode.ConfigurationTarget.Global);
      await refreshMcpOnboarding(context, {
        interactive: false,
        notify: false,
        reason: 'config',
      });
      vscode.window.showInformationMessage('Signed out of Polar Signals');
    }
  });

  const switchProject = registerTracked('polarSignals.switchProject', async () => {
    if (getMode() !== 'cloud') {
      vscode.window.showInformationMessage(
        'Project switching is only available in Polar Signals Cloud mode.',
      );
      return;
    }

    const projectId = await showProjectPicker();
    if (projectId) {
      vscode.window.showInformationMessage(`Switched to project: ${projectId}`);
    }
  });

  const manageRepoMappings = registerTracked('polarSignals.manageRepoMappings', async () => {
    await manageRepoMappingsCommand();
  });

  const setUpMcp = registerTracked('polarSignals.setUpMcp', async () => {
    await setupMcpCommand(context);
  });

  const showMcpOptionsCmd = registerTracked('polarSignals.showMcpOptions', async () => {
    await showMcpOptions(context);
  });

  const copyLineForAICmd = registerTracked(
    'polarSignals.copyLineForAI',
    async (args: {line: number}) => {
      await copyLineForAI(args);
    },
  );

  const copyFileForAICmd = registerTracked('polarSignals.copyFileForAI', async () => {
    await copyFileForAI();
  });

  const configChangeListener = vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration('polarSignals')) {
      invalidateConfigCache();
    }
    const modeChanged = e.affectsConfiguration('polarSignals.mode');
    if (modeChanged) {
      void startTelemetry(context.extension.packageJSON.version);
    }
    if (
      modeChanged ||
      e.affectsConfiguration('polarSignals.mcpOnboardingMode') ||
      e.affectsConfiguration('polarSignals.cloudUrl')
    ) {
      void refreshMcpOnboarding(context, {
        interactive: false,
        notify: false,
        reason: 'config',
      });
    }
  });

  let autoFetchTimeout: ReturnType<typeof setTimeout> | undefined;
  let currentAbortController: AbortController | undefined;

  const editorChangeListener = vscode.window.onDidChangeActiveTextEditor(editor => {
    if (!editor || !getMode()) return;

    if (currentAbortController) {
      currentAbortController.abort();
      currentAbortController = undefined;
    }

    if (autoFetchTimeout !== undefined) {
      clearTimeout(autoFetchTimeout);
      autoFetchTimeout = undefined;
    }

    const cacheHit = restoreCachedAnnotations(editor);

    if (!getAutoFetchOnFileOpen()) return;

    const lastConfig = sessionStore.getLastQueryConfig();
    if (cacheHit && lastConfig) {
      const cached = sessionStore.get(editor.document.uri.fsPath);
      if (cached && isSameQueryConfig(cached.queryConfig, lastConfig)) {
        return;
      }
    }

    if (!lastConfig) return;

    autoFetchTimeout = setTimeout(() => {
      autoFetchTimeout = undefined;
      const abortController = new AbortController();
      currentAbortController = abortController;

      silentFetchProfile({
        context,
        editor,
        queryConfig: lastConfig,
        signal: abortController.signal,
      })
        .catch(error => {
          if (!abortController.signal.aborted) {
            console.error('[Polar Signals] Auto-fetch failed:', error);
          }
        })
        .finally(() => {
          if (currentAbortController === abortController) {
            currentAbortController = undefined;
          }
        });
    }, 100);
  });

  const autoFetchCleanup: vscode.Disposable = {
    dispose: () => {
      if (autoFetchTimeout !== undefined) {
        clearTimeout(autoFetchTimeout);
      }
      if (currentAbortController) {
        currentAbortController.abort();
      }
    },
  };

  context.subscriptions.push(
    fetchProfile,
    clearAnnotations,
    configureDefaults,
    selectPreset,
    fetchWithPreset,
    importFromUrl,
    setupMode,
    signOut,
    switchProject,
    manageRepoMappings,
    setUpMcp,
    showMcpOptionsCmd,
    copyLineForAICmd,
    copyFileForAICmd,
    configChangeListener,
    editorChangeListener,
    autoFetchCleanup,
  );

  registerViews(context);

  void refreshMcpOnboarding(context, {
    interactive: false,
    notify: true,
    reason: 'activation',
  });
}

export async function deactivate() {
  console.log('Parca Profiler extension is now deactivated');
  await stopTelemetry();
  disposeAnnotations();
}
