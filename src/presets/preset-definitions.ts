import * as vscode from 'vscode';
import {getMode, type ProfilerMode} from '../config/settings';

export interface QueryPreset {
  id: string;
  name: string;
  description?: string;
  profileType: string;
  timeRange: string;
  labelMatchers?: Record<string, string>;
  mode?: ProfilerMode | 'both';
}

export const DEFAULT_PRESETS: QueryPreset[] = [
  {
    id: 'cpu-15m',
    name: 'On-CPU (15min)',
    description: 'CPU profile samples over the last 15 minutes',
    profileType: 'parca_agent:samples:count:cpu:nanoseconds:delta',
    timeRange: '15m',
  },
  {
    id: 'cpu-1h',
    name: 'On-CPU (1 hour)',
    description: 'CPU profile samples over the last hour',
    profileType: 'parca_agent:samples:count:cpu:nanoseconds:delta',
    timeRange: '1h',
  },
  {
    id: 'cpu-24h',
    name: 'On-CPU (24 hours)',
    description: 'CPU profile samples over the last 24 hours',
    profileType: 'parca_agent:samples:count:cpu:nanoseconds:delta',
    timeRange: '24h',
  },

  {
    id: 'off-cpu-15m',
    name: 'Off-CPU (15min)',
    description: 'Time spent waiting/blocked over the last 15 minutes',
    profileType: 'parca_agent:wallclock:nanoseconds:samples:count:delta',
    timeRange: '15m',
  },
  {
    id: 'off-cpu-1h',
    name: 'Off-CPU (1 hour)',
    description: 'Time spent waiting/blocked over the last hour',
    profileType: 'parca_agent:wallclock:nanoseconds:samples:count:delta',
    timeRange: '1h',
  },

  {
    id: 'memory-alloc-15m',
    name: 'Memory Allocations (15min)',
    description: 'Memory allocations during the last 15 minutes',
    profileType: 'memory:alloc_space:bytes:space:bytes:delta',
    timeRange: '15m',
  },
  {
    id: 'memory-alloc-1h',
    name: 'Memory Allocations (1 hour)',
    description: 'Memory allocations during the last hour',
    profileType: 'memory:alloc_space:bytes:space:bytes:delta',
    timeRange: '1h',
  },
  {
    id: 'memory-inuse-15m',
    name: 'Memory In-Use (15min)',
    description: 'Currently allocated memory over the last 15 minutes',
    profileType: 'memory:inuse_space:bytes:space:bytes',
    timeRange: '15m',
  },

  {
    id: 'goroutines-15m',
    name: 'Goroutines (15min)',
    description: 'Goroutine creation stack traces over the last 15 minutes',
    profileType: 'goroutine:goroutine:count:goroutine:count',
    timeRange: '15m',
  },

  {
    id: 'mutex-15m',
    name: 'Mutex Contention (15min)',
    description: 'Time spent waiting on mutex locks over the last 15 minutes',
    profileType: 'mutex:delay:nanoseconds:contentions:count',
    timeRange: '15m',
  },

  {
    id: 'block-15m',
    name: 'Block Contention (15min)',
    description: 'Time spent blocked on synchronization over the last 15 minutes',
    profileType: 'block:delay:nanoseconds:contentions:count',
    timeRange: '15m',
  },

  {
    id: 'process-cpu-15m',
    name: 'Process CPU Samples (15min)',
    description: 'CPU profile samples from Go runtime pprof',
    profileType: 'process_cpu:samples:count:cpu:nanoseconds:delta',
    timeRange: '15m',
    mode: 'oss',
  },
  {
    id: 'process-cpu-time-15m',
    name: 'Process CPU Time (15min)',
    description: 'CPU time from Go runtime pprof',
    profileType: 'process_cpu:cpu:nanoseconds:cpu:nanoseconds:delta',
    timeRange: '15m',
    mode: 'oss',
  },

  {
    id: 'fgprof-samples-15m',
    name: 'Fgprof Samples (15min)',
    description: 'Full goroutine profile samples (on + off CPU)',
    profileType: 'fgprof:samples:count:cpu:nanoseconds:delta',
    timeRange: '15m',
    mode: 'oss',
  },
  {
    id: 'fgprof-time-15m',
    name: 'Fgprof Time (15min)',
    description: 'Full goroutine profile time (on + off CPU)',
    profileType: 'fgprof:cpu:nanoseconds:cpu:nanoseconds:delta',
    timeRange: '15m',
    mode: 'oss',
  },

  {
    id: 'block-contentions-15m',
    name: 'Block Contentions Count (15min)',
    description: 'Number of blocking events on synchronization primitives',
    profileType: 'block:contentions:count:delay:nanoseconds',
    timeRange: '15m',
    mode: 'oss',
  },
];

export function getAllPresets(): QueryPreset[] {
  const currentMode = getMode();
  const config = vscode.workspace.getConfiguration('polarSignals');
  const userPresets = config.get<QueryPreset[]>('presets') ?? [];

  const filterByMode = (preset: QueryPreset): boolean => {
    if (!preset.mode || preset.mode === 'both') return true;
    return preset.mode === currentMode;
  };

  const presetsMap = new Map<string, QueryPreset>();

  for (const preset of DEFAULT_PRESETS) {
    if (filterByMode(preset)) {
      presetsMap.set(preset.id, preset);
    }
  }

  for (const preset of userPresets) {
    if (
      preset.id &&
      preset.name &&
      preset.profileType &&
      preset.timeRange &&
      filterByMode(preset)
    ) {
      presetsMap.set(preset.id, preset);
    }
  }

  return Array.from(presetsMap.values());
}

export function getPresetById(id: string): QueryPreset | undefined {
  const config = vscode.workspace.getConfiguration('polarSignals');
  const userPresets = config.get<QueryPreset[]>('presets') ?? [];

  const allPresets = [...DEFAULT_PRESETS, ...userPresets];
  return allPresets.find(p => p.id === id);
}
