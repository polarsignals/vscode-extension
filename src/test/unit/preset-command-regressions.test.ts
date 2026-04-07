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

const parseSourceArrow = vi.fn();
const getUniqueFilenames = vi.fn();
const filterByFilename = vi.fn();
vi.mock('../../converters/source-arrow-converter', () => ({
  parseSourceArrow,
  getUniqueFilenames,
  filterByFilename,
}));

const pickCandidateAndRequery = vi.fn();
vi.mock('../../commands/pick-candidate', () => ({
  pickCandidateAndRequery,
}));

const showNoProfile = vi.fn();
const showActiveProfile = vi.fn();
vi.mock('../../ui/status-bar', () => ({
  getStatusBar: () => ({
    showNoProfile,
    showActiveProfile,
  }),
}));

const applyAnnotations = vi.fn();
vi.mock('../../annotations/annotation-manager', () => ({
  getAnnotations: () => ({applyAnnotations}),
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

const emptyResult = () => ({
  record: new Uint8Array(),
  source: '',
  unit: 'nanoseconds',
  total: 1n,
  filtered: 1n,
});

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
    querySourceReport.mockResolvedValue(emptyResult());
    fetchSourceExact.mockResolvedValue(emptyResult());
    parseSourceArrow.mockReturnValue([]);
    getUniqueFilenames.mockReturnValue([]);
    filterByFilename.mockReturnValue([]);
    pickCandidateAndRequery.mockResolvedValue(undefined);
  });

  it('selectPresetCommand warns when a preset fetch returns no profiling data', async () => {
    const {selectPresetCommand} = await import('../../commands/select-preset');

    await selectPresetCommand({globalState: {update: vi.fn()}} as never);

    expect(showWarningMessage).toHaveBeenCalledWith(
      'No profiling data found for this file in the selected time range',
    );
    expect(showNoProfile).toHaveBeenCalled();
  });

  it('selectPresetCommand returns early without fetching when picker is cancelled', async () => {
    showPresetPicker.mockResolvedValue(undefined);
    const {selectPresetCommand} = await import('../../commands/select-preset');

    await selectPresetCommand({globalState: {update: vi.fn()}} as never);

    expect(querySourceReport).not.toHaveBeenCalled();
    expect(fetchSourceExact).not.toHaveBeenCalled();
  });

  it('fetchWithPresetCommand surfaces config errors instead of rejecting', async () => {
    getConfig.mockRejectedValue(new Error('Please sign in to Polar Signals Cloud'));

    const {fetchWithPresetCommand} = await import('../../commands/fetch-with-preset');

    await expect(fetchWithPresetCommand({} as never, 'cpu-15m')).resolves.toBeUndefined();
    expect(showErrorMessage).toHaveBeenCalledWith(
      'Failed to fetch profile: Please sign in to Polar Signals Cloud',
    );
  });

  it('routes the picker requery through fetchSourceExact and renders the picked data', async () => {
    const pickedResult = {...emptyResult(), record: new Uint8Array([1, 2, 3])};
    const pickedLines = [{filename: 'src/a/foo.go', line: 1, flat: 1, cumulative: 1}];

    parseSourceArrow.mockReturnValueOnce([]).mockReturnValueOnce(pickedLines);
    getUniqueFilenames.mockReturnValue(['src/a/foo.go']);

    pickCandidateAndRequery.mockImplementation(async (_result, _name, requery) => {
      // Verify the helper is wired to fetchSourceExact, not querySourceReport.
      return await requery('src/a/foo.go');
    });
    fetchSourceExact.mockResolvedValue(pickedResult);

    const {selectPresetCommand} = await import('../../commands/select-preset');
    await selectPresetCommand({globalState: {update: vi.fn()}} as never);

    expect(fetchSourceExact).toHaveBeenCalledTimes(1);
    expect(fetchSourceExact).toHaveBeenCalledWith('cpu{}', '15m', 'src/a/foo.go');
    expect(querySourceReport).toHaveBeenCalledTimes(1); // initial only, not the requery
    expect(applyAnnotations).toHaveBeenCalledWith(
      activeEditor,
      pickedLines,
      pickedResult.unit,
      pickedResult.total,
      pickedResult.filtered,
    );
    expect(showWarningMessage).not.toHaveBeenCalled();
  });

  it('still warns when the picked candidate also returns no data', async () => {
    parseSourceArrow.mockReturnValue([]);
    pickCandidateAndRequery.mockImplementation(async (_result, _name, requery) => {
      return await requery('src/a/foo.go');
    });

    const {selectPresetCommand} = await import('../../commands/select-preset');
    await selectPresetCommand({globalState: {update: vi.fn()}} as never);

    expect(fetchSourceExact).toHaveBeenCalled();
    expect(showWarningMessage).toHaveBeenCalledWith(
      'No profiling data found for this file in the selected time range',
    );
    expect(showNoProfile).toHaveBeenCalled();
  });

  it('shows OSS-specific connection error message when querySourceReport fails with ECONNREFUSED', async () => {
    getConfig.mockResolvedValue({
      mode: 'oss',
      apiUrl: 'http://localhost:7070',
      defaultTimeRange: '1h',
      profileType: 'cpu',
      queryLabels: {},
    });
    const err = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:7070'), {
      code: 'ECONNREFUSED',
    });
    querySourceReport.mockRejectedValue(err);

    const {selectPresetCommand} = await import('../../commands/select-preset');
    await selectPresetCommand({globalState: {update: vi.fn()}} as never);

    expect(showErrorMessage).toHaveBeenCalledWith(
      'Failed to connect to Parca at http://localhost:7070. Check if the server is running and the URL is correct in settings.',
    );
  });
});
