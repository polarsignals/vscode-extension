import * as vscode from 'vscode';
import {getStatusBar} from '../ui/status-bar';
import {getMode, getBrandNameShort} from '../config/settings';

interface StatusMenuItem extends vscode.QuickPickItem {
  action: string;
}

/**
 * Show a quick-pick menu with profile actions when the status bar is clicked.
 */
export async function showStatusMenuCommand(_context: vscode.ExtensionContext): Promise<void> {
  const statusBar = getStatusBar();
  const hasProfile = statusBar.hasActiveProfile();
  const mode = getMode();

  const items: StatusMenuItem[] = [
    {
      label: '$(cloud-download) Fetch Profile',
      description: 'Fetch profiling data for current file',
      action: 'fetch',
    },
    {
      label: '$(list-selection) Select Preset',
      description: 'Quick fetch using a preset configuration',
      action: 'preset',
    },
  ];

  if (hasProfile) {
    items.push(
      {
        label: '$(copy) Copy File Summary for AI',
        description: 'Copy profiling summary to paste into AI assistant',
        action: 'copy-file-for-ai',
      },
      {
        label: '$(trash) Clear Annotations',
        description: 'Remove profiling annotations from current file',
        action: 'clear',
      },
    );
  }

  if (mode !== 'oss') {
    items.push({
      label: '$(link-external) Import from URL',
      description: 'Import query configuration from Polar Signals Cloud URL',
      action: 'import',
    });
  }

  items.push(
    {
      label: '$(settings-gear) Change Mode',
      description: `Currently: ${mode === 'oss' ? 'Parca OSS' : 'Polar Signals Cloud'}`,
      action: 'setup',
    },
    {
      label: '$(gear) Configure Defaults',
      description: 'Open extension settings',
      action: 'configure',
    },
  );

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select an action',
    title: `${getBrandNameShort()}: Quick Actions`,
  });

  if (!selected) {
    return;
  }

  switch (selected.action) {
    case 'fetch':
      await vscode.commands.executeCommand('polarSignals.fetchProfile');
      break;
    case 'preset':
      await vscode.commands.executeCommand('polarSignals.selectPreset');
      break;
    case 'clear':
      await vscode.commands.executeCommand('polarSignals.clearAnnotations');
      break;
    case 'copy-file-for-ai':
      await vscode.commands.executeCommand('polarSignals.copyFileForAI');
      break;
    case 'import':
      await vscode.commands.executeCommand('polarSignals.importFromUrl');
      break;
    case 'setup':
      await vscode.commands.executeCommand('polarSignals.setupMode');
      break;
    case 'configure':
      await vscode.commands.executeCommand('polarSignals.configureDefaults');
      break;
  }
}
