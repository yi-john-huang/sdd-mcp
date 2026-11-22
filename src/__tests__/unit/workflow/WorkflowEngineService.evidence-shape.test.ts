import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ContextCompactionService } from '../../../application/services/ContextCompactionService';
import { WorkflowEngineService } from '../../../application/services/WorkflowEngineService';
import type { LoggerPort, ProjectRepository } from '../../../domain/ports';
import type { Project } from '../../../domain/types';
import { NodeFileSystemAdapter } from '../../../infrastructure/adapters/NodeFileSystemAdapter';

const FEATURE = 'payments';
const REPO_ROOT = path.resolve(__dirname, '../../../..');

const requirements = [
  '# Requirements',
  '### FR-1: Checkout',
  '**Objective:** Complete checkout',
  '**EARS Specification:** WHEN a cart is valid, THE system SHALL create an order.',
  '**Acceptance Criteria:** 1. A persisted order is returned.',
].join('\n');
const design = [
  '# Design',
  '## Requirements Traceability', 'FR-1',
  '## Architecture and Data Flow', 'Request to service to store.',
  '## Components and Interfaces', 'Checkout service and order store.',
  '## Failure Handling', 'Failures do not leave partial writes.',
  '## Verification', 'Focused unit checks.',
  '### D-1: Atomic order creation',
  '**Covers:** FR-1',
  '**Decision:** Commit the order atomically.',
  '**Failure behavior:** Roll back the transaction.',
  '**Verification:** Exercise successful and failed commits.',
].join('\n');
const tasks = [
  '# Tasks',
  '### 1.1 Create order transaction',
  '**Covers:** FR-1, D-1',
  '**Dependencies:** none',
  '**TDD:** required',
  '**Affected artifacts:** src/order.ts, src/order.test.ts',
  '**Acceptance criteria:** 1. The transaction is atomic.',
  '**Verification:** Run the focused order test.',
  '### 1.2 Verify latency',
  '**Covers:** FR-1',
  '**Dependencies:** 1.1',
  '**TDD:** not-applicable — measurement-only task',
  '**Affected artifacts:** none',
  '**Acceptance criteria:** 1. Latency is recorded.',
  '**Verification:** Run the benchmark.',
].join('\n');

const logger: LoggerPort = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

function repository(): ProjectRepository {
  const projects: Project[] = [];
  return {
    async save(project) { const index = projects.findIndex(({ id }) => id === project.id); if (index < 0) projects.push(project); else projects[index] = project; },
    async findById(id) { return projects.find((project) => project.id === id) ?? null; },
    async findByPath(projectPath) { return projects.find((project) => project.path === projectPath) ?? null; },
    async list() { return [...projects]; },
    async delete(id) { const index = projects.findIndex((project) => project.id === id); if (index >= 0) projects.splice(index, 1); },
  };
}

const SHA = 'a'.repeat(64);
const OBSERVED_AT = '2026-11-21T10:00:00.000Z';

const callerEntry = { command: 'jest order', exit_code: 0, summary: 'passes', observed_at: OBSERVED_AT };
const engineRed = {
  command: 'npx jest src/order.test.ts',
  exit_code: 1,
  summary: 'Expected: 2\nReceived: 3',
  observed_at: OBSERVED_AT,
  source: 'engine',
  argv: ['npx', 'jest', 'src/order.test.ts'],
  output_sha256: SHA,
  duration_ms: 1234,
  output_excerpt: 'Expected: 2\nReceived: 3',
  truncated: false,
  redactions: 0,
  red_classification: 'assertion',
};
const engineVerification = {
  command: 'npm test',
  exit_code: 0,
  summary: '(no output)',
  observed_at: OBSERVED_AT,
  source: 'engine',
  argv: ['npm', 'test'],
  output_sha256: 'b'.repeat(64),
  duration_ms: 0,
  output_excerpt: '',
  truncated: true,
  redactions: 2,
};

describe('WorkflowEngineService additive evidence entries', () => {
  let projectRoot: string;
  let fileSystem: NodeFileSystemAdapter;
  let specPath: string;

  const createWorkflow = (): WorkflowEngineService =>
    new WorkflowEngineService(repository(), new ContextCompactionService(fileSystem, logger), logger, fileSystem, undefined, { SDD_EVIDENCE_MODE: 'self-reported' });

  async function prepareImplementation(workflow: WorkflowEngineService): Promise<void> {
    await workflow.initializeFeature({ projectRoot, featureName: FEATURE, description: 'Govern checkout', language: 'en' });
    for (const [phase, content] of [['requirements', requirements], ['design', design]] as const) {
      const submitted = await workflow.submitPhaseArtifact({ projectRoot, featureName: FEATURE, phase, content, expectedRevision: 0, expectedArtifactSha256: null });
      await workflow.approve({ projectRoot, featureName: FEATURE, phase, expectedRevision: submitted.revision, expectedArtifactSha256: submitted.artifact.sha256 });
    }
    const submitted = await workflow.submitPhaseArtifact({ projectRoot, featureName: FEATURE, phase: 'tasks', content: tasks, expectedRevision: 0, expectedArtifactSha256: null, reviewTestCases: false });
    await workflow.approve({ projectRoot, featureName: FEATURE, phase: 'tasks', expectedRevision: submitted.revision, expectedArtifactSha256: submitted.artifact.sha256 });
    await workflow.beginImplementation({ projectRoot, featureName: FEATURE });
  }

  async function injectCompletedTask(evidence: Record<string, unknown>): Promise<number> {
    const spec = JSON.parse(await readFile(specPath, 'utf8'));
    const task = spec.implementation.tasks['1.1'];
    task.status = 'completed';
    task.evidence = evidence;
    task.observed_artifacts = ['src/order.ts'];
    await writeFile(specPath, `${JSON.stringify(spec, null, 2)}\n`, 'utf8');
    return spec.implementation.revision as number;
  }

  beforeEach(async () => {
    projectRoot = await mkdtemp(path.join(os.tmpdir(), 'sdd-evidence-shape-'));
    fileSystem = new NodeFileSystemAdapter();
    specPath = path.join(projectRoot, '.spec', 'specs', FEATURE, 'spec.json');
    await prepareImplementation(createWorkflow());
  });

  afterEach(async () => { await rm(projectRoot, { recursive: true, force: true }); });

  it('should load a legacy entry without a source field and keep it unchanged on rewrite', async () => {
    const revision = await injectCompletedTask({ red: { ...callerEntry, exit_code: 1, summary: 'fails' }, green: callerEntry, verification: callerEntry });
    const workflow = createWorkflow();
    await expect(workflow.getFeatureStatus({ projectRoot, featureName: FEATURE })).resolves.toMatchObject({ phase: 'implementation' });
    await workflow.recordTaskProgress({ projectRoot, featureName: FEATURE, taskNumber: '1.2', action: 'start', expectedRevision: revision });
    const rewritten = JSON.parse(await readFile(specPath, 'utf8'));
    expect(rewritten.implementation.tasks['1.1'].evidence.green).toEqual(callerEntry);
  });

  it('should round-trip every engine key byte-for-byte through a commit', async () => {
    const revision = await injectCompletedTask({ red: engineRed, green: callerEntry, verification: engineVerification });
    const workflow = createWorkflow();
    await workflow.recordTaskProgress({ projectRoot, featureName: FEATURE, taskNumber: '1.2', action: 'start', expectedRevision: revision });
    const rewritten = JSON.parse(await readFile(specPath, 'utf8'));
    expect(rewritten.implementation.tasks['1.1'].evidence).toEqual({ red: engineRed, green: callerEntry, verification: engineVerification });
    expect(rewritten.schema_version).toBe(5);
  });

  it('should write source caller on evidence recorded through the existing request shape', async () => {
    const workflow = createWorkflow();
    const started = await workflow.recordTaskProgress({ projectRoot, featureName: FEATURE, taskNumber: '1.1', action: 'start', expectedRevision: 0 });
    await workflow.recordTaskProgress({ projectRoot, featureName: FEATURE, taskNumber: '1.1', action: 'record-red', expectedRevision: started.revision, evidence: { command: 'jest order', exitCode: 1, summary: 'fails' } });
    const spec = JSON.parse(await readFile(specPath, 'utf8'));
    expect(spec.implementation.tasks['1.1'].evidence.red).toMatchObject({ source: 'caller', exit_code: 1 });
  });

  it.each([
    ['missing output_sha256', (() => { const { output_sha256: _dropped, ...rest } = engineRed; return rest; })()],
    ['a 63-character hash', { ...engineRed, output_sha256: 'a'.repeat(63) }],
    ['argv that is not an array', { ...engineRed, argv: 'npx jest' }],
    ['a negative duration', { ...engineRed, duration_ms: -1 }],
    ['an unknown source', { ...engineRed, source: 'bogus' }],
    ['an unknown classification', { ...engineRed, red_classification: 'nope' }],
    ['a non-boolean truncated flag', { ...engineRed, truncated: 'yes' }],
  ])('should reject an engine entry with %s as a state invariant violation', async (_name, red) => {
    await injectCompletedTask({ red, green: callerEntry, verification: callerEntry });
    await expect(createWorkflow().getFeatureStatus({ projectRoot, featureName: FEATURE })).rejects.toMatchObject({ code: 'StateInvariantViolation' });
  });

  it('should still reject an unknown evidence slot', async () => {
    await injectCompletedTask({ red: engineRed, green: callerEntry, verification: callerEntry, extra: callerEntry });
    await expect(createWorkflow().getFeatureStatus({ projectRoot, featureName: FEATURE })).rejects.toMatchObject({ code: 'StateInvariantViolation' });
  });

  it('should load every feature in this repository without an evidence error', async () => {
    const features = (await readdir(path.join(REPO_ROOT, '.spec', 'specs'), { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
    expect(features.length).toBeGreaterThanOrEqual(12);
    const workflow = createWorkflow();
    for (const featureName of features) {
      try {
        await workflow.getFeatureStatus({ projectRoot: REPO_ROOT, featureName });
      } catch (error) {
        // Legacy conflicts predate this feature; only an evidence-shape rejection would be a regression.
        const message = String((error as Error).message);
        expect(message).not.toMatch(/evidence/i);
        expect((error as { code?: string }).code).not.toBe('StateInvariantViolation');
      }
    }
  });
});
