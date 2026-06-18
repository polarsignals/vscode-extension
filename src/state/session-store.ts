import * as vscode from 'vscode';
import {type SourceLineData} from '../converters/source-arrow-converter';
import {type TimeRange} from '../api/profiler-client';
import {type QueryConfig} from '../ui/query-configurator';

export interface CachedProfile {
  lineData: SourceLineData[];
  unit: string;
  total: bigint;
  filtered: bigint;
  queryConfig: QueryConfig;
  sourceFile: {
    filename: string;
  };
  timestamp: number;
}

export interface LastQueryConfig {
  profileType: string;
  timeRange: TimeRange;
  labelMatchers: Record<string, string>;
}

/**
 * Check if two query configs are equivalent for caching purposes.
 * TimeRange is compared by type only (relative string vs absolute) since
 * absolute timestamps change on each fetch.
 */
export function isSameQueryConfig(a: QueryConfig, b: LastQueryConfig): boolean {
  if (a.profileType !== b.profileType) return false;

  const aLabels = a.labelMatchers;
  const bLabels = b.labelMatchers;
  const aKeys = Object.keys(aLabels);
  const bKeys = Object.keys(bLabels);

  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (aLabels[key] !== bLabels[key]) return false;
  }

  return true;
}

/**
 * SessionStore manages in-memory caching of profiling data keyed by file path.
 * Data is automatically restored when navigating back to a file.
 * Cache is session-only and cleared when VS Code restarts.
 */
class SessionStoreImpl {
  private readonly cache = new Map<string, CachedProfile>();
  private readonly originalPaths = new Map<string, string>();
  private lastQueryConfig: LastQueryConfig | null = null;
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;

  store(filePath: string, data: CachedProfile): void {
    const key = this.normalizeKey(filePath);
    this.cache.set(key, {
      ...data,
      timestamp: Date.now(),
    });
    this.originalPaths.set(key, filePath);
    this._onDidChange.fire();
  }

  get(filePath: string): CachedProfile | undefined {
    return this.cache.get(this.normalizeKey(filePath));
  }

  has(filePath: string): boolean {
    return this.cache.has(this.normalizeKey(filePath));
  }

  remove(filePath: string): void {
    const key = this.normalizeKey(filePath);
    const existed = this.cache.delete(key);
    this.originalPaths.delete(key);
    if (existed) this._onDidChange.fire();
  }

  clear(): void {
    const hadEntries = this.cache.size > 0;
    this.cache.clear();
    this.originalPaths.clear();
    if (hadEntries) this._onDidChange.fire();
  }

  getCachedPaths(): string[] {
    return Array.from(this.originalPaths.values());
  }

  getEntries(): Array<{filePath: string; profile: CachedProfile}> {
    return Array.from(this.cache.entries()).map(([key, profile]) => ({
      filePath: this.originalPaths.get(key) ?? key,
      profile,
    }));
  }

  get size(): number {
    return this.cache.size;
  }

  setLastQueryConfig(config: LastQueryConfig): void {
    this.lastQueryConfig = config;
    this._onDidChange.fire();
  }

  getLastQueryConfig(): LastQueryConfig | null {
    return this.lastQueryConfig;
  }

  private normalizeKey(filePath: string): string {
    return filePath.replace(/\\/g, '/').toLowerCase();
  }
}

export const sessionStore = new SessionStoreImpl();
