import * as vscode from 'vscode';

export type EditorHostId = 'vscode' | 'cursor';

export interface EditorHost {
  id: EditorHostId;
  displayName: string;
  docsUrl: string;
}

const HOSTS: Record<EditorHostId, EditorHost> = {
  vscode: {
    id: 'vscode',
    displayName: 'VS Code',
    docsUrl: 'https://www.polarsignals.com/docs/mcp#usage-examples',
  },
  cursor: {
    id: 'cursor',
    displayName: 'Cursor',
    docsUrl: 'https://www.polarsignals.com/docs/mcp#usage-examples',
  },
};

let cachedHost: EditorHost | undefined;

export function detectEditorHost(): EditorHost {
  if (cachedHost) {
    return cachedHost;
  }

  const appName = vscode.env.appName.toLowerCase();

  if (appName.includes('cursor')) {
    cachedHost = HOSTS.cursor;
  } else {
    cachedHost = HOSTS.vscode;
  }

  return cachedHost;
}
