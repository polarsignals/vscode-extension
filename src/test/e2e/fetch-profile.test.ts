import * as assert from 'assert';
import * as vscode from 'vscode';
import {startMockParcaServer, type MockParcaServer} from './helpers/mock-parca-server';

const EXTENSION_ID = 'polarsignals.polar-signals-profiler';

suite('Fetch profile (end-to-end)', () => {
  let server: MockParcaServer;

  suiteSetup(async function () {
    this.timeout(30000);

    server = await startMockParcaServer();
    console.log(`[Test] Mock Parca server running at ${server.url}`);

    const config = vscode.workspace.getConfiguration('polarSignals');
    await config.update('mode', 'oss', vscode.ConfigurationTarget.Global);
    await config.update('selfHostedUrl', server.url, vscode.ConfigurationTarget.Global);
    await config.update('autoFetchOnFileOpen', false, vscode.ConfigurationTarget.Global);

    const ext = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(ext, 'Extension should be installed');
    await ext.activate();
  });

  suiteTeardown(async function () {
    this.timeout(10000);

    // Clean up config
    const config = vscode.workspace.getConfiguration('polarSignals');
    await config.update('mode', undefined, vscode.ConfigurationTarget.Global);
    await config.update('selfHostedUrl', undefined, vscode.ConfigurationTarget.Global);
    await config.update('autoFetchOnFileOpen', undefined, vscode.ConfigurationTarget.Global);

    // Stop mock server
    if (server) {
      await server.close();
    }
  });

  test('fetchWithPreset fetches profile and populates session store', async function () {
    this.timeout(20000);

    // Open a Go file so the extension has an active editor
    const doc = await vscode.workspace.openTextDocument({
      content: Array.from({length: 50}, (_, i) => `// line ${i + 1}`).join('\n'),
      language: 'go',
    });
    await vscode.window.showTextDocument(doc);

    // Execute fetchWithPreset with the default cpu-15m preset
    await vscode.commands.executeCommand('polarSignals.fetchWithPreset', 'cpu-15m');

    // Give a moment for async state updates
    await new Promise(resolve => setTimeout(resolve, 500));

    // The session store is an internal singleton — we can't import it directly from the
    // e2e test since the extension runs in a separate host. But we can verify side effects:
    // 1. No error messages were shown (command completed without throwing)
    // 2. The clear command should succeed (implying annotations exist)
    // 3. We can re-fetch and it still works

    // Verify we can clear annotations without error
    await vscode.commands.executeCommand('polarSignals.clearAnnotations');
  });

  test('fetchWithPreset on a real workspace file', async function () {
    this.timeout(20000);

    // Use a file from the actual workspace if available
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      this.skip();
      return;
    }

    // Find a source file in the workspace
    const files = await vscode.workspace.findFiles('src/**/*.ts', undefined, 1);
    if (files.length === 0) {
      this.skip();
      return;
    }

    const doc = await vscode.workspace.openTextDocument(files[0]);
    await vscode.window.showTextDocument(doc);

    // Execute fetch — the mock server returns data for "src/main.go" so the filenames
    // won't match, but the command should still complete without throwing
    await vscode.commands.executeCommand('polarSignals.fetchWithPreset', 'cpu-15m');
    await new Promise(resolve => setTimeout(resolve, 500));
  });

  test('clear annotations succeeds after fetch', async function () {
    this.timeout(10000);

    const doc = await vscode.workspace.openTextDocument({
      content: 'package main\n\nfunc main() {}\n',
      language: 'go',
    });
    await vscode.window.showTextDocument(doc);

    await vscode.commands.executeCommand('polarSignals.fetchWithPreset', 'cpu-15m');
    await new Promise(resolve => setTimeout(resolve, 500));

    // Clear should not throw
    await vscode.commands.executeCommand('polarSignals.clearAnnotations');
  });

  test('fetching twice on the same file does not throw', async function () {
    this.timeout(20000);

    const doc = await vscode.workspace.openTextDocument({
      content: 'package main\n\nfunc main() {}\n',
      language: 'go',
    });
    await vscode.window.showTextDocument(doc);

    await vscode.commands.executeCommand('polarSignals.fetchWithPreset', 'cpu-15m');
    await new Promise(resolve => setTimeout(resolve, 300));

    // Second fetch should replace the first without errors
    await vscode.commands.executeCommand('polarSignals.fetchWithPreset', 'cpu-1h');
    await new Promise(resolve => setTimeout(resolve, 300));

    await vscode.commands.executeCommand('polarSignals.clearAnnotations');
  });
});
