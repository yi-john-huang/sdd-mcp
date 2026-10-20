import { injectable } from 'inversify';
import { JevTransportError } from '../../domain/ports.js';
import type { JevHttpPort, JevHttpRequest, JevHttpResponse } from '../../domain/ports.js';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

/** Only https is allowed, except plain http to loopback so tests can use a local server. */
function isAllowedUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' || (url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname));
  } catch {
    return false;
  }
}

async function readCapped(response: Response, maxBytes: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new JevTransportError('too-large');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

@injectable()
export class FetchJevHttpAdapter implements JevHttpPort {
  async post(request: JevHttpRequest): Promise<JevHttpResponse> {
    if (!isAllowedUrl(request.url)) throw new JevTransportError('network');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), request.timeoutMs);
    try {
      const response = await fetch(request.url, {
        method: 'POST',
        headers: { ...request.headers },
        body: request.body,
        redirect: 'manual',
        signal: controller.signal,
      });
      if (response.status < 200 || response.status > 299) {
        await response.body?.cancel().catch(() => undefined);
        return { status: response.status, body: '' };
      }
      return { status: response.status, body: await readCapped(response, request.maxResponseBytes) };
    } catch (error) {
      if (error instanceof JevTransportError) throw error;
      throw new JevTransportError(controller.signal.aborted ? 'timeout' : 'network');
    } finally {
      clearTimeout(timer);
    }
  }
}
