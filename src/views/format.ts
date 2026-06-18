export function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * A terse, human-friendly name for a profile type, for rows where the full
 * `formatProfileType` label is too long (Status "Last query", Recent rows).
 */
export function shortProfileType(profileType: string): string {
  const parts = profileType.split(':');
  if (parts.includes('cpu')) return 'CPU';
  if (parts.some(p => p.includes('alloc'))) return 'Mem Alloc';
  if (parts.some(p => p.includes('inuse'))) return 'Mem In-Use';
  if (parts[0] === 'goroutine') return 'Goroutines';
  if (parts[0] === 'mutex') return 'Mutex';
  if (parts[0] === 'block') return 'Block';
  return parts[0] ?? profileType;
}
