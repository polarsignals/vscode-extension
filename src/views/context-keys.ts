import * as vscode from 'vscode';
import {getMode} from '../config/settings';
import {getAuthProvider} from '../auth/oauth-provider';
import {sessionStore} from '../state/session-store';

const CONFIGURED = 'polarSignals.configured';
const SIGNED_IN = 'polarSignals.signedIn';
const HAS_CURRENT_FILE_PROFILE = 'polarSignals.hasCurrentFileProfile';

async function isSignedIn(): Promise<boolean> {
  const provider = getAuthProvider();
  if (!provider) return false;
  const sessions = await provider.getSessions();
  return sessions.length > 0;
}

function hasCurrentFileProfile(): boolean {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return false;
  return sessionStore.has(editor.document.uri.fsPath);
}

export async function updateContextKeys(): Promise<void> {
  const mode = getMode();
  const signedIn = await isSignedIn();

  // "configured" means: OSS mode (no auth needed) OR cloud + signed in.
  const configured = mode === 'oss' || (mode === 'cloud' && signedIn);

  await Promise.all([
    vscode.commands.executeCommand('setContext', CONFIGURED, configured),
    vscode.commands.executeCommand('setContext', SIGNED_IN, signedIn),
    vscode.commands.executeCommand('setContext', HAS_CURRENT_FILE_PROFILE, hasCurrentFileProfile()),
  ]);
}
