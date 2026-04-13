import * as vscode from 'vscode';
import * as path from 'path';
import {getConfig, getBrandNameShort} from '../config/settings';
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
import {decodeFilters} from '../filters/filter-encoding';
import {type ProfileFilter} from '../filters/filter-types';
import {convertToProtoFilters} from '../filters/filter-converter';
import {findMatchingFile} from '../uri/file-matcher';

export interface ParsedPolarSignalsUrl {
  expression?: string;
  profileType?: string;
  labelMatchers: Record<string, string>;
  timeRange?: string;
  from?: number;
  to?: number;
  profileFilters: ProfileFilter[];
  sourceFilename?: string;
}

/**
 * Import query configuration from a Polar Signals Cloud URL and fetch profiling data.
 */
export async function importFromUrlCommand(context: vscode.ExtensionContext): Promise<void> {
  const brandName = getBrandNameShort();

  try {
    const urlInput = await vscode.window.showInputBox({
      prompt: 'Paste a profiler URL to import query configuration',
      placeHolder: 'https://...',
      title: `${brandName}: Import from URL`,
      validateInput: input => {
        if (!input || input.trim() === '') {
          return 'URL cannot be empty';
        }
        try {
          const url = new URL(input.trim());
          void url;
          return null;
        } catch {
          return 'Please enter a valid URL';
        }
      },
    });

    if (!urlInput) {
      return;
    }

    const parsed = parsePolarSignalsUrl(urlInput.trim());

    if (!parsed.profileType && !parsed.expression) {
      vscode.window.showErrorMessage(
        'Could not extract profile type from URL. Make sure the URL contains valid query parameters.',
      );
      return;
    }

    console.log(`[${brandName}] Parsed URL:`, parsed);

    const config = await getConfig(context);
    const client = new ProfilerClient(config);

    const profileType = parsed.profileType ?? config.profileType;
    const timeRange = parsed.timeRange ?? config.defaultTimeRange;
    const labelMatchers = {...config.queryLabels, ...parsed.labelMatchers};

    config.profileType = profileType;
    config.defaultTimeRange = timeRange;
    config.queryLabels = labelMatchers;

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('No file is currently open. Please open a source file first.');
      return;
    }

    const currentFilePath = editor.document.uri.fsPath;
    const currentFileName = path.basename(currentFilePath);

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const relativeFilePath = workspaceFolder
      ? path.relative(workspaceFolder.uri.fsPath, currentFilePath)
      : currentFileName;

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Importing profile from URL...',
        cancellable: false,
      },
      async progress => {
        const query = client.buildQueryForFile('');
        console.log(`[${brandName}] Query: ${query}`);

        const filenameHint = parsed.sourceFilename ?? relativeFilePath;

        if (!parsed.sourceFilename) {
          vscode.window.showInformationMessage(
            `No source filename detected in URL. Using current file: ${relativeFilePath}`,
          );
        }

        progress.report({message: 'Fetching line-level profiling data...'});
        const protoFilters = convertToProtoFilters(parsed.profileFilters);
        let sourceResult = await client.querySourceReport(
          query,
          timeRange,
          {
            filename: filenameHint,
          },
          protoFilters,
        );

        progress.report({message: 'Processing profiling data...'});
        let allLineData = parseSourceArrow(sourceResult.record);

        if (allLineData.length === 0) {
          const picked = await pickCandidateAndRequery(sourceResult, currentFileName, filename =>
            client.fetchSourceExact(query, timeRange, filename, protoFilters),
          );
          if (picked) {
            sourceResult = picked;
            allLineData = parseSourceArrow(sourceResult.record);
          }

          if (allLineData.length === 0) {
            vscode.window.showErrorMessage(
              'No source files found in profile data for this time range',
            );
            return;
          }
        }

        const uniqueFilenames = getUniqueFilenames(allLineData);
        let lineData: SourceLineData[];
        let selectedFilename: string;

        if (uniqueFilenames.length <= 1) {
          lineData = allLineData;
          selectedFilename = uniqueFilenames[0] || filenameHint;
        } else if (parsed.sourceFilename) {
          const sourceFilename = parsed.sourceFilename;
          const matched = uniqueFilenames.find(
            f => f === sourceFilename || f.endsWith(sourceFilename) || sourceFilename.endsWith(f),
          );

          if (matched) {
            lineData = filterByFilename(allLineData, matched);
            selectedFilename = matched;
          } else {
            const selected = await vscode.window.showQuickPick(uniqueFilenames, {
              placeHolder: 'Multiple source files found - select one',
              title: `${brandName}: Select Source File`,
            });
            if (!selected) {
              return;
            }
            lineData = filterByFilename(allLineData, selected);
            selectedFilename = selected;
          }
        } else {
          const selected = await vscode.window.showQuickPick(uniqueFilenames, {
            placeHolder: 'Multiple source files found - select one',
            title: `${brandName}: Select Source File`,
          });
          if (!selected) {
            return;
          }
          lineData = filterByFilename(allLineData, selected);
          selectedFilename = selected;
        }

        console.log(`[${brandName}] Selected file: ${selectedFilename}`);

        progress.report({message: 'Finding local file...'});
        let targetFile = await findMatchingFile(selectedFilename);

        if (!targetFile) {
          const action = await vscode.window.showWarningMessage(
            `Could not find local file matching: ${selectedFilename}`,
            'Select File Manually',
            'Cancel',
          );

          if (action === 'Select File Manually') {
            const files = await vscode.window.showOpenDialog({
              canSelectMany: false,
              openLabel: 'Select Source File',
              title: 'Select the source file to annotate',
            });
            if (files?.[0]) {
              targetFile = files[0];
            }
          }
        }

        if (!targetFile) {
          vscode.window.showWarningMessage('No file selected. Cannot apply annotations.');
          return;
        }

        const document = await vscode.workspace.openTextDocument(targetFile);
        const editor = await vscode.window.showTextDocument(document);
        const currentFilePath = editor.document.uri.fsPath;

        progress.report({message: 'Applying annotations...'});

        getAnnotations().applyAnnotations(
          editor,
          lineData,
          sourceResult.unit,
          sourceResult.total,
          sourceResult.filtered,
        );

        const queryConfig = {
          profileType,
          timeRange,
          labelMatchers,
        };

        sessionStore.store(currentFilePath, {
          lineData,
          unit: sourceResult.unit,
          total: sourceResult.total,
          filtered: sourceResult.filtered,
          queryConfig,
          sourceFile: {
            filename: selectedFilename,
          },
          timestamp: Date.now(),
        });

        sessionStore.setLastQueryConfig({
          profileType,
          timeRange,
          labelMatchers,
        });

        getStatusBar().showActiveProfile({
          profileType,
          timeRange,
          labelMatchers,
        });

        const filtersInfo =
          parsed.profileFilters.length > 0 ? ` with ${parsed.profileFilters.length} filter(s)` : '';
        vscode.window.showInformationMessage(
          `Profile imported! ${lineData.length} lines annotated${filtersInfo}`,
        );
      },
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Failed to import profile: ${errorMessage}`);
    console.error('Error importing profile from URL:', error);
  }
}

/**
 * Parse a Polar Signals Cloud URL and extract query configuration.
 */
export function parsePolarSignalsUrl(urlString: string): ParsedPolarSignalsUrl {
  const url = new URL(urlString);
  const params = url.searchParams;

  const result: ParsedPolarSignalsUrl = {
    labelMatchers: {},
    profileFilters: [],
  };

  const expression = params.get('expression_a') ?? params.get('expression');
  if (expression) {
    result.expression = expression;
    const parsed = parseExpression(expression);
    result.profileType = parsed.profileType;
    result.labelMatchers = parsed.labelMatchers;
  }

  const timeSelection = params.get('time_selection_a') ?? params.get('time_selection');
  if (timeSelection) {
    result.timeRange = parseTimeSelection(timeSelection);
  }

  const from = params.get('from_a') ?? params.get('from');
  const to = params.get('to_a') ?? params.get('to');
  if (from) result.from = parseInt(from, 10);
  if (to) result.to = parseInt(to, 10);

  if (!result.timeRange && result.from && result.to) {
    const durationMs = result.to - result.from;
    result.timeRange = computeTimeRange(durationMs);
  }

  const filters = params.get('profile_filters');
  if (filters) {
    result.profileFilters = decodeFilters(filters);
  }

  const sourceFilename = params.get('source_filename') ?? params.get('filename');
  if (sourceFilename) {
    result.sourceFilename = sourceFilename;
  }

  return result;
}

/**
 * Parse a profile expression like "parca_agent:samples:count:cpu:nanoseconds:delta{comm=\"api\"}"
 */
export function parseExpression(expression: string): {
  profileType: string;
  labelMatchers: Record<string, string>;
} {
  const labelMatchers: Record<string, string> = {};

  const braceStart = expression.indexOf('{');
  const braceEnd = expression.lastIndexOf('}');

  let profileType = expression;

  if (braceStart !== -1 && braceEnd > braceStart) {
    profileType = expression.slice(0, braceStart);
    const labelSelector = expression.slice(braceStart + 1, braceEnd);

    const labelRegex = /(\w+)\s*=\s*"([^"]+)"/g;
    let match;
    while ((match = labelRegex.exec(labelSelector)) !== null) {
      labelMatchers[match[1]] = match[2];
    }
  }

  return {profileType, labelMatchers};
}

/**
 * Parse time selection format like "relative:minute|15" or "absolute:..."
 */
export function parseTimeSelection(timeSelection: string): string {
  if (timeSelection.startsWith('relative:')) {
    const parts = timeSelection.slice(9).split('|');
    const unit = parts[0];
    const value = parseInt(parts[1] ?? '15', 10);

    switch (unit) {
      case 'minute':
        return `${value}m`;
      case 'hour':
        return `${value}h`;
      case 'day':
        return `${value}d`;
      default:
        return '15m';
    }
  }

  return '15m';
}

export function computeTimeRange(durationMs: number): string {
  const minutes = Math.round(durationMs / 60000);

  if (minutes <= 5) return '5m';
  if (minutes <= 15) return '15m';
  if (minutes <= 60) return '1h';
  if (minutes <= 1440) return '24h';
  if (minutes <= 10080) return '7d';
  return '30d';
}
