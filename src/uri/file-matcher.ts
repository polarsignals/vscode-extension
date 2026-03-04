import * as vscode from 'vscode';
import * as path from 'path';

/**
 * Strip repository prefix from a profile path.
 * e.g. "github.com/org/repo/pkg/file.go" → "pkg/file.go"
 */
function stripRepoPrefix(profilePath: string): string | null {
  const match = profilePath.match(
    /^(?:github\.com|gitlab\.com|bitbucket\.org)\/[^/]+\/[^/]+\/(.+)$/,
  );
  return match ? match[1] : null;
}

/**
 * Find a local file that matches a profile path using fuzzy matching.
 * Tries multiple strategies to find the best match.
 */
export async function findMatchingFile(profilePath: string): Promise<vscode.Uri | undefined> {
  const strippedPath = stripRepoPrefix(profilePath) ?? profilePath;
  const normalizedProfilePath = strippedPath.replace(/\\/g, '/');
  const profileBasename = path.basename(normalizedProfilePath);
  const profileSegments = normalizedProfilePath.split('/').filter(Boolean);

  const pattern = `**/${profileBasename}`;
  const candidates = await vscode.workspace.findFiles(pattern, '**/node_modules/**', 50);

  if (candidates.length === 0) {
    return undefined;
  }

  if (candidates.length === 1) {
    return candidates[0];
  }

  const scoredCandidates = candidates.map(candidate => {
    const localPath = candidate.fsPath.replace(/\\/g, '/');
    const score = scorePathMatch(localPath, normalizedProfilePath, profileSegments);
    return {uri: candidate, score};
  });

  scoredCandidates.sort((a, b) => b.score - a.score);

  const bestMatch = scoredCandidates[0];
  const secondBest = scoredCandidates[1];

  if (
    bestMatch.score >= 50 &&
    (!secondBest ||
      bestMatch.score >= secondBest.score * 2 ||
      bestMatch.score >= secondBest.score + 30)
  ) {
    console.log(
      `[Polar Signals] Auto-selected file: ${bestMatch.uri.fsPath} (score: ${bestMatch.score})`,
    );
    return bestMatch.uri;
  }

  if (bestMatch.score > 0) {
    console.log(`[Polar Signals] Best match: ${bestMatch.uri.fsPath} (score: ${bestMatch.score})`);
    return bestMatch.uri;
  }

  return undefined;
}

/**
 * Score how well a local path matches a profile path.
 * Higher scores indicate better matches.
 */
function scorePathMatch(localPath: string, profilePath: string, profileSegments: string[]): number {
  const localSegments = localPath.split('/').filter(Boolean);

  if (profilePath.endsWith(localPath) || localPath.endsWith(profilePath)) {
    return 100;
  }

  let matchingSegments = 0;
  for (let i = 1; i <= Math.min(localSegments.length, profileSegments.length); i++) {
    const localSeg = localSegments[localSegments.length - i];
    const profileSeg = profileSegments[profileSegments.length - i];
    if (localSeg === profileSeg) {
      matchingSegments++;
    } else {
      break;
    }
  }

  if (matchingSegments >= 4) {
    return 90;
  }
  if (matchingSegments >= 3) {
    return 80;
  }
  if (matchingSegments === 2) {
    return 50;
  }
  if (matchingSegments === 1) {
    return 10;
  }

  return 0;
}
