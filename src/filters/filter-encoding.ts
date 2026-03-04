import {type ProfileFilter, generateFilterId, isRegularFilter} from './filter-types';
import {isPresetKey} from './filter-presets';

/**
 * Compact encoding mappings matching Parca's URL state format.
 */
const TYPE_MAP: Record<string, string> = {
  stack: 's',
  frame: 'f',
};

const FIELD_MAP: Record<string, string> = {
  function_name: 'fn',
  binary: 'b',
  system_name: 'sn',
  filename: 'f',
  address: 'a',
  line_number: 'ln',
};

const MATCH_MAP: Record<string, string> = {
  equal: '=',
  not_equal: '!=',
  contains: '~',
  not_contains: '!~',
  starts_with: '^',
  not_starts_with: '!^',
};

const TYPE_MAP_REVERSE = Object.fromEntries(Object.entries(TYPE_MAP).map(([k, v]) => [v, k]));
const FIELD_MAP_REVERSE = Object.fromEntries(Object.entries(FIELD_MAP).map(([k, v]) => [v, k]));
const MATCH_MAP_REVERSE = Object.fromEntries(Object.entries(MATCH_MAP).map(([k, v]) => [v, k]));

/**
 * Encode filters to compact URL-safe string format.
 * Format: "s:fn:~:value,f:b:!=:libc.so,p:preset_key:enabled"
 */
export function encodeFilters(filters: ProfileFilter[]): string {
  if (filters.length === 0) return '';

  return filters
    .filter(f => f.value !== '' && f.type != null)
    .map(f => {
      const filterType = f.type;
      if (!isRegularFilter(f) && filterType != null && isPresetKey(filterType)) {
        const presetKey = encodeURIComponent(filterType);
        const value = encodeURIComponent(f.value);
        return `p:${presetKey}:${value}`;
      }

      if (filterType == null || f.field == null || f.matchType == null) {
        return null;
      }
      const type = TYPE_MAP[filterType];
      const field = FIELD_MAP[f.field];
      const match = MATCH_MAP[f.matchType];
      const value = encodeURIComponent(f.value);

      if (!type || !field || !match) {
        return null;
      }

      return `${type}:${field}:${match}:${value}`;
    })
    .filter(Boolean)
    .join(',');
}

/**
 * Decode filters from compact URL string format.
 */
export function decodeFilters(encoded: string): ProfileFilter[] {
  if (!encoded || encoded === '') return [];

  try {
    const decodedString = safeDecodeURI(encoded);

    return decodedString
      .split(',')
      .map((filter, index) => {
        const parts = filter.split(':');

        if (parts[0] === 'p' && parts.length >= 3) {
          const presetKey = parts[1];
          const value = parts.slice(2).join(':');

          return {
            id: generateFilterId({type: presetKey, value}, index),
            type: presetKey,
            value: safeDecodeURI(value),
          };
        }

        const [type, field, match, ...valueParts] = parts;
        const value = valueParts.join(':');

        const decodedType = TYPE_MAP_REVERSE[type] as ProfileFilter['type'];
        const decodedField = FIELD_MAP_REVERSE[field] as ProfileFilter['field'];
        const decodedMatch = MATCH_MAP_REVERSE[match] as ProfileFilter['matchType'];

        if (!decodedType || !decodedField || !decodedMatch) {
          return null;
        }

        return {
          id: generateFilterId(
            {
              type: decodedType,
              field: decodedField,
              matchType: decodedMatch,
              value: safeDecodeURI(value),
            },
            index,
          ),
          type: decodedType,
          field: decodedField,
          matchType: decodedMatch,
          value: safeDecodeURI(value),
        };
      })
      .filter((f): f is ProfileFilter => f !== null);
  } catch {
    return [];
  }
}

function safeDecodeURI(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function filterToDisplayString(filter: ProfileFilter): string {
  if (!isRegularFilter(filter)) {
    return `Preset: ${filter.type}`;
  }

  const typeStr = filter.type === 'stack' ? 'Stack' : 'Frame';
  const fieldStr = formatFieldName(filter.field ?? '');
  const matchStr = formatMatchType(filter.matchType ?? 'equal');

  return `${typeStr} ${fieldStr} ${matchStr} "${filter.value}"`;
}

function formatFieldName(field: string): string {
  const fieldNames: Record<string, string> = {
    function_name: 'function',
    binary: 'binary',
    system_name: 'system name',
    filename: 'filename',
    address: 'address',
    line_number: 'line',
  };
  return fieldNames[field] ?? field;
}

function formatMatchType(matchType: string): string {
  const matchTypes: Record<string, string> = {
    equal: '=',
    not_equal: '!=',
    contains: 'contains',
    not_contains: 'not contains',
    starts_with: 'starts with',
    not_starts_with: 'not starts with',
  };
  return matchTypes[matchType] ?? matchType;
}
