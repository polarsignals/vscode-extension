import * as vscode from 'vscode';
import {getMode, getProjectId, getApiUrl} from '../config/settings';
import {getAuthProvider} from '../auth/oauth-provider';
import {RefreshableTreeProvider} from './tree-provider';

interface StatusItem {
  label: string;
  description?: string;
  iconId: string;
  tooltip?: string;
  command?: vscode.Command;
}

export class StatusViewProvider extends RefreshableTreeProvider<StatusItem> {
  getTreeItem(element: StatusItem): vscode.TreeItem {
    const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
    item.description = element.description;
    item.iconPath = new vscode.ThemeIcon(element.iconId);
    item.tooltip = element.tooltip;
    item.command = element.command;
    return item;
  }

  async getChildren(): Promise<StatusItem[]> {
    const mode = getMode();
    if (!mode) return [];

    const items: StatusItem[] = [];

    if (mode === 'cloud') {
      const provider = getAuthProvider();
      const sessions = provider ? await provider.getSessions() : [];
      const session = sessions[0];

      items.push({
        label: 'Mode',
        description: 'Polar Signals Cloud',
        iconId: 'cloud',
      });

      items.push({
        label: 'Account',
        description: session ? session.account.label : 'Not signed in',
        iconId: session ? 'account' : 'sign-in',
        command: session
          ? {command: 'polarSignals.signOut', title: 'Sign Out'}
          : {command: 'polarSignals.signIn', title: 'Sign In'},
      });

      const projectId = getProjectId();
      items.push({
        label: 'Project',
        description: projectId ?? 'Not set',
        iconId: 'project',
        command: {command: 'polarSignals.switchProject', title: 'Switch Project'},
      });
    } else {
      items.push({
        label: 'Mode',
        description: 'Self-hosted Parca',
        iconId: 'server',
      });
      items.push({
        label: 'Server',
        description: getApiUrl(),
        iconId: 'link',
        command: {command: 'polarSignals.configureDefaults', title: 'Configure'},
      });
    }

    return items;
  }
}
