import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import type {RepoIdentifier} from './repo-types';

/**
 * Normalize a git remote URL to a RepoIdentifier.
 *
 * Handles:
 * - SSH: git@github.com:org/repo.git
 * - HTTPS: https://github.com/org/repo.git
 * - HTTPS with auth: https://user@github.com/org/repo.git
 * - Git protocol: git://github.com/org/repo.git
 *
 * Returns: "github.com/org/repo"
 */
export function normalizeGitUrl(remoteUrl: string): RepoIdentifier | null {
  const url = remoteUrl.trim().replace(/\.git$/, '');

  const sshMatch = url.match(/^git@([^:]+):(.+)$/);
  if (sshMatch) {
    return `${sshMatch[1]}/${sshMatch[2]}`;
  }

  const httpsMatch = url.match(/^(?:https?|git):\/\/(?:[^@]+@)?([^/]+)\/(.+)$/);
  if (httpsMatch) {
    return `${httpsMatch[1]}/${httpsMatch[2]}`;
  }

  return null;
}

/**
 * Extract repo identifier from a directory by reading its .git/config.
 */
export async function getRepoIdFromDirectory(dirPath: string): Promise<RepoIdentifier | null> {
  const gitConfigPath = path.join(dirPath, '.git', 'config');

  try {
    const configContent = await fs.promises.readFile(gitConfigPath, 'utf8');

    const remoteMatch = configContent.match(/\[remote\s+"origin"\][^[]*url\s*=\s*(.+)/m);

    if (remoteMatch) {
      return normalizeGitUrl(remoteMatch[1].trim());
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Check all open workspace folders for a matching repository.
 */
export async function findRepoInWorkspaceFolders(
  targetRepoId: RepoIdentifier,
): Promise<string | null> {
  const workspaceFolders = vscode.workspace.workspaceFolders ?? [];

  for (const folder of workspaceFolders) {
    const repoId = await getRepoIdFromDirectory(folder.uri.fsPath);
    if (repoId === targetRepoId) {
      return folder.uri.fsPath;
    }
  }

  return null;
}

/**
 * Extract a repo identifier from a profile path.
 *
 * e.g. "github.com/parca-dev/parca/pkg/query/query.go"
 *   -> { repoId: "github.com/parca-dev/parca", relativePath: "pkg/query/query.go" }
 */
export function parseProfilePath(
  profilePath: string,
): {repoId: RepoIdentifier; relativePath: string} | null {
  const match = profilePath.match(
    /^((?:github\.com|gitlab\.com|bitbucket\.org)\/[^/]+\/[^/]+)\/(.+)$/,
  );

  if (match) {
    return {repoId: match[1], relativePath: match[2]};
  }

  return null;
}
