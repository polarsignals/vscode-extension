import * as vscode from 'vscode';
import * as path from 'path';
import {getPresetById, type QueryPreset} from '../presets/preset-definitions';
import {
  getConfig,
  getBrandNameShort,
  getAutoScrollToAnnotation,
  type PolarSignalsConfig,
} from '../config/settings';
import {ProfilerClient} from '../api/profiler-client';
import {
  parseSourceArrow,
  getUniqueFilenames,
  filterByFilename,
  type SourceLineData,
} from '../converters/source-arrow-converter';
import {getAnnotations} from '../annotations/annotation-manager';
import {pickCandidateAndRequery} from './pick-candidate';
import {sessionStore} from '../state/session-store';
import {getStatusBar} from '../ui/status-bar';
import {scrollToFirstAnnotatedLine} from '../ui/editor-utils';

/**
 * Show a user-facing error for a profile fetch failure. Classifies the cause:
 *  - auth/setup errors get a "Set Up" button that opens the setup wizard,
 *  - OSS-mode network errors point the user at their configured apiUrl,
 *  - everything else falls through to a generic message.
 */
export async function reportProfileError(
  error: unknown,
  config: PolarSignalsConfig | null,
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes('not configured') || message.includes('Please sign in')) {
    const choice = await vscode.window.showErrorMessage(
      `Failed to fetch profile: ${message}`,
      'Set Up',
    );
    if (choice === 'Set Up') {
      await vscode.commands.executeCommand('polarSignals.setupMode');
    }
  } else if (config?.mode === 'oss' && isConnectionError(error)) {
    vscode.window.showErrorMessage(
      `Failed to connect to Parca at ${config.apiUrl}. Check if the server is running and the URL is correct in settings.`,
    );
  } else {
    vscode.window.showErrorMessage(`Failed to fetch profile: ${message}`);
  }
  console.error('Error fetching profile:', error);
}

function isConnectionError(error: unknown): boolean {
  // Browser fetch failures surface as TypeError ("Failed to fetch").
  if (error instanceof TypeError) return true;
  const code =
    (error as {code?: string; cause?: {code?: string}})?.code ??
    (error as {cause?: {code?: string}})?.cause?.code;
  return code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'ETIMEDOUT';
}

/**
 * Fetch profiling data using a specific preset ID without showing the picker.
 * Used for post-onboarding quick start flow.
 */
export async function fetchWithPresetCommand(
  context: vscode.ExtensionContext,
  presetId: string = 'cpu-15m',
): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage('No active file open. Please open a source file first.');
    return;
  }

  const preset = getPresetById(presetId);
  if (!preset) {
    vscode.window.showWarningMessage(
      `Preset "${presetId}" not found, opening query configurator...`,
    );
    await vscode.commands.executeCommand('polarSignals.fetchProfile');
    return;
  }

  try {
    await fetchWithPreset(context, editor, preset);
  } catch (error) {
    const config = await getConfig(context).catch(() => null);
    await reportProfileError(error, config);
  }
}

/**
 * Fetch profile using a preset against the given editor. Shared by the
 * preset-picker command and the post-onboarding quick-start flow.
 */
export async function fetchWithPreset(
  context: vscode.ExtensionContext,
  editor: vscode.TextEditor,
  preset: QueryPreset,
): Promise<void> {
  const currentFilePath = editor.document.uri.fsPath;
  const fileName = path.basename(currentFilePath);

  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  const relativeFilePath = workspaceFolder
    ? path.relative(workspaceFolder.uri.fsPath, currentFilePath)
    : fileName;

  const brandName = getBrandNameShort();
  console.log(`[${brandName}] Using preset: ${preset.name}`);
  console.log(`[${brandName}] Current file: ${currentFilePath}`);

  const config = await getConfig(context);
  const client = new ProfilerClient(config);

  config.profileType = preset.profileType;
  config.defaultTimeRange = preset.timeRange;
  if (preset.labelMatchers) {
    config.queryLabels = preset.labelMatchers;
  }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Fetching profile using "${preset.name}"...`,
      cancellable: false,
    },
    async progress => {
      const query = client.buildQueryForFile(fileName);
      console.log(`[${brandName}] Query: ${query}`);

      progress.report({message: 'Fetching line-level profiling data...'});
      let sourceResult = await client.querySourceReport(query, preset.timeRange, {
        filename: relativeFilePath,
      });

      progress.report({message: 'Processing profiling data...'});
      let allLineData = parseSourceArrow(sourceResult.record);

      if (allLineData.length === 0) {
        const picked = await pickCandidateAndRequery(sourceResult, fileName, filename =>
          client.fetchSourceExact(query, preset.timeRange, filename),
        );
        if (picked) {
          sourceResult = picked;
          allLineData = parseSourceArrow(sourceResult.record);
        }

        if (allLineData.length === 0) {
          getStatusBar().showNoProfile();
          console.log(`[${brandName}] No profiling data found for ${fileName}`);
          vscode.window.showWarningMessage(
            'No profiling data found for this file in the selected time range',
          );
          return;
        }
      }

      const uniqueFilenames = getUniqueFilenames(allLineData);
      let lineData: SourceLineData[];
      let selectedFilename: string;

      if (uniqueFilenames.length <= 1) {
        lineData = allLineData;
        selectedFilename = uniqueFilenames[0] || fileName;
      } else {
        const matched = uniqueFilenames.find(
          f => currentFilePath.endsWith(f) || f.endsWith(relativeFilePath) || f.endsWith(fileName),
        );

        if (matched) {
          lineData = filterByFilename(allLineData, matched);
          selectedFilename = matched;
          console.log(`[${brandName}] Auto-matched filename: ${matched}`);
        } else {
          const selected = await vscode.window.showQuickPick(uniqueFilenames, {
            placeHolder: 'Multiple source files found in profile - select one',
            title: `${brandName}: Select Source File`,
          });
          if (!selected) {
            return;
          }
          lineData = filterByFilename(allLineData, selected);
          selectedFilename = selected;
        }
      }

      progress.report({message: 'Applying annotations...'});

      getAnnotations().applyAnnotations(
        editor,
        lineData,
        sourceResult.unit,
        sourceResult.total,
        sourceResult.filtered,
      );

      const queryConfig = {
        profileType: preset.profileType,
        timeRange: preset.timeRange,
        labelMatchers: preset.labelMatchers ?? {},
      };

      sessionStore.store(currentFilePath, {
        lineData,
        unit: sourceResult.unit,
        total: sourceResult.total,
        filtered: sourceResult.filtered,
        queryConfig,
        sourceFile: {filename: selectedFilename},
        timestamp: Date.now(),
      });

      sessionStore.setLastQueryConfig({
        profileType: preset.profileType,
        timeRange: preset.timeRange,
        labelMatchers: preset.labelMatchers ?? {},
      });

      getStatusBar().showActiveProfile({
        profileType: preset.profileType,
        timeRange: preset.timeRange,
        labelMatchers: preset.labelMatchers,
      });

      if (getAutoScrollToAnnotation()) {
        scrollToFirstAnnotatedLine(editor, lineData);
      }

      vscode.window.showInformationMessage(
        `Profile loaded! ${lineData.length} lines annotated using "${preset.name}"`,
      );
    },
  );
}
