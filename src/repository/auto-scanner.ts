import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import type {RepoIdentifier} from './repo-types';
import {getRepoIdFromDirectory} from './git-utils';

const MAX_DEPTH = 3;
const MAX_DIRS_PER_LEVEL = 100;
const TIMEOUT_MS = 5000;

const EXCLUDE_DIRS = new Set([
  'node_modules',
  '.git',
  'vendor',
  '__pycache__',
  '.cache',
  'dist',
  'build',
  '.npm',
  '.yarn',
  '.pnpm',
]);

function getDefaultScanPaths(): string[] {
  const home = os.homedir();
  const defaults = [
    path.join(home, 'code'),
    path.join(home, 'src'),
    path.join(home, 'projects'),
    path.join(home, 'go', 'src'),
    path.join(home, 'Developer'),
    path.join(home, 'dev'),
    path.join(home, 'repos'),
    path.join(home, 'workspace'),
  ];

  return defaults;
}

export async function autoScanForRepo(targetRepoId: RepoIdentifier): Promise<string | null> {
  const config = vscode.workspace.getConfiguration('polarSignals');
  const additionalPaths = config.get<string[]>('repoScanPaths') ?? [];

  const scanPaths = [...getDefaultScanPaths(), ...additionalPaths];
  const startTime = Date.now();

  for (const basePath of scanPaths) {
    if (Date.now() - startTime > TIMEOUT_MS) {
      console.log('[Polar Signals] Auto-scan timeout reached');
      break;
    }

    const result = await scanDirectory(basePath, targetRepoId, 0, startTime);
    if (result) {
      return result;
    }
  }

  return null;
}

async function scanDirectory(
  dirPath: string,
  targetRepoId: RepoIdentifier,
  depth: number,
  startTime: number,
): Promise<string | null> {
  if (depth > MAX_DEPTH) {
    return null;
  }
  if (Date.now() - startTime > TIMEOUT_MS) {
    return null;
  }

  try {
    const repoId = await getRepoIdFromDirectory(dirPath);
    if (repoId === targetRepoId) {
      return dirPath;
    }

    if (depth === MAX_DEPTH) {
      return null;
    }

    const entries = await fs.promises.readdir(dirPath, {withFileTypes: true});
    let dirsChecked = 0;

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      if (EXCLUDE_DIRS.has(entry.name)) {
        continue;
      }
      if (entry.name.startsWith('.')) {
        continue;
      }
      if (dirsChecked++ >= MAX_DIRS_PER_LEVEL) {
        break;
      }

      const result = await scanDirectory(
        path.join(dirPath, entry.name),
        targetRepoId,
        depth + 1,
        startTime,
      );
      if (result) {
        return result;
      }
    }
  } catch {
    // Permission denied or directory doesn't exist
  }

  return null;
}
