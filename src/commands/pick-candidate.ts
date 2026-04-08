import * as vscode from 'vscode';
import {type SourceQueryResult} from '../api/profiler-client';
import {getBrandNameShort} from '../config/settings';

export async function pickCandidateAndRequery(
  result: SourceQueryResult,
  localFileName: string,
  requery: (filename: string) => Promise<SourceQueryResult>,
): Promise<SourceQueryResult | undefined> {
  if (!result.candidates || result.candidates.length === 0) {
    return undefined;
  }

  const items: vscode.QuickPickItem[] = result.candidates.map(candidate => ({
    label: candidate.filename,
    description: formatValue(candidate.cumulative, result.unit),
  }));

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: `Couldn't match ${localFileName} exactly - pick a candidate from the profile`,
    title: `${getBrandNameShort()}: Select Source File`,
    matchOnDescription: true,
  });

  if (!picked) {
    return undefined;
  }

  return requery(picked.label);
}

function formatValue(value: number, unit: string): string {
  if (value === 0) {
    return `0 ${unit}`;
  }

  const unitFormatters: Record<string, Array<{multiplier: number; symbol: string}>> = {
    nanoseconds: [
      {multiplier: 1e9, symbol: 's'},
      {multiplier: 1e6, symbol: 'ms'},
      {multiplier: 1e3, symbol: 'us'},
      {multiplier: 1, symbol: 'ns'},
    ],
    milliseconds: [
      {multiplier: 1e6, symbol: 'ks'},
      {multiplier: 1e3, symbol: 's'},
      {multiplier: 1, symbol: 'ms'},
    ],
    bytes: [
      {multiplier: 1e18, symbol: 'EB'},
      {multiplier: 1e15, symbol: 'PB'},
      {multiplier: 1e12, symbol: 'TB'},
      {multiplier: 1e9, symbol: 'GB'},
      {multiplier: 1e6, symbol: 'MB'},
      {multiplier: 1e3, symbol: 'kB'},
      {multiplier: 1, symbol: 'B'},
    ],
    count: [
      {multiplier: 1e18, symbol: 'E'},
      {multiplier: 1e15, symbol: 'P'},
      {multiplier: 1e12, symbol: 'T'},
      {multiplier: 1e9, symbol: 'G'},
      {multiplier: 1e6, symbol: 'M'},
      {multiplier: 1e3, symbol: 'k'},
      {multiplier: 1, symbol: ''},
    ],
  };

  const formats = unitFormatters[unit] ?? unitFormatters.count;
  const absValue = Math.abs(value);
  const fallback = formats[formats.length - 1];
  const selected = formats.find(format => absValue >= format.multiplier) ?? fallback;
  const formatted = (value / selected.multiplier).toFixed(1).replace(/\.?0+$/, '');

  return `${formatted} ${selected.symbol}`.trim();
}
