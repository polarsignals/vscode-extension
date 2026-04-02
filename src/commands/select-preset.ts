import * as vscode from 'vscode';
import * as path from 'path';
import {showPresetPicker} from '../presets/preset-picker';
import {getConfig, getBrandNameShort, getAutoScrollToAnnotation} from '../config/settings';
import {ProfilerClient} from '../api/profiler-client';
import {
  parseSourceArrow,
  getUniqueFilenames,
  filterByFilename,
  type SourceLineData,
} from '../converters/source-arrow-converter';
import {getAnnotations} from '../annotations/annotation-manager';
import {sessionStore} from '../state/session-store';
import {getStatusBar} from '../ui/status-bar';
import {scrollToFirstAnnotatedLine} from '../ui/editor-utils';

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
        const sourceResult = await client.querySourceReport(query, preset.timeRange, {
          filename: relativeFilePath,
        });

        progress.report({message: 'Processing profiling data...'});
        const allLineData = parseSourceArrow(sourceResult.record);

        if (allLineData.length === 0) {
          vscode.window.showWarningMessage(
            'No profiling data found for this file in the selected time range',
          );
          return;
        }

        const uniqueFilenames = getUniqueFilenames(allLineData);
        let lineData: SourceLineData[];
        let selectedFilename: string;

        if (uniqueFilenames.length <= 1) {
          lineData = allLineData;
          selectedFilename = uniqueFilenames[0] || fileName;
        } else {
          const matched = uniqueFilenames.find(
            f =>
              currentFilePath.endsWith(f) || f.endsWith(relativeFilePath) || f.endsWith(fileName),
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
