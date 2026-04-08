import * as vscode from 'vscode';
import * as path from 'path';
import {getConfig, getBrandNameShort, getAutoScrollToAnnotation} from '../config/settings';
import {ProfilerClient} from '../api/profiler-client';
import {
  parseSourceArrow,
  getUniqueFilenames,
  filterByFilename,
  type SourceLineData,
} from '../converters/source-arrow-converter';
import {getAnnotations} from '../annotations/annotation-manager';
import {pickCandidateAndRequery} from './pick-candidate';
import {QueryConfigurator} from '../ui/query-configurator';
import {sessionStore} from '../state/session-store';
import {getStatusBar} from '../ui/status-bar';
import {scrollToFirstAnnotatedLine} from '../ui/editor-utils';

export async function fetchProfileCommand(context: vscode.ExtensionContext): Promise<void> {
  try {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('No active file open');
      return;
    }

    const currentFilePath = editor.document.uri.fsPath;
    const fileName = path.basename(currentFilePath);

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const relativeFilePath = workspaceFolder
      ? path.relative(workspaceFolder.uri.fsPath, currentFilePath)
      : fileName;

    const brandName = getBrandNameShort();
    console.log(`[${brandName}] Current file: ${currentFilePath}`);
    console.log(`[${brandName}] Workspace-relative path: ${relativeFilePath}`);

    const config = await getConfig(context);
    const client = new ProfilerClient(config);

    const configurator = new QueryConfigurator({
      getProfileTypes: async timeRange => await client.getProfileTypes(timeRange),
      getLabels: async (profileType, timeRange) => await client.getLabels(profileType, timeRange),
      getValues: async (profileType, labelName, timeRange) =>
        await client.getValues(profileType, labelName, timeRange),
    });

    const queryConfig = await configurator.configure();
    if (!queryConfig) {
      return;
    }

    console.log(`[${brandName}] Query configuration:`, queryConfig);

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Fetching profile for ${fileName}...`,
        cancellable: false,
      },
      async progress => {
        config.profileType = queryConfig.profileType;
        config.defaultTimeRange =
          typeof queryConfig.timeRange === 'string' ? queryConfig.timeRange : '1h';
        config.queryLabels = queryConfig.labelMatchers;

        const query = client.buildQueryForFile(fileName);
        console.log(`[${brandName}] Query: ${query}`);

        progress.report({message: 'Fetching line-level profiling data...'});
        let sourceResult = await client.querySourceReport(query, queryConfig.timeRange, {
          filename: relativeFilePath,
        });

        progress.report({message: 'Processing profiling data...'});
        let allLineData = parseSourceArrow(sourceResult.record);

        if (allLineData.length === 0) {
          const picked = await pickCandidateAndRequery(sourceResult, fileName, filename =>
            client.fetchSourceExact(query, queryConfig.timeRange, filename),
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
          profileType: queryConfig.profileType,
          timeRange: queryConfig.timeRange,
          labelMatchers: queryConfig.labelMatchers,
        });

        getStatusBar().showActiveProfile({
          profileType: queryConfig.profileType,
          timeRange: queryConfig.timeRange,
          labelMatchers: queryConfig.labelMatchers,
        });

        const labelFilters =
          Object.keys(queryConfig.labelMatchers).length > 0
            ? Object.entries(queryConfig.labelMatchers)
                .map(([k, v]) => `${k}="${v}"`)
                .join(', ')
            : 'No filters';

        const timeRangeDisplay =
          typeof queryConfig.timeRange === 'string'
            ? queryConfig.timeRange
            : `${Math.round((queryConfig.timeRange.to - queryConfig.timeRange.from) / 60000)}m`;

        if (getAutoScrollToAnnotation()) {
          scrollToFirstAnnotatedLine(editor, lineData);
        }

        vscode.window.showInformationMessage(
          `Profile loaded! ${lineData.length} lines annotated. Query: ${queryConfig.profileType
            .split(':')
            .slice(-3)
            .join(':')} {${labelFilters}} over ${timeRangeDisplay}`,
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
      const config = await getConfig(context).catch(() => null);
      if (
        config?.mode === 'oss' &&
        (errorMessage.includes('fetch') ||
          errorMessage.includes('network') ||
          errorMessage.includes('ECONNREFUSED'))
      ) {
        vscode.window.showErrorMessage(
          `Failed to connect to Parca at ${config.apiUrl}. Check if the server is running and the URL is correct in settings.`,
        );
      } else {
        vscode.window.showErrorMessage(`Failed to fetch profile: ${errorMessage}`);
      }
    }
    console.error('Error fetching profile:', error);
  }
}

/**
 * Restore cached profiling annotations when navigating back to a file.
 * Called by the editor change listener in extension.ts.
 */
export function restoreCachedAnnotations(editor: vscode.TextEditor): boolean {
  const filePath = editor.document.uri.fsPath;
  const cached = sessionStore.get(filePath);

  if (!cached) {
    return false;
  }

  getAnnotations().applyAnnotations(
    editor,
    cached.lineData,
    cached.unit,
    cached.total,
    cached.filtered,
  );

  getStatusBar().showActiveProfile({
    profileType: cached.queryConfig.profileType,
    timeRange: cached.queryConfig.timeRange,
    labelMatchers: cached.queryConfig.labelMatchers,
  });

  const brandName = getBrandNameShort();
  console.log(`[${brandName}] Restored cached annotations for ${filePath}`);
  return true;
}

export function clearCachedAnnotations(filePath: string): void {
  sessionStore.remove(filePath);
}

export function hasCachedProfile(filePath: string): boolean {
  return sessionStore.has(filePath);
}
