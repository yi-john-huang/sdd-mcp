// Minimal MCP stdio client to call sdd-steering
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';

function enc(obj) {
  const b = Buffer.from(JSON.stringify(obj), 'utf8');
  const h = Buffer.from(`Content-Length: ${b.length}\r\nContent-Type: application/json\r\n\r\n`, 'utf8');
  return Buffer.concat([h, b]);
}
function dec(buffer) {
  const out = [];
  let buf = buffer;
  while (true) {
    const sep = buf.indexOf('\r\n\r\n');
    if (sep === -1) break;
    const header = buf.slice(0, sep).toString('utf8');
    const m = header.match(/Content-Length:\s*(\d+)/i);
    if (!m) break;
    const len = parseInt(m[1], 10);
    const start = sep + 4;
    const end = start + len;
    if (buf.length < end) break;
    const body = buf.slice(start, end).toString('utf8');
    try { out.push(JSON.parse(body)); } catch {}
    buf = buf.slice(end);
  }
  return { messages: out, rest: buf };
}

async function main() {
  const proj = process.argv[2] || '/tmp/test-sdd-project';
  const serverPath = path.resolve(process.cwd(), 'mcp-server.js');
  const child = spawn(process.execPath, [serverPath], { stdio: ['pipe', 'pipe', 'inherit'], cwd: proj });

  let out = Buffer.alloc(0);
  let initialized = false;
  let steeringCalled = false;
  let done = false;

  child.stdout.on('data', async (chunk) => {
    out = Buffer.concat([out, chunk]);
    const { messages, rest } = dec(out);
    out = rest;
    for (const m of messages) {
      if (m.id === 1 && !initialized) {
        initialized = true;
        // Send initialized notification then call sdd-steering
        child.stdin.write(enc({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }));
        const call = { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'sdd-steering', arguments: { updateMode: 'create' } } };
        child.stdin.write(enc(call));
      } else if (m.id === 2 && !steeringCalled) {
        steeringCalled = true;
        // Verify files
        const steeringDir = path.join(proj, '.spec', 'steering');
        const files = await fs.readdir(steeringDir).catch(() => []);
        const secPath = path.join(steeringDir, 'security-check.md');
        const exists = files.includes('security-check.md');
        let head = '';
        if (exists) {
          const content = await fs.readFile(secPath, 'utf8');
          head = content.split('\n').slice(0, 5).join('\n');
        }
        console.log(JSON.stringify({ ok: true, steeringDir, files, securityCheckExists: exists, securityCheckHead: head }, null, 2));
        try { child.kill('SIGTERM'); } catch {}
        done = true;
      }
    }
  });

  // Send initialize
  const init = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-09-18', capabilities: { tools: { list: true, call: true } }, clientInfo: { name: 'local-smoke-client', version: '0.0.1' } } };
  child.stdin.write(enc(init));

  setTimeout(() => {
    if (!done) {
      console.error('Timeout waiting for sdd-steering response');
      try { child.kill('SIGTERM'); } catch {}
      process.exit(1);
    }
  }, 3000);
}

main().catch((e) => { console.error(e); process.exit(1); });
