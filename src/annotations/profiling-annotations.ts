import * as vscode from 'vscode';

export interface LineProfilingData {
  lineNumber: number;
  cumulative: number;
  flat: number;
  functionName?: string;
}

interface UnitFormat {
  multiplier: number;
  symbol: string;
}

const unitFormatters: Record<string, UnitFormat[]> = {
  nanoseconds: [
    {multiplier: 1e9, symbol: 's'},
    {multiplier: 1e6, symbol: 'ms'},
    {multiplier: 1e3, symbol: 'µs'},
    {multiplier: 1, symbol: 'ns'},
  ],
  milliseconds: [
    {multiplier: 1e6, symbol: 'ks'},
    {multiplier: 1e3, symbol: 's'},
    {multiplier: 1, symbol: 'ms'},
  ],
  bytes: [
    {multiplier: 1e18, symbol: 'EB'},
    {multiplier: 1e15, symbol: 'PB'},
    {multiplier: 1e12, symbol: 'TB'},
    {multiplier: 1e9, symbol: 'GB'},
    {multiplier: 1e6, symbol: 'MB'},
    {multiplier: 1e3, symbol: 'kB'},
    {multiplier: 1, symbol: 'B'},
  ],
  count: [
    {multiplier: 1e18, symbol: 'E'},
    {multiplier: 1e15, symbol: 'P'},
    {multiplier: 1e12, symbol: 'T'},
    {multiplier: 1e9, symbol: 'G'},
    {multiplier: 1e6, symbol: 'M'},
    {multiplier: 1e3, symbol: 'k'},
    {multiplier: 1, symbol: ''},
  ],
};

export class ProfilingAnnotations {
  private readonly lineDecorationType: vscode.TextEditorDecorationType;
  private readonly blockDecorationTypes = new Map<string, vscode.TextEditorDecorationType>();
  private readonly hoverProvider: vscode.Disposable | undefined;
  private unit: string = 'nanoseconds';
  private total: bigint = 0n;
  private filtered: bigint = 0n;

  constructor() {
    this.lineDecorationType = vscode.window.createTextEditorDecorationType({
      isWholeLine: false,
      after: {
        margin: '0 0 0 3em',
        textDecoration: 'none',
      },
    });

    this.createBlockDecorationTypes();
  }

  private createBlockDecorationTypes(): void {
    this.blockDecorationTypes.set(
      'hot',
      vscode.window.createTextEditorDecorationType({
        isWholeLine: true,
        backgroundColor: 'rgba(255, 68, 68, 0.15)',
        overviewRulerColor: 'rgba(255, 68, 68, 0.8)',
        overviewRulerLane: vscode.OverviewRulerLane.Right,
      }),
    );

    this.blockDecorationTypes.set(
      'warm',
      vscode.window.createTextEditorDecorationType({
        isWholeLine: true,
        backgroundColor: 'rgba(255, 170, 0, 0.12)',
        overviewRulerColor: 'rgba(255, 170, 0, 0.8)',
        overviewRulerLane: vscode.OverviewRulerLane.Right,
      }),
    );

    this.blockDecorationTypes.set(
      'mild',
      vscode.window.createTextEditorDecorationType({
        isWholeLine: true,
        backgroundColor: 'rgba(255, 221, 0, 0.1)',
        overviewRulerColor: 'rgba(255, 221, 0, 0.8)',
        overviewRulerLane: vscode.OverviewRulerLane.Right,
      }),
    );

    this.blockDecorationTypes.set(
      'cool',
      vscode.window.createTextEditorDecorationType({
        isWholeLine: true,
        backgroundColor: 'rgba(136, 204, 255, 0.08)',
        overviewRulerColor: 'rgba(136, 204, 255, 0.8)',
        overviewRulerLane: vscode.OverviewRulerLane.Right,
      }),
    );
  }

  public applyAnnotations(
    editor: vscode.TextEditor,
    profilingData: LineProfilingData[],
    unit: string = 'nanoseconds',
    total: bigint = 0n,
    filtered: bigint = 0n,
  ): void {
    this.unit = unit;
    this.total = total;
    this.filtered = filtered;
    const lineDecorations: vscode.DecorationOptions[] = [];

    const lineMap = new Map<number, {cumulative: number; flat: number; functions: string[]}>();

    for (const data of profilingData) {
      const existing = lineMap.get(data.lineNumber);
      if (existing) {
        if (data.cumulative > existing.cumulative) {
          existing.cumulative = data.cumulative;
          existing.flat = data.flat;
        }
        if (data.functionName && !existing.functions.includes(data.functionName)) {
          existing.functions.push(data.functionName);
        }
      } else {
        lineMap.set(data.lineNumber, {
          cumulative: data.cumulative,
          flat: data.flat,
          functions: data.functionName ? [data.functionName] : [],
        });
      }
    }

    let maxCumulative = 0;
    let maxFlat = 0;
    lineMap.forEach(data => {
      maxCumulative = Math.max(maxCumulative, data.cumulative);
      maxFlat = Math.max(maxFlat, data.flat);
    });

    const hasFunction = profilingData.some(d => d.functionName);
    const functionBlocks = hasFunction
      ? this.detectFunctionBlocks(editor.document, profilingData)
      : [];

    const blockDecorationsByType = new Map<string, vscode.DecorationOptions[]>([
      ['hot', []],
      ['warm', []],
      ['mild', []],
      ['cool', []],
    ]);

    for (const block of functionBlocks) {
      const intensity = Math.min(1, block.cumulative / maxCumulative);
      const heatLevel = this.getHeatLevel(intensity);

      const decoration: vscode.DecorationOptions = {
        range: block.range,
        hoverMessage: this.createBlockHoverMessage(block, intensity),
      };

      blockDecorationsByType.get(heatLevel)?.push(decoration);
    }

    blockDecorationsByType.forEach((decorations, heatLevel) => {
      const decorationType = this.blockDecorationTypes.get(heatLevel);
      if (decorationType !== undefined) {
        editor.setDecorations(decorationType, decorations);
      }
    });

    const totalLines = editor.document.lineCount;

    lineMap.forEach((data, lineNumber) => {
      // VS Code uses 0-based line numbers
      const zeroBasedLine = lineNumber - 1;

      // Skip if line number is out of bounds
      if (zeroBasedLine < 0 || zeroBasedLine >= totalLines) {
        return;
      }

      const line = editor.document.lineAt(zeroBasedLine);

      const intensity = Math.min(1, data.cumulative / maxCumulative);

      const cumulativeStr = this.formatValue(data.cumulative);
      const flatStr = this.formatValue(data.flat);
      const cumulativePct = this.formatPercentage(data.cumulative);
      const flatPct = this.formatPercentage(data.flat);
      const annotationText = `Cumulative: ${cumulativeStr}${cumulativePct} | Flat: ${flatStr}${flatPct}`;

      const color = this.getHeatColor(intensity);

      const decoration: vscode.DecorationOptions = {
        range: new vscode.Range(line.range.end, line.range.end),
        renderOptions: {
          after: {
            contentText: annotationText,
            color,
            fontStyle: 'italic',
          },
        },
        hoverMessage: this.createHoverMessage(data, lineNumber, intensity),
      };

      lineDecorations.push(decoration);
    });

    console.log(
      `[Polar Signals] Applied ${lineDecorations.length} line annotations and ${functionBlocks.length} block highlights`,
    );

    editor.setDecorations(this.lineDecorationType, lineDecorations);
  }

  private formatPercentage(value: number): string {
    const denominator = Number(this.total + this.filtered);
    if (denominator === 0) return '';
    const percent = (value / denominator) * 100;
    return ` (${percent.toFixed(2)}%)`;
  }

  private formatValue(value: number, tight: boolean = true, digits: number = 1): string {
    if (value === 0) return '0';

    const format = unitFormatters[this.unit] ?? unitFormatters.count;
    const absValue = Math.abs(value);

    let selectedFormat = format[format.length - 1];
    for (const fmt of format) {
      if (absValue >= fmt.multiplier) {
        selectedFormat = fmt;
        break;
      }
    }

    const formatted = (value / selectedFormat.multiplier).toFixed(digits);
    const cleanFormatted = formatted.replace(/\.?0+$/, '');
    const space = tight ? '' : ' ';
    return `${cleanFormatted}${space}${selectedFormat.symbol}`;
  }

  private getHeatColor(intensity: number): string {
    if (intensity > 0.7) {
      return '#ff4444'; // Hot - red
    } else if (intensity > 0.4) {
      return '#ffaa00'; // Warm - orange
    } else if (intensity > 0.1) {
      return '#ffdd00'; // Mild - yellow
    } else {
      return '#88ccff'; // Cool - blue
    }
  }

  private getHeatLevel(intensity: number): string {
    if (intensity > 0.7) {
      return 'hot';
    } else if (intensity > 0.4) {
      return 'warm';
    } else if (intensity > 0.1) {
      return 'mild';
    } else {
      return 'cool';
    }
  }

  private detectFunctionBlocks(
    document: vscode.TextDocument,
    profilingData: LineProfilingData[],
  ): {
    functionName: string;
    startLine: number;
    endLine: number;
    range: vscode.Range;
    cumulative: number;
    flat: number;
  }[] {
    const functionMap = new Map<
      string,
      {
        functionName: string;
        startLine: number;
        cumulative: number;
        flat: number;
      }
    >();

    for (const data of profilingData) {
      if (!data.functionName) continue;

      const key = `${data.functionName}:${data.lineNumber}`;
      const existing = functionMap.get(key);

      if (existing) {
        if (data.cumulative > existing.cumulative) {
          existing.cumulative = data.cumulative;
          existing.flat = data.flat;
        }
      } else {
        functionMap.set(key, {
          functionName: data.functionName,
          startLine: data.lineNumber,
          cumulative: data.cumulative,
          flat: data.flat,
        });
      }
    }

    const functions = Array.from(functionMap.values()).sort((a, b) => a.startLine - b.startLine);

    const blocks: {
      functionName: string;
      startLine: number;
      endLine: number;
      range: vscode.Range;
      cumulative: number;
      flat: number;
    }[] = [];

    for (let i = 0; i < functions.length; i++) {
      const func = functions[i];
      const zeroBasedStartLine = func.startLine - 1;

      if (zeroBasedStartLine < 0 || zeroBasedStartLine >= document.lineCount) {
        continue;
      }

      const endLine = this.findFunctionEndLine(
        document,
        zeroBasedStartLine,
        functions[i + 1]?.startLine,
      );

      blocks.push({
        functionName: func.functionName,
        startLine: func.startLine,
        endLine: endLine + 1, // Convert back to 1-based
        range: new vscode.Range(zeroBasedStartLine, 0, endLine, Number.MAX_SAFE_INTEGER),
        cumulative: func.cumulative,
        flat: func.flat,
      });
    }

    return blocks;
  }

  private findFunctionEndLine(
    document: vscode.TextDocument,
    startLine: number,
    nextFunctionStartLine?: number,
  ): number {
    const maxLine = document.lineCount - 1;
    const endLine = startLine;
    let braceCount = 0;
    let foundOpenBrace = false;

    for (let i = startLine; i <= maxLine; i++) {
      const lineText = document.lineAt(i).text;

      for (const char of lineText) {
        if (char === '{') {
          braceCount++;
          foundOpenBrace = true;
        } else if (char === '}') {
          braceCount--;
          if (foundOpenBrace && braceCount === 0) {
            return i;
          }
        }
      }

      if (nextFunctionStartLine && i >= nextFunctionStartLine - 2) {
        return i - 1;
      }

      if (i - startLine > 1000) {
        return i;
      }
    }

    return endLine;
  }

  private createBlockHoverMessage(
    block: {
      functionName: string;
      startLine: number;
      endLine: number;
      cumulative: number;
      flat: number;
    },
    intensity: number,
  ): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.isTrusted = true;
    md.supportThemeIcons = true;
    md.appendMarkdown(`### 🔥 Hot Function\n\n`);
    md.appendMarkdown(`**Function:** \`${block.functionName}\`\n\n`);
    md.appendMarkdown(`**Lines:** ${block.startLine}-${block.endLine}\n\n`);
    md.appendMarkdown(
      `**Cumulative:** ${this.formatValue(block.cumulative, false, 2)}${this.formatPercentage(
        block.cumulative,
      )}\n\n`,
    );
    md.appendMarkdown(
      `**Flat:** ${this.formatValue(block.flat, false, 2)}${this.formatPercentage(block.flat)}\n\n`,
    );
    md.appendMarkdown(`---\n\n`);
    md.appendMarkdown(
      `*This function and its callees consumed ${this.formatValue(
        block.cumulative,
        false,
        2,
      )}${this.formatPercentage(block.cumulative)}*\n`,
    );

    if (intensity > 0.4) {
      const args = encodeURIComponent(JSON.stringify({line: block.startLine}));
      md.appendMarkdown(
        `\n\n[$(sparkle) Copy for AI Analysis](command:polarSignals.copyLineForAI?${args})`,
      );
    }

    return md;
  }

  private createHoverMessage(
    data: {cumulative: number; flat: number; functions: string[]},
    lineNumber: number,
    intensity: number,
  ): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.isTrusted = true;
    md.supportThemeIcons = true;
    md.appendMarkdown(`### Profiling Data (Line ${lineNumber})\n\n`);
    md.appendMarkdown(
      `**Cumulative:** ${this.formatValue(data.cumulative, false, 2)}${this.formatPercentage(
        data.cumulative,
      )}\n\n`,
    );
    md.appendMarkdown(
      `**Flat:** ${this.formatValue(data.flat, false, 2)}${this.formatPercentage(data.flat)}\n\n`,
    );

    if (data.functions.length > 0) {
      md.appendMarkdown(`**Functions:**\n`);
      for (const func of data.functions.slice(0, 5)) {
        md.appendMarkdown(`- \`${func}\`\n`);
      }
      if (data.functions.length > 5) {
        md.appendMarkdown(`- ... and ${data.functions.length - 5} more\n`);
      }
    }

    if (intensity > 0.4) {
      const args = encodeURIComponent(JSON.stringify({line: lineNumber}));
      md.appendMarkdown(
        `\n\n[$(sparkle) Copy for AI Analysis](command:polarSignals.copyLineForAI?${args})`,
      );
    }

    return md;
  }

  public clear(editor: vscode.TextEditor): void {
    editor.setDecorations(this.lineDecorationType, []);

    this.blockDecorationTypes.forEach(decorationType => {
      editor.setDecorations(decorationType, []);
    });
  }

  public dispose(): void {
    this.lineDecorationType.dispose();

    this.blockDecorationTypes.forEach(decorationType => {
      decorationType.dispose();
    });

    if (this.hoverProvider) {
      this.hoverProvider.dispose();
    }
  }
}
