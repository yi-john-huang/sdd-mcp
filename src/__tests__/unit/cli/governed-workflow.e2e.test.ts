import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const repositoryRoot = process.cwd();

describe('packed Skill-governed workflow distribution', () => {
  let sandbox: string;
  let packageRoot: string;
  let entrypoint: string;

  beforeAll(() => {
    execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], { cwd: repositoryRoot, stdio: 'ignore' });
    sandbox = mkdtempSync(path.join(os.tmpdir(), 'sdd-packed-governed-'));
    const packed = JSON.parse(execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['pack', '--json', '--pack-destination', sandbox], { cwd: repositoryRoot, encoding: 'utf8' })) as Array<{ filename: string }>;
    const consumer = path.join(sandbox, 'consumer');
    execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['init', '-y'], { cwd: sandbox, stdio: 'ignore' });
    execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', path.join(sandbox, packed[0].filename)], { cwd: sandbox, stdio: 'ignore' });
    packageRoot = path.join(sandbox, 'node_modules', 'sdd-mcp-server');
    entrypoint = path.join(packageRoot, 'sdd-entry.js');
    writeFileSync(path.join(sandbox, '.consumer-path'), consumer);
  }, 120_000);

  afterAll(() => rmSync(sandbox, { recursive: true, force: true }));

  it.each([
    ['claude-code', '.claude/skills/sdd-requirements/SKILL.md', '.mcp.json'],
    ['codex', '.agents/skills/sdd-requirements/SKILL.md', '.codex/config.toml'],
    ['omp', '.omp/skills/sdd-requirements/SKILL.md', '.omp/mcp.json'],
  ])('installs lean %s Skills and mandatory runtime registration', (target, skillPath, runtimePath) => {
    const project = mkdtempSync(path.join(os.tmpdir(), `sdd-packed-${target}-`));
    try {
      const installed = spawnSync(process.execPath, [entrypoint, 'install', '--profile', 'lean', '--target', target], {
        cwd: project,
        encoding: 'utf8',
        env: { ...process.env, FORCE_COLOR: '0' },
      });
      expect(installed.status).toBe(0);
      const skill = readFileSync(path.join(project, skillPath), 'utf8');
      expect(skill).toContain('Internally read status');
      expect(skill).toContain('explicit');
      const runtime = readFileSync(path.join(project, runtimePath), 'utf8');
      expect(runtime).toContain('sdd-mcp');
      expect(runtime).toContain('sdd-mcp-server@5.0.0');
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  it('publishes the canonical governed schemas from packed stdio runtime', async () => {
    const requests = [
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'packed-test', version: '1' } } },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
    ];
    const child = spawn(process.execPath, [entrypoint], {
      cwd: sandbox,
      env: { ...process.env, MCP_MODE: '1', FORCE_COLOR: '0' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    child.stdin.end(`${requests.map((request) => JSON.stringify(request)).join('\n')}\n`);
    const tools = await new Promise<Array<{ name: string; inputSchema: Record<string, unknown> }>>((resolve, reject) => {
      let stdout = '';
      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
        for (const line of stdout.split('\n').filter(Boolean)) {
          try {
            const response = JSON.parse(line);
            if (response.id === 2 && response.result?.tools) {
              resolve(response.result.tools);
              return;
            }
          } catch {
            // Await the next chunk when this JSON-RPC line is incomplete.
          }
        }
      });
      child.on('error', reject);
      child.on('exit', (code) => {
        if (code !== null && code !== 0) reject(new Error(`Packed runtime exited ${code}: ${stdout}`));
      });
    }).finally(() => child.kill());
    expect(tools).toHaveLength(16);
    const submit = tools.find(({ name }) => name === 'sdd-requirements')!;
    expect(submit.inputSchema.required).toEqual(['featureName', 'content', 'expectedRevision', 'expectedArtifactSha256']);
    const progress = tools.find(({ name }) => name === 'sdd-spec-impl')!;
    expect(progress.inputSchema.allOf).toHaveLength(3);
  }, 30_000);
});
