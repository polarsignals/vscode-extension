import * as http from 'http';
import {BinaryWriter, WireType} from '@protobuf-ts/runtime';
import {buildArrowFixture} from './arrow-fixture';

/** Wrap a protobuf-encoded message in the gRPC-Web binary frame format. */
function grpcWebFrame(payload: Uint8Array): Buffer {
  // Data frame: flag=0x00, 4-byte big-endian length, then payload
  const dataFrame = Buffer.alloc(5 + payload.length);
  dataFrame[0] = 0x00;
  dataFrame.writeUInt32BE(payload.length, 1);
  Buffer.from(payload).copy(dataFrame, 5);

  // Trailers frame: flag=0x80, then "grpc-status: 0\r\n"
  const trailers = Buffer.from('grpc-status: 0\r\n');
  const trailerFrame = Buffer.alloc(5 + trailers.length);
  trailerFrame[0] = 0x80;
  trailerFrame.writeUInt32BE(trailers.length, 1);
  trailers.copy(trailerFrame, 5);

  return Buffer.concat([dataFrame, trailerFrame]);
}

function encodeProfileType(): Uint8Array {
  // ProfileType proto: name(1), sample_type(2), sample_unit(3), period_type(4), period_unit(5), delta(6)
  const w = new BinaryWriter();
  w.tag(1, WireType.LengthDelimited).string('parca_agent');
  w.tag(2, WireType.LengthDelimited).string('samples');
  w.tag(3, WireType.LengthDelimited).string('count');
  w.tag(4, WireType.LengthDelimited).string('cpu');
  w.tag(5, WireType.LengthDelimited).string('nanoseconds');
  w.tag(6, WireType.Varint).bool(true);
  return w.finish();
}

function handleProfileTypes(): Buffer {
  // ProfileTypesResponse: types(1) = repeated ProfileType
  const w = new BinaryWriter();
  w.tag(1, WireType.LengthDelimited).bytes(encodeProfileType());
  return grpcWebFrame(w.finish());
}

function handleLabels(): Buffer {
  // LabelsResponse: label_names(1) = repeated string
  const w = new BinaryWriter();
  for (const name of ['namespace', 'pod', 'node']) {
    w.tag(1, WireType.LengthDelimited).string(name);
  }
  return grpcWebFrame(w.finish());
}

function handleValues(): Buffer {
  // ValuesResponse: label_values(1) = repeated string
  const w = new BinaryWriter();
  for (const value of ['default', 'kube-system', 'monitoring']) {
    w.tag(1, WireType.LengthDelimited).string(value);
  }
  return grpcWebFrame(w.finish());
}

function handleQuery(): Buffer {
  const arrowData = buildArrowFixture();

  // Source proto: record(1)=bytes, source(2)=string, unit(3)=string
  const sourceWriter = new BinaryWriter();
  sourceWriter.tag(1, WireType.LengthDelimited).bytes(arrowData);
  sourceWriter.tag(2, WireType.LengthDelimited).string('');
  sourceWriter.tag(3, WireType.LengthDelimited).string('nanoseconds');
  const sourceBytes = sourceWriter.finish();

  // QueryResponse: source(12)=Source (oneof report), total(9)=int64, filtered(10)=int64
  const w = new BinaryWriter();
  w.tag(12, WireType.LengthDelimited).bytes(sourceBytes);
  w.tag(9, WireType.Varint).int64(1000n);
  w.tag(10, WireType.Varint).int64(900n);
  return grpcWebFrame(w.finish());
}

const ROUTE_HANDLERS: Record<string, () => Buffer> = {
  '/api/parca.query.v1alpha1.QueryService/ProfileTypes': handleProfileTypes,
  '/api/parca.query.v1alpha1.QueryService/Labels': handleLabels,
  '/api/parca.query.v1alpha1.QueryService/Values': handleValues,
  '/api/parca.query.v1alpha1.QueryService/Query': handleQuery,
};

export interface MockParcaServer {
  url: string;
  port: number;
  close: () => Promise<void>;
}

/**
 * Start a lightweight HTTP server that speaks enough gRPC-Web to satisfy
 * the ProfilerClient. Returns a handle with the base URL and a close method.
 */
export function startMockParcaServer(): Promise<MockParcaServer> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const handler = ROUTE_HANDLERS[req.url ?? ''];

      if (!handler) {
        res.writeHead(404);
        res.end();
        return;
      }

      const body = handler();
      res.writeHead(200, {
        'Content-Type': 'application/grpc-web+proto',
        'Content-Length': body.length.toString(),
      });
      res.end(body);
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('Failed to get server address'));
        return;
      }

      resolve({
        url: `http://127.0.0.1:${addr.port}`,
        port: addr.port,
        close: () =>
          new Promise<void>((res, rej) => {
            server.close(err => (err ? rej(err) : res()));
          }),
      });
    });

    server.on('error', reject);
  });
}
