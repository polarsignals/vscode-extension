import {randomUUID} from 'crypto';
import {Counter, Gauge, Registry} from 'prom-client';
import * as SnappyJS from 'snappyjs';
import {
  WriteRequest,
  type WriteRequest as WriteRequestMessage,
} from './generated/prometheus/prometheus_remote_write';

const ANALYTICS_URL = 'https://analytics.parca.dev/api/v1/write';
const FLUSH_TIMEOUT_MS = 10_000;

export const sessionId = randomUUID();

const registry = new Registry();
let extensionVersion = 'unknown';

export const info = new Gauge({
  name: 'polarsignals_vscode_info',
  help: 'Extension session info',
  labelNames: ['session_id', 'version', 'vscode_version', 'platform', 'arch', 'mode', 'signed_in'],
  registers: [registry],
});

export const commandInvocations = new Counter({
  name: 'polarsignals_vscode_command_invocations_total',
  help: 'Command invocations this session',
  labelNames: ['session_id', 'command'],
  registers: [registry],
});

export const presetRuns = new Counter({
  name: 'polarsignals_vscode_preset_runs_total',
  help: 'Preset runs this session',
  labelNames: ['session_id', 'preset'],
  registers: [registry],
});

export const queryBuilderTimeRangeSelections = new Counter({
  name: 'polarsignals_vscode_query_builder_time_range_selections_total',
  help: 'Query builder time range selections this session',
  labelNames: ['session_id', 'time_range'],
  registers: [registry],
});

type MetricFamilies = Awaited<ReturnType<Registry['getMetricsAsJSON']>>;

export function setExtensionVersion(version: string): void {
  extensionVersion = version || 'unknown';
}

export function toWriteRequest(families: MetricFamilies, tsMs: number): WriteRequestMessage {
  const timeseries = families.flatMap(family =>
    family.values.map(value => ({
      labels: [
        {name: '__name__', value: family.name},
        ...Object.entries(value.labels).map(([name, labelValue]) => ({
          name,
          value: String(labelValue),
        })),
      ].sort((a, b) => a.name.localeCompare(b.name)),
      samples: [{value: value.value, timestamp: BigInt(tsMs)}],
    })),
  );

  return {timeseries};
}

export function encodeWriteRequest(request: WriteRequestMessage): Uint8Array {
  return SnappyJS.compress(WriteRequest.toBinary(request));
}

async function collectPayload(): Promise<Uint8Array | undefined> {
  const families = await registry.getMetricsAsJSON();
  if (families.every(family => family.values.length === 0)) return undefined;
  return encodeWriteRequest(toWriteRequest(families, Date.now()));
}

/** Serialize and send the registry. Telemetry failures must never escape. */
export async function flush(): Promise<void> {
  try {
    const body = await collectPayload();
    if (!body) return;
    // Copy into a fresh ArrayBuffer: the configured DOM lib's BodyInit accepts
    // ArrayBuffer but not a Uint8Array view.
    const requestBody = new ArrayBuffer(body.byteLength);
    new Uint8Array(requestBody).set(body);

    await fetch(ANALYTICS_URL, {
      method: 'POST',
      headers: {
        'Content-Encoding': 'snappy',
        'Content-Type': 'application/x-protobuf',
        'User-Agent': `polarsignals-vscode/${extensionVersion}`,
        'X-Prometheus-Remote-Write-Version': '0.1.0',
      },
      body: requestBody,
      signal: AbortSignal.timeout(FLUSH_TIMEOUT_MS),
    });
  } catch {
    // Telemetry must never break the extension.
  }
}
