import * as vscode from 'vscode';
import {CompressionType, setCompressionCodec} from '@uwdata/flechette';
import * as lz4 from 'lz4js';
import {fetchProfileCommand, restoreCachedAnnotations} from './commands/fetch-profile';
import {clearAnnotationsCommand} from './commands/clear-annotations';
import {showStatusMenuCommand} from './commands/show-status-menu';
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
import {getStatusBar, disposeStatusBar} from './ui/status-bar';
import {PolarSignalsUriHandler} from './uri/uri-handler';
import {disposeAnnotations} from './annotations/annotation-manager';
import {checkAndRunSetup, showSetupWizard, showProjectPicker} from './onboarding/setup-wizard';
import {repoMappingStore} from './repository/repo-mapping-store';
import {manageRepoMappingsCommand} from './commands/manage-repo-mappings';
import {sessionStore, isSameQueryConfig} from './state/session-store';
import {silentFetchProfile} from './commands/silent-fetch';
import {
  registerAuthProvider,
  getAuthProvider,
  PolarSignalsAuthProvider,
} from './auth/oauth-provider';

export async function activate(context: vscode.ExtensionContext) {
  setCompressionCodec(CompressionType.LZ4_FRAME, {
    encode: (buf: Uint8Array) => lz4.compress(buf),
    decode: (buf: Uint8Array) => lz4.decompress(buf),
  });

  registerAuthProvider(context);

  const brandName = getMode() ? getBrandName() : 'Polar Signals Profiler';
  console.log(`${brandName} extension is now active`);

  getStatusBar();

  repoMappingStore.initialize(context);

  const uriHandler = new PolarSignalsUriHandler();
  context.subscriptions.push(vscode.window.registerUriHandler(uriHandler));

  const withSetupCheck = (fn: (context: vscode.ExtensionContext) => Promise<void>) => async () => {
    const isConfigured = await checkAndRunSetup(context);
    if (isConfigured) {
      await fn(context);
    }
  };

  const fetchProfile = vscode.commands.registerCommand(
    'polarSignals.fetchProfile',
    withSetupCheck(fetchProfileCommand),
  );

  const clearAnnotations = vscode.commands.registerCommand(
    'polarSignals.clearAnnotations',
    async () => {
      await clearAnnotationsCommand();
    },
  );

  const showStatusMenu = vscode.commands.registerCommand(
    'polarSignals.showStatusMenu',
    withSetupCheck(showStatusMenuCommand),
  );

  const configureDefaults = vscode.commands.registerCommand(
    'polarSignals.configureDefaults',
    async () => {
      await configureDefaultsCommand();
    },
  );

  const selectPreset = vscode.commands.registerCommand(
    'polarSignals.selectPreset',
    withSetupCheck(selectPresetCommand),
  );

  const fetchWithPreset = vscode.commands.registerCommand(
    'polarSignals.fetchWithPreset',
    async (presetId?: string) => {
      const isConfigured = await checkAndRunSetup(context);
      if (isConfigured) {
        await fetchWithPresetCommand(context, presetId);
      }
    },
  );

  const importFromUrl = vscode.commands.registerCommand(
    'polarSignals.importFromUrl',
    withSetupCheck(importFromUrlCommand),
  );

  const setupMode = vscode.commands.registerCommand('polarSignals.setupMode', async () => {
    await showSetupWizard(context);
  });

  const signOut = vscode.commands.registerCommand('polarSignals.signOut', async () => {
    const session = await vscode.authentication.getSession(PolarSignalsAuthProvider.id, [], {
      createIfNone: false,
    });

    if (!session) {
      vscode.window.showInformationMessage('You are not signed in to Polar Signals');
      return;
    }

    const choice = await vscode.window.showWarningMessage(
      'Are you sure you want to sign out of Polar Signals?',
      {modal: true},
      'Sign Out',
    );

    if (choice === 'Sign Out') {
      const authProvider = getAuthProvider();
      if (authProvider) {
        await authProvider.removeSession(session.id);
        vscode.window.showInformationMessage('Signed out of Polar Signals');
      }
    }
  });

  const switchProject = vscode.commands.registerCommand('polarSignals.switchProject', async () => {
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

  const manageRepoMappings = vscode.commands.registerCommand(
    'polarSignals.manageRepoMappings',
    async () => {
      await manageRepoMappingsCommand();
    },
  );

  const copyLineForAICmd = vscode.commands.registerCommand(
    'polarSignals.copyLineForAI',
    async (args: {line: number}) => {
      await copyLineForAI(args);
    },
  );

  const copyFileForAICmd = vscode.commands.registerCommand(
    'polarSignals.copyFileForAI',
    async () => {
      await copyFileForAI();
    },
  );

  const configChangeListener = vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration('polarSignals')) {
      invalidateConfigCache();
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

      getStatusBar().showLoading();

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
    showStatusMenu,
    configureDefaults,
    selectPreset,
    fetchWithPreset,
    importFromUrl,
    setupMode,
    signOut,
    switchProject,
    manageRepoMappings,
    copyLineForAICmd,
    copyFileForAICmd,
    configChangeListener,
    editorChangeListener,
    autoFetchCleanup,
  );
}

export function deactivate() {
  console.log('Parca Profiler extension is now deactivated');
  disposeAnnotations();
  disposeStatusBar();
}
