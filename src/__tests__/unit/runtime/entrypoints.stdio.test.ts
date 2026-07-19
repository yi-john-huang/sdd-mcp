import { spawn } from 'child_process';
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
  result?: { tools?: Array<{ name: string; inputSchema: Record<string, unknown> }> };
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
