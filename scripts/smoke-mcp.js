// Simple smoke test: start mcp-server.js, wait briefly, then terminate
import { spawn } from 'node:child_process';

function runSmoke() {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['mcp-server.js'], {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      try { child.kill('SIGTERM'); } catch {}
      resolve({ ok: true, stdout, stderr, note: 'terminated after timeout' });
    }, 700);

    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ ok: false, error: String(err), stdout, stderr });
    });
    child.on('exit', (code, signal) => {
      clearTimeout(timer);
      resolve({ ok: true, code, signal, stdout, stderr });
    });
  });
}

const res = await runSmoke();
console.log(JSON.stringify(res, null, 2));

