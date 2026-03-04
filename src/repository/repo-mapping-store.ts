import type * as vscode from 'vscode';
import type {RepoIdentifier, RepoMapping, RepoMappingsState} from './repo-types';

const REPO_MAPPINGS_KEY = 'polarSignals.repoMappings';

/**
 * Persistent store for repo-to-local-path mappings using VS Code globalState.
 */
class RepoMappingStoreImpl {
  private context: vscode.ExtensionContext | null = null;
  private readonly memoryCache = new Map<RepoIdentifier, RepoMapping>();

  initialize(context: vscode.ExtensionContext): void {
    this.context = context;
    this.loadFromState();
  }

  private loadFromState(): void {
    if (!this.context) {
      return;
    }

    const state = this.context.globalState.get<RepoMappingsState>(REPO_MAPPINGS_KEY);
    if (state?.mappings) {
      for (const mapping of state.mappings) {
        this.memoryCache.set(mapping.repoId, mapping);
      }
    }
  }

  private async persistToState(): Promise<void> {
    if (!this.context) {
      return;
    }

    const state: RepoMappingsState = {
      version: 1,
      mappings: Array.from(this.memoryCache.values()),
    };

    await this.context.globalState.update(REPO_MAPPINGS_KEY, state);
  }

  get(repoId: RepoIdentifier): RepoMapping | undefined {
    return this.memoryCache.get(repoId);
  }

  async save(mapping: RepoMapping): Promise<void> {
    this.memoryCache.set(mapping.repoId, {
      ...mapping,
      lastUsed: Date.now(),
    });
    await this.persistToState();
  }

  async remove(repoId: RepoIdentifier): Promise<void> {
    this.memoryCache.delete(repoId);
    await this.persistToState();
  }

  async updateLastUsed(repoId: RepoIdentifier): Promise<void> {
    const mapping = this.memoryCache.get(repoId);
    if (mapping) {
      mapping.lastUsed = Date.now();
      await this.persistToState();
    }
  }

  getAll(): RepoMapping[] {
    return Array.from(this.memoryCache.values());
  }
}

export const repoMappingStore = new RepoMappingStoreImpl();
