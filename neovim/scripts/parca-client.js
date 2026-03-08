#!/usr/bin/env node
/**
 * Parca gRPC client helper for the Neovim plugin.
 * Reads a JSON command from stdin, executes it, and writes the result to stdout.
 *
 * Protocol:
 *   stdin:  one JSON line per invocation { cmd, args... }
 *   stdout: one JSON line { ok: true, data } or { ok: false, error }
 */

'use strict';

const {GrpcWebFetchTransport} = require('@protobuf-ts/grpcweb-transport');
const {QueryServiceClient} = require('@parca/client');
const {ReportType} = require('@parca/client');

let config = null;

function parseTimeRange(str) {
  if (typeof str === 'object' && str !== null && str.from !== undefined) {
    return {isRelative: false, from: BigInt(str.from), to: BigInt(str.to)};
  }
  const match = String(str).match(/^(\d+)(m|h|d)$/);
  if (match) {
    const now = Date.now();
    const units = {m: 60000, h: 3600000, d: 86400000};
    const ms = parseInt(match[1], 10) * units[match[2]];
    return {isRelative: false, from: BigInt(now - ms) * 1000000n, to: BigInt(now) * 1000000n};
  }
  // default: last 1 hour
  const now = Date.now();
  return {isRelative: false, from: BigInt(now - 3600000) * 1000000n, to: BigInt(now) * 1000000n};
}

function buildHeaders(cfg) {
  const headers = {};
  if (cfg.mode === 'cloud') {
    if (cfg.projectId) headers['projectID'] = cfg.projectId;
    if (cfg.oauthToken) headers['Authorization'] = `Bearer ${cfg.oauthToken}`;
  }
  return headers;
}

function makeClient(cfg) {
  const transport = new GrpcWebFetchTransport({
    baseUrl: cfg.apiUrl,
    format: 'binary',
    fetchInit: {headers: buildHeaders(cfg)},
  });
  return new QueryServiceClient(transport);
}

async function querySourceReport(args) {
  const client = makeClient(config);
  const {query, timeRange, filename, buildId, filters} = args;
  const tr = parseTimeRange(timeRange);

  const sourceRef = filename
    ? {filename, buildId: buildId || '', lastModified: undefined}
    : undefined;

  const call = client.queryRange({
    reportType: ReportType.SOURCE,
    query,
    start: tr.from,
    end: tr.to,
    limit: 0,
    filterQuery: filters || '',
    nodeTrimThreshold: 0,
  });

  const chunks = [];
  for await (const msg of call.responses) {
    if (msg.report?.oneofKind === 'source') {
      const src = msg.report.source;
      // Collect per-line data from protobuf response
      if (src.record) {
        // Arrow IPC bytes — send as base64 back to Lua plugin
        chunks.push({type: 'arrow', data: Buffer.from(src.record).toString('base64')});
      }
      if (src.sourceCode !== undefined) {
        chunks.push({type: 'source', unit: src.unit || '', total: String(src.total || 0), filtered: String(src.filtered || 0)});
      }
    }
  }
  await call.status;
  return {chunks};
}

async function getProfileTypes(args) {
  const client = makeClient(config);
  const tr = parseTimeRange(args.timeRange || '1h');
  const call = await client.profileTypes({});
  const types = (call.response.types || []).map(t => {
    const parts = [t.name, t.sampleType, t.sampleUnit, t.periodType, t.periodUnit, t.delta ? 'delta' : ''].filter(Boolean);
    return parts.join(':');
  });
  return {types};
}

async function getLabels(args) {
  const client = makeClient(config);
  const tr = parseTimeRange(args.timeRange || '1h');
  const call = await client.labels({
    match: [args.profileType],
    start: tr.from,
    end: tr.to,
  });
  return {labels: call.response.labelNames || []};
}

async function getValues(args) {
  const client = makeClient(config);
  const tr = parseTimeRange(args.timeRange || '1h');
  const call = await client.values({
    labelName: args.labelName,
    match: [args.profileType],
    start: tr.from,
    end: tr.to,
  });
  return {values: call.response.labelValues || []};
}

async function getProjects(args) {
  // Projects are fetched from the Polar Signals REST API, not gRPC
  const url = (config.apiUrl || 'https://api.polarsignals.com').replace(/\/$/, '');
  const headers = {'Authorization': `Bearer ${config.oauthToken || ''}`};
  const resp = await fetch(`${url}/v1/projects`, {headers});
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const body = await resp.json();
  const projects = (body.projects || []).map(p => ({
    id: p.id,
    name: p.name,
    org: p.organizationName || p.organization_name || '',
  }));
  return {projects};
}

async function dispatch(cmd) {
  switch (cmd.name) {
    case 'configure':
      config = cmd.args;
      return {ok: true};
    case 'querySourceReport':
      return await querySourceReport(cmd.args);
    case 'getProfileTypes':
      return await getProfileTypes(cmd.args);
    case 'getLabels':
      return await getLabels(cmd.args);
    case 'getValues':
      return await getValues(cmd.args);
    case 'getProjects':
      return await getProjects(cmd.args);
    default:
      throw new Error(`Unknown command: ${cmd.name}`);
  }
}

async function main() {
  process.stdin.setEncoding('utf8');
  let buf = '';
  process.stdin.on('data', chunk => {
    buf += chunk;
    const lines = buf.split('\n');
    buf = lines.pop(); // keep incomplete line
    for (const line of lines) {
      if (!line.trim()) continue;
      let cmd;
      try {
        cmd = JSON.parse(line);
      } catch (e) {
        process.stdout.write(JSON.stringify({ok: false, error: `JSON parse error: ${e.message}`}) + '\n');
        continue;
      }
      dispatch(cmd)
        .then(data => {
          process.stdout.write(JSON.stringify({ok: true, data}) + '\n');
        })
        .catch(err => {
          process.stdout.write(JSON.stringify({ok: false, error: String(err.message || err)}) + '\n');
        });
    }
  });
  process.stdin.on('end', () => process.exit(0));
}

main().catch(err => {
  process.stderr.write(String(err) + '\n');
  process.exit(1);
});
