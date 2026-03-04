import * as vscode from 'vscode';
import {type ProfilerMode, setMode, isFirstUse, normalizeUrl, getApiUrl} from '../config/settings';
import {PolarSignalsAuthProvider, getAuthProvider} from '../auth/oauth-provider';
import {ProfilerClient} from '../api/profiler-client';

const CONFIG_SECTION = 'polarSignals';

interface SetupOption extends vscode.QuickPickItem {
  mode: ProfilerMode;
}

export async function showSetupWizard(
  _context: vscode.ExtensionContext,
): Promise<ProfilerMode | null> {
  const options: SetupOption[] = [
    {
      label: '$(cloud) Polar Signals Cloud',
      description: 'Connect to Polar Signals Cloud',
      detail: 'Sign in with your Polar Signals account',
      mode: 'cloud',
    },
    {
      label: '$(server) Self-hosted Parca',
      description: 'Connect to a local or self-hosted Parca server',
      detail: 'No authentication required. Default: localhost:7070',
      mode: 'oss',
    },
  ];

  const selected = await vscode.window.showQuickPick(options, {
    placeHolder: 'Select your profiler setup',
    title: 'Polar Signals Profiler Setup',
    ignoreFocusOut: true,
  });

  if (!selected) {
    return null;
  }

  await setMode(selected.mode);

  if (selected.mode === 'cloud') {
    const authenticated = await signInWithOAuth();
    if (!authenticated) {
      return null;
    }
    showSuccessMessage('cloud');
  } else {
    const urlSet = await promptForSelfHostedUrl();
    if (!urlSet) {
      return null;
    }
    showSuccessMessage('oss');
  }

  return selected.mode;
}

async function signInWithOAuth(): Promise<boolean> {
  try {
    const session = await vscode.authentication.getSession(
      PolarSignalsAuthProvider.id,
      ['openid', 'profile', 'email', 'offline_access'],
      {createIfNone: true},
    );

    if (session) {
      const projectId = await showProjectPicker();
      if (!projectId) {
        vscode.window.showWarningMessage(
          'Signed in successfully, but no project ID configured. You can set it later in settings.',
        );
      }
      return true;
    }

    return false;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    vscode.window.showErrorMessage(`Sign in failed: ${message}`);
    return false;
  }
}

interface ProjectPickItem extends vscode.QuickPickItem {
  projectId: string;
}

export async function showProjectPicker(): Promise<string | undefined> {
  const authProvider = getAuthProvider();
  const accessToken = authProvider ? await authProvider.getAccessToken() : null;

  if (!accessToken) {
    return await promptForProjectIdManual();
  }

  try {
    const projects = await vscode.window.withProgress(
      {location: vscode.ProgressLocation.Notification, title: 'Loading projects...'},
      async () => {
        const client = new ProfilerClient({
          mode: 'cloud',
          apiUrl: getApiUrl(),
          oauthToken: accessToken,
          projectId: null,
          defaultTimeRange: '15m',
          profileType: '',
          queryLabels: {},
        });
        return await client.getProjects();
      },
    );

    if (projects.length === 0) {
      vscode.window.showWarningMessage(
        'No projects found. Create one at polarsignals.com, then try again.',
      );
      return undefined;
    }

    const items: ProjectPickItem[] = projects.map(({org, project}) => ({
      label: project.name,
      description: org.name,
      detail: `ID: ${project.id}`,
      projectId: project.id,
    }));

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select a project',
      title: 'Choose Polar Signals Project',
      ignoreFocusOut: true,
    });

    if (selected) {
      const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
      await config.update('projectId', selected.projectId, vscode.ConfigurationTarget.Global);
      return selected.projectId;
    }

    return undefined;
  } catch (error) {
    console.error('Failed to fetch projects:', error);
    vscode.window.showWarningMessage(
      'Failed to load projects. You can enter the project ID manually.',
    );
    return await promptForProjectIdManual();
  }
}

async function promptForProjectIdManual(): Promise<string | undefined> {
  const projectId = await vscode.window.showInputBox({
    prompt: 'Enter your Polar Signals Project ID',
    ignoreFocusOut: true,
    placeHolder: 'Project ID (found in your project URL)',
    validateInput: value => {
      if (!value || value.trim() === '') {
        return 'Project ID is required for querying profiling data';
      }
      return null;
    },
  });

  if (projectId) {
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    await config.update('projectId', projectId.trim(), vscode.ConfigurationTarget.Global);
  }

  return projectId;
}

async function promptForSelfHostedUrl(): Promise<boolean> {
  const url = await vscode.window.showInputBox({
    prompt: 'Enter your Parca server URL',
    value: 'http://localhost:7070',
    ignoreFocusOut: true,
    placeHolder: 'http://localhost:7070',
    validateInput: value => {
      if (!value || value.trim() === '') {
        return 'URL is required';
      }
      return null;
    },
  });

  if (!url) {
    return false;
  }

  const normalizedUrl = normalizeUrl(url.trim());
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  await config.update('selfHostedUrl', normalizedUrl, vscode.ConfigurationTarget.Global);
  return true;
}

function showSuccessMessage(mode: 'cloud' | 'oss'): void {
  const message =
    mode === 'cloud'
      ? 'Polar Signals Cloud configured! Click to fetch your first profile.'
      : 'Self-hosted Parca configured! Click to fetch your first profile.';
  vscode.window.showInformationMessage(message, 'Fetch On-CPU (15min)').then(selection => {
    if (selection === 'Fetch On-CPU (15min)') {
      vscode.commands.executeCommand('polarSignals.fetchWithPreset', 'cpu-15m');
    }
  });
}

export async function checkAndRunSetup(context: vscode.ExtensionContext): Promise<boolean> {
  if (!isFirstUse()) {
    return true;
  }

  const mode = await showSetupWizard(context);
  return mode !== null;
}
