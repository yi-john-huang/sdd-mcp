import * as fs from 'fs';
import * as path from 'path';
import { SDDToolAdapter } from '../../../adapters/cli/SDDToolAdapter';
import { JevAdvisoryService } from '../../../application/services/JevAdvisoryService';
import { AjvValidationAdapter } from '../../../infrastructure/adapters/AjvValidationAdapter';
import { NodeFileSystemAdapter } from '../../../infrastructure/adapters/NodeFileSystemAdapter';
import { SDD_TOOL_DEFINITIONS, SDD_TOOL_NAMES } from '../../../infrastructure/mcp/sddToolDefinitions';
import { FakeGitPort, FakeJevHttpPort, silentLogger } from './helpers';

const PREVIOUS_16 = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'sdd-tools-16.json'), 'utf8')) as Array<{ name: string }>;
const dependency = {} as never;
const validator = new AjvValidationAdapter();
const schemaOf = (name: string): object => SDD_TOOL_DEFINITIONS.find((tool) => tool.name === name)!.inputSchema;
const accepts = async (data: unknown): Promise<boolean> => validator.validate(data, schemaOf('sdd-jev-check')).then(() => true, () => false);

const finding = { id: 'F1', path: 'src/a.ts', line: 10, title: 'Injection', severity: 'high' };
const unit = { id: 'U1', path: 'src/a.ts', line: 10, summary: 'handler' };
const evidence = { command: 'npx jest', exitCode: 1, summary: 'failed' };

describe('sdd-jev-check tool definition', () => {
  it('is the 17th tool, appended after the existing 16 in stable order', () => {
    const names: readonly string[] = SDD_TOOL_NAMES;
    expect(names).toHaveLength(17);
    expect(names.slice(0, 16)).toEqual(PREVIOUS_16.map(({ name }) => name));
    expect(names[16]).toBe('sdd-jev-check');
    expect(SDD_TOOL_DEFINITIONS.map(({ name }) => name)).toEqual(names);
  });

  it('leaves the existing 16 tool definitions byte-for-byte unchanged', () => {
    expect(JSON.parse(JSON.stringify(SDD_TOOL_DEFINITIONS.slice(0, 16)))).toEqual(PREVIOUS_16);
  });

  it.each([
    ['a spec check', { check: 'requirements', featureName: 'payments' }],
    ['a design check', { check: 'design', featureName: 'payments' }],
    ['the test-case handshake without cases', { check: 'testcases', featureName: 'payments' }],
    ['a test-case check with cases', {
      check: 'testcases', featureName: 'payments',
      cases: [{ taskId: '1.1', kind: 'error', given: 'g', when: 'w', then: 't', covers: 'c' }],
    }],
    ['a RED check', { check: 'red', featureName: 'payments', taskNumber: '1.1', testName: 't', evidence }],
    ['a security check without a feature', { check: 'security', findings: [finding] }],
    ['a principles check with a feature', { check: 'principles', featureName: 'payments', units: [unit] }],
    ['a commit check', { check: 'commit' }],
  ])('accepts %s', async (_name, data) => {
    expect(await accepts(data)).toBe(true);
  });

  it.each([
    ['requirements without a feature', { check: 'requirements' }],
    ['design without a feature', { check: 'design' }],
    ['testcases without a feature', { check: 'testcases' }],
    ['red without a feature', { check: 'red', taskNumber: '1.1', testName: 't', evidence }],
    ['red without a task number', { check: 'red', featureName: 'payments', testName: 't', evidence }],
    ['red without evidence', { check: 'red', featureName: 'payments', taskNumber: '1.1', testName: 't' }],
    ['security without findings', { check: 'security' }],
    ['principles without units', { check: 'principles' }],
    ['an unknown check', { check: 'everything' }],
    ['an extra top-level property', { check: 'commit', extra: true }],
    ['an extra property inside a finding', { check: 'security', findings: [{ ...finding, excerpt: 'code' }] }],
    ['a finding path containing ..', { check: 'security', findings: [{ ...finding, path: '../../etc/passwd' }] }],
    ['an absolute finding path', { check: 'security', findings: [{ ...finding, path: '/etc/passwd' }] }],
    ['a finding line below 1', { check: 'security', findings: [{ ...finding, line: 0 }] }],
    ['an unknown severity', { check: 'security', findings: [{ ...finding, severity: 'catastrophic' }] }],
    ['an invalid feature name', { check: 'requirements', featureName: '../escape' }],
    ['too many findings', { check: 'security', findings: Array.from({ length: 51 }, (_, i) => ({ ...finding, id: `F${i}` })) }],
    ['an invalid case kind', { check: 'testcases', featureName: 'payments', cases: [{ taskId: '1.1', kind: 'other', given: 'g', when: 'w', then: 't', covers: 'c' }] }],
    ['a non-numeric task id in a case', { check: 'testcases', featureName: 'payments', cases: [{ taskId: 'abc', kind: 'error', given: 'g', when: 'w', then: 't', covers: 'c' }] }],
  ])('rejects %s', async (_name, data) => {
    expect(await accepts(data)).toBe(false);
  });
});

describe('sdd-jev-check handler', () => {
  const build = (service: unknown): Record<string, (args: Record<string, unknown>) => Promise<unknown>> => {
    const adapter = new SDDToolAdapter(dependency, dependency, dependency, dependency, dependency, dependency, dependency, service as never);
    return Object.fromEntries(adapter.getSDDTools().map(({ name, handler }) => [name, handler]));
  };

  it('is registered with the published schema', () => {
    const adapter = new SDDToolAdapter(dependency, dependency, dependency, dependency, dependency, dependency, dependency, dependency);
    const tool = adapter.getSDDTools().find(({ name }) => name === 'sdd-jev-check');
    expect(tool?.tool.inputSchema).toEqual(schemaOf('sdd-jev-check'));
  });

  it('passes the arguments and the server workspace root to the service and returns its result unchanged', async () => {
    const result = { marker: 'unchanged' };
    const check = jest.fn().mockResolvedValue(result);
    const handlers = build({ check });
    await expect(handlers['sdd-jev-check']!({ check: 'security', findings: [finding] })).resolves.toBe(result);
    expect(check).toHaveBeenCalledWith({
      check: 'security', projectRoot: process.cwd(), featureName: undefined, cases: undefined, taskNumber: undefined,
      testName: undefined, evidence: undefined, findings: [finding], units: undefined,
    });
    await handlers['sdd-jev-check']!({ check: 'red', featureName: 'payments', taskNumber: '1.1', testName: 't', evidence });
    expect(check).toHaveBeenLastCalledWith(expect.objectContaining({ check: 'red', featureName: 'payments', taskNumber: '1.1', testName: 't', evidence }));
  });

  it('reports disabled by default without touching anything', async () => {
    const http = new FakeJevHttpPort();
    const git = new FakeGitPort();
    const service = new JevAdvisoryService(http, git, { readAdvisorySnapshot: jest.fn() } as never, new NodeFileSystemAdapter(), silentLogger(), {});
    const handlers = build(service);
    await expect(handlers['sdd-jev-check']!({ check: 'requirements', featureName: 'payments' })).resolves.toMatchObject({
      check: 'requirements', status: 'unavailable', reason: 'disabled', line: 'JEV: unavailable (disabled)',
    });
    expect(http.calls).toHaveLength(0);
    expect(git.calls).toHaveLength(0);
  });
});
