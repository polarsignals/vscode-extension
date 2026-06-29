import {describe, expect, it} from 'vitest';
import * as SnappyJS from 'snappyjs';
import {Counter, Registry} from 'prom-client';
import {WriteRequest} from '../../generated/prometheus/prometheus_remote_write';
import {encodeWriteRequest, toWriteRequest} from '../../metrics';

describe('remote-write metrics', () => {
  it('serializes prom-client metric JSON as sorted remote-write timeseries', async () => {
    const registry = new Registry();
    const counter = new Counter({
      name: 'polarsignals_vscode_preset_runs_total',
      help: 'Preset runs this session',
      labelNames: ['session_id', 'preset'],
      registers: [registry],
    });
    counter.inc({session_id: 'session-1', preset: 'cpu-15m'}, 3);

    const request = toWriteRequest(await registry.getMetricsAsJSON(), 1750000000000);

    expect(request.timeseries).toHaveLength(1);
    expect(request.timeseries[0].labels).toEqual([
      {name: '__name__', value: 'polarsignals_vscode_preset_runs_total'},
      {name: 'preset', value: 'cpu-15m'},
      {name: 'session_id', value: 'session-1'},
    ]);
    expect(request.timeseries[0].samples).toEqual([{value: 3, timestamp: 1750000000000n}]);
  });

  it('uses snappy block compression and preserves int64 timestamps', () => {
    const original = WriteRequest.toBinary({
      timeseries: [
        {
          labels: [
            {name: '__name__', value: 'polarsignals_vscode_info'},
            {name: 'session_id', value: 'session-1'},
          ],
          samples: [{value: 1, timestamp: 1750000000000n}],
        },
      ],
    });

    const compressed = encodeWriteRequest(WriteRequest.fromBinary(original));
    const framedMagic = [0xff, 0x06, 0x00, 0x00, 0x73, 0x4e, 0x61, 0x50, 0x70, 0x59];

    expect([...compressed.slice(0, framedMagic.length)]).not.toEqual(framedMagic);

    const decoded = WriteRequest.fromBinary(SnappyJS.uncompress(compressed));
    expect(decoded.timeseries[0].samples[0].timestamp).toBe(1750000000000n);
    expect(decoded).toEqual(WriteRequest.fromBinary(original));
  });
});
