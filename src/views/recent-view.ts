import * as vscode from 'vscode';
import * as path from 'path';
import {sessionStore, type CachedProfile} from '../state/session-store';
import {RefreshableTreeProvider} from './tree-provider';
import {formatTimeAgo, shortProfileType} from './format';

interface RecentEntry {
  filePath: string;
  profile: CachedProfile;
}

export class RecentViewProvider extends RefreshableTreeProvider<RecentEntry> {
  getTreeItem(entry: RecentEntry): vscode.TreeItem {
    const fileName = path.basename(entry.filePath);
    const item = new vscode.TreeItem(fileName, vscode.TreeItemCollapsibleState.None);
    const tr =
      typeof entry.profile.queryConfig.timeRange === 'string'
        ? entry.profile.queryConfig.timeRange
        : 'custom';
    item.description = `${shortProfileType(entry.profile.queryConfig.profileType)} · ${tr} · ${formatTimeAgo(entry.profile.timestamp)}`;
    item.tooltip = new vscode.MarkdownString(
      `**${fileName}**\n\n` +
        `\`${entry.filePath}\`\n\n` +
        `Profile: \`${entry.profile.queryConfig.profileType}\`\n\n` +
        `Lines annotated: ${entry.profile.lineData.length}`,
    );
    item.iconPath = new vscode.ThemeIcon('file-code');
    item.contextValue = 'recentProfile';
    item.command = {
      command: 'polarSignals.openRecentProfile',
      title: 'Open',
      arguments: [entry.filePath],
    };
    item.resourceUri = vscode.Uri.file(entry.filePath);
    return item;
  }

  getChildren(): RecentEntry[] {
    return sessionStore.getEntries().sort((a, b) => b.profile.timestamp - a.profile.timestamp);
  }
}

export async function openRecentProfile(filePath: string): Promise<void> {
  await vscode.window.showTextDocument(vscode.Uri.file(filePath));
  // restoreCachedAnnotations runs automatically via the editor change listener.
}

export function removeRecentProfile(entry: {filePath: string}): void {
  sessionStore.remove(entry.filePath);
}
