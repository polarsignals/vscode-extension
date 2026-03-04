import * as vscode from 'vscode';
import {type QueryPreset, getAllPresets} from './preset-definitions';

interface PresetQuickPickItem extends vscode.QuickPickItem {
  preset: QueryPreset;
}

export async function showPresetPicker(): Promise<QueryPreset | null> {
  const presets = getAllPresets();

  if (presets.length === 0) {
    vscode.window.showWarningMessage('No presets available. Configure presets in settings.');
    return null;
  }

  const items: PresetQuickPickItem[] = presets.map(preset => ({
    label: preset.name,
    description: preset.timeRange,
    detail: preset.description ?? `${preset.profileType}`,
    preset,
  }));

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select a preset to fetch profiling data',
    title: 'Polar Signals: Select Preset',
    matchOnDescription: true,
    matchOnDetail: true,
  });

  return selected?.preset ?? null;
}
