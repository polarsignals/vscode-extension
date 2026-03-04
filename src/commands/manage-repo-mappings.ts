import * as vscode from 'vscode';
import {repoMappingStore} from '../repository/repo-mapping-store';
import {getBrandNameShort} from '../config/settings';

export async function manageRepoMappingsCommand(): Promise<void> {
  const brand = getBrandNameShort();
  const mappings = repoMappingStore.getAll();

  const items: (vscode.QuickPickItem & {action?: string; repoId?: string})[] = [
    {
      label: '$(add) Add New Mapping',
      description: 'Manually map a repository to a local path',
      action: 'add',
    },
    ...mappings.map(m => ({
      label: `$(repo) ${m.repoId}`,
      description: m.localPath,
      detail: `Source: ${m.source} | Last used: ${formatRelativeTime(m.lastUsed)}`,
      action: 'edit' as const,
      repoId: m.repoId,
    })),
  ];

  if (mappings.length === 0) {
    items.push({
      label: '$(info) No mappings configured',
      description: 'Mappings are auto-created when you open files via deep links',
      action: 'none',
    });
  }

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select an action or mapping to manage',
    title: `${brand}: Repository Mappings`,
  });

  if (!selected?.action || selected.action === 'none') {
    return;
  }

  if (selected.action === 'add') {
    await addMappingFlow();
  } else if (selected.action === 'edit' && selected.repoId) {
    await editMappingFlow(selected.repoId);
  }
}

async function addMappingFlow(): Promise<void> {
  const repoId = await vscode.window.showInputBox({
    prompt: 'Enter repository identifier',
    placeHolder: 'github.com/org/repo',
    validateInput: input => {
      if (!input.match(/^[^/]+\/[^/]+\/[^/]+$/)) {
        return 'Format: host/org/repo (e.g., github.com/parca-dev/parca)';
      }
      return null;
    },
  });

  if (!repoId) {
    return;
  }

  const folders = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: 'Select Repository Root',
    title: `Select local directory for ${repoId}`,
  });

  if (!folders?.[0]) {
    return;
  }

  await repoMappingStore.save({
    repoId,
    localPath: folders[0].fsPath,
    source: 'manual',
    lastUsed: Date.now(),
  });

  vscode.window.showInformationMessage(`Mapped ${repoId} → ${folders[0].fsPath}`);
}

async function editMappingFlow(repoId: string): Promise<void> {
  const mapping = repoMappingStore.get(repoId);
  if (!mapping) {
    return;
  }

  const action = await vscode.window.showQuickPick(
    [
      {label: '$(folder-opened) Change Local Path', value: 'edit'},
      {label: '$(trash) Remove Mapping', value: 'delete'},
    ],
    {placeHolder: `${repoId} → ${mapping.localPath}`},
  );

  if (!action) {
    return;
  }

  if (action.value === 'delete') {
    await repoMappingStore.remove(repoId);
    vscode.window.showInformationMessage(`Removed mapping for ${repoId}`);
  } else {
    const folders = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: 'Select New Repository Root',
      title: `Update local directory for ${repoId}`,
    });

    if (folders?.[0]) {
      await repoMappingStore.save({
        repoId,
        localPath: folders[0].fsPath,
        source: 'manual',
        lastUsed: Date.now(),
      });
      vscode.window.showInformationMessage(`Updated ${repoId} → ${folders[0].fsPath}`);
    }
  }
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) {
    return 'just now';
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  if (hours < 24) {
    return `${hours}h ago`;
  }
  return `${days}d ago`;
}
