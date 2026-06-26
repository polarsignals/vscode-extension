import * as vscode from 'vscode';
import {getConfig, getMode, getBrandNameShort} from '../config/settings';
import {ProfilerClient} from '../api/profiler-client';
import {formatProfileType} from '../ui/query-configurator';
import {sessionStore} from '../state/session-store';
import {fetchWithPreset, reportProfileError} from '../commands/fetch-with-preset';
import {type QueryPreset} from '../presets/preset-definitions';
import {RefreshableTreeProvider} from './tree-provider';
import {trackQueryBuilderTimeRangeSelection} from '../usage';

interface Draft {
  profileType: string | undefined;
  timeRange: string;
  filters: Record<string, string>;
}

type Row =
  | {kind: 'profileType'}
  | {kind: 'timeRange'}
  | {kind: 'filter'; label: string; value: string}
  | {kind: 'addFilter'};

const TIME_RANGES = [
  {label: '5 minutes', value: '5m'},
  {label: '15 minutes', value: '15m'},
  {label: '1 hour', value: '1h'},
  {label: '24 hours', value: '24h'},
  {label: '7 days', value: '7d'},
  {label: '30 days', value: '30d'},
];

export class QueryBuilderViewProvider extends RefreshableTreeProvider<Row> {
  private readonly draft: Draft;

  constructor(private readonly context: vscode.ExtensionContext) {
    super();
    // Seed from the last run so the builder opens pre-filled rather than blank.
    const last = sessionStore.getLastQueryConfig();
    this.draft = {
      profileType: last?.profileType,
      timeRange: typeof last?.timeRange === 'string' ? last.timeRange : '15m',
      filters: last ? {...last.labelMatchers} : {},
    };
  }

  getTreeItem(row: Row): vscode.TreeItem {
    switch (row.kind) {
      case 'profileType': {
        const item = new vscode.TreeItem('Profile type', vscode.TreeItemCollapsibleState.None);
        item.description = this.draft.profileType
          ? formatProfileType(this.draft.profileType).label
          : 'Choose…';
        item.tooltip = this.draft.profileType;
        item.iconPath = new vscode.ThemeIcon('pulse');
        item.command = {command: 'polarSignals.queryBuilder.setProfileType', title: 'Set'};
        return item;
      }
      case 'timeRange': {
        const item = new vscode.TreeItem('Time range', vscode.TreeItemCollapsibleState.None);
        item.description = this.draft.timeRange;
        item.iconPath = new vscode.ThemeIcon('history');
        item.command = {command: 'polarSignals.queryBuilder.setTimeRange', title: 'Set'};
        return item;
      }
      case 'filter': {
        const item = new vscode.TreeItem(row.label, vscode.TreeItemCollapsibleState.None);
        item.description = `= ${row.value}`;
        item.iconPath = new vscode.ThemeIcon('filter');
        item.contextValue = 'queryFilter';
        item.command = {
          command: 'polarSignals.queryBuilder.editFilter',
          title: 'Edit',
          arguments: [row.label],
        };
        return item;
      }
      case 'addFilter': {
        const item = new vscode.TreeItem('Add filter…', vscode.TreeItemCollapsibleState.None);
        item.iconPath = new vscode.ThemeIcon('add');
        item.command = {command: 'polarSignals.queryBuilder.addFilter', title: 'Add Filter'};
        return item;
      }
    }
  }

  getChildren(): Row[] {
    // Empty when unconfigured so the viewsWelcome shows instead.
    if (!getMode()) return [];

    const rows: Row[] = [{kind: 'profileType'}, {kind: 'timeRange'}];
    for (const [label, value] of Object.entries(this.draft.filters)) {
      rows.push({kind: 'filter', label, value});
    }
    rows.push({kind: 'addFilter'});
    return rows;
  }

  // ── Mutations (called by the registered commands) ──────────────────────

  async chooseProfileType(): Promise<void> {
    const client = await this.client();
    if (!client) return;

    const types = await client.getProfileTypes(this.draft.timeRange);
    if (types.length === 0) {
      vscode.window.showWarningMessage('No profile types available for this time range.');
      return;
    }

    const picked = await vscode.window.showQuickPick(
      types.map(pt => {
        const f = formatProfileType(pt);
        return {label: f.label, description: f.description, detail: f.detail, profileType: pt};
      }),
      {
        placeHolder: 'Select profile type',
        title: `${getBrandNameShort()}: Profile Type`,
        matchOnDescription: true,
      },
    );
    if (!picked) return;
    this.draft.profileType = picked.profileType;
    this.refresh();
  }

  async chooseTimeRange(): Promise<void> {
    const picked = await vscode.window.showQuickPick(TIME_RANGES, {
      placeHolder: 'Select time range',
      title: `${getBrandNameShort()}: Time Range`,
    });
    if (!picked) return;
    this.draft.timeRange = picked.value;
    trackQueryBuilderTimeRangeSelection(picked.value);
    this.refresh();
  }

  async addFilter(): Promise<void> {
    if (!this.draft.profileType) {
      vscode.window.showWarningMessage('Choose a profile type before adding filters.');
      return;
    }
    const client = await this.client();
    if (!client) return;

    const labels = (await client.getLabels(this.draft.profileType, this.draft.timeRange)).sort();
    if (labels.length === 0) {
      vscode.window.showInformationMessage('No labels available for this profile type.');
      return;
    }

    const label = await vscode.window.showQuickPick(labels, {
      placeHolder: 'Select a label to filter on',
      title: `${getBrandNameShort()}: Add Filter`,
    });
    if (!label) return;
    await this.pickValue(client, label);
  }

  async editFilter(label: string): Promise<void> {
    const client = await this.client();
    if (!client || !this.draft.profileType) return;
    await this.pickValue(client, label);
  }

  removeFilter(arg: string | {label?: string}): void {
    const label = typeof arg === 'string' ? arg : arg?.label;
    if (!label) return;
    delete this.draft.filters[label];
    this.refresh();
  }

  reset(): void {
    this.draft.profileType = undefined;
    this.draft.timeRange = '15m';
    this.draft.filters = {};
    this.refresh();
  }

  async run(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('No active file open. Open a source file first.');
      return;
    }
    if (!this.draft.profileType) {
      vscode.window.showWarningMessage('Choose a profile type before running.');
      return;
    }

    const preset: QueryPreset = {
      id: '__query_builder__',
      name: 'Custom query',
      profileType: this.draft.profileType,
      timeRange: this.draft.timeRange,
      labelMatchers: {...this.draft.filters},
    };

    try {
      await fetchWithPreset(this.context, editor, preset);
    } catch (error) {
      const config = await getConfig(this.context).catch(() => null);
      await reportProfileError(error, config);
    }
  }

  private async pickValue(client: ProfilerClient, label: string): Promise<void> {
    const values = (
      await client.getValues(this.draft.profileType!, label, this.draft.timeRange)
    ).sort();
    if (values.length === 0) {
      vscode.window.showInformationMessage(`No values found for "${label}".`);
      return;
    }
    const value = await vscode.window.showQuickPick(values, {
      placeHolder: `Select value for "${label}"`,
      title: `${getBrandNameShort()}: ${label}`,
    });
    if (!value) return;
    this.draft.filters[label] = value;
    this.refresh();
  }

  private async client(): Promise<ProfilerClient | null> {
    try {
      const config = await getConfig(this.context);
      return new ProfilerClient(config);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const choice = await vscode.window.showErrorMessage(message, 'Set Up');
      if (choice === 'Set Up') await vscode.commands.executeCommand('polarSignals.setupMode');
      return null;
    }
  }
}
