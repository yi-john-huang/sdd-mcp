// Minimal MCP stdio client to request tools/list
import { spawn } from 'node:child_process';

function encodeMessage(obj) {
  const body = Buffer.from(JSON.stringify(obj), 'utf8');
  const header = Buffer.from(`Content-Length: ${body.length}\r\nContent-Type: application/json\r\n\r\n`, 'utf8');
  return Buffer.concat([header, body]);
}

function decodeMessages(buffer) {
  const messages = [];
  let buf = buffer;
  while (true) {
    const headerEnd = buf.indexOf('\r\n\r\n');
    if (headerEnd === -1) break;
    const header = buf.slice(0, headerEnd).toString('utf8');
    const match = header.match(/Content-Length:\s*(\d+)/i);
    if (!match) break;
    const length = parseInt(match[1], 10);
    const start = headerEnd + 4;
    const end = start + length;
    if (buf.length < end) break;
    const body = buf.slice(start, end).toString('utf8');
    try { messages.push(JSON.parse(body)); } catch {}
    buf = buf.slice(end);
  }
  return { messages, rest: buf };
}

const child = spawn(process.execPath, ['mcp-server.js'], { stdio: ['pipe', 'pipe', 'inherit'] });

let outBuf = Buffer.alloc(0);
let initialized = false;
let initReplied = false;
child.stdout.on('data', (chunk) => {
  outBuf = Buffer.concat([outBuf, chunk]);
  const { messages, rest } = decodeMessages(outBuf);
  outBuf = rest;
  for (const m of messages) {
    // console.log('<<', JSON.stringify(m));
    if (!initReplied && m.id === 1) {
      initReplied = true;
      // Send initialized notification then request tools/list
      const initializedNote = { jsonrpc: '2.0', method: 'notifications/initialized', params: {} };
      child.stdin.write(encodeMessage(initializedNote));
      const listReq = { jsonrpc: '2.0', id: 2, method: 'tools/list' };
      child.stdin.write(encodeMessage(listReq));
    } else if (m.id === 2) {
      console.log('Tools:', m.result?.tools?.map(t => t.name).join(', '));
      try { child.kill('SIGTERM'); } catch {}
    }
  }
});
// Send initialize
const initReq = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2024-09-18',
    capabilities: { tools: { list: true, call: true } },
    clientInfo: { name: 'local-smoke-client', version: '0.0.1' }
  }
};
child.stdin.write(encodeMessage(initReq));
