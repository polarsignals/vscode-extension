import * as vscode from 'vscode';
import {showPresetPicker} from '../presets/preset-picker';
import {fetchWithPreset, reportProfileError} from './fetch-with-preset';
import {getConfig} from '../config/settings';

/**
 * Select a preset and fetch profiling data using it.
 * This provides a 2-click flow: select preset -> fetch.
 */
export async function selectPresetCommand(context: vscode.ExtensionContext): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage('No active file open');
    return;
  }

  const preset = await showPresetPicker(context);
  if (!preset) return;

  try {
    await fetchWithPreset(context, editor, preset);
  } catch (error) {
    const config = await getConfig(context).catch(() => null);
    await reportProfileError(error, config);
  }
}
