import * as vscode from 'vscode';
import {type ProfileFilter, generateFilterId} from './filter-types';
import {FILTER_PRESETS, getPresetsForProfileType} from './filter-presets';

interface FilterQuickPickItem extends vscode.QuickPickItem {
  filterType: 'preset' | 'custom-stack' | 'custom-frame';
  presetKey?: string;
}

/**
 * Show a QuickPick for selecting filter presets or creating custom filters.
 * Returns an array of ProfileFilters or null if cancelled.
 */
export async function showFilterPicker(profileType?: string): Promise<ProfileFilter[] | null> {
  const presets = getPresetsForProfileType(profileType);

  const items: FilterQuickPickItem[] = [
    {
      label: '$(add) Add Custom Stack Filter',
      description: 'Filter entire stacks by function name, binary, etc.',
      filterType: 'custom-stack',
    },
    {
      label: '$(add) Add Custom Frame Filter',
      description: 'Filter individual frames by function name, binary, etc.',
      filterType: 'custom-frame',
    },
    {
      label: '',
      kind: vscode.QuickPickItemKind.Separator,
      filterType: 'preset',
    },
    ...presets.map(preset => ({
      label: preset.name,
      description: `${preset.filters.length} filter${preset.filters.length > 1 ? 's' : ''}`,
      detail: preset.description,
      filterType: 'preset' as const,
      presetKey: preset.key,
    })),
  ];

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select a filter preset or create a custom filter',
    title: 'Polar Signals: Add Stack/Frame Filter',
  });

  if (!selected) {
    return null;
  }

  if (selected.filterType === 'preset' && selected.presetKey) {
    return [
      {
        id: generateFilterId({type: selected.presetKey, value: 'enabled'}, 0),
        type: selected.presetKey,
        value: 'enabled',
      },
    ];
  }

  if (selected.filterType === 'custom-stack' || selected.filterType === 'custom-frame') {
    return await showCustomFilterDialog(selected.filterType === 'custom-stack' ? 'stack' : 'frame');
  }

  return null;
}

/**
 * Show dialog for creating a custom stack or frame filter.
 */
async function showCustomFilterDialog(
  filterType: 'stack' | 'frame',
): Promise<ProfileFilter[] | null> {
  const fieldItems = [
    {label: 'Function Name', description: 'Filter by function name', value: 'function_name'},
    {label: 'Binary', description: 'Filter by binary/executable name', value: 'binary'},
    {label: 'Filename', description: 'Filter by source filename', value: 'filename'},
    {label: 'System Name', description: 'Filter by system name', value: 'system_name'},
    {label: 'Line Number', description: 'Filter by source line number', value: 'line_number'},
    {label: 'Address', description: 'Filter by memory address', value: 'address'},
  ];

  const selectedField = await vscode.window.showQuickPick(fieldItems, {
    placeHolder: 'What field do you want to filter by?',
    title: `Polar Signals: Create ${filterType === 'stack' ? 'Stack' : 'Frame'} Filter`,
  });

  if (!selectedField) {
    return null;
  }

  const isNumericField = selectedField.value === 'line_number' || selectedField.value === 'address';
  const matchItems = isNumericField
    ? [
        {label: 'Equals', description: 'Value must equal', value: 'equal'},
        {label: 'Not Equals', description: 'Value must not equal', value: 'not_equal'},
      ]
    : [
        {label: 'Equals', description: 'Exact match', value: 'equal'},
        {label: 'Not Equals', description: 'Must not equal', value: 'not_equal'},
        {label: 'Contains', description: 'Value contains substring', value: 'contains'},
        {
          label: 'Not Contains',
          description: 'Value does not contain substring',
          value: 'not_contains',
        },
        {label: 'Starts With', description: 'Value starts with prefix', value: 'starts_with'},
        {
          label: 'Not Starts With',
          description: 'Value does not start with prefix',
          value: 'not_starts_with',
        },
      ];

  const selectedMatch = await vscode.window.showQuickPick(matchItems, {
    placeHolder: 'How should the value be matched?',
    title: 'Polar Signals: Select Match Type',
  });

  if (!selectedMatch) {
    return null;
  }

  const value = await vscode.window.showInputBox({
    prompt: `Enter the ${selectedField.label.toLowerCase()} to filter`,
    placeHolder: isNumericField ? '42' : 'e.g., main, runtime., libc.so',
    title: 'Polar Signals: Enter Filter Value',
    validateInput: input => {
      if (!input || input.trim() === '') {
        return 'Value cannot be empty';
      }
      if (isNumericField && isNaN(Number(input))) {
        return 'Value must be a number';
      }
      return null;
    },
  });

  if (!value) {
    return null;
  }

  const filter: ProfileFilter = {
    id: generateFilterId(
      {
        type: filterType,
        field: selectedField.value as ProfileFilter['field'],
        matchType: selectedMatch.value as ProfileFilter['matchType'],
        value: value.trim(),
      },
      0,
    ),
    type: filterType,
    field: selectedField.value as ProfileFilter['field'],
    matchType: selectedMatch.value as ProfileFilter['matchType'],
    value: value.trim(),
  };

  return [filter];
}

/**
 * Show a picker for selecting which active filters to remove.
 */
export async function showRemoveFilterPicker(
  currentFilters: ProfileFilter[],
): Promise<ProfileFilter[] | null> {
  if (currentFilters.length === 0) {
    vscode.window.showInformationMessage('No active filters to remove');
    return null;
  }

  const items = currentFilters.map(filter => {
    let label: string;
    let description: string;

    const preset = FILTER_PRESETS.find(p => p.key === filter.type);
    if (preset) {
      label = `$(package) ${preset.name}`;
      description = preset.description;
    } else {
      const typeIcon = filter.type === 'stack' ? '$(layers)' : '$(symbol-method)';
      label = `${typeIcon} ${filter.field} ${filter.matchType} "${filter.value}"`;
      description = filter.type === 'stack' ? 'Stack filter' : 'Frame filter';
    }

    return {
      label,
      description,
      filter,
      picked: false,
    };
  });

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select filters to remove',
    title: 'Polar Signals: Remove Filters',
    canPickMany: true,
  });

  if (!selected || selected.length === 0) {
    return null;
  }

  const selectedIds = new Set(selected.map(s => s.filter.id));
  return currentFilters.filter(f => !selectedIds.has(f.id));
}
