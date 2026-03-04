import * as vscode from 'vscode';
import {clearCachedAnnotations} from './fetch-profile';
import {getAnnotations} from '../annotations/annotation-manager';
import {getStatusBar} from '../ui/status-bar';

export async function clearAnnotationsCommand(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('No active editor to clear annotations from');
    return;
  }

  getAnnotations().clear(editor);

  clearCachedAnnotations(editor.document.uri.fsPath);

  getStatusBar().showNoProfile();

  vscode.window.showInformationMessage('Profiling annotations cleared');
}
