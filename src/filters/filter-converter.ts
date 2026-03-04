import {type Filter, type NumberCondition, type StringCondition} from '@parca/client';
import {type ProfileFilter} from './filter-types';

/**
 * Create a StringCondition from matchType and value.
 * Adapted from Parca UI useProfileFilters.ts
 */
const createStringCondition = (matchType: string, value: string): StringCondition => ({
  condition:
    matchType === 'equal'
      ? {oneofKind: 'equal' as const, equal: value}
      : matchType === 'not_equal'
        ? {oneofKind: 'notEqual' as const, notEqual: value}
        : matchType === 'contains'
          ? {oneofKind: 'contains' as const, contains: value}
          : matchType === 'not_contains'
            ? {oneofKind: 'notContains' as const, notContains: value}
            : matchType === 'starts_with'
              ? {oneofKind: 'startsWith' as const, startsWith: value}
              : matchType === 'not_starts_with'
                ? {oneofKind: 'notStartsWith' as const, notStartsWith: value}
                : {oneofKind: 'notContains' as const, notContains: value},
});

/**
 * Create a NumberCondition from matchType and value.
 * Used for address and line_number fields.
 */
const createNumberCondition = (matchType: string, value: bigint): NumberCondition => ({
  condition:
    matchType === 'equal'
      ? {oneofKind: 'equal' as const, equal: value}
      : {oneofKind: 'notEqual' as const, notEqual: value},
});

/**
 * Convert ProfileFilter[] to protobuf Filter[] matching the expected structure.
 * Adapted from Parca UI useProfileFilters.ts
 */
export const convertToProtoFilters = (profileFilters: ProfileFilter[]): Filter[] => {
  return profileFilters
    .filter(f => f.value !== '' && f.type != null && f.field != null && f.matchType != null)
    .map(f => {
      const isNumberField = f.field === 'address' || f.field === 'line_number';

      const condition: StringCondition | NumberCondition = isNumberField
        ? createNumberCondition(f.matchType as string, BigInt(f.value))
        : createStringCondition(f.matchType as string, f.value);

      const criteria: Record<string, StringCondition | NumberCondition> = {};
      switch (f.field) {
        case 'function_name':
          criteria.functionName = condition;
          break;
        case 'binary':
          criteria.binary = condition;
          break;
        case 'system_name':
          criteria.systemName = condition;
          break;
        case 'filename':
          criteria.filename = condition;
          break;
        case 'address':
          criteria.address = condition;
          break;
        case 'line_number':
          criteria.lineNumber = condition;
          break;
      }

      if (f.type === 'stack') {
        return {
          filter: {
            oneofKind: 'stackFilter' as const,
            stackFilter: {
              filter: {
                oneofKind: 'criteria' as const,
                criteria,
              },
            },
          },
        };
      } else {
        return {
          filter: {
            oneofKind: 'frameFilter' as const,
            frameFilter: {
              filter: {
                oneofKind: 'criteria' as const,
                criteria,
              },
            },
          },
        };
      }
    });
};
