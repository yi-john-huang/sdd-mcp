import { spawn } from 'child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'path';

import { SDD_TOOL_NAMES } from '../../../infrastructure/mcp/sddToolDefinitions';

const repositoryRoot = process.cwd();
const requests = [
  {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'runtime-contract-test', version: '1.0.0' },
    },
  },
  { jsonrpc: '2.0', method: 'notifications/initialized' },
  { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
];

interface JsonRpcResponse {
  id?: number;
  result?: {
    tools?: Array<{ name: string; inputSchema: Record<string, unknown> }>;
    content?: Array<{ type: string; text: string }>;
  };
  error?: unknown;
}

async function listTools(
  entrypoint: string
): Promise<Array<{ name: string; inputSchema: Record<string, unknown> }>> {
  const child = spawn(process.execPath, [path.join(repositoryRoot, entrypoint)], {
    cwd: repositoryRoot,
    env: { ...process.env, MCP_MODE: '1', FORCE_COLOR: '0' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', chunk => {
    stderr += chunk;
  });
  child.stdin.end(`${requests.map(request => JSON.stringify(request)).join('\n')}\n`);

  try {
    for await (const chunk of child.stdout) {
      stdout += chunk.toString();
      const responses = stdout
        .split('\n')
        .filter(line => line.trim().length > 0)
        .flatMap(line => {
          try {
            return [JSON.parse(line) as JsonRpcResponse];
          } catch {
            return [];
          }
        });
      const response = responses.find(({ id }) => id === 2);
      if (response?.result?.tools) return response.result.tools;
      if (response?.error) {
        throw new Error(`tools/list failed for ${entrypoint}: ${JSON.stringify(response.error)}`);
      }
    }
  } finally {
    child.kill();
  }
  throw new Error(`tools/list failed for ${entrypoint}: ${stderr || stdout}`);
}

async function callTool(
  entrypoint: string,
  cwd: string,
  name: string,
  args: Record<string, unknown>,
): Promise<JsonRpcResponse> {
  const child = spawn(process.execPath, [path.join(repositoryRoot, entrypoint)], {
    cwd,
    env: { ...process.env, MCP_MODE: '1', FORCE_COLOR: '0' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const callRequests = [
    requests[0],
    requests[1],
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name, arguments: args } },
  ];
  let stdout = '';
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', chunk => { stderr += chunk; });
  child.stdin.end(`${callRequests.map(request => JSON.stringify(request)).join('\n')}\n`);

  try {
    for await (const chunk of child.stdout) {
      stdout += chunk.toString();
      for (const line of stdout.split('\n').filter(candidate => candidate.trim().length > 0)) {
        try {
          const response = JSON.parse(line) as JsonRpcResponse;
          if (response.id === 2) return response;
        } catch {
          // Wait for a complete JSON-RPC line.
        }
      }
    }
  } finally {
    child.kill();
  }
  throw new Error(`tools/call failed for ${entrypoint}: ${stderr || stdout}`);
}

describe.each(['sdd-entry.js', 'mcp-server.js'])('%s stdio runtime', (entrypoint) => {
  it('publishes the exact canonical inventory and schemas', async () => {
    const tools = await listTools(entrypoint);
    expect(tools.map(({ name }) => name)).toEqual(SDD_TOOL_NAMES);
    const byName = Object.fromEntries(tools.map((tool) => [tool.name, tool.inputSchema]));
    expect(byName['sdd-approve']).toMatchObject({
      required: ['featureName', 'phase'],
    });
    expect(byName['sdd-context-load']).toMatchObject({
      required: ['featureName'],
      properties: {
        featureName: { type: 'string' },
        mode: { enum: ['compact', 'standard', 'full'] },
        phase: { enum: ['requirements', 'design', 'tasks'] },
        maxEstimatedTokens: { type: 'integer', minimum: 1 },
        ifNoneMatch: { type: 'string' },
        includeUnapproved: { type: 'boolean' },
      },
    });
  });
});

describe('compiled workflow restart durability', () => {
  it('discovers a disk feature and generates its next phase in fresh server processes', async () => {
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'sdd-stdio-restart-'));
    const featureRoot = path.join(projectRoot, '.spec', 'specs', 'restart-flow');
    await mkdir(featureRoot, { recursive: true });
    await writeFile(path.join(featureRoot, 'spec.json'), `${JSON.stringify({
      feature_name: 'restart-flow',
      created_at: '2026-07-19T00:00:00.000Z',
      updated_at: '2026-07-19T00:00:00.000Z',
      language: 'en',
      phase: 'init',
      approvals: {
        requirements: { generated: false, approved: false },
        design: { generated: false, approved: false },
        tasks: { generated: false, approved: false },
      },
      workflow_options: { review_test_cases: false },
      checkpoints: { test_cases: { required: false, reviewed: true } },
      ready_for_implementation: false,
    }, null, 2)}\n`, 'utf8');

    try {
      const status = await callTool('sdd-entry.js', projectRoot, 'sdd-status', {
        featureName: 'restart-flow',
      });
      expect(status.error).toBeUndefined();
      expect(JSON.parse(status.result?.content?.[0]?.text ?? '{}')).toMatchObject({
        featureName: 'restart-flow',
        currentPhase: 'init',
      });

      const requirements = await callTool('sdd-entry.js', projectRoot, 'sdd-requirements', {
        featureName: 'restart-flow',
      });
      expect(requirements.error).toBeUndefined();
      expect(requirements.result?.content?.[0]?.text).toContain('Requirements document generated');
      await expect(readFile(path.join(featureRoot, 'requirements.md'), 'utf8')).resolves.toContain('# Requirements');
      const persisted = JSON.parse(await readFile(path.join(featureRoot, 'spec.json'), 'utf8')) as {
        phase: string;
        approvals: { requirements: { generated: boolean } };
      };
      expect(persisted).toMatchObject({
        phase: 'requirements-generated',
        approvals: { requirements: { generated: true } },
      });
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });
});
