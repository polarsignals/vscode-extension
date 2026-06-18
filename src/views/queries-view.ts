import * as vscode from 'vscode';
import {DEFAULT_PRESETS, filterByMode, type QueryPreset} from '../presets/preset-definitions';
import {getMode} from '../config/settings';
import {RefreshableTreeProvider} from './tree-provider';
import {formatTimeAgo} from './format';

const PRESET_USAGE_KEY = 'polarsignals.presetUsage';

type Node =
  | {kind: 'group'; id: string; label: string; children: Node[]}
  | {kind: 'preset'; preset: QueryPreset; lastUsed?: number};

export class QueriesViewProvider extends RefreshableTreeProvider<Node> {
  constructor(private readonly context: vscode.ExtensionContext) {
    super();
  }

  getTreeItem(node: Node): vscode.TreeItem {
    if (node.kind === 'group') {
      const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.Expanded);
      item.contextValue = 'presetGroup';
      item.iconPath = new vscode.ThemeIcon('folder');
      return item;
    }

    const preset = node.preset;
    const item = new vscode.TreeItem(preset.name, vscode.TreeItemCollapsibleState.None);
    const parts: string[] = [preset.timeRange];
    if (node.lastUsed) parts.push(formatTimeAgo(node.lastUsed));
    item.description = parts.join(' · ');
    item.tooltip = new vscode.MarkdownString(
      `**${preset.name}**\n\n` +
        (preset.description ? `${preset.description}\n\n` : '') +
        `\`${preset.profileType}\`\n\n` +
        `Time range: ${preset.timeRange}`,
    );
    item.iconPath = new vscode.ThemeIcon('flame');
    item.contextValue = 'preset';
    item.command = {
      command: 'polarSignals.runPreset',
      title: 'Run Preset',
      arguments: [preset.id],
    };
    return item;
  }

  getChildren(node?: Node): Node[] {
    if (!node) {
      return this.buildRoots();
    }
    if (node.kind === 'group') return node.children;
    return [];
  }

  private buildRoots(): Node[] {
    const currentMode = getMode();
    const usage = this.context.globalState.get<Record<string, number>>(PRESET_USAGE_KEY) ?? {};
    const userPresets =
      vscode.workspace.getConfiguration('polarSignals').get<QueryPreset[]>('presets') ?? [];

    const builtIn = DEFAULT_PRESETS.filter(p => filterByMode(p, currentMode))
      .map(preset => ({kind: 'preset' as const, preset, lastUsed: usage[preset.id]}))
      .sort((a, b) => (b.lastUsed ?? 0) - (a.lastUsed ?? 0));

    const userValid = userPresets
      .filter(
        p => p && p.id && p.name && p.profileType && p.timeRange && filterByMode(p, currentMode),
      )
      .map(preset => ({kind: 'preset' as const, preset, lastUsed: usage[preset.id]}));

    const groups: Node[] = [
      {
        kind: 'group',
        id: 'builtin',
        label: 'Built-in presets',
        children: builtIn,
      },
    ];

    if (userValid.length > 0) {
      groups.push({
        kind: 'group',
        id: 'user',
        label: 'My queries',
        children: userValid,
      });
    }

    return groups;
  }
}
