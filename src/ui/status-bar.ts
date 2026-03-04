import * as vscode from 'vscode';
import {type TimeRange} from '../api/profiler-client';
import {getBrandName} from '../config/settings';

const wellKnownProfileShortNames: Record<string, string> = {
  'parca_agent:samples:count:cpu:nanoseconds:delta': 'CPU',
  'parca_agent:wallclock:nanoseconds:samples:count:delta': 'Off-CPU',
  'parca_agent:cuda:nanoseconds:cuda:nanoseconds:delta': 'GPU',
  'memory:alloc_space:bytes:space:bytes:delta': 'Mem Alloc',
  'memory:alloc_space:bytes:space:bytes': 'Mem Alloc Total',
  'memory:inuse_space:bytes:space:bytes': 'Mem In-Use',
  'memory:alloc_objects:count:space:bytes:delta': 'Mem Objects',
  'mutex:delay:nanoseconds:contentions:count': 'Mutex',
  'mutex:contentions:count:contentions:count': 'Mutex Count',
  'block:delay:nanoseconds:contentions:count': 'Block',
  'block:contentions:count:contentions:count': 'Block Count',
  'goroutine:goroutine:count:goroutine:count': 'Goroutines',
};

export interface ProfileStatusState {
  profileType: string;
  timeRange: TimeRange;
  labelMatchers?: Record<string, string>;
}

/**
 * ProfileStatusBar manages a clickable status bar item showing current profile state.
 */
export class ProfileStatusBar {
  private readonly item: vscode.StatusBarItem;
  private currentState: ProfileStatusState | null = null;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.command = 'polarSignals.showStatusMenu';
    this.showNoProfile();
    this.item.show();
  }

  showNoProfile(): void {
    this.currentState = null;
    this.item.text = '$(flame) No profile';
    this.item.tooltip = `${getBrandName()}\nClick to fetch profile`;
    this.item.backgroundColor = undefined;
  }

  showActiveProfile(state: ProfileStatusState): void {
    this.currentState = state;
    const shortType = this.shortenProfileType(state.profileType);
    const timeRangeDisplay = this.formatTimeRange(state.timeRange);
    this.item.text = `$(flame) ${shortType} ${timeRangeDisplay}`;

    const labelInfo =
      state.labelMatchers && Object.keys(state.labelMatchers).length > 0
        ? Object.entries(state.labelMatchers)
            .map(([k, v]) => `  ${k}="${v}"`)
            .join('\n')
        : '  (none)';

    this.item.tooltip = new vscode.MarkdownString(
      `**${getBrandName()}**\n\n` +
        `**Profile:** ${state.profileType}\n\n` +
        `**Time Range:** ${timeRangeDisplay}\n\n` +
        `**Filters:**\n${labelInfo}\n\n` +
        `*Click for quick actions*`,
    );
    this.item.backgroundColor = undefined;
  }

  private formatTimeRange(timeRange: TimeRange): string {
    if (typeof timeRange === 'string') {
      return timeRange;
    }
    const from = new Date(timeRange.from);
    const to = new Date(timeRange.to);
    const durationMs = timeRange.to - timeRange.from;
    const durationMins = Math.round(durationMs / 60000);
    return `${durationMins}m (${from.toLocaleTimeString()} - ${to.toLocaleTimeString()})`;
  }

  showLoading(): void {
    this.item.text = '$(sync~spin) Fetching...';
    this.item.tooltip = 'Fetching profiling data...';
  }

  getState(): ProfileStatusState | null {
    return this.currentState;
  }

  hasActiveProfile(): boolean {
    return this.currentState !== null;
  }

  private shortenProfileType(profileType: string): string {
    if (wellKnownProfileShortNames[profileType]) {
      return wellKnownProfileShortNames[profileType];
    }

    for (const [key, name] of Object.entries(wellKnownProfileShortNames)) {
      if (profileType.includes(key.split(':').slice(1, -1).join(':'))) {
        return name;
      }
    }

    const parts = profileType.split(':');
    if (parts.length >= 3) {
      const cpuIndex = parts.indexOf('cpu');
      if (cpuIndex !== -1) return 'CPU';

      const memIndex = parts.findIndex(p => p.includes('memory') || p.includes('alloc'));
      if (memIndex !== -1) return 'Memory';

      return parts[1] || profileType.slice(0, 10);
    }

    return profileType.slice(0, 10);
  }

  dispose(): void {
    this.item.dispose();
  }
}

let statusBarInstance: ProfileStatusBar | undefined;

export function getStatusBar(): ProfileStatusBar {
  if (!statusBarInstance) {
    statusBarInstance = new ProfileStatusBar();
  }
  return statusBarInstance;
}

export function disposeStatusBar(): void {
  if (statusBarInstance) {
    statusBarInstance.dispose();
    statusBarInstance = undefined;
  }
}
