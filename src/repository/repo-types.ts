export type RepoIdentifier = string;

export interface RepoMapping {
  repoId: RepoIdentifier;
  localPath: string;
  lastUsed: number;
  source: 'manual' | 'auto' | 'workspace';
}

export interface RepoMappingsState {
  version: 1;
  mappings: RepoMapping[];
}

export interface ResolvedPath {
  absolutePath: string;
  repoId: RepoIdentifier;
  relativePath: string;
  confidence: 'exact' | 'fuzzy' | 'manual';
}
