import * as vscode from 'vscode';
import {type SourceQueryResult} from '../api/profiler-client';
import {formatValue} from '../annotations/profiling-annotations';
import {getBrandNameShort} from '../config/settings';

/**
 * Show a QuickPick of candidate filenames returned by a SOURCE miss and
 * re-run the query with the user's pick. Returns undefined if the user
 * cancels or no candidates are available.
 */
export async function pickCandidateAndRequery(
  result: SourceQueryResult,
  localFileName: string,
  requery: (filename: string) => Promise<SourceQueryResult>,
): Promise<SourceQueryResult | undefined> {
  if (!result.candidates || result.candidates.length === 0) return undefined;

  const items: vscode.QuickPickItem[] = result.candidates.map(c => ({
    label: c.filename,
    description: formatValue(c.cumulative, result.unit),
  }));
  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: `Couldn't match ${localFileName} exactly — pick a candidate from the profile`,
    title: `${getBrandNameShort()}: Select Source File`,
    matchOnDescription: true,
  });
  if (!picked) return undefined;
  return requery(picked.label);
}
