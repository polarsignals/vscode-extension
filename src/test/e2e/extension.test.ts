import * as assert from 'assert';
import * as vscode from 'vscode';

const EXTENSION_ID = 'polarsignals.polar-signals-profiler';

suite('Extension', () => {
  let ext: vscode.Extension<unknown>;

  suiteSetup(async () => {
    const found = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(found, 'Extension should be installed');
    ext = found;
    await ext.activate();
  });

  test('extension is active', () => {
    assert.ok(ext.isActive, 'Extension should be active after activation');
  });

  test('all commands are registered', async () => {
    const allCommands = await vscode.commands.getCommands(true);

    const expectedCommands = [
      'polarSignals.fetchProfile',
      'polarSignals.clearAnnotations',
      'polarSignals.selectPreset',
      'polarSignals.fetchWithPreset',
      'polarSignals.showStatusMenu',
      'polarSignals.configureDefaults',
      'polarSignals.importFromUrl',
      'polarSignals.signOut',
      'polarSignals.switchProject',
      'polarSignals.setupMode',
      'polarSignals.manageRepoMappings',
      'polarSignals.copyLineForAI',
      'polarSignals.copyFileForAI',
      'polarSignals.setUpMcp',
      'polarSignals.showMcpOptions',
    ];

    for (const cmd of expectedCommands) {
      assert.ok(allCommands.includes(cmd), `Command ${cmd} should be registered`);
    }
  });
});

suite('Configuration defaults', () => {
  test('default config values match package.json declarations', () => {
    const config = vscode.workspace.getConfiguration('polarSignals');

    assert.strictEqual(config.get('cloudUrl'), 'https://api.polarsignals.com');
    assert.strictEqual(config.get('selfHostedUrl'), 'http://localhost:7070');
    assert.strictEqual(config.get('defaultTimeRange'), '15m');
    assert.strictEqual(
      config.get('profileType'),
      'parca_agent:samples:count:cpu:nanoseconds:delta',
    );
    assert.strictEqual(config.get('autoFetchOnFileOpen'), true);
    assert.strictEqual(config.get('autoScrollToAnnotation'), false);
    assert.strictEqual(config.get('autoScanOnMiss'), true);
    assert.strictEqual(config.get('mcpOnboardingMode'), 'auto');
  });

  test('mode is unset on fresh install', () => {
    const config = vscode.workspace.getConfiguration('polarSignals');
    // VS Code returns empty string for unset enum/string configs
    assert.ok(!config.get('mode'), 'mode should be falsy on fresh install');
  });

  test('projectId is unset on fresh install', () => {
    const config = vscode.workspace.getConfiguration('polarSignals');
    assert.ok(!config.get('projectId'), 'projectId should be falsy on fresh install');
  });

  test('queryLabels defaults to empty object', () => {
    const config = vscode.workspace.getConfiguration('polarSignals');
    assert.deepStrictEqual(config.get('queryLabels'), {});
  });

  test('presets defaults to empty array', () => {
    const config = vscode.workspace.getConfiguration('polarSignals');
    assert.deepStrictEqual(config.get('presets'), []);
  });
});

suite('Clear annotations', () => {
  test('succeeds on a file with no profile', async () => {
    const doc = await vscode.workspace.openTextDocument({content: 'hello world', language: 'go'});
    await vscode.window.showTextDocument(doc);

    // Should not throw — just clears (no-op) and shows info message
    await vscode.commands.executeCommand('polarSignals.clearAnnotations');
  });
});
