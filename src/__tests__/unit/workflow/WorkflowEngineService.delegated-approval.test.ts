import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ContextCompactionService } from '../../../application/services/ContextCompactionService';
import { WorkflowEngineService } from '../../../application/services/WorkflowEngineService';
import { resolveApprovalSettings, reviewSidecarPath } from '../../../application/services/ApprovalSettings';
import { ProjectRepository, LoggerPort } from '../../../domain/ports';
import { Project } from '../../../domain/types';
import { NodeFileSystemAdapter } from '../../../infrastructure/adapters/NodeFileSystemAdapter';

const requirements = [
  '# Requirements',
  '### FR-1: Checkout',
  '**Objective:** Complete checkout',
  '**EARS Specification:** WHEN a cart is valid, THE system SHALL create an order.',
  '**Acceptance Criteria:** 1. A persisted order is returned.',
].join('\n');

const logger: LoggerPort = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

function repository(): ProjectRepository {
  const projects: Project[] = [];
  return {
    async save(project) { const i = projects.findIndex(({ id }) => id === project.id); if (i < 0) projects.push(project); else projects[i] = project; },
    async findById(id) { return projects.find((p) => p.id === id) ?? null; },
    async findByPath(p) { return projects.find((project) => project.path === p) ?? null; },
    async list() { return [...projects]; },
    async delete(id) { const i = projects.findIndex((p) => p.id === id); if (i >= 0) projects.splice(i, 1); },
  };
}

describe('resolveApprovalSettings', () => {
  it('defaults to human mode with agy as the only delegated reviewer', () => {
    const settings = resolveApprovalSettings(undefined);
    expect(settings.mode).toBe('human');
    expect([...settings.reviewers]).toEqual(['agy']);
    expect(settings.warnings).toEqual([]);
  });

  it('accepts delegated-reviewer mode and a reviewer list', () => {
    const settings = resolveApprovalSettings({ approval: { mode: 'delegated-reviewer', reviewers: ['agy', 'gemini-review'] } });
    expect(settings.mode).toBe('delegated-reviewer');
    expect([...settings.reviewers]).toEqual(['agy', 'gemini-review']);
  });

  it('falls back to human mode and warns on an unknown mode', () => {
    const settings = resolveApprovalSettings({ approval: { mode: 'auto' } });
    expect(settings.mode).toBe('human');
    expect(settings.warnings).toHaveLength(1);
  });

  it('rejects an invalid reviewer list and keeps the default', () => {
    const settings = resolveApprovalSettings({ approval: { mode: 'delegated-reviewer', reviewers: ['Bad Name'] } });
    expect([...settings.reviewers]).toEqual(['agy']);
    expect(settings.warnings).toHaveLength(1);
  });

  it('builds the only allowed sidecar path', () => {
    expect(reviewSidecarPath('agy', 'design', 3)).toBe('review/agy-design-r3.json');
  });
});

describe('WorkflowEngineService delegated approval', () => {
  let projectRoot: string;
  let workflow: WorkflowEngineService;
  let featureRoot: string;
  let revision: number;
  let sha: string;

  async function writeConfig(config: unknown): Promise<void> {
    await writeFile(path.join(projectRoot, '.spec', 'sdd-config.json'), JSON.stringify(config));
  }

  async function writeReview(overrides: Record<string, unknown> = {}, reviewer = 'agy'): Promise<string> {
    const relative = reviewSidecarPath(reviewer, 'requirements', revision);
    await mkdir(path.join(featureRoot, 'review'), { recursive: true });
    await writeFile(path.join(featureRoot, relative), JSON.stringify({
      schema_version: 1, reviewer, phase: 'requirements', revision, artifact_sha256: sha, verdict: 'approve', findings: [], ...overrides,
    }));
    return relative;
  }

  async function readSpec(): Promise<Record<string, any>> {
    return JSON.parse(await readFile(path.join(featureRoot, 'spec.json'), 'utf8'));
  }

  beforeEach(async () => {
    projectRoot = await mkdtemp(path.join(os.tmpdir(), 'sdd-delegated-'));
    const fileSystem = new NodeFileSystemAdapter();
    workflow = new WorkflowEngineService(
      repository(), new ContextCompactionService(fileSystem, logger), logger, fileSystem, undefined, { SDD_EVIDENCE_MODE: 'self-reported' },
    );
    await workflow.initializeFeature({ projectRoot, featureName: 'payments', description: 'Govern checkout', language: 'en' });
    featureRoot = path.join(projectRoot, '.spec', 'specs', 'payments');
    const submitted = await workflow.submitPhaseArtifact({
      projectRoot, featureName: 'payments', phase: 'requirements', content: requirements, expectedRevision: 0, expectedArtifactSha256: null,
    });
    revision = submitted.revision;
    sha = submitted.artifact.sha256;
  });

  afterEach(async () => { await rm(projectRoot, { recursive: true, force: true }); jest.clearAllMocks(); });

  const approve = (extra: Record<string, string> = {}) => workflow.approve({
    projectRoot, featureName: 'payments', phase: 'requirements', expectedRevision: revision, expectedArtifactSha256: sha, ...extra,
  });

  it('keeps a plain human approval unchanged and records no approver', async () => {
    await expect(approve()).resolves.toMatchObject({ approved: true });
    const spec = await readSpec();
    expect(spec.approvals.requirements.approved).toBe(true);
    expect(spec.approvals.requirements).not.toHaveProperty('approved_by');
    expect(spec.approvals.requirements).not.toHaveProperty('review_sidecar');
  });

  it('refuses a delegated approval in the default human mode', async () => {
    const sidecar = await writeReview();
    await expect(approve({ approvedBy: 'agy', reviewSidecar: sidecar })).rejects.toMatchObject({ code: 'PhaseNotApproved' });
    expect((await readSpec()).approvals.requirements.approved).toBe(false);
  });

  it('records approvedBy and reviewSidecar for a matching approve verdict in delegated mode', async () => {
    await writeConfig({ approval: { mode: 'delegated-reviewer' } });
    const sidecar = await writeReview();
    await expect(approve({ approvedBy: 'agy', reviewSidecar: sidecar }))
      .resolves.toMatchObject({ approved: true, approvedBy: 'agy', reviewSidecar: 'review/agy-requirements-r1.json' });
    const record = (await readSpec()).approvals.requirements;
    expect(record).toMatchObject({ approved: true, approved_by: 'agy', review_sidecar: 'review/agy-requirements-r1.json' });
  });

  it('reloads a delegated record from disk without losing the approver', async () => {
    await writeConfig({ approval: { mode: 'delegated-reviewer' } });
    const sidecar = await writeReview();
    await approve({ approvedBy: 'agy', reviewSidecar: sidecar });
    await expect(approve()).resolves.toMatchObject({ approvedBy: 'agy' });
  });

  it.each([
    ['a reject verdict', { verdict: 'reject' }, 'verdict'],
    ['a stale revision', { revision: 99 }, 'revision'],
    ['a different artifact hash', { artifact_sha256: 'f'.repeat(64) }, 'artifact_sha256'],
    ['another phase', { phase: 'design' }, 'phase'],
    ['another reviewer name inside the file', { reviewer: 'someone' }, 'reviewer'],
  ])('refuses %s', async (_label, overrides, field) => {
    await writeConfig({ approval: { mode: 'delegated-reviewer' } });
    const sidecar = await writeReview(overrides);
    await expect(approve({ approvedBy: 'agy', reviewSidecar: sidecar }))
      .rejects.toMatchObject({ code: 'PhaseNotApproved', details: { mismatched: [field] } });
    expect((await readSpec()).approvals.requirements.approved).toBe(false);
  });

  it('refuses a missing or unreadable sidecar', async () => {
    await writeConfig({ approval: { mode: 'delegated-reviewer' } });
    await expect(approve({ approvedBy: 'agy', reviewSidecar: 'review/agy-requirements-r1.json' }))
      .rejects.toMatchObject({ code: 'PhaseNotApproved', details: { mismatched: ['file'] } });
    await mkdir(path.join(featureRoot, 'review'), { recursive: true });
    await writeFile(path.join(featureRoot, 'review', 'agy-requirements-r1.json'), '{not json');
    await expect(approve({ approvedBy: 'agy', reviewSidecar: 'review/agy-requirements-r1.json' }))
      .rejects.toMatchObject({ code: 'PhaseNotApproved', details: { mismatched: ['file'] } });
  });

  it('refuses a sidecar path that is not the canonical one', async () => {
    await writeConfig({ approval: { mode: 'delegated-reviewer' } });
    await writeReview();
    await expect(approve({ approvedBy: 'agy', reviewSidecar: 'review/agy-requirements-r0.json' }))
      .rejects.toMatchObject({ code: 'PhaseNotApproved' });
  });

  it('refuses a reviewer outside approval.reviewers', async () => {
    await writeConfig({ approval: { mode: 'delegated-reviewer', reviewers: ['agy'] } });
    const sidecar = await writeReview({}, 'other');
    await expect(approve({ approvedBy: 'other', reviewSidecar: sidecar })).rejects.toMatchObject({ code: 'PhaseNotApproved' });
  });

  it('requires approvedBy and reviewSidecar together', async () => {
    await writeConfig({ approval: { mode: 'delegated-reviewer' } });
    await expect(approve({ approvedBy: 'agy' })).rejects.toMatchObject({ code: 'InvalidParams' });
    await expect(approve({ reviewSidecar: 'review/agy-requirements-r1.json' })).rejects.toMatchObject({ code: 'InvalidParams' });
  });

  it('refuses the old sidecar after the phase is revised to a new revision', async () => {
    await writeConfig({ approval: { mode: 'delegated-reviewer' } });
    const oldSidecar = await writeReview();
    const revised = await workflow.submitPhaseArtifact({
      projectRoot, featureName: 'payments', phase: 'requirements', content: `${requirements}\n`, expectedRevision: revision, expectedArtifactSha256: sha,
    });
    await expect(workflow.approve({
      projectRoot, featureName: 'payments', phase: 'requirements', expectedRevision: revised.revision,
      expectedArtifactSha256: revised.artifact.sha256, approvedBy: 'agy', reviewSidecar: oldSidecar,
    })).rejects.toMatchObject({ code: 'PhaseNotApproved' });
    expect((await readSpec()).approvals.requirements.approved).toBe(false);
  });
});
