import {tableFromIPC} from '@uwdata/flechette';

export interface SourceLineData {
  filename: string;
  lineNumber: number;
  cumulative: number;
  flat: number;
}

/**
 * Parse the sparse Arrow format from SOURCE report type.
 * The Arrow schema has columns: filename, line_number, cumulative, flat
 * Only rows with profiling data are included (sparse format).
 */
export function parseSourceArrow(arrowData: Uint8Array): SourceLineData[] {
  const table = tableFromIPC(arrowData);

  const filenameCol = table.getChild('filename');
  const lineNumberCol = table.getChild('line_number');
  const cumulativeCol = table.getChild('cumulative');
  const flatCol = table.getChild('flat');

  if (!lineNumberCol) {
    console.warn('[Polar Signals] No line_number column found in SOURCE response');
    return [];
  }

  const lines: SourceLineData[] = [];

  for (let i = 0; i < table.numRows; i++) {
    const filename = String(filenameCol?.get(i) ?? '');
    const lineNumber = Number(lineNumberCol.get(i) ?? 0);
    const cumulative = Number(cumulativeCol?.get(i) ?? 0n);
    const flat = Number(flatCol?.get(i) ?? 0n);

    if (lineNumber > 0 && (cumulative > 0 || flat > 0)) {
      lines.push({filename, lineNumber, cumulative, flat});
    }
  }

  const uniqueFiles = [...new Set(lines.map(l => l.filename))];
  console.log(
    `[Polar Signals] Parsed ${lines.length} lines with profiling data from SOURCE response`,
  );
  console.log(`[Polar Signals] Unique filenames in response:`, uniqueFiles);

  return lines;
}

export function getUniqueFilenames(lines: SourceLineData[]): string[] {
  return [...new Set(lines.map(l => l.filename))];
}

export function filterByFilename(
  lines: SourceLineData[],
  targetFilename: string,
): SourceLineData[] {
  return lines.filter(
    l =>
      l.filename === targetFilename ||
      l.filename.endsWith('/' + targetFilename) ||
      l.filename.endsWith(targetFilename),
  );
}
