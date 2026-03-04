import * as vscode from 'vscode';
import * as path from 'path';
import {getConfig, getBrandNameShort, invalidateConfigCache} from '../config/settings';
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
import {decodeFilters} from '../filters/filter-encoding';
import {convertToProtoFilters} from '../filters/filter-converter';
import {findMatchingFile} from './file-matcher';
import {getPathResolver} from '../repository/path-resolver';
import {PolarSignalsAuthProvider} from '../auth/oauth-provider';

/**
 * URI Handler for vscode://polarsignals.polar-signals-profiler deep links.
 *
 * Supported paths:
 *
 * /configure - Configure the extension from cloud dashboard
 *   vscode://polarsignals.polar-signals-profiler/configure?project_id=abc123
 *
 * /open - Open a file with profiling annotations
 *   vscode://polarsignals.polar-signals-profiler/open?
 *     expression_a=process_cpu:samples:count:cpu:nanoseconds:delta{comm="api"}
 *     &time_selection_a=relative:minute|15
 *     &from_a=1769092814252
 *     &to_a=1769093714252
 *     &profile_filters=s:fn:~:RenderFlamegraph
 *     &filename=pkg/query/query.go
 *     &build_id=abc123
 *     &line=42
 */
export class PolarSignalsUriHandler implements vscode.UriHandler {
  constructor(private readonly context: vscode.ExtensionContext) {}

  async handleUri(uri: vscode.Uri): Promise<void> {
    console.log(`[${getBrandNameShort()}] Handling URI:`, uri.toString());

    try {
      const action = uri.path.replace(/^\//, '');

      if (action === 'configure') {
        const params = new URLSearchParams(uri.query as string);
        await this.handleConfigureAction(params);
        return;
      }

      const decodedQuery = decodeURIComponent(uri.query as string);
      const params = new URLSearchParams(decodedQuery);

      if (action !== 'open') {
        vscode.window.showErrorMessage(`Unknown action: ${action}`);
        return;
      }

      await this.handleOpenAction(params);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Failed to handle deep link: ${message}`);
      console.error(`[${getBrandNameShort()}] URI handler error:`, error);
    }
  }

  private async handleConfigureAction(params: URLSearchParams): Promise<void> {
    const projectId = params.get('project_id');

    if (!projectId) {
      vscode.window.showErrorMessage('Missing project_id in configure URL');
      return;
    }

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Configuring Polar Signals extension...',
        cancellable: false,
      },
      async progress => {
        progress.report({message: 'Signing in...'});

        const session = await vscode.authentication.getSession(
          PolarSignalsAuthProvider.id,
          ['openid', 'profile', 'email', 'offline_access'],
          {createIfNone: true},
        );

        if (!session) {
          vscode.window.showErrorMessage('Sign-in was cancelled');
          return;
        }

        progress.report({message: 'Configuring project...'});

        const config = vscode.workspace.getConfiguration('polarSignals');
        await config.update('mode', 'cloud', vscode.ConfigurationTarget.Global);
        await config.update('projectId', projectId, vscode.ConfigurationTarget.Global);

        invalidateConfigCache();

        vscode.window.showInformationMessage(
          `Polar Signals extension configured for project: ${projectId}`,
        );
      },
    );
  }

  private async handleOpenAction(params: URLSearchParams): Promise<void> {
    const expression = params.get('expression_a');
    const timeSelectionParam = params.get('time_selection_a');
    const fromParam = params.get('from_a');
    const toParam = params.get('to_a');
    const profileFilters = params.get('profile_filters');
    const filename = params.get('filename');
    const buildId = params.get('build_id');
    const line = params.get('line');

    let timeRangeParam = '15m';
    if (timeSelectionParam) {
      const match = timeSelectionParam.match(/relative:(\w+)\|(\d+)/);
      if (match) {
        const unit = match[1];
        const value = match[2];
        const unitMap: Record<string, string> = {minute: 'm', hour: 'h', day: 'd'};
        timeRangeParam = `${value}${unitMap[unit] ?? 'm'}`;
      }
    }

    const timeRange =
      fromParam && toParam
        ? {from: parseInt(fromParam, 10), to: parseInt(toParam, 10)}
        : timeRangeParam;

    let profileType: string | undefined;
    let labelMatchers: Record<string, string> = {};

    if (expression) {
      const parsed = parseExpression(expression);
      profileType = parsed.profileType;
      labelMatchers = parsed.labelMatchers;
    }

    const filters = profileFilters ? decodeFilters(profileFilters) : [];

    let targetFile: vscode.Uri | undefined;

    if (filename) {
      const resolver = getPathResolver();
      const resolved = await resolver.resolve(filename);

      if (resolved) {
        targetFile = vscode.Uri.file(resolved.absolutePath);
        console.log(`[${getBrandNameShort()}] Resolved via repo mapping: ${resolved.absolutePath}`);
      } else {
        targetFile = await findMatchingFile(filename);
      }

      if (!targetFile) {
        const action = await vscode.window.showWarningMessage(
          `Could not find local file matching: ${filename}`,
          'Select File Manually',
          'Cancel',
        );

        if (action === 'Select File Manually') {
          const files = await vscode.window.showOpenDialog({
            canSelectMany: false,
            openLabel: 'Select Source File',
            title: 'Select the source file to annotate',
          });
          if (files && files.length > 0) {
            targetFile = files[0];
          }
        }
      }
    }

    if (!targetFile) {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        targetFile = editor.document.uri;
      } else {
        vscode.window.showErrorMessage('No file to annotate. Open a source file first.');
        return;
      }
    }

    const document = await vscode.workspace.openTextDocument(targetFile);
    const editor = await vscode.window.showTextDocument(document);

    if (line) {
      const lineNumber = parseInt(line, 10);
      if (!isNaN(lineNumber) && lineNumber > 0) {
        const position = new vscode.Position(lineNumber - 1, 0);
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(
          new vscode.Range(position, position),
          vscode.TextEditorRevealType.InCenter,
        );
      }
    }

    const config = await getConfig(this.context);

    if (profileType) {
      config.profileType = profileType;
    }
    config.queryLabels = {...config.queryLabels, ...labelMatchers};

    const client = new ProfilerClient(config);

    const currentFilePath = editor.document.uri.fsPath as string;
    const currentFileName = path.basename(currentFilePath);

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const relativeFilePath = workspaceFolder
      ? path.relative(workspaceFolder.uri.fsPath as string, currentFilePath)
      : currentFileName;

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Loading profile from deep link...',
        cancellable: false,
      },
      async progress => {
        const query = client.buildQueryForFile(currentFileName);

        const filenameHint = filename ?? relativeFilePath;

        progress.report({message: 'Fetching profiling data...'});
        const protoFilters = convertToProtoFilters(filters);

        const extractRelativePath = (goModulePath: string): string | null => {
          const match = goModulePath.match(
            /^(?:github\.com|gitlab\.com|bitbucket\.org)\/[^/]+\/[^/]+\/(.+)$/,
          );
          return match ? match[1] : null;
        };

        let sourceResult = await client.querySourceReport(
          query,
          timeRange,
          {
            buildId: buildId ?? '',
            filename: filenameHint,
          },
          protoFilters,
        );

        progress.report({message: 'Processing profiling data...'});
        let allLineData = parseSourceArrow(sourceResult.record);

        // Fallback: if no results and filename looks like a Go module path, try with relative path
        if (allLineData.length === 0 && filename) {
          const relativePath = extractRelativePath(filename);
          if (relativePath && relativePath !== filename) {
            console.log(`[${getBrandNameShort()}] Retrying with relative path: ${relativePath}`);
            progress.report({message: 'Retrying with workspace-relative path...'});

            sourceResult = await client.querySourceReport(
              query,
              timeRange,
              {
                buildId: '',
                filename: relativePath,
              },
              protoFilters,
            );
            allLineData = parseSourceArrow(sourceResult.record);
          }
        }

        // Second fallback: try with just the current file's relative path (no build ID)
        if (allLineData.length === 0) {
          console.log(
            `[${getBrandNameShort()}] Retrying with current file path: ${relativeFilePath}`,
          );
          progress.report({message: 'Retrying with local file path...'});

          sourceResult = await client.querySourceReport(
            query,
            timeRange,
            {
              buildId: '',
              filename: relativeFilePath,
            },
            protoFilters,
          );
          allLineData = parseSourceArrow(sourceResult.record);
        }

        if (allLineData.length === 0) {
          vscode.window.showErrorMessage('No source files found in profile data');
          return;
        }

        const uniqueFilenames = getUniqueFilenames(allLineData);
        let lineData: SourceLineData[];
        let selectedFilename: string;

        if (uniqueFilenames.length <= 1) {
          lineData = allLineData;
          selectedFilename = uniqueFilenames[0] || filenameHint;
        } else if (filename) {
          const matched = uniqueFilenames.find(
            f => f === filename || f.endsWith(filename) || filename.endsWith(f),
          );

          if (matched) {
            lineData = filterByFilename(allLineData, matched);
            selectedFilename = matched;
          } else {
            const selected: string | undefined = await vscode.window.showQuickPick(
              uniqueFilenames,
              {
                placeHolder: 'Multiple source files found - select one',
                title: `${getBrandNameShort()}: Select Source File`,
              },
            );
            if (!selected) {
              return;
            }
            lineData = filterByFilename(allLineData, selected);
            selectedFilename = selected;
          }
        } else {
          const matched = uniqueFilenames.find(
            f =>
              currentFilePath.endsWith(f) ||
              f.endsWith(relativeFilePath) ||
              f.endsWith(currentFileName),
          );

          if (matched) {
            lineData = filterByFilename(allLineData, matched);
            selectedFilename = matched;
          } else {
            const selected: string | undefined = await vscode.window.showQuickPick(
              uniqueFilenames,
              {
                placeHolder: 'Multiple source files found - select one',
                title: `${getBrandNameShort()}: Select Source File`,
              },
            );
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
          profileType: config.profileType,
          timeRange,
          labelMatchers: config.queryLabels,
        };

        sessionStore.store(currentFilePath, {
          lineData,
          unit: sourceResult.unit,
          total: sourceResult.total,
          filtered: sourceResult.filtered,
          queryConfig,
          sourceFile: {filename: selectedFilename, buildId: buildId ?? ''},
          timestamp: Date.now(),
        });

        sessionStore.setLastQueryConfig({
          profileType: config.profileType,
          timeRange,
          labelMatchers: config.queryLabels,
        });

        getStatusBar().showActiveProfile({
          profileType: config.profileType,
          timeRange,
          labelMatchers: config.queryLabels,
        });

        vscode.window.showInformationMessage(`Profile loaded! ${lineData.length} lines annotated`);
      },
    );
  }
}

/**
 * Parse a profile expression like "parca_agent:samples:count:cpu:nanoseconds:delta{comm=\"api\"}"
 */
function parseExpression(expression: string): {
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
