import * as vscode from 'vscode';
import * as path from 'path';
import {getConfig, getBrandNameShort} from '../config/settings';
import {getProfilerClient} from '../api/profiler-client';
import {
  parseSourceArrow,
  getUniqueFilenames,
  filterByFilename,
} from '../converters/source-arrow-converter';
import {getAnnotations} from '../annotations/annotation-manager';
import {sessionStore, type LastQueryConfig} from '../state/session-store';
import {getStatusBar} from '../ui/status-bar';

/**
 * Try to resolve a remote filename (from profiling data) to a local file path.
 * Returns null if the file doesn't exist locally.
 */
function resolveToLocalPath(
  remoteFilename: string,
  workspaceFolder: vscode.WorkspaceFolder | undefined,
): string | null {
  if (!workspaceFolder) return null;

  const directPath = path.join(workspaceFolder.uri.fsPath, remoteFilename);
  return directPath;
}

export interface SilentFetchOptions {
  context: vscode.ExtensionContext;
  editor: vscode.TextEditor;
  queryConfig: LastQueryConfig;
  signal?: AbortSignal;
}

export async function silentFetchProfile(options: SilentFetchOptions): Promise<void> {
  const {context, editor, queryConfig, signal} = options;
  const currentFilePath = editor.document.uri.fsPath;
  const fileName = path.basename(currentFilePath);
  const brandName = getBrandNameShort();

  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  const relativeFilePath = workspaceFolder
    ? path.relative(workspaceFolder.uri.fsPath, currentFilePath)
    : fileName;

  const config = await getConfig(context);
  config.profileType = queryConfig.profileType;
  config.defaultTimeRange =
    typeof queryConfig.timeRange === 'string' ? queryConfig.timeRange : '1h';
  config.queryLabels = queryConfig.labelMatchers;

  const client = getProfilerClient(config);
  const query = client.buildQueryForFile(fileName);

  if (signal?.aborted) return;

  const sourceResult = await client.querySourceReport(query, queryConfig.timeRange, {
    buildId: '',
    filename: relativeFilePath,
  });

  if (signal?.aborted) return;

  const allLineData = parseSourceArrow(sourceResult.record);
  if (allLineData.length === 0) {
    console.log(`[${brandName}] Auto-fetch: No profiling data found for ${fileName}`);
    getStatusBar().showNoProfile();
    return;
  }

  const uniqueFilenames = getUniqueFilenames(allLineData);
  let lineData = allLineData;
  let selectedFilename = uniqueFilenames[0] ?? fileName;

  if (uniqueFilenames.length > 1) {
    const matched = uniqueFilenames.find(
      f => currentFilePath.endsWith(f) || f.endsWith(relativeFilePath) || f.endsWith(fileName),
    );
    if (matched) {
      lineData = filterByFilename(allLineData, matched);
      selectedFilename = matched;
    }
  }

  if (signal?.aborted) return;

  getAnnotations().applyAnnotations(
    editor,
    lineData,
    sourceResult.unit,
    sourceResult.total,
    sourceResult.filtered,
  );

  const cacheData = {
    unit: sourceResult.unit,
    total: sourceResult.total,
    filtered: sourceResult.filtered,
    queryConfig: {
      profileType: queryConfig.profileType,
      timeRange: queryConfig.timeRange,
      labelMatchers: queryConfig.labelMatchers,
    },
    timestamp: Date.now(),
  };

  for (const remoteFilename of uniqueFilenames) {
    const fileLineData = filterByFilename(allLineData, remoteFilename);
    if (fileLineData.length === 0) continue;

    const localPath = resolveToLocalPath(remoteFilename, workspaceFolder);
    if (localPath) {
      sessionStore.store(localPath, {
        ...cacheData,
        lineData: fileLineData,
        sourceFile: {filename: remoteFilename, buildId: ''},
      });
    }
  }

  sessionStore.store(currentFilePath, {
    ...cacheData,
    lineData,
    sourceFile: {filename: selectedFilename, buildId: ''},
  });

  getStatusBar().showActiveProfile({
    profileType: queryConfig.profileType,
    timeRange: queryConfig.timeRange,
    labelMatchers: queryConfig.labelMatchers,
  });

  console.log(`[${brandName}] Auto-fetch: Applied ${lineData.length} annotations for ${fileName}`);
}
