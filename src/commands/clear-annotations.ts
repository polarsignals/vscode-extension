import * as vscode from 'vscode';
import {clearCachedAnnotations} from './fetch-profile';
import {getAnnotations} from '../annotations/annotation-manager';

export async function clearAnnotationsCommand(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('No active editor to clear annotations from');
    return;
  }

  getAnnotations().clear(editor);

  clearCachedAnnotations(editor.document.uri.fsPath);

  vscode.window.showInformationMessage('Profiling annotations cleared');
}
