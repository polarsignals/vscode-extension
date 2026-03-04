import {tableFromIPC} from '@uwdata/flechette';
import {type LineProfilingData} from '../annotations/profiling-annotations';

export interface CPUProfile {
  nodes: ProfileNode[];
  startTime: number;
  endTime: number;
  samples: number[];
  timeDeltas: number[];
  $vscode?: VsCodeMetadata;
}

export interface ProfilingResult {
  cpuProfile: CPUProfile;
  lineData: LineProfilingData[];
}

export interface ProfileNode {
  id: number;
  callFrame: CallFrame;
  hitCount: number;
  children: number[];
  locationId?: number;
}

export interface CallFrame {
  functionName: string;
  scriptId: string;
  url: string;
  lineNumber: number;
  columnNumber: number;
}

export interface VsCodeMetadata {
  rootPath?: string;
  locations: AnnotationLocation[];
}

export interface AnnotationLocation {
  callFrame: CallFrame;
  locations: SourceLocation[];
}

export interface SourceLocation {
  lineNumber: number;
  columnNumber: number;
  source: {
    name: string;
    path: string;
    sourceReference: number;
  };
}

interface ArrowRow {
  functionName: string;
  fileName: string;
  startLine: number;
  cumulative: number;
  flat: number;
}

export class ArrowToCpuProfileConverter {
  private readonly nodes: ProfileNode[] = [];
  private readonly nodeMap = new Map<string, number>();
  private readonly locationMap = new Map<string, number>();
  private readonly locations: AnnotationLocation[] = [];
  private nodeIdCounter = 1;
  private locationIdCounter = 0;
  private totalRowsBeforeFilter = 0;
  private parsedRows: ArrowRow[] = [];

  constructor(
    private readonly arrowData: Uint8Array,
    private readonly filenameFilter?: string,
  ) {}

  public convert(): CPUProfile {
    this.parsedRows = this.parseArrowTable();

    if (this.parsedRows.length === 0) {
      this.throwNoDataError();
    }

    this.createRootNode();
    this.buildNodeTree(this.parsedRows);

    const samples = this.generateSamples(this.parsedRows);
    const timeDeltas = this.generateTimeDeltas(samples.length);

    return {
      nodes: this.nodes,
      samples,
      timeDeltas,
      startTime: 0,
      endTime: timeDeltas.reduce((sum, delta) => sum + delta, 0),
      $vscode: {
        rootPath: '.',
        locations: this.locations,
      },
    };
  }

  public getLineProfilingData(): LineProfilingData[] {
    const lineData = this.parsedRows.map(row => ({
      lineNumber: row.startLine,
      cumulative: row.cumulative,
      flat: row.flat,
      functionName: row.functionName,
    }));

    const lineCounts = new Map<number, number>();
    const lineValues = new Map<number, number[]>();

    for (const data of lineData) {
      lineCounts.set(data.lineNumber, (lineCounts.get(data.lineNumber) ?? 0) + 1);

      const existing = lineValues.get(data.lineNumber);
      if (existing) {
        existing.push(data.cumulative);
      } else {
        lineValues.set(data.lineNumber, [data.cumulative]);
      }
    }

    lineCounts.forEach((count, line) => {
      if (count > 5) {
        const values = lineValues.get(line);
        if (values && values.length > 0) {
          const sum = values.reduce((a, b) => a + b, 0);
          const max = Math.max(...values);
          console.log(
            `[Debug] Line ${line}: ${count} rows, sum=${this.formatNs(sum)}, max=${this.formatNs(
              max,
            )}, first 5 values: ${values
              .slice(0, 5)
              .map(v => this.formatNs(v))
              .join(', ')}`,
          );
        }
      }
    });

    return lineData;
  }

  private formatNs(ns: number): string {
    if (ns >= 1_000_000_000) {
      return `${(ns / 1_000_000_000).toFixed(2)}s`;
    } else if (ns >= 1_000_000) {
      return `${(ns / 1_000_000).toFixed(2)}ms`;
    } else {
      return `${ns}ns`;
    }
  }

  private parseArrowTable(): ArrowRow[] {
    const table = tableFromIPC(this.arrowData);
    let rows: ArrowRow[] = [];
    const uniqueFiles = new Set<string>();
    this.totalRowsBeforeFilter = table.numRows;

    for (let i = 0; i < Math.min(table.numRows, 100); i++) {
      const row = table.get(i);
      if (row) {
        const fileName = this.getStringValue(row, 'function_file_name');
        if (fileName) uniqueFiles.add(fileName);
      }
    }

    if (table.numRows > 0) {
      const sampleRow = table.get(0);
      const sampleCumBigInt = this.getBigIntValue(sampleRow, 'cumulative');
      const sampleFlatBigInt = this.getBigIntValue(sampleRow, 'flat');
      console.log(
        `[Polar Signals] Sample row 0 - cumulative: ${sampleCumBigInt.toString()} (${Number(
          sampleCumBigInt,
        )}), flat: ${sampleFlatBigInt.toString()} (${Number(sampleFlatBigInt)})`,
      );
    }

    const functionAggregates = new Map<
      string,
      {
        functionName: string;
        fileName: string;
        startLine: number;
        cumulative: number;
        flat: number;
      }
    >();

    for (let i = 0; i < table.numRows; i++) {
      const row = table.get(i);
      if (!row) continue;

      const fileName = this.getStringValue(row, 'function_file_name');

      if (this.filenameFilter && !this.matchesFile(fileName, this.filenameFilter)) {
        continue;
      }

      const functionName = this.getStringValue(row, 'function_name');

      const startLineValue = row.function_startline;
      if (startLineValue === null || startLineValue === undefined) {
        continue;
      }

      const startLine =
        typeof startLineValue === 'bigint' ? Number(startLineValue) : Number(startLineValue);
      const cumulativeBigInt = this.getBigIntValue(row, 'cumulative');
      const flatBigInt = this.getBigIntValue(row, 'flat');

      const functionKey = `${fileName}:${functionName}:${startLine}`;

      const existing = functionAggregates.get(functionKey);
      if (existing) {
        existing.cumulative += Number(cumulativeBigInt);
        existing.flat += Number(flatBigInt);
      } else {
        functionAggregates.set(functionKey, {
          functionName,
          fileName,
          startLine,
          cumulative: Number(cumulativeBigInt),
          flat: Number(flatBigInt),
        });
      }
    }

    rows = Array.from(functionAggregates.values());

    console.log(`[Polar Signals] Rows after filtering and aggregation: ${rows.length} functions`);

    return rows;
  }

  private matchesFile(arrowFileName: string, filterPath: string): boolean {
    if (!arrowFileName || !filterPath) return false;
    return arrowFileName.includes(filterPath);
  }

  private throwNoDataError(): never {
    if (this.totalRowsBeforeFilter === 0) {
      throw new Error(
        'No profiling data found in the specified time range. ' +
          'Try increasing the time range in settings (polarsignals.defaultTimeRange) or check if profiling data exists for your application.',
      );
    } else if (this.filenameFilter) {
      throw new Error(
        `No profiling data found for file "${this.filenameFilter}". ` +
          `Found ${this.totalRowsBeforeFilter} total rows in the profile. ` +
          'The file may not have been profiled during this time range, or the filename may not match. ' +
          'Try a different time range or verify the file was part of the profiled application.',
      );
    } else {
      throw new Error('No profiling data found');
    }
  }

  private getStringValue(row: Record<string, unknown>, field: string): string {
    try {
      const value = row[field];
      if (value === null || value === undefined) return '';
      return String(value);
    } catch {
      return '';
    }
  }

  private getNumberValue(row: Record<string, unknown>, field: string): number {
    try {
      const value = row[field];
      if (value === null || value === undefined) return 0;
      return Number(value);
    } catch {
      return 0;
    }
  }

  private getBigIntValue(row: Record<string, unknown>, field: string): bigint {
    try {
      const value = row[field];
      if (value === null || value === undefined) return 0n;

      if (typeof value === 'bigint') {
        return value;
      }

      return BigInt(value as string | number | bigint | boolean);
    } catch {
      return 0n;
    }
  }

  private createRootNode(): void {
    const rootCallFrame: CallFrame = {
      functionName: '(root)',
      scriptId: '0',
      url: '',
      lineNumber: 0,
      columnNumber: 0,
    };

    const rootNode: ProfileNode = {
      id: 0,
      callFrame: rootCallFrame,
      hitCount: 0,
      children: [],
      locationId: this.getLocationIdFor(rootCallFrame),
    };

    this.nodes.push(rootNode);
  }

  private buildNodeTree(rows: ArrowRow[]): void {
    for (const row of rows) {
      const callFrame: CallFrame = {
        functionName: row.functionName || '(anonymous)',
        scriptId: String(this.nodeIdCounter),
        url: row.fileName,
        lineNumber: Math.max(0, row.startLine - 1),
        columnNumber: 0,
      };

      const nodeKey = this.getNodeKey(callFrame);
      let nodeId = this.nodeMap.get(nodeKey);

      if (nodeId === undefined) {
        nodeId = this.createNode(callFrame, 0);
        this.nodeMap.set(nodeKey, nodeId);
      }

      this.nodes[nodeId].hitCount += row.flat;
    }
  }

  private createNode(callFrame: CallFrame, parentId: number): number {
    const nodeId = this.nodeIdCounter++;

    const node: ProfileNode = {
      id: nodeId,
      callFrame,
      hitCount: 0,
      children: [],
      locationId: this.getLocationIdFor(callFrame),
    };

    this.nodes.push(node);

    if (!this.nodes[parentId].children.includes(nodeId)) {
      this.nodes[parentId].children.push(nodeId);
    }

    return nodeId;
  }

  private getLocationIdFor(callFrame: CallFrame): number {
    const ref = [
      callFrame.functionName,
      callFrame.url,
      callFrame.scriptId,
      callFrame.lineNumber,
      callFrame.columnNumber,
    ].join(':');

    let locationId = this.locationMap.get(ref);
    if (locationId !== undefined) {
      return locationId;
    }

    locationId = this.locationIdCounter++;
    this.locationMap.set(ref, locationId);

    this.locations.push({
      callFrame,
      locations: [
        {
          lineNumber: callFrame.lineNumber + 1,
          columnNumber: callFrame.columnNumber + 1,
          source: {
            name: callFrame.url.split('/').pop() ?? callFrame.url,
            path: callFrame.url,
            sourceReference: 0,
          },
        },
      ],
    });

    return locationId;
  }

  private getNodeKey(callFrame: CallFrame): string {
    return `${callFrame.functionName}|${callFrame.url}|${callFrame.lineNumber}`;
  }

  private generateSamples(rows: ArrowRow[]): number[] {
    const samples: number[] = [];

    for (const row of rows) {
      const callFrame: CallFrame = {
        functionName: row.functionName || '(anonymous)',
        scriptId: '',
        url: row.fileName,
        lineNumber: Math.max(0, row.startLine - 1),
        columnNumber: 0,
      };

      const nodeKey = this.getNodeKey(callFrame);
      const nodeId = this.nodeMap.get(nodeKey);

      if (nodeId !== undefined) {
        const sampleCount = Math.max(1, Math.round(row.flat / 1000000));
        for (let i = 0; i < sampleCount; i++) {
          samples.push(nodeId);
        }
      }
    }

    if (samples.length === 0) {
      samples.push(0);
    }

    return samples;
  }

  private generateTimeDeltas(sampleCount: number): number[] {
    return Array(sampleCount).fill(10000);
  }
}

export function convertArrowToCpuProfile(
  arrowData: Uint8Array,
  filenameFilter?: string,
): CPUProfile {
  const converter = new ArrowToCpuProfileConverter(arrowData, filenameFilter);
  return converter.convert();
}

export function extractProfilingData(
  arrowData: Uint8Array,
  filenameFilter?: string,
): ProfilingResult {
  const converter = new ArrowToCpuProfileConverter(arrowData, filenameFilter);
  const cpuProfile = converter.convert();
  const lineData = converter.getLineProfilingData();
  return {cpuProfile, lineData};
}
