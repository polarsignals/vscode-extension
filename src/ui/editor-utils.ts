import * as vscode from 'vscode';
import type {SourceLineData} from '../converters/source-arrow-converter';

export function scrollToFirstAnnotatedLine(
  editor: vscode.TextEditor,
  lineData: SourceLineData[],
): void {
  if (lineData.length === 0) return;

  let firstLine = lineData[0].lineNumber;
  for (const d of lineData) {
    if (d.lineNumber < firstLine) firstLine = d.lineNumber;
  }

  const position = new vscode.Position(firstLine - 1, 0);
  editor.selection = new vscode.Selection(position, position);
  editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
}
