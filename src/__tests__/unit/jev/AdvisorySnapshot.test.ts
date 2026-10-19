import { createHash } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ContextCompactionService } from '../../../application/services/ContextCompactionService';
import { WorkflowEngineService } from '../../../application/services/WorkflowEngineService';
import { GovernanceError } from '../../../application/services/WorkflowErrors';
import * as validation from '../../../application/services/WorkflowValidationService';
import type { LoggerPort, ProjectRepository } from '../../../domain/ports';
import { NodeFileSystemAdapter } from '../../../infrastructure/adapters/NodeFileSystemAdapter';

const requirements = [
  '# Requirements',
  '### FR-1: Checkout',
  '**Objective:** Complete checkout',
  '**EARS Specification:** WHEN a cart is valid, THE system SHALL create an order.',
  '**Acceptance Criteria:** 1. A persisted order is returned.',
  '### NFR-1: Latency',
  '**Objective:** Respond quickly',
  '**EARS Specification:** THE system SHALL respond within two seconds.',
  '**Acceptance Criteria:** 1. The response is at most two seconds.',
].join('\n');
const design = [
  '# Design',
  '## Requirements Traceability', 'FR-1, NFR-1',
  '## Architecture and Data Flow', 'Request to service to store.',
  '## Components and Interfaces', 'Checkout service and order store.',
  '## Failure Handling', 'Failures do not leave partial writes.',
  '## Verification', 'Focused unit and integration checks.',
  '### D-1: Atomic order creation',
  '**Covers:** FR-1, NFR-1',
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
  '**Covers:** NFR-1',
  '**Dependencies:** 1.1',
  '**TDD:** not-applicable — measurement-only task',
  '**Affected artifacts:** none',
  '**Acceptance criteria:** 1. Latency is recorded.',
  '**Verification:** Run the benchmark.',
].join('\n');

const logger: LoggerPort = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
const sha = (content: string): string => createHash('sha256').update(content).digest('hex');
const repository = (): ProjectRepository => ({
  save: async () => undefined, findById: async () => null, findByPath: async () => null, list: async () => [], delete: async () => undefined,
});

describe('WorkflowEngineService.readAdvisorySnapshot', () => {
  let projectRoot: string;
  let workflow: WorkflowEngineService;
  const feature = 'payments';
  const featureDir = (): string => path.join(projectRoot, '.spec', 'specs', feature);

  beforeEach(async () => {
    projectRoot = await mkdtemp(path.join(os.tmpdir(), 'jev-snapshot-'));
    const fileSystem = new NodeFileSystemAdapter();
    workflow = new WorkflowEngineService(repository(), new ContextCompactionService(fileSystem, logger), logger, fileSystem);
    await workflow.initializeFeature({ projectRoot, featureName: feature, description: 'Govern checkout', language: 'en' });
  });
  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  const submit = async (phase: 'requirements' | 'design' | 'tasks', content: string, revision = 0, hash: string | null = null) =>
    workflow.submitPhaseArtifact({
      projectRoot, featureName: feature, phase, content, expectedRevision: revision, expectedArtifactSha256: hash,
      reviewTestCases: phase === 'tasks' ? false : undefined,
    });
  const approve = async (phase: 'requirements' | 'design' | 'tasks', result: { revision: number; artifact: { sha256: string } }) =>
    workflow.approve({ projectRoot, featureName: feature, phase, expectedRevision: result.revision, expectedArtifactSha256: result.artifact.sha256 });
  const approveAll = async (): Promise<void> => {
    await approve('requirements', await submit('requirements', requirements));
    await approve('design', await submit('design', design));
    await approve('tasks', await submit('tasks', tasks));
  };
  const listing = async (): Promise<string[]> => (await readdir(featureDir())).sort();
  const specBytes = async (): Promise<string> => readFile(path.join(featureDir(), 'spec.json'), 'utf8');

  it('returns the revision, matching hashes, passed validation, content, and description for a passed phase', async () => {
    const submitted = await submit('requirements', requirements);
    const snapshot = await workflow.readAdvisorySnapshot({ projectRoot, featureName: feature, phase: 'requirements' });
    expect(snapshot).toMatchObject({
      featureName: feature, description: 'Govern checkout', phase: 'requirements', revision: submitted.revision,
      recordedSha256: submitted.artifact.sha256, observedSha256: sha(requirements), validationStatus: 'passed', content: requirements,
    });
    expect(snapshot.recordedSha256).toBe(snapshot.observedSha256);
  });

  it('reports failed validation', async () => {
    await submit('requirements', '# nothing here');
    const snapshot = await workflow.readAdvisorySnapshot({ projectRoot, featureName: feature, phase: 'requirements' });
    expect(snapshot.validationStatus).toBe('failed');
  });

  it('reports an artifact edited after submission through differing hashes', async () => {
    await submit('requirements', requirements);
    await writeFile(path.join(featureDir(), 'requirements.md'), `${requirements}\nedited`, 'utf8');
    const snapshot = await workflow.readAdvisorySnapshot({ projectRoot, featureName: feature, phase: 'requirements' });
    expect(snapshot.observedSha256).toBe(sha(`${requirements}\nedited`));
    expect(snapshot.observedSha256).not.toBe(snapshot.recordedSha256);
  });

  it('reports a phase that was never submitted as not-run with empty content', async () => {
    const snapshot = await workflow.readAdvisorySnapshot({ projectRoot, featureName: feature, phase: 'design' });
    expect(snapshot).toMatchObject({ validationStatus: 'not-run', content: '', revision: 0 });
    expect(snapshot.observedSha256).toBeUndefined();
  });

  it('does not change spec.json bytes or the feature directory listing across 10 snapshots', async () => {
    await submit('requirements', requirements);
    await workflow.readAdvisorySnapshot({ projectRoot, featureName: feature, phase: 'requirements' });
    const bytesBefore = await specBytes();
    const listingBefore = await listing();
    for (let i = 0; i < 10; i += 1) {
      await workflow.readAdvisorySnapshot({ projectRoot, featureName: feature, phase: 'requirements' });
    }
    expect(await specBytes()).toBe(bytesBefore);
    expect(await listing()).toEqual(listingBefore);
  });

  it('includes upstream artifacts for design and tasks snapshots', async () => {
    await approve('requirements', await submit('requirements', requirements));
    const designSubmitted = await submit('design', design);
    await approve('design', designSubmitted);
    await submit('tasks', tasks);
    const forDesign = await workflow.readAdvisorySnapshot({ projectRoot, featureName: feature, phase: 'design' });
    expect(forDesign.requirementsContent).toBe(requirements);
    const forTasks = await workflow.readAdvisorySnapshot({ projectRoot, featureName: feature, phase: 'tasks' });
    expect(forTasks).toMatchObject({ requirementsContent: requirements, designContent: design, content: tasks });
  });

  it('exposes task status, TDD flag, and acceptance criteria once implementation has begun', async () => {
    await approveAll();
    await workflow.beginImplementation({ projectRoot, featureName: feature });
    const snapshot = await workflow.readAdvisorySnapshot({ projectRoot, featureName: feature, phase: 'tasks' });
    expect(snapshot.implementation?.tasks['1.1']).toMatchObject({ status: 'pending', tddRequired: true });
    expect(snapshot.implementation?.tasks['1.1']?.acceptanceCriteria).toContain('The transaction is atomic');
    expect(snapshot.implementation?.tasks['1.2']).toMatchObject({ tddRequired: false });
    expect(snapshot.implementation?.tasks['1.2']?.acceptanceCriteria).toContain('Latency is recorded');
    await workflow.recordTaskProgress({ projectRoot, featureName: feature, taskNumber: '1.1', action: 'start', expectedRevision: snapshot.implementation?.revision ?? -1 });
    const started = await workflow.readAdvisorySnapshot({ projectRoot, featureName: feature, phase: 'tasks' });
    expect(started.implementation?.tasks['1.1']?.status).toBe('in-progress');
  });

  it('rejects an unknown feature and an invalid feature name with governance errors', async () => {
    await expect(workflow.readAdvisorySnapshot({ projectRoot, featureName: 'missing', phase: 'requirements' })).rejects.toBeInstanceOf(GovernanceError);
    await expect(workflow.readAdvisorySnapshot({ projectRoot, featureName: 'bad/name', phase: 'requirements' })).rejects.toThrow(/Invalid feature name/);
    expect(await readdir(path.join(projectRoot, '.spec', 'specs'))).toEqual([feature]);
  });
});

describe('WorkflowValidationService parser exports', () => {
  it('exports the section parsing helpers', () => {
    for (const name of ['parseSections', 'visibleLines', 'metadata', 'parseList', 'uniqueSections'] as const) {
      expect(typeof validation[name]).toBe('function');
    }
  });
});
