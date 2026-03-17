import * as vscode from 'vscode';
import {type QueryPreset, getAllPresets} from './preset-definitions';

const PRESET_USAGE_KEY = 'polarsignals.presetUsage';

interface PresetQuickPickItem extends vscode.QuickPickItem {
  preset: QueryPreset;
}

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export async function showPresetPicker(
  context: vscode.ExtensionContext,
): Promise<QueryPreset | null> {
  const presets = getAllPresets();

  if (presets.length === 0) {
    vscode.window.showWarningMessage('No presets available. Configure presets in settings.');
    return null;
  }

  const usage = context.globalState.get<Record<string, number>>(PRESET_USAGE_KEY) ?? {};

  const sorted = [...presets].sort((a, b) => {
    const aTime = usage[a.id] ?? 0;
    const bTime = usage[b.id] ?? 0;
    if (aTime && bTime) return bTime - aTime;
    if (aTime) return -1;
    if (bTime) return 1;
    return 0;
  });

  const items: PresetQuickPickItem[] = sorted.map(preset => {
    const lastUsed = usage[preset.id];
    const description = lastUsed
      ? `${preset.timeRange} · Last used ${formatTimeAgo(lastUsed)}`
      : preset.timeRange;

    return {
      label: preset.name,
      description,
      detail: preset.description ?? `${preset.profileType}`,
      preset,
    };
  });

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select a preset to fetch profiling data',
    title: 'Polar Signals: Select Preset',
    matchOnDescription: true,
    matchOnDetail: true,
  });

  if (selected) {
    await context.globalState.update(PRESET_USAGE_KEY, {
      ...usage,
      [selected.preset.id]: Date.now(),
    });
  }

  return selected?.preset ?? null;
}
