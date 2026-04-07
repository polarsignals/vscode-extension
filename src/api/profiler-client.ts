import {type PolarSignalsConfig, getBrandNameShort, onConfigChange} from '../config/settings';
import {GrpcWebFetchTransport} from '@protobuf-ts/grpcweb-transport';
import {QueryServiceClient} from '@parca/client/dist/parca/query/v1alpha1/query.client';
import {
  type QueryRequest,
  QueryRequest_Mode,
  QueryRequest_ReportType,
  type ProfileTypesRequest,
  type LabelsRequest,
  type ValuesRequest,
  type Filter,
} from '@parca/client/dist/parca/query/v1alpha1/query';
import {type Timestamp} from '@parca/client/dist/google/protobuf/timestamp';
import {ProjectServiceClient} from '../generated/polarsignals/project/v1alpha1/project.client';
import type {Organization, Project} from '../generated/polarsignals/project/v1alpha1/project';
import {parseSourceArrow, getUniqueFilenames} from '../converters/source-arrow-converter';

export interface SourceQueryResult {
  record: Uint8Array;
  source: string;
  unit: string;
  total: bigint;
  filtered: bigint;
  candidates?: Array<{filename: string; cumulative: number}>;
}

/**
 * Time range can be either:
 * - A relative string like "15m", "1h", "24h"
 * - An object with absolute timestamps in milliseconds
 */
export type TimeRange = string | {from: number; to: number};

export class ProfilerClient {
  private readonly client: QueryServiceClient;
  private readonly projectClient: ProjectServiceClient;
  private readonly config: PolarSignalsConfig;

  constructor(config: PolarSignalsConfig) {
    this.config = config;
    const transport = new GrpcWebFetchTransport({
      baseUrl: `${this.config.apiUrl}/api`,
      format: 'binary',
    });

    this.client = new QueryServiceClient(transport);
    this.projectClient = new ProjectServiceClient(transport);
  }

  private getAuthMeta(): Record<string, string> {
    if (this.config.mode === 'oss') {
      return {};
    }

    const headers: Record<string, string> = {};

    if (this.config.projectId) {
      headers.projectID = this.config.projectId;
    }

    if (this.config.oauthToken) {
      headers.Authorization = `Bearer ${this.config.oauthToken}`;
    }

    return headers;
  }

  private parseTimeRange(timeRange: TimeRange): {start: Date; end: Date} {
    if (typeof timeRange === 'object' && 'from' in timeRange && 'to' in timeRange) {
      return {
        start: new Date(timeRange.from),
        end: new Date(timeRange.to),
      };
    }

    const end = new Date();
    const start = new Date();

    const match = timeRange.match(/^(\d+)([smhd])$/);
    if (!match) {
      start.setHours(end.getHours() - 1);
      return {start, end};
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 's':
        start.setSeconds(end.getSeconds() - value);
        break;
      case 'm':
        start.setMinutes(end.getMinutes() - value);
        break;
      case 'h':
        start.setHours(end.getHours() - value);
        break;
      case 'd':
        start.setDate(end.getDate() - value);
        break;
    }

    return {start, end};
  }

  private dateToTimestamp(date: Date): Timestamp {
    const seconds = Math.floor(date.getTime() / 1000);
    const nanos = (date.getTime() % 1000) * 1000000;
    return {
      seconds: BigInt(seconds),
      nanos,
    };
  }

  buildQueryForFile(_fileName: string): string {
    const baseQuery = this.config.profileType;

    const labels = this.config.queryLabels ?? {};

    const labelSelectors = Object.entries(labels)
      .map(([key, value]) => `${key}="${value}"`)
      .join(',');

    return `${baseQuery}{${labelSelectors}}`;
  }

  /**
   * Fetch available profile types from the API
   */
  async getProfileTypes(timeRange?: string): Promise<string[]> {
    try {
      const {start, end} = this.parseTimeRange(timeRange ?? this.config.defaultTimeRange);

      const request: ProfileTypesRequest = {
        start: this.dateToTimestamp(start),
        end: this.dateToTimestamp(end),
      };

      console.log(`[${getBrandNameShort()}] Fetching profile types for time range:`, {
        start: start.toISOString(),
        end: end.toISOString(),
        timeRange: timeRange ?? this.config.defaultTimeRange,
      });

      const response = await this.client.profileTypes(request, {
        meta: this.getAuthMeta(),
      });

      console.log(`[${getBrandNameShort()}] Raw profile types response:`, response.response.types);

      const profileTypeNames = response.response.types.map(type => {
        const parts = [
          type.name,
          type.sampleType,
          type.sampleUnit,
          type.periodType,
          type.periodUnit,
        ];

        const fullType = parts.join(':');
        return type.delta ? `${fullType}:delta` : fullType;
      });

      console.log(`[${getBrandNameShort()}] Profile type names:`, profileTypeNames);

      return profileTypeNames;
    } catch (error) {
      console.error(`[${getBrandNameShort()}] Failed to fetch profile types:`, error);
      return ['parca_agent:samples:count:cpu:nanoseconds:delta'];
    }
  }

  /**
   * Fetch available label names for a profile type
   */
  async getLabels(profileType: string, timeRange?: string): Promise<string[]> {
    try {
      const {start, end} = this.parseTimeRange(timeRange ?? this.config.defaultTimeRange);

      const request: LabelsRequest = {
        match: [],
        profileType,
        start: this.dateToTimestamp(start),
        end: this.dateToTimestamp(end),
      };

      console.log(`[${getBrandNameShort()}] Fetching labels with request:`, request);

      const response = await this.client.labels(request, {
        meta: this.getAuthMeta(),
      });

      console.log(`[${getBrandNameShort()}] Received labels:`, response.response.labelNames);
      return response.response.labelNames;
    } catch (error) {
      console.error(`[${getBrandNameShort()}] Failed to fetch labels:`, error);
      console.error(`[${getBrandNameShort()}] Request was:`, {
        profileType,
        timeRange,
      });
      return [];
    }
  }

  /**
   * Fetch available values for a specific label
   */
  async getValues(profileType: string, labelName: string, timeRange?: string): Promise<string[]> {
    try {
      const {start, end} = this.parseTimeRange(timeRange ?? this.config.defaultTimeRange);

      const request: ValuesRequest = {
        labelName,
        match: [],
        profileType,
        start: this.dateToTimestamp(start),
        end: this.dateToTimestamp(end),
      };

      console.log(`[${getBrandNameShort()}] Fetching values with request:`, request);

      const response = await this.client.values(request, {
        meta: this.getAuthMeta(),
      });

      console.log(`[${getBrandNameShort()}] Received values:`, response.response.labelValues);
      return response.response.labelValues;
    } catch (error) {
      console.error(`[${getBrandNameShort()}] Failed to fetch values for ${labelName}:`, error);
      console.error(`[${getBrandNameShort()}] Request was:`, {
        profileType,
        labelName,
        timeRange,
      });
      return [];
    }
  }

  private async executeSourceQuery(
    query: string,
    start: Date,
    end: Date,
    filename: string,
    filters: Filter[],
  ): Promise<SourceQueryResult> {
    const request: QueryRequest = {
      mode: QueryRequest_Mode.MERGE,
      reportType: QueryRequest_ReportType.SOURCE,
      options: {
        oneofKind: 'merge',
        merge: {
          query,
          start: this.dateToTimestamp(start),
          end: this.dateToTimestamp(end),
        },
      },
      sourceReference: {
        buildId: '',
        filename,
        sourceOnly: false,
      },
      filter: filters,
    };

    const response = await this.client.query(request, {meta: this.getAuthMeta()});

    if (response.response.report.oneofKind !== 'source') {
      throw new Error(`Expected SOURCE report type, got ${response.response.report.oneofKind}`);
    }

    const {record: rawRecord, source, unit} = response.response.report.source;
    const record = alignedUint8Array(rawRecord);
    const {total, filtered} = response.response;
    console.log(
      `[${getBrandNameShort()}] SOURCE response: ${
        record.byteLength
      } bytes, unit=${unit}, total=${total}, filtered=${filtered}`,
    );

    return {record, source, unit, total, filtered};
  }

  /**
   * Fetch SOURCE for a known-exact filename without the suffix-trimming retry
   * loop. Use this when the filename is already a full indexed path (e.g.
   * after the user picks one from the candidates list).
   */
  async fetchSourceExact(
    query: string,
    timeRange: TimeRange,
    filename: string,
    filters: Filter[] = [],
  ): Promise<SourceQueryResult> {
    const {start, end} = this.parseTimeRange(timeRange);
    return this.executeSourceQuery(query, start, end, filename, filters);
  }

  async querySourceReport(
    query: string,
    timeRange: TimeRange,
    sourceRef: {filename: string},
    filters: Filter[] = [],
  ): Promise<SourceQueryResult> {
    const {start, end} = this.parseTimeRange(timeRange);

    console.log(`[${getBrandNameShort()}] Executing SOURCE query: ${query}`);

    const candidates = buildFilenameCandidates(sourceRef.filename);
    const seen = new Map<string, number>();
    let last: SourceQueryResult | undefined;
    for (const filename of candidates) {
      const result = await this.executeSourceQuery(query, start, end, filename, filters);
      last = result;
      if (result.record.byteLength > 0) {
        const lines = parseSourceArrow(result.record);
        if (getUniqueFilenames(lines).length === 1) return result;
        // First multi-match attempt has the widest view of the profile;
        // narrower retries are strict subsets, so snapshot once.
        if (seen.size === 0) {
          for (const line of lines) {
            seen.set(line.filename, (seen.get(line.filename) ?? 0) + line.cumulative);
          }
        }
      }
      if (result.total <= 0n) break;
    }
    const candidatesOut =
      seen.size > 0
        ? [...seen.entries()]
            .map(([filename, cumulative]) => ({filename, cumulative}))
            .sort((a, b) => b.cumulative - a.cumulative)
        : undefined;
    return {...last!, candidates: candidatesOut};
  }

  async getProjects(): Promise<{org: Organization; project: Project}[]> {
    const response = await this.projectClient.getProjects({}, {meta: this.getAuthMeta()});

    return response.response.organizations.flatMap(org =>
      org.projects.map(project => ({org, project})),
    );
  }
}

export type {Organization, Project};

// Full workspace-relative path first, then basename and
// grow toward the front.
function buildFilenameCandidates(filename: string): string[] {
  const parts = filename.split('/').filter(Boolean);
  if (parts.length === 0) return [filename];

  const full = parts.join('/');
  const out: string[] = [full];
  for (let i = parts.length - 1; i >= 1; i--) {
    const candidate = parts.slice(i).join('/');
    if (candidate !== full) out.push(candidate);
  }
  return out;
}

/**
 * Ensures the buffer is 8-byte aligned for Arrow IPC parsing.
 * Arrow's BigInt64Array/BigUint64Array require 8-byte aligned memory.
 * If not aligned, creates a copy which will be properly aligned.
 */
function alignedUint8Array(buffer: Uint8Array): Uint8Array {
  return buffer.byteOffset % 8 === 0 ? buffer : new Uint8Array(buffer);
}

let clientInstance: ProfilerClient | undefined;
let configHash: string | undefined;

export function getProfilerClient(config: PolarSignalsConfig): ProfilerClient {
  const hash = `${config.apiUrl}|${config.oauthToken ?? ''}|${config.projectId ?? ''}|${
    config.mode
  }`;
  if (!clientInstance || configHash !== hash) {
    clientInstance = new ProfilerClient(config);
    configHash = hash;
  }
  return clientInstance;
}

export function clearProfilerClient(): void {
  clientInstance = undefined;
  configHash = undefined;
}

onConfigChange(clearProfilerClient);
