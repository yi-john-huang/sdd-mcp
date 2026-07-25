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
      required: ['featureName', 'phase', 'expectedRevision', 'expectedArtifactSha256'],
    });
    expect(byName['sdd-context-load']).toMatchObject({
      required: ['featureName'],
      properties: {
        featureName: { type: 'string' },
        mode: { enum: ['compact', 'standard', 'full'] },
        phase: { enum: ['requirements', 'design', 'tasks', 'implementation'] },
        maxEstimatedTokens: { type: 'integer', minimum: 1 },
        ifNoneMatch: { type: 'string' },
        includeUnapproved: { type: 'boolean' },
      },
    });
    expect(byName['sdd-spec-impl']).toHaveProperty('allOf');
  });
});

describe('compiled workflow restart durability', () => {
  it('persists submit, approval, context, and next phase across fresh processes', async () => {
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'sdd-stdio-restart-'));
    const featureRoot = path.join(projectRoot, '.spec', 'specs', 'restart-flow');
    await mkdir(featureRoot, { recursive: true });
    const empty = { generated: false, approved: false, revision: 0, validation: { status: 'not-run', blockers: [] } };
    await writeFile(path.join(featureRoot, 'spec.json'), `${JSON.stringify({
      schema_version: 5,
      feature_name: 'restart-flow',
      description: 'Persist workflow governance across runtime restarts.',
      created_at: '2026-07-19T00:00:00.000Z',
      updated_at: '2026-07-19T00:00:00.000Z',
      language: 'en',
      phase: 'init',
      approvals: { requirements: empty, design: empty, tasks: empty },
      workflow_options: { review_test_cases: null },
      checkpoints: { test_cases: { required: false, reviewed: false } },
    }, null, 2)}\n`, 'utf8');
    const requirementsContent = [
      '# Requirements',
      '### FR-1: Restart durability',
      '**Objective:** Preserve workflow state',
      '**EARS Specification:** WHEN the runtime restarts, THE system SHALL preserve approved state.',
      '**Acceptance Criteria:** 1. A fresh process observes approval.',
    ].join('\n');
    const designContent = [
      '# Design',
      '## Requirements Traceability', 'FR-1',
      '## Architecture and Data Flow', 'Runtime reads canonical disk state.',
      '## Components and Interfaces', 'Workflow service and spec store.',
      '## Failure Handling', 'Invalid state is rejected.',
      '## Verification', 'Restart the process.',
      '### D-1: Disk authority',
      '**Covers:** FR-1',
      '**Decision:** Use spec.json as authority.',
      '**Failure behavior:** Reject inconsistent bytes.',
      '**Verification:** Read from a fresh process.',
    ].join('\n');

    const obsoletePayload = await callTool('sdd-entry.js', projectRoot, 'sdd-requirements', {
      featureName: 'restart-flow',
    });
    expect(JSON.parse(obsoletePayload.result?.content?.[0]?.text ?? '{}')).toMatchObject({
      code: 'InvalidParams',
    });
    await expect(readFile(path.join(featureRoot, 'requirements.md'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });

    try {
      const submittedResponse = await callTool('sdd-entry.js', projectRoot, 'sdd-requirements', {
        featureName: 'restart-flow',
        content: requirementsContent,
        expectedRevision: 0,
        expectedArtifactSha256: null,
      });
      const submitted = JSON.parse(submittedResponse.result?.content?.[0]?.text ?? '{}');
      expect(submitted).toMatchObject({ revision: 1, validation: { status: 'passed' }, approvalRequired: true });

      const approvedResponse = await callTool('sdd-entry.js', projectRoot, 'sdd-approve', {
        featureName: 'restart-flow',
        phase: 'requirements',
        expectedRevision: submitted.revision,
        expectedArtifactSha256: submitted.artifact.sha256,
      });
      expect(JSON.parse(approvedResponse.result?.content?.[0]?.text ?? '{}')).toMatchObject({ approved: true });

      const statusResponse = await callTool('sdd-entry.js', projectRoot, 'sdd-status', { featureName: 'restart-flow' });
      expect(JSON.parse(statusResponse.result?.content?.[0]?.text ?? '{}')).toMatchObject({
        phases: { requirements: { approved: true, revision: 1, artifactSha256: submitted.artifact.sha256 } },
        nextAction: { kind: 'submit-phase', phase: 'design' },
      });
      const contextResponse = await callTool('sdd-entry.js', projectRoot, 'sdd-context-load', { featureName: 'restart-flow' });
      expect(JSON.parse(contextResponse.result?.content?.[0]?.text ?? '{}').content).toContain('Restart durability');

      const designResponse = await callTool('sdd-entry.js', projectRoot, 'sdd-design', {
        featureName: 'restart-flow',
        content: designContent,
        expectedRevision: 0,
        expectedArtifactSha256: null,
      });
      expect(JSON.parse(designResponse.result?.content?.[0]?.text ?? '{}')).toMatchObject({ revision: 1, validation: { status: 'passed' } });
      const persisted = JSON.parse(await readFile(path.join(featureRoot, 'spec.json'), 'utf8'));
      expect(persisted).toMatchObject({
        schema_version: 5,
        phase: 'design',
        approvals: { requirements: { approved: true, artifact_sha256: submitted.artifact.sha256 }, design: { revision: 1 } },
      });
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });
});
