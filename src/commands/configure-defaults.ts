import * as vscode from 'vscode';

export async function configureDefaultsCommand(): Promise<void> {
  await vscode.commands.executeCommand('workbench.action.openSettings', 'polarSignals');
}
