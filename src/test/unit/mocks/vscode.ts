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
