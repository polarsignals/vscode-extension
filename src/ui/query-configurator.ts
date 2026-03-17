import * as vscode from 'vscode';
import {type TimeRange} from '../api/profiler-client';
import {getBrandNameShort} from '../config/settings';

interface WellKnownProfile {
  name: string;
  help: string;
}

const wellKnownProfiles: Record<string, WellKnownProfile> = {
  'block:contentions:count:contentions:count': {
    name: 'Block Contentions Total',
    help: 'Stack traces that led to blocking on synchronization primitives.',
  },
  'block:delay:nanoseconds:contentions:count': {
    name: 'Block Contention Time Total',
    help: 'Time delayed stack traces caused by blocking on synchronization primitives.',
  },
  'fgprof:samples:count:wallclock:nanoseconds:delta': {
    name: 'Fgprof Samples Total',
    help: 'CPU profile samples observed regardless of their current On/Off CPU scheduling status',
  },
  'fgprof:time:nanoseconds:wallclock:nanoseconds:delta': {
    name: 'Fgprof Samples Time Total',
    help: 'CPU profile measured regardless of their current On/Off CPU scheduling status in nanoseconds',
  },
  'goroutine:goroutine:count:goroutine:count': {
    name: 'Goroutine Created Total',
    help: 'Stack traces that created all current goroutines.',
  },
  'memory:alloc_objects:count:space:bytes': {
    name: 'Memory Allocated Objects Total',
    help: 'A sampling of all past memory allocations by objects.',
  },
  'memory:alloc_space:bytes:space:bytes': {
    name: 'Memory Allocated Bytes Total',
    help: 'A sampling of all past memory allocations in bytes.',
  },
  'memory:alloc_objects:count:space:bytes:delta': {
    name: 'Memory Allocated Objects Delta',
    help: 'A sampling of all memory allocations during the observation by objects.',
  },
  'memory:alloc_space:bytes:space:bytes:delta': {
    name: 'Memory Allocated Bytes Delta',
    help: 'A sampling of all memory allocations during the observation in bytes.',
  },
  'memory:inuse_objects:count:space:bytes': {
    name: 'Memory In-Use Objects',
    help: 'A sampling of memory allocations of live objects by objects.',
  },
  'memory:inuse_space:bytes:space:bytes': {
    name: 'Memory In-Use Bytes',
    help: 'A sampling of memory allocations of live objects by bytes.',
  },
  'mutex:contentions:count:contentions:count': {
    name: 'Mutex Contentions Total',
    help: 'Stack traces of holders of contended mutexes.',
  },
  'mutex:delay:nanoseconds:contentions:count': {
    name: 'Mutex Contention Time Total',
    help: 'Time delayed stack traces caused by contended mutexes.',
  },
  'process_cpu:cpu:nanoseconds:cpu:nanoseconds:delta': {
    name: 'Process CPU Nanoseconds',
    help: 'CPU profile measured by the process itself in nanoseconds.',
  },
  'process_cpu:samples:count:cpu:nanoseconds:delta': {
    name: 'Process CPU Samples',
    help: 'CPU profile samples observed by the process itself.',
  },
  'parca_agent_cpu:samples:count:cpu:nanoseconds:delta': {
    name: 'CPU Samples',
    help: 'CPU profile samples observed by Parca Agent.',
  },
  'otel_profiling_agent_on_cpu:samples:count:cpu:nanoseconds:delta': {
    name: 'On-CPU Samples',
    help: 'On CPU profile samples observed by the Otel Profiling Agent.',
  },
  'parca_agent:samples:count:cpu:nanoseconds:delta': {
    name: 'On-CPU',
    help: 'On CPU profile samples as observed by the Parca Agent.',
  },
  'parca_agent:wallclock:nanoseconds:samples:count:delta': {
    name: 'Off-CPU',
    help: 'Time spent off the CPU as observed by the Parca Agent.',
  },
  'parca_agent:cuda:nanoseconds:cuda:nanoseconds:delta': {
    name: 'On-GPU',
    help: 'Time spent on the GPU.',
  },
};

function flexibleWellKnownProfileMatching(name: string): WellKnownProfile | undefined {
  const prefixExcludedName = name.split(':').slice(1).join(':');
  const deltaExcludedName = prefixExcludedName.replace(/:delta$/, '');
  const matchedKey = Object.keys(wellKnownProfiles).find(key => key.includes(deltaExcludedName));
  return matchedKey != null ? wellKnownProfiles[matchedKey] : undefined;
}

function formatProfileType(name: string): {label: string; description: string; detail?: string} {
  const wellKnown = wellKnownProfiles[name] ?? flexibleWellKnownProfileMatching(name);
  if (wellKnown) {
    return {
      label: wellKnown.name,
      description: name,
      detail: wellKnown.help,
    };
  }
  return {
    label: name,
    description: '',
  };
}

export interface QueryConfig {
  profileType: string;
  timeRange: TimeRange;
  labelMatchers: Record<string, string>;
  targetFile?: string;
}

export interface QueryConfiguratorDeps {
  getProfileTypes: (timeRange: string) => Promise<string[]>;
  getLabels: (profileType: string, timeRange: string) => Promise<string[]>;
  getValues: (profileType: string, labelName: string, timeRange: string) => Promise<string[]>;
}

/**
 * QueryConfigurator provides an interactive UI for users to configure
 * profiling queries in VS Code using QuickPick and InputBox dialogs.
 */
export class QueryConfigurator {
  private readonly deps: QueryConfiguratorDeps;

  constructor(deps: QueryConfiguratorDeps) {
    this.deps = deps;
  }

  /**
   * Show interactive configuration flow to the user.
   * Returns null if user cancels at any step.
   */
  async configure(): Promise<QueryConfig | null> {
    try {
      const timeRange = await this.selectTimeRange();
      if (!timeRange) return null;

      const profileType = await this.selectProfileType(timeRange);
      if (!profileType) return null;

      const labelMatchers = await this.configureLabelMatchers(profileType, timeRange);
      if (labelMatchers === null) return null;

      return {
        profileType,
        timeRange,
        labelMatchers,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Configuration error: ${message}`);
      return null;
    }
  }

  private async selectTimeRange(): Promise<string | null> {
    const timeRanges = [
      {label: '5 minutes', value: '5m'},
      {label: '15 minutes', value: '15m'},
      {label: '1 hour', value: '1h'},
      {label: '24 hours', value: '24h'},
      {label: '7 days', value: '7d'},
      {label: '30 days', value: '30d'},
    ];

    const selected = await vscode.window.showQuickPick(timeRanges, {
      placeHolder: 'Select time range for profiling data',
      title: `${getBrandNameShort()}: Select Time Range`,
    });

    return selected?.value ?? null;
  }

  private async selectProfileType(timeRange: string): Promise<string | null> {
    try {
      const profileTypes = await this.deps.getProfileTypes(timeRange);

      if (profileTypes.length === 0) {
        vscode.window.showWarningMessage('No profile types available for this time range');
        return null;
      }

      const items = profileTypes.map(pt => {
        const formatted = formatProfileType(pt);
        return {
          label: formatted.label,
          description: formatted.description,
          detail: formatted.detail,
          profileType: pt,
        };
      });

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select profile type',
        title: `${getBrandNameShort()}: Select Profile Type`,
        matchOnDescription: true,
      });

      return selected?.profileType ?? null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Failed to fetch profile types: ${message}`);
      return null;
    }
  }

  private async configureLabelMatchers(
    profileType: string,
    timeRange: string,
  ): Promise<Record<string, string> | null> {
    const matchers: Record<string, string> = {};

    try {
      const labels = (await this.deps.getLabels(profileType, timeRange)).sort();

      if (labels.length === 0) {
        return matchers;
      }

      const addFilters = await vscode.window.showQuickPick(
        [
          {label: 'Yes, add filters', value: true},
          {label: 'No, skip filters', value: false},
        ],
        {
          placeHolder: 'Add label filters to refine results?',
          title: `${getBrandNameShort()}: Add Label Filters`,
        },
      );

      if (addFilters?.value === false || !addFilters) {
        return matchers;
      }

      let selectedLabels: string[] | undefined;
      while (true) {
        selectedLabels = await vscode.window.showQuickPick(labels, {
          placeHolder: 'Select at least one label (use arrow keys and Space to select, then Enter)',
          canPickMany: true,
          title: `${getBrandNameShort()}: Select Labels to Filter`,
        });

        if (!selectedLabels) {
          return null;
        }

        if (selectedLabels.length > 0) {
          break;
        }
      }

      for (const label of selectedLabels) {
        try {
          const values = (await this.deps.getValues(profileType, label, timeRange)).sort();

          if (values.length === 0) {
            continue;
          }

          if (values.length === 1) {
            matchers[label] = values[0];
            continue;
          }

          const selectedValue = await vscode.window.showQuickPick(values, {
            placeHolder: `Select value for label "${label}"`,
            title: `${getBrandNameShort()}: Select Value for ${label}`,
          });

          if (!selectedValue) {
            return null;
          }
          matchers[label] = selectedValue;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          vscode.window.showWarningMessage(
            `Failed to fetch values for label "${label}": ${message}`,
          );
          continue;
        }
      }

      return matchers;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Failed to fetch labels: ${message}`);
      return null;
    }
  }
}
