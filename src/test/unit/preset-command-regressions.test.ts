import {beforeEach, describe, expect, it, vi} from 'vitest';

const showWarningMessage = vi.fn();
const showErrorMessage = vi.fn();
const showInformationMessage = vi.fn();
const showQuickPick = vi.fn();
const executeCommand = vi.fn();
const withProgress = vi.fn(async (_options, task) => task({report: vi.fn()}));

const activeEditor = {
  document: {
    uri: {
      fsPath: '/workspace/pkg/service.ts',
    },
  },
};

vi.mock('vscode', () => ({
  window: {
    activeTextEditor: activeEditor,
    showWarningMessage,
    showErrorMessage,
    showInformationMessage,
    showQuickPick,
    withProgress,
  },
  workspace: {
    workspaceFolders: [{uri: {fsPath: '/workspace'}}],
  },
  commands: {
    executeCommand,
  },
  ProgressLocation: {
    Notification: 15,
  },
}));

const getConfig = vi.fn();
vi.mock('../../config/settings', () => ({
  getConfig,
  getBrandNameShort: () => 'Polar Signals',
  getAutoScrollToAnnotation: () => false,
}));

const showPresetPicker = vi.fn();
const preset = {
  id: 'cpu-15m',
  name: 'CPU 15m',
  profileType: 'cpu',
  timeRange: '15m',
  labelMatchers: {},
};
vi.mock('../../presets/preset-picker', () => ({
  showPresetPicker,
}));

const getPresetById = vi.fn();
vi.mock('../../presets/preset-definitions', () => ({
  getPresetById,
}));

const querySourceReport = vi.fn();
const fetchSourceExact = vi.fn();
const buildQueryForFile = vi.fn(() => 'cpu{}');
class MockProfilerClient {
  querySourceReport = querySourceReport;
  fetchSourceExact = fetchSourceExact;
  buildQueryForFile = buildQueryForFile;
}

vi.mock('../../api/profiler-client', () => ({
  ProfilerClient: MockProfilerClient,
}));

const parseSourceArrow = vi.fn(() => []);
vi.mock('../../converters/source-arrow-converter', () => ({
  parseSourceArrow,
  getUniqueFilenames: vi.fn(() => []),
  filterByFilename: vi.fn(() => []),
}));

const pickCandidateAndRequery = vi.fn(async () => undefined);
vi.mock('../../commands/pick-candidate', () => ({
  pickCandidateAndRequery,
}));

const showNoProfile = vi.fn();
vi.mock('../../ui/status-bar', () => ({
  getStatusBar: () => ({
    showNoProfile,
    showActiveProfile: vi.fn(),
  }),
}));

vi.mock('../../annotations/annotation-manager', () => ({
  getAnnotations: () => ({
    applyAnnotations: vi.fn(),
  }),
}));

vi.mock('../../state/session-store', () => ({
  sessionStore: {
    store: vi.fn(),
    setLastQueryConfig: vi.fn(),
  },
}));

vi.mock('../../ui/editor-utils', () => ({
  scrollToFirstAnnotatedLine: vi.fn(),
}));

describe('preset command regressions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    showPresetPicker.mockResolvedValue(preset);
    getPresetById.mockReturnValue(preset);
    getConfig.mockResolvedValue({
      mode: 'cloud',
      apiUrl: 'https://api.polarsignals.com',
      oauthToken: 'token',
      projectId: 'project',
      defaultTimeRange: '1h',
      profileType: 'default-profile',
      queryLabels: {env: 'prod'},
    });
    querySourceReport.mockResolvedValue({
      record: new Uint8Array(),
      source: '',
      unit: 'nanoseconds',
      total: 1n,
      filtered: 1n,
    });
    fetchSourceExact.mockResolvedValue({
      record: new Uint8Array(),
      source: '',
      unit: 'nanoseconds',
      total: 1n,
      filtered: 1n,
    });
  });

  it('selectPresetCommand warns when a preset fetch returns no profiling data', async () => {
    const {selectPresetCommand} = await import('../../commands/select-preset');

    await selectPresetCommand({globalState: {update: vi.fn()}} as never);

    expect(showWarningMessage).toHaveBeenCalledWith(
      'No profiling data found for this file in the selected time range',
    );
  });

  it('fetchWithPresetCommand surfaces config errors instead of rejecting', async () => {
    getConfig.mockRejectedValue(new Error('Please sign in to Polar Signals Cloud'));

    const {fetchWithPresetCommand} = await import('../../commands/fetch-with-preset');

    await expect(fetchWithPresetCommand({} as never, 'cpu-15m')).resolves.toBeUndefined();
    expect(showErrorMessage).toHaveBeenCalledWith(
      'Failed to fetch profile: Please sign in to Polar Signals Cloud',
    );
  });
});
