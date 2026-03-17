import * as vscode from 'vscode';
import {getBrandNameShort, invalidateConfigCache} from '../config/settings';
import {PolarSignalsAuthProvider} from '../auth/oauth-provider';

/**
 * URI Handler for vscode://polarsignals.polar-signals-profiler deep links.
 *
 * Supported paths:
 *
 * /configure - Configure the extension from cloud dashboard
 *   vscode://polarsignals.polar-signals-profiler/configure?project_id=abc123
 */
export class PolarSignalsUriHandler implements vscode.UriHandler {
  async handleUri(uri: vscode.Uri): Promise<void> {
    console.log(`[${getBrandNameShort()}] Handling URI:`, uri.toString());

    try {
      const action = uri.path.replace(/^\//, '');

      if (action === 'configure') {
        const params = new URLSearchParams(uri.query as string);
        await this.handleConfigureAction(params);
        return;
      }

      vscode.window.showErrorMessage(`Unknown action: ${action}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Failed to handle deep link: ${message}`);
      console.error(`[${getBrandNameShort()}] URI handler error:`, error);
    }
  }

  private async handleConfigureAction(params: URLSearchParams): Promise<void> {
    const projectId = params.get('project_id');

    if (!projectId) {
      vscode.window.showErrorMessage('Missing project_id in configure URL');
      return;
    }

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Configuring Polar Signals extension...',
        cancellable: false,
      },
      async progress => {
        progress.report({message: 'Signing in...'});

        const session = await vscode.authentication.getSession(
          PolarSignalsAuthProvider.id,
          ['openid', 'profile', 'email', 'offline_access'],
          {createIfNone: true},
        );

        if (!session) {
          vscode.window.showErrorMessage('Sign-in was cancelled');
          return;
        }

        progress.report({message: 'Configuring project...'});

        const config = vscode.workspace.getConfiguration('polarSignals');
        await config.update('mode', 'cloud', vscode.ConfigurationTarget.Global);
        await config.update('projectId', projectId, vscode.ConfigurationTarget.Global);

        invalidateConfigCache();

        vscode.window.showInformationMessage(
          `Polar Signals extension configured for project: ${projectId}`,
        );
      },
    );
  }
}
