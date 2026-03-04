import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import type {ResolvedPath} from './repo-types';
import {parseProfilePath, findRepoInWorkspaceFolders} from './git-utils';
import {repoMappingStore} from './repo-mapping-store';
import {autoScanForRepo} from './auto-scanner';
import {getBrandNameShort} from '../config/settings';

let instance: PathResolver | null = null;

export class PathResolver {
  async resolve(profilePath: string): Promise<ResolvedPath | undefined> {
    const parsed = parseProfilePath(profilePath);
    if (!parsed) {
      return undefined;
    }

    const {repoId, relativePath} = parsed;
    const brand = getBrandNameShort();

    const cached = repoMappingStore.get(repoId);
    if (cached) {
      const fullPath = path.join(cached.localPath, relativePath);
      if (await this.fileExists(fullPath)) {
        console.log(`[${brand}] Resolved from cached mapping: ${fullPath}`);
        await repoMappingStore.updateLastUsed(repoId);
        return {absolutePath: fullPath, repoId, relativePath, confidence: 'exact'};
      }
    }

    const workspacePath = await findRepoInWorkspaceFolders(repoId);
    if (workspacePath) {
      const fullPath = path.join(workspacePath, relativePath);
      if (await this.fileExists(fullPath)) {
        console.log(`[${brand}] Resolved from workspace git remote: ${fullPath}`);
        await repoMappingStore.save({
          repoId,
          localPath: workspacePath,
          lastUsed: Date.now(),
          source: 'workspace',
        });
        return {absolutePath: fullPath, repoId, relativePath, confidence: 'exact'};
      }
    }

    const autoScanEnabled =
      vscode.workspace.getConfiguration('polarSignals').get<boolean>('autoScanOnMiss') ?? true;
    if (autoScanEnabled) {
      console.log(`[${brand}] Scanning filesystem for ${repoId}...`);
      const scannedPath = await autoScanForRepo(repoId);
      if (scannedPath) {
        const fullPath = path.join(scannedPath, relativePath);
        if (await this.fileExists(fullPath)) {
          console.log(`[${brand}] Resolved from auto-scan: ${fullPath}`);
          await repoMappingStore.save({
            repoId,
            localPath: scannedPath,
            lastUsed: Date.now(),
            source: 'auto',
          });
          return {absolutePath: fullPath, repoId, relativePath, confidence: 'exact'};
        }
      }
    }

    const userPath = await this.promptUserForRepo(repoId, relativePath);
    if (userPath) {
      const fullPath = path.join(userPath, relativePath);
      console.log(`[${brand}] Resolved from user selection: ${fullPath}`);
      await repoMappingStore.save({
        repoId,
        localPath: userPath,
        lastUsed: Date.now(),
        source: 'manual',
      });
      return {absolutePath: fullPath, repoId, relativePath, confidence: 'manual'};
    }

    return undefined;
  }

  private async promptUserForRepo(
    repoId: string,
    relativePath: string,
  ): Promise<string | undefined> {
    const action = await vscode.window.showWarningMessage(
      `Could not find local checkout of "${repoId}" (looking for ${relativePath})`,
      'Select Folder',
      'Cancel',
    );

    if (action !== 'Select Folder') {
      return undefined;
    }

    const folders = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: 'Select Repository Root',
      title: `Select local checkout of ${repoId}`,
    });

    if (!folders?.[0]) {
      return undefined;
    }

    return folders[0].fsPath;
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.promises.access(filePath, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }
}

export function initializePathResolver(): void {
  instance = new PathResolver();
}

export function getPathResolver(): PathResolver {
  if (!instance) {
    instance = new PathResolver();
  }
  return instance;
}
