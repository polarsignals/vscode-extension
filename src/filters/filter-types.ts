export interface ProfileFilter {
  id: string;
  type?: 'stack' | 'frame' | string;
  field?: 'function_name' | 'binary' | 'system_name' | 'filename' | 'address' | 'line_number';
  matchType?:
    | 'equal'
    | 'not_equal'
    | 'contains'
    | 'not_contains'
    | 'starts_with'
    | 'not_starts_with';
  value: string;
}

export interface FilterPreset {
  key: string;
  name: string;
  description: string;
  filters: Omit<ProfileFilter, 'id'>[];
  allowedProfileTypes?: string[];
}

export function isPresetFilter(filter: ProfileFilter): boolean {
  return filter.type !== 'stack' && filter.type !== 'frame' && filter.type !== undefined;
}

export function isRegularFilter(filter: ProfileFilter): boolean {
  return filter.type === 'stack' || filter.type === 'frame';
}

export function isValidFilter(filter: ProfileFilter): boolean {
  if (!filter.value) return false;
  if (!filter.type) return false;

  if (!isRegularFilter(filter)) {
    return true;
  }

  return filter.field !== undefined && filter.matchType !== undefined;
}

export function generateFilterId(filter: Omit<ProfileFilter, 'id'>, index: number = 0): string {
  const parts = [
    filter.type ?? '',
    filter.field ?? '',
    filter.matchType ?? '',
    filter.value,
    index.toString(),
  ];
  return `filter-${parts.join('-').replace(/[^a-zA-Z0-9-]/g, '_')}`;
}
