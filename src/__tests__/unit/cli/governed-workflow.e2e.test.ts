import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
      const packageVersion = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8')).version;
      expect(runtime).toContain(`sdd-mcp-server@${packageVersion}`);
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
    expect(tools).toHaveLength(17);
    const submit = tools.find(({ name }) => name === 'sdd-requirements')!;
    expect(submit.inputSchema.required).toEqual(['featureName', 'content', 'expectedRevision', 'expectedArtifactSha256']);
    const progress = tools.find(({ name }) => name === 'sdd-spec-impl')!;
    expect(progress.inputSchema.allOf).toHaveLength(3);
  }, 30_000);

  describe('verified execution evidence through the packed stdio runtime', () => {
    const feature = 'checkout';
    const description = [
      'The goal is to let a shopper complete checkout for developers and users.',
      'This feature provides an order transaction and supports a latency measurement.',
      'Success criteria measure that 100% of valid carts create exactly one persisted order.',
    ].join(' ');
    const requirements = [
      '# Requirements', '### FR-1: Checkout', '**Objective:** Complete checkout',
      '**EARS Specification:** WHEN a cart is valid, THE system SHALL create an order.',
      '**Acceptance Criteria:** 1. A persisted order is returned.',
    ].join('\n');
    const design = [
      '# Design', '## Requirements Traceability', 'FR-1', '## Architecture and Data Flow', 'Request to service to store.',
      '## Components and Interfaces', 'Checkout service and order store.', '## Failure Handling', 'Failures do not leave partial writes.',
      '## Verification', 'Focused unit checks.', '### D-1: Atomic order creation', '**Covers:** FR-1',
      '**Decision:** Commit the order atomically.', '**Failure behavior:** Roll back the transaction.', '**Verification:** Exercise successful and failed commits.',
    ].join('\n');
    const tasks = [
      '# Tasks', '### 1.1 Create order transaction', '**Covers:** FR-1, D-1', '**Dependencies:** none', '**TDD:** required',
      '**Affected artifacts:** src/order.ts, src/order.test.ts', '**Acceptance criteria:** 1. The transaction is atomic.', '**Verification:** Run the focused order test.',
    ].join('\n');

    let projectRoot: string;
    let serverCwd: string;
    const specPath = (): string => path.join(projectRoot, '.spec', 'specs', feature, 'spec.json');
    const spec = (): { implementation: { revision: number; tasks: Record<string, { evidence: Record<string, Record<string, unknown>> }> } } => JSON.parse(readFileSync(specPath(), 'utf8'));

    /** One packed server per call; the spec on disk carries state between calls, as it does between agent turns. */
    async function call(name: string, args: Record<string, unknown>, extraEnv: Record<string, string> = {}): Promise<Record<string, unknown>> {
      const child = spawn(process.execPath, [entrypoint], {
        cwd: serverCwd,
        env: { ...process.env, MCP_MODE: '1', FORCE_COLOR: '0', CLAUDE_PROJECT_DIR: projectRoot, ...extraEnv },
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      const requests = [
        { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'packed-test', version: '1' } } },
        { jsonrpc: '2.0', method: 'notifications/initialized' },
        { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name, arguments: args } },
      ];
      child.stdin.end(`${requests.map((request) => JSON.stringify(request)).join('\n')}\n`);
      let stdout = '';
      try {
        for await (const chunk of child.stdout) {
          stdout += chunk.toString();
          for (const line of stdout.split('\n').filter((candidate) => candidate.trim().length > 0)) {
            try {
              const response = JSON.parse(line) as { id?: number; result?: { content?: Array<{ text: string }> }; error?: unknown };
              if (response.id !== 2) continue;
              const text = response.result?.content?.[0]?.text;
              if (text !== undefined) {
                try { return JSON.parse(text) as Record<string, unknown>; } catch { return { text }; }
              }
              return { error: response.error };
            } catch {
              // Wait for a complete JSON-RPC line.
            }
          }
        }
      } finally {
        child.kill();
      }
      throw new Error(`tools/call ${name} produced no response: ${stdout}`);
    }
    const codeOf = (result: Record<string, unknown>): string | undefined => JSON.stringify(result).match(/"code":"([A-Za-z]+)"/)?.[1];

    async function approveAll(): Promise<number> {
      const init = await call('sdd-init', { featureName: feature, description, language: 'en' });
      expect(init.status).toBe('initialized');
      for (const [phase, content, extra] of [['requirements', requirements, {}], ['design', design, {}], ['tasks', tasks, { reviewTestCases: false }]] as const) {
        const submitted = await call(`sdd-${phase}`, { featureName: feature, content, expectedRevision: 0, expectedArtifactSha256: null, ...extra });
        expect(submitted.validation).toMatchObject({ status: 'passed' });
        const artifact = submitted.artifact as { sha256: string };
        const approved = await call('sdd-approve', { featureName: feature, phase, expectedRevision: submitted.revision, expectedArtifactSha256: artifact.sha256 });
        expect(approved.approved).toBe(true);
      }
      const begun = await call('sdd-implement', { featureName: feature });
      return begun.revision as number;
    }

    beforeEach(() => {
      const root = mkdtempSync(path.join(os.tmpdir(), 'sdd-packed-evidence-'));
      projectRoot = path.join(root, 'project');
      serverCwd = path.join(root, 'server');
      mkdirSync(projectRoot);
      mkdirSync(serverCwd);
    });
    afterEach(() => rmSync(path.dirname(projectRoot), { recursive: true, force: true }));

    /** A test that fails with an assertion until order.js exports 1; RED and GREEN run this same file. */
    const orderTest = (): string => {
      script('order.js', 'module.exports = 2;\n');
      return script('order.test.js', 'const actual = require("./order.js");\nif (actual !== 1) { process.stderr.write(`Expected: 1\\nReceived: ${actual}\\n`); process.exit(3); }\n');
    };
    /** Evidence runs a project file, never inline code, so each scenario writes its script into the project. */
    const script = (name: string, body: string): string => {
      writeFileSync(path.join(projectRoot, name), body);
      return name;
    };

    it('runs the command itself, rejects typed exit codes and shells, and keeps the 5.5.0 shape in self-reported mode', async () => {
      const node = process.execPath;
      let revision = await approveAll();
      revision = (await call('sdd-spec-impl', { featureName: feature, taskNumber: '1.1', action: 'start', expectedRevision: revision })).revision as number;

      const red = await call('sdd-spec-impl', { featureName: feature, taskNumber: '1.1', action: 'record-red', expectedRevision: revision, run: { argv: [node, orderTest()] } });
      expect(red).toMatchObject({ taskState: 'red-observed', evidenceMode: 'verified', observed: { exitCode: 3, classification: 'assertion' } });
      const redEntry = spec().implementation.tasks['1.1'].evidence.red;
      expect(redEntry).toMatchObject({ exit_code: 3, source: 'engine', red_classification: 'assertion' });
      expect(redEntry.output_sha256).toMatch(/^[a-f0-9]{64}$/);
      revision = red.revision as number;

      const before = readFileSync(specPath(), 'utf8');
      const typed = await call('sdd-spec-impl', { featureName: feature, taskNumber: '1.1', action: 'record-green', expectedRevision: revision, evidence: { command: 'jest order', exitCode: 0, summary: 'passes' } });
      expect(codeOf(typed)).toBe('SelfReportedEvidenceRejected');
      expect(readFileSync(specPath(), 'utf8')).toBe(before);

      script('order.js', 'module.exports = 1;\n');
      const green = await call('sdd-spec-impl', { featureName: feature, taskNumber: '1.1', action: 'record-green', expectedRevision: revision, run: { argv: [node, 'order.test.js'] } });
      expect(green).toMatchObject({ taskState: 'green-observed', observed: { exitCode: 0 } });
      revision = green.revision as number;

      const afterGreen = readFileSync(specPath(), 'utf8');
      const shell = await call('sdd-spec-impl', { featureName: feature, taskNumber: '1.1', action: 'complete', expectedRevision: revision, run: { argv: ['sh', '-c', 'exit 0'] }, affectedArtifacts: ['src/order.ts'] });
      expect(codeOf(shell)).toBe('EvidenceCommandNotAllowed');
      expect(readFileSync(specPath(), 'utf8')).toBe(afterGreen);

      const legacy = await call('sdd-spec-impl', { featureName: feature, taskNumber: '1.1', action: 'complete', expectedRevision: revision, evidence: { command: 'npm test', exitCode: 0, summary: 'verified' }, affectedArtifacts: ['src/order.ts'] }, { SDD_EVIDENCE_MODE: 'self-reported' });
      expect(legacy).toMatchObject({ taskState: 'completed', evidenceMode: 'self-reported' });
      expect(spec().implementation.tasks['1.1'].evidence.verification).toMatchObject({ source: 'caller', exit_code: 0 });

      const status = await call('sdd-status', { featureName: feature });
      expect(status).toMatchObject({ evidenceMode: 'verified', implementation: { tasks: { '1.1': { evidence: { red: 'engine', green: 'engine', verification: 'caller' } } } } });
    }, 120_000);

    it('closes the setup, continuity, verify-command, inline-eval, and drift bypasses in a real git project', async () => {
      const node = process.execPath;
      const gitIn = (...args: string[]) => execFileSync('git', args, { cwd: projectRoot, encoding: 'utf8', env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' } });
      gitIn('init', '-q');
      gitIn('config', 'user.email', 't@example.com');
      gitIn('config', 'user.name', 'T');
      gitIn('config', 'commit.gpgsign', 'false');
      writeFileSync(path.join(projectRoot, 'README.md'), '# fixture\n');
      gitIn('add', '-A');
      gitIn('commit', '-q', '-m', 'base');
      const testArgv = [node, '--test', 'order.test.js'];
      mkdirSync(path.join(projectRoot, '.spec'), { recursive: true });
      writeFileSync(path.join(projectRoot, '.spec', 'sdd-config.json'), JSON.stringify({ evidence: { verifyCommand: testArgv } }));
      const step = async (action: string, extra: Record<string, unknown>): Promise<Record<string, unknown>> =>
        call('sdd-spec-impl', { featureName: feature, taskNumber: '1.1', action, expectedRevision: revision, ...extra });

      let revision = await approveAll();
      revision = (await step('start', {})).revision as number;

      // The test file exists but the module it imports does not: a setup failure.
      writeFileSync(path.join(projectRoot, 'order.test.js'), readFileSync(path.join(__dirname, 'fixtures', 'verified-project', 'order.test.js')));
      const setupRed = await step('record-red', { run: { argv: testArgv } });
      expect(setupRed).toMatchObject({ taskState: 'red-observed', observed: { classification: 'setup' } });
      revision = setupRed.revision as number;
      expect(codeOf(await step('record-green', { run: { argv: testArgv } }))).toBe('RedSetupFailure');

      expect(codeOf(await step('record-red', { run: { argv: [node, '-e', 'process.exit(1)'] } }))).toBe('EvidenceCommandInlineEval');

      writeFileSync(path.join(projectRoot, 'order.js'), 'module.exports = 2;\n');
      const red = await step('record-red', { run: { argv: testArgv } });
      expect(red).toMatchObject({ taskState: 'red-observed', observed: { classification: 'assertion' } });
      revision = red.revision as number;

      const unchanged = await step('record-green', { run: { argv: testArgv } });
      expect(unchanged).toMatchObject({ code: 'EvidenceContinuityViolation', details: { reason: 'unchanged-tree' } });

      writeFileSync(path.join(projectRoot, 'order.js'), 'module.exports = 1;\n');
      const green = await step('record-green', { run: { argv: testArgv } });
      expect(green).toMatchObject({ taskState: 'green-observed', observed: { exitCode: 0 } });
      revision = green.revision as number;

      expect(codeOf(await step('complete', { run: { argv: [node, '--test'] }, affectedArtifacts: ['order.js'] }))).toBe('VerifyCommandMismatch');
      const completed = await step('complete', { affectedArtifacts: ['order.js', 'order.test.js'] });
      expect(completed).toMatchObject({ taskState: 'completed', observed: { exitCode: 0 } });
      expect(spec().implementation.tasks['1.1'].evidence.verification).toMatchObject({ source: 'engine', argv: testArgv });

      writeFileSync(path.join(projectRoot, 'order.js'), 'module.exports = 1; // edited after verification\n');
      const status = await call('sdd-status', { featureName: feature });
      expect(status).toMatchObject({ verifyCommand: testArgv, verificationDrift: { taskNumber: '1.1', changedPaths: ['order.js'] } });
    }, 180_000);

    it('caps a chatty command at 1 MiB and says so in the saved excerpt', async () => {
      let revision = await approveAll();
      revision = (await call('sdd-spec-impl', { featureName: feature, taskNumber: '1.1', action: 'start', expectedRevision: revision })).revision as number;
      const chatty = 'process.stdout.write(Buffer.alloc(2 * 1024 * 1024, 120)); process.stdout.write("\\nExpected: 1\\nReceived: 2\\n", () => process.exit(1));';
      const red = await call('sdd-spec-impl', { featureName: feature, taskNumber: '1.1', action: 'record-red', expectedRevision: revision, run: { argv: [process.execPath, script('chatty.js', chatty)] } });
      expect(red).toMatchObject({ taskState: 'red-observed', observed: { exitCode: 1, truncated: true } });
      const observed = red.observed as { outputExcerpt: string };
      expect(observed.outputExcerpt).toMatch(/^\[output truncated: 1048576 of \d+ bytes captured\]\n/);
      expect(Buffer.byteLength(observed.outputExcerpt, 'utf8')).toBeLessThanOrEqual(8192);
      const entry = spec().implementation.tasks['1.1'].evidence.red;
      expect(entry).toMatchObject({ truncated: true, source: 'engine' });
      expect(String(entry.output_excerpt)).toMatch(/^\[output truncated: 1048576 of \d+ bytes captured\]\n/);
    }, 120_000);
  });
});
