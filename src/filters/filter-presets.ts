import {type FilterPreset} from './filter-types';

/**
 * Built-in filter presets matching Parca UI's filter presets.
 */
export const FILTER_PRESETS: FilterPreset[] = [
  {
    key: 'go_runtime_expected_off_cpu',
    name: 'Go Runtime Expected Off-CPU',
    description: 'Excludes expected Go runtime blocking functions',
    allowedProfileTypes: ['parca_agent:wallclock:nanoseconds:samples:count:delta'],
    filters: [
      {
        type: 'stack',
        field: 'function_name',
        matchType: 'not_equal',
        value: 'runtime.usleep',
      },
      {
        type: 'stack',
        field: 'function_name',
        matchType: 'not_equal',
        value: 'runtime.futex',
      },
    ],
  },
  {
    key: 'rust_runtime_expected_off_cpu',
    name: 'Rust Expected Off-CPU',
    description: 'Excludes expected Rust runtime blocking functions',
    allowedProfileTypes: ['parca_agent:wallclock:nanoseconds:samples:count:delta'],
    filters: [
      {
        type: 'stack',
        field: 'function_name',
        matchType: 'not_equal',
        value: 'parking_lot_core::thread_parker::imp::ThreadParker::futex_wait',
      },
      {
        type: 'stack',
        field: 'function_name',
        matchType: 'not_equal',
        value: 'tokio::runtime::time::Driver::park_internal',
      },
      {
        type: 'stack',
        field: 'function_name',
        matchType: 'not_equal',
        value: 'futex_wait',
      },
    ],
  },
  {
    key: 'hide_v8_internals',
    name: 'Hide V8 internals',
    description: 'Excludes Node.js and V8 internal functions from the profile',
    filters: [
      {
        type: 'frame',
        field: 'binary',
        matchType: 'not_contains',
        value: 'node',
      },
      {
        type: 'frame',
        field: 'function_name',
        matchType: 'not_contains',
        value: 'V8',
      },
    ],
  },
  {
    key: 'hide_cuda_internals',
    name: 'Hide CUDA Internals',
    description: 'Excludes CUDA and NVIDIA GPU driver internal functions from the profile',
    filters: [
      {
        type: 'frame',
        field: 'binary',
        matchType: 'not_contains',
        value: 'libcudnn_engines_precompiled.so',
      },
      {
        type: 'frame',
        field: 'binary',
        matchType: 'not_contains',
        value: 'libcupti.so',
      },
      {
        type: 'frame',
        field: 'binary',
        matchType: 'not_contains',
        value: 'libcudart.so',
      },
      {
        type: 'frame',
        field: 'binary',
        matchType: 'not_contains',
        value: 'libcuda.so',
      },
      {
        type: 'frame',
        field: 'binary',
        matchType: 'not_contains',
        value: 'libcudnn.so',
      },
      {
        type: 'frame',
        field: 'binary',
        matchType: 'not_contains',
        value: 'libcudnn_graph.so',
      },
      {
        type: 'frame',
        field: 'binary',
        matchType: 'not_contains',
        value: 'libparcagpucupti.so',
      },
      {
        type: 'frame',
        field: 'binary',
        matchType: 'not_starts_with',
        value: 'libcublas',
      },
    ],
  },
  {
    key: 'hide_python_internals',
    name: 'Hide Python Internals',
    description: 'Excludes Python interpreter internal functions from the profile',
    filters: [
      {
        type: 'frame',
        field: 'binary',
        matchType: 'not_contains',
        value: 'python3',
      },
      {
        type: 'frame',
        field: 'function_name',
        matchType: 'not_equal',
        value: '<interpreter trampoline>',
      },
      {
        type: 'frame',
        field: 'function_name',
        matchType: 'not_equal',
        value: '<module>',
      },
    ],
  },
  {
    key: 'hide_libc',
    name: 'Hide libc',
    description: 'Excludes C standard library functions from the profile',
    filters: [
      {
        type: 'frame',
        field: 'binary',
        matchType: 'not_contains',
        value: 'libc.so',
      },
    ],
  },
  {
    key: 'hide_tokio_frames',
    name: 'Hide Tokio Frames',
    description: 'Excludes Tokio runtime frames from the profile',
    filters: [
      {
        type: 'frame',
        field: 'function_name',
        matchType: 'not_starts_with',
        value: 'tokio::',
      },
      {
        type: 'frame',
        field: 'function_name',
        matchType: 'not_starts_with',
        value: '<tokio::',
      },
    ],
  },
  {
    key: 'hide_rust_futures',
    name: 'Hide Rust Futures Infrastructure',
    description: 'Excludes Rust futures infrastructure frames from the profile',
    filters: [
      {
        type: 'frame',
        field: 'function_name',
        matchType: 'not_starts_with',
        value: 'future',
      },
      {
        type: 'frame',
        field: 'function_name',
        matchType: 'not_starts_with',
        value: '<future',
      },
      {
        type: 'frame',
        field: 'function_name',
        matchType: 'not_contains',
        value: 'futures_core',
      },
      {
        type: 'frame',
        field: 'function_name',
        matchType: 'not_contains',
        value: 'core::future::future::Future',
      },
    ],
  },
  {
    key: 'hide_rust_panic_backtrace',
    name: 'Hide Rust Panic Backtrace Infrastructure',
    description: 'Excludes Rust panic and backtrace infrastructure frames from the profile',
    filters: [
      {
        type: 'frame',
        field: 'function_name',
        matchType: 'not_starts_with',
        value: 'std::panic',
      },
      {
        type: 'frame',
        field: 'function_name',
        matchType: 'not_starts_with',
        value: '<core::panic',
      },
      {
        type: 'frame',
        field: 'function_name',
        matchType: 'not_starts_with',
        value: 'std::sys::backtrace',
      },
    ],
  },
];

const presetKeys = new Set(FILTER_PRESETS.map(preset => preset.key));

export function isPresetKey(key: string): boolean {
  return presetKeys.has(key);
}

export function getPresetByKey(key: string): FilterPreset | undefined {
  return FILTER_PRESETS.find(preset => preset.key === key);
}

export function getPresetsForProfileType(profileType?: string): FilterPreset[] {
  if (profileType === undefined || profileType === '') {
    return FILTER_PRESETS;
  }

  return FILTER_PRESETS.filter(preset => {
    if (preset.allowedProfileTypes === undefined) return true;
    return preset.allowedProfileTypes.includes(profileType);
  });
}

export function getAllFilterPresets(): FilterPreset[] {
  return FILTER_PRESETS;
}
