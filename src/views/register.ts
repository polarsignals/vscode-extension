import * as vscode from 'vscode';
import {StatusViewProvider} from './status-view';
import {QueriesViewProvider} from './queries-view';
import {CurrentFileViewProvider, openHotLine} from './current-file-view';
import {RecentViewProvider, openRecentProfile, removeRecentProfile} from './recent-view';
import {QueryBuilderViewProvider} from './query-builder-view';
import {updateContextKeys} from './context-keys';
import {sessionStore} from '../state/session-store';
import {getAuthProvider, PolarSignalsAuthProvider} from '../auth/oauth-provider';
import {fetchWithPresetCommand} from '../commands/fetch-with-preset';
import {checkAndRunSetup, showProjectPicker} from '../onboarding/setup-wizard';
import {getMode, setMode, getProjectId} from '../config/settings';
import {registerTracked} from '../usage';

export function registerViews(context: vscode.ExtensionContext): void {
  const status = new StatusViewProvider();
  const queries = new QueriesViewProvider(context);
  const queryBuilder = new QueryBuilderViewProvider(context);
  const currentFile = new CurrentFileViewProvider();
  const recent = new RecentViewProvider();

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('polarSignals.statusView', status),
    vscode.window.registerTreeDataProvider('polarSignals.queriesView', queries),
    vscode.window.registerTreeDataProvider('polarSignals.queryBuilderView', queryBuilder),
    vscode.window.registerTreeDataProvider('polarSignals.currentFileView', currentFile),
    vscode.window.registerTreeDataProvider('polarSignals.recentView', recent),
  );

  const refreshAll = () => {
    status.refresh();
    queries.refresh();
    queryBuilder.refresh();
    currentFile.refresh();
    recent.refresh();
    void updateContextKeys();
  };

  context.subscriptions.push(sessionStore.onDidChange(refreshAll));

  const authProvider = getAuthProvider();
  if (authProvider) {
    context.subscriptions.push(authProvider.onDidChangeSessions(refreshAll));
  }

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('polarSignals')) refreshAll();
    }),
    vscode.window.onDidChangeActiveTextEditor(() => {
      currentFile.refresh();
      void updateContextKeys();
    }),
  );

  void updateContextKeys();

  context.subscriptions.push(
    registerTracked('polarSignals.refreshViews', refreshAll),
    registerTracked(
      'polarSignals.runPreset',
      // Inline view actions pass the tree node; the row's default command passes a string id.
      async (arg: string | {preset?: {id: string}}) => {
        const presetId = typeof arg === 'string' ? arg : arg?.preset?.id;
        if (!presetId) return;
        const isConfigured = await checkAndRunSetup(context);
        if (isConfigured) await fetchWithPresetCommand(context, presetId);
      },
    ),
    registerTracked('polarSignals.openHotLine', async (filePath: string, line: number) => {
      await openHotLine(filePath, line);
    }),
    registerTracked('polarSignals.openRecentProfile', async (filePath: string) => {
      await openRecentProfile(filePath);
    }),
    registerTracked('polarSignals.removeRecentProfile', (item: {filePath: string}) => {
      removeRecentProfile(item);
    }),
    registerTracked('polarSignals.queryBuilder.setProfileType', () =>
      queryBuilder.chooseProfileType(),
    ),
    registerTracked('polarSignals.queryBuilder.setTimeRange', () => queryBuilder.chooseTimeRange()),
    registerTracked('polarSignals.queryBuilder.addFilter', () => queryBuilder.addFilter()),
    registerTracked('polarSignals.queryBuilder.editFilter', (label: string) =>
      queryBuilder.editFilter(label),
    ),
    registerTracked('polarSignals.queryBuilder.removeFilter', (item: string | {label?: string}) =>
      queryBuilder.removeFilter(item),
    ),
    registerTracked('polarSignals.queryBuilder.reset', () => queryBuilder.reset()),
    registerTracked('polarSignals.queryBuilder.run', () => queryBuilder.run()),
    registerTracked('polarSignals.signIn', async () => {
      const session = await vscode.authentication.getSession(
        PolarSignalsAuthProvider.id,
        ['openid', 'profile', 'email', 'offline_access'],
        {createIfNone: true},
      );
      if (!session) return;

      // Welcome-view sign-in is the entry point for new cloud users — set the
      // mode and pick a project so they don't end up authenticated-but-unconfigured.
      // Existing cloud users who re-auth keep their current project.
      if (getMode() !== 'cloud') {
        await setMode('cloud');
      }
      if (!getProjectId()) {
        await showProjectPicker();
      }
    }),
  );
}
