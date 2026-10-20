import * as http from 'http';
import type { AddressInfo } from 'net';
import { JEV_DECIDE_URL, JevTransportError, type JevHttpRequest } from '../../../domain/ports';
import { FetchJevHttpAdapter } from '../../../infrastructure/adapters/FetchJevHttpAdapter';

const KEY = 'sk-test-abcdef123456';

interface Seen {
  method?: string;
  rawHeaders: string[];
  body: string;
}

let server: http.Server;
let seen: Seen[];
let handler: (req: http.IncomingMessage, res: http.ServerResponse) => void;

const baseUrl = (): string => `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const request = (overrides: Partial<JevHttpRequest> = {}): JevHttpRequest => ({
  url: `${baseUrl()}/decide`,
  body: '{"state":{},"questions":{}}',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
  timeoutMs: 2000,
  maxResponseBytes: 262_144,
  ...overrides,
});
const kindOf = async (promise: Promise<unknown>): Promise<string | undefined> => {
  try {
    await promise;
    return undefined;
  } catch (error) {
    expect(error).toBeInstanceOf(JevTransportError);
    expect(String((error as Error).message)).not.toContain(KEY);
    return (error as JevTransportError).kind;
  }
};

beforeEach(async () => {
  seen = [];
  handler = (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"answers":{}}');
  };
  server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      seen.push({ method: req.method, rawHeaders: req.rawHeaders, body: Buffer.concat(chunks).toString('utf8') });
      handler(req, res);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
});

afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('FetchJevHttpAdapter', () => {
  it('posts once and returns status and body with exactly one Authorization header', async () => {
    const response = await new FetchJevHttpAdapter().post(request());
    expect(response).toEqual({ status: 200, body: '{"answers":{}}' });
    expect(seen).toHaveLength(1);
    expect(seen[0]?.method).toBe('POST');
    expect(seen[0]?.body).toBe('{"state":{},"questions":{}}');
    const authHeaders = (seen[0]?.rawHeaders ?? []).filter((value, index) => index % 2 === 0 && value.toLowerCase() === 'authorization');
    expect(authHeaders).toHaveLength(1);
  });

  it('returns non-2xx statuses without throwing', async () => {
    handler = (_req, res) => {
      res.writeHead(503);
      res.end('busy');
    };
    const response = await new FetchJevHttpAdapter().post(request());
    expect(response.status).toBe(503);
    expect(seen).toHaveLength(1);
  });

  it('times out when the server never responds', async () => {
    handler = () => undefined;
    const started = Date.now();
    const kind = await kindOf(new FetchJevHttpAdapter().post(request({ timeoutMs: 1000 })));
    expect(kind).toBe('timeout');
    expect(Date.now() - started).toBeLessThan(1500);
    expect(seen).toHaveLength(1);
  });

  it('reports network failure for a closed port without leaking the key', async () => {
    const spare = http.createServer();
    await new Promise<void>((resolve) => spare.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${(spare.address() as AddressInfo).port}/decide`;
    await new Promise<void>((resolve) => spare.close(() => resolve()));
    expect(await kindOf(new FetchJevHttpAdapter().post(request({ url })))).toBe('network');
    expect(seen).toHaveLength(0);
  });

  it('does not follow a redirect', async () => {
    let targetHits = 0;
    handler = (req, res) => {
      if (req.url === '/target') {
        targetHits += 1;
        res.writeHead(200);
        res.end('followed');
        return;
      }
      res.writeHead(302, { Location: '/target' });
      res.end();
    };
    const response = await new FetchJevHttpAdapter().post(request());
    expect(response.status).toBe(302);
    expect(targetHits).toBe(0);
  });

  it('aborts a body larger than the response cap', async () => {
    handler = (_req, res) => {
      res.writeHead(200);
      res.end('x'.repeat(300_000));
    };
    expect(await kindOf(new FetchJevHttpAdapter().post(request()))).toBe('too-large');
  });

  it('refuses plain http to a non-loopback host without sending anything', async () => {
    expect(await kindOf(new FetchJevHttpAdapter().post(request({ url: 'http://example.com/decide' })))).toBe('network');
    expect(seen).toHaveLength(0);
  });
});

describe('JEV endpoint constant', () => {
  it('is the fixed HTTPS decide URL', () => {
    expect(JEV_DECIDE_URL).toBe('https://jevtypesafeai.com/api/v1/decide');
  });
});
