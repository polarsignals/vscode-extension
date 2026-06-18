import * as vscode from 'vscode';

/**
 * Base for the sidebar's TreeDataProviders: owns the change emitter and the
 * `refresh()` trigger so each concrete provider only implements its data.
 */
export abstract class RefreshableTreeProvider<T> implements vscode.TreeDataProvider<T> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  abstract getTreeItem(element: T): vscode.TreeItem;
  abstract getChildren(element?: T): vscode.ProviderResult<T[]>;
}
