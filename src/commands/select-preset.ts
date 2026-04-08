import * as vscode from 'vscode';
import {showPresetPicker} from '../presets/preset-picker';
import {fetchWithPreset} from './fetch-with-preset';

/**
 * Select a preset and fetch profiling data using it.
 * This provides a 2-click flow: select preset -> fetch.
 */
export async function selectPresetCommand(context: vscode.ExtensionContext): Promise<void> {
  try {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('No active file open');
      return;
    }

    const preset = await showPresetPicker(context);
    if (!preset) {
      return;
    }

    await fetchWithPreset(context, editor, preset);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('not configured') || errorMessage.includes('Please sign in')) {
      const choice = await vscode.window.showErrorMessage(
        `Failed to fetch profile: ${errorMessage}`,
        'Set Up',
      );
      if (choice === 'Set Up') {
        await vscode.commands.executeCommand('polarSignals.setupMode');
      }
    } else {
      vscode.window.showErrorMessage(`Failed to fetch profile: ${errorMessage}`);
    }
    console.error('Error fetching profile with preset:', error);
  }
}
