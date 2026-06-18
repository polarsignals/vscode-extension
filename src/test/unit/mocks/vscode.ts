// Minimal vscode mock for unit tests that import modules with top-level vscode imports.
// Only the symbols that are actually referenced at module load time need to be mocked.
export const workspace = {
  getConfiguration: () => ({
    get: () => undefined,
  }),
};

export const window = {
  createTextEditorDecorationType: () => ({dispose: () => {}}),
};

export const ConfigurationTarget = {
  Global: 1,
  Workspace: 2,
  WorkspaceFolder: 3,
};

export const OverviewRulerLane = {
  Left: 1,
  Center: 2,
  Right: 4,
};

export const Range = class {
  constructor(
    public startLine: number,
    public startChar: number,
    public endLine: number,
    public endChar: number,
  ) {}
};

export const Uri = {
  parse: (s: string) => ({toString: () => s}),
};

export class EventEmitter<T> {
  private listeners: ((e: T) => void)[] = [];
  readonly event = (listener: (e: T) => void) => {
    this.listeners.push(listener);
    return {dispose: () => (this.listeners = this.listeners.filter(l => l !== listener))};
  };
  fire(data: T): void {
    for (const listener of this.listeners) listener(data);
  }
  dispose(): void {
    this.listeners = [];
  }
}
