import * as vscode from 'vscode';
import {sessionStore} from '../state/session-store';

const wellKnownProfiles: Record<string, string> = {
  'block:contentions:count:contentions:count': 'Block Contentions',
  'block:delay:nanoseconds:contentions:count': 'Block Contention Time',
  'fgprof:samples:count:wallclock:nanoseconds:delta': 'Fgprof Samples',
  'fgprof:time:nanoseconds:wallclock:nanoseconds:delta': 'Fgprof Time',
  'goroutine:goroutine:count:goroutine:count': 'Goroutines',
  'memory:alloc_objects:count:space:bytes': 'Memory Allocations (objects)',
  'memory:alloc_space:bytes:space:bytes': 'Memory Allocations (bytes)',
  'memory:alloc_objects:count:space:bytes:delta': 'Memory Allocations Delta (objects)',
  'memory:alloc_space:bytes:space:bytes:delta': 'Memory Allocations Delta (bytes)',
  'memory:inuse_objects:count:space:bytes': 'Memory In-Use (objects)',
  'memory:inuse_space:bytes:space:bytes': 'Memory In-Use (bytes)',
  'mutex:contentions:count:contentions:count': 'Mutex Contentions',
  'mutex:delay:nanoseconds:contentions:count': 'Mutex Contention Time',
  'process_cpu:cpu:nanoseconds:cpu:nanoseconds:delta': 'Process CPU',
  'process_cpu:samples:count:cpu:nanoseconds:delta': 'Process CPU Samples',
  'parca_agent_cpu:samples:count:cpu:nanoseconds:delta': 'CPU Samples',
  'otel_profiling_agent_on_cpu:samples:count:cpu:nanoseconds:delta': 'On-CPU Samples',
  'parca_agent:samples:count:cpu:nanoseconds:delta': 'On-CPU',
  'parca_agent:wallclock:nanoseconds:samples:count:delta': 'Off-CPU',
  'parca_agent:cuda:nanoseconds:cuda:nanoseconds:delta': 'On-GPU',
};

const unitFormatters: Record<string, {multiplier: number; symbol: string}[]> = {
  nanoseconds: [
    {multiplier: 1e9, symbol: 's'},
    {multiplier: 1e6, symbol: 'ms'},
    {multiplier: 1e3, symbol: 'µs'},
    {multiplier: 1, symbol: 'ns'},
  ],
  bytes: [
    {multiplier: 1e9, symbol: 'GB'},
    {multiplier: 1e6, symbol: 'MB'},
    {multiplier: 1e3, symbol: 'kB'},
    {multiplier: 1, symbol: 'B'},
  ],
  count: [
    {multiplier: 1e9, symbol: 'B'},
    {multiplier: 1e6, symbol: 'M'},
    {multiplier: 1e3, symbol: 'k'},
    {multiplier: 1, symbol: ''},
  ],
};

const langMap: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  go: 'go',
  py: 'python',
  rs: 'rust',
  java: 'java',
  cpp: 'cpp',
  c: 'c',
  rb: 'ruby',
};

export function getHumanReadableProfileType(profileType: string): string {
  if (wellKnownProfiles[profileType]) return wellKnownProfiles[profileType];
  const normalized = profileType
    .split(':')
    .slice(1)
    .join(':')
    .replace(/:delta$/, '');
  const match = Object.keys(wellKnownProfiles).find(k => k.includes(normalized));
  return match ? wellKnownProfiles[match] : profileType;
}

export function formatTimeRange(timeRange: string | {from: number; to: number}): string {
  if (typeof timeRange === 'string') return `last ${timeRange}`;
  return `${new Date(timeRange.from).toISOString()} to ${new Date(timeRange.to).toISOString()}`;
}

export function formatValue(value: number, unit: string): string {
  if (value === 0) return '0';
  const format = unitFormatters[unit] ?? unitFormatters.count;
  const fmt = format.find(f => Math.abs(value) >= f.multiplier) ?? format[format.length - 1];
  return `${(value / fmt.multiplier).toFixed(2)}${fmt.symbol}`;
}

export function formatPercentage(value: number, total: bigint, filtered: bigint): string {
  const denom = Number(total + filtered);
  return denom === 0 ? '' : `${((value / denom) * 100).toFixed(1)}%`;
}

export async function copyLineForAI(args: {line: number}): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('No active editor');
    return;
  }

  const profile = sessionStore.get(editor.document.uri.fsPath);
  if (!profile) {
    vscode.window.showWarningMessage('No profiling data for this file');
    return;
  }

  const lineData = profile.lineData.find(d => d.lineNumber === args.line);
  if (!lineData) {
    vscode.window.showWarningMessage(`No profiling data for line ${args.line}`);
    return;
  }

  const startLine = Math.max(0, args.line - 16);
  const endLine = Math.min(editor.document.lineCount - 1, args.line + 14);
  const lines = editor.document
    .getText(new vscode.Range(startLine, 0, endLine, Infinity))
    .split('\n');

  const hotspotIdx = args.line - 1 - startLine;
  if (hotspotIdx >= 0 && hotspotIdx < lines.length) {
    lines[hotspotIdx] = `${lines[hotspotIdx]}  // ← LINE ${args.line} (hotspot)`;
  }

  const fileName = editor.document.uri.fsPath.split('/').pop()!;
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  const cumPct = formatPercentage(lineData.cumulative, profile.total, profile.filtered);
  const flatPct = formatPercentage(lineData.flat, profile.total, profile.filtered);

  const prompt = `## Performance Analysis Request

**File:** ${fileName}
**Profile Type:** ${getHumanReadableProfileType(profile.queryConfig.profileType)} (${formatTimeRange(profile.queryConfig.timeRange)})
**Line ${args.line}**

### Code Context
\`\`\`${langMap[ext] ?? ext}
${lines.join('\n')}
\`\`\`

### Profiling Metrics
- **Cumulative:** ${formatValue(lineData.cumulative, profile.unit)} (${cumPct}) — time in this line + everything it calls
- **Flat:** ${formatValue(lineData.flat, profile.unit)} (${flatPct}) — time spent directly in this line

### Analysis Questions
1. Why is this line consuming significant resources?
2. What does the gap between cumulative (${cumPct}) and flat (${flatPct}) tell us?
3. What are 2-3 specific optimizations to reduce this hotspot?`;

  await vscode.env.clipboard.writeText(prompt);
  vscode.window.showInformationMessage('Copied profiling context for AI analysis');
}

export async function copyFileForAI(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('No active editor');
    return;
  }

  const profile = sessionStore.get(editor.document.uri.fsPath);
  if (!profile) {
    vscode.window.showWarningMessage('No profiling data for this file');
    return;
  }

  const top10 = [...profile.lineData].sort((a, b) => b.cumulative - a.cumulative).slice(0, 10);
  if (top10.length === 0) {
    vscode.window.showWarningMessage('No hotspots found in this file');
    return;
  }

  const fileName = editor.document.uri.fsPath.split('/').pop()!;
  const hotspots = top10
    .map((d, i) => {
      const cum = formatValue(d.cumulative, profile.unit);
      const pct = formatPercentage(d.cumulative, profile.total, profile.filtered);
      return `${i + 1}. **Line ${d.lineNumber}** — ${cum} cumulative (${pct})`;
    })
    .join('\n');

  const prompt = `## File Performance Summary

**File:** ${fileName}
**Profile Type:** ${getHumanReadableProfileType(profile.queryConfig.profileType)} (${formatTimeRange(profile.queryConfig.timeRange)})
**Total profiled:** ${formatValue(Number(profile.total + profile.filtered), profile.unit)}

### Top Hotspots

${hotspots}

### Analysis Questions
1. What patterns do you see in where time is being spent?
2. Which hotspot would give the biggest win if optimized?
3. Are there any obvious inefficiencies in this profile?`;

  await vscode.env.clipboard.writeText(prompt);
  vscode.window.showInformationMessage('Copied file summary for AI analysis');
}
