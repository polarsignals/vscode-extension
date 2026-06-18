import * as vscode from 'vscode';
import {sessionStore} from '../state/session-store';
import {type SourceLineData} from '../converters/source-arrow-converter';
import {RefreshableTreeProvider} from './tree-provider';

interface HotLine {
  filePath: string;
  line: SourceLineData;
  share: number;
  preview: string;
}

export class CurrentFileViewProvider extends RefreshableTreeProvider<HotLine> {
  getTreeItem(hot: HotLine): vscode.TreeItem {
    const pct = (hot.share * 100).toFixed(1);
    const label = `${pct}%  ·  L${hot.line.lineNumber}`;
    const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
    item.description = hot.preview || undefined;
    item.tooltip = new vscode.MarkdownString(
      `**Line ${hot.line.lineNumber}** — ${pct}% of total\n\n` +
        `Cumulative: ${hot.line.cumulative.toLocaleString()}\n\n` +
        `Flat: ${hot.line.flat.toLocaleString()}`,
    );
    item.iconPath = new vscode.ThemeIcon(this.iconForShare(hot.share));
    item.contextValue = 'hotLine';
    item.command = {
      command: 'polarSignals.openHotLine',
      title: 'Reveal',
      arguments: [hot.filePath, hot.line.lineNumber],
    };
    return item;
  }

  getChildren(): HotLine[] {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return [];

    const filePath = editor.document.uri.fsPath;
    const cached = sessionStore.get(filePath);
    if (!cached || cached.lineData.length === 0) return [];

    const total = cached.lineData.reduce((sum, l) => sum + Math.max(l.cumulative, 0), 0);
    if (total === 0) return [];

    const document = editor.document;
    return [...cached.lineData]
      .sort((a, b) => b.cumulative - a.cumulative)
      .slice(0, 50)
      .map(line => ({
        filePath,
        line,
        share: line.cumulative / total,
        preview: getLinePreview(document, line.lineNumber),
      }));
  }

  private iconForShare(share: number): string {
    if (share >= 0.2) return 'flame';
    if (share >= 0.1) return 'symbol-event';
    return 'circle-small-filled';
  }
}

function getLinePreview(document: vscode.TextDocument, lineNumber: number): string {
  const idx = lineNumber - 1;
  if (idx < 0 || idx >= document.lineCount) return '';
  const text = document.lineAt(idx).text.trim();
  if (text.length > 80) return text.slice(0, 77) + '…';
  return text;
}

export async function openHotLine(filePath: string, lineNumber: number): Promise<void> {
  const uri = vscode.Uri.file(filePath);
  const editor = await vscode.window.showTextDocument(uri, {preserveFocus: false});
  const targetLine = Math.max(0, lineNumber - 1);
  const range = new vscode.Range(targetLine, 0, targetLine, 0);
  editor.selection = new vscode.Selection(range.start, range.start);
  editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
}
