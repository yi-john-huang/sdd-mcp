import { mkdtemp, mkdir, readFile, rm, writeFile, symlink, unlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ContextCompactionService } from '../../../application/services/ContextCompactionService';
import { WorkflowEngineService } from '../../../application/services/WorkflowEngineService';
import { ProjectRepository, LoggerPort } from '../../../domain/ports';
import { Project } from '../../../domain/types';
import { NodeFileSystemAdapter } from '../../../infrastructure/adapters/NodeFileSystemAdapter';

class FailureInjectingFileSystem extends NodeFileSystemAdapter {
  failSpecCode?: 'EEXIST' | 'EPERM';
  failHandoffCode?: 'EEXIST' | 'EPERM';
  atomicWrites = 0;

  override async writeFileAtomic(filePath: string, content: string): Promise<void> {
    this.atomicWrites += 1;
    const code = filePath.endsWith('spec.json') ? this.failSpecCode : filePath.endsWith('handoff.md') ? this.failHandoffCode : undefined;
    if (code) {
      if (filePath.endsWith('spec.json')) this.failSpecCode = undefined;
      else this.failHandoffCode = undefined;
      const error = new Error(`injected ${code}`) as NodeJS.ErrnoException;
      error.code = code;
      throw error;
    }
    await super.writeFileAtomic(filePath, content);
  }
}

const logger: LoggerPort = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

function repository(): ProjectRepository {
  const projects: Project[] = [];
  return {
    async save(project) { const index = projects.findIndex((candidate) => candidate.id === project.id); if (index >= 0) projects[index] = project; else projects.push(project); },
    async findById(id) { return projects.find((project) => project.id === id) ?? null; },
    async findByPath(projectPath) { return projects.find((project) => project.path === projectPath) ?? null; },
    async list() { return [...projects]; },
    async delete(id) { const index = projects.findIndex((project) => project.id === id); if (index >= 0) projects.splice(index, 1); },
  };
}

describe('WorkflowEngineService disk authority', () => {
  let projectRoot: string;
  let featureRoot: string;
  let fileSystem: FailureInjectingFileSystem;
  let context: ContextCompactionService;
  let workflow: WorkflowEngineService;

  async function writeSpec(overrides: Record<string, unknown> = {}): Promise<void> {
    const spec = {
      feature_name: 'payments',
      phase: 'requirements-generated',
      approvals: {
        requirements: { generated: true, approved: false },
        design: { generated: true, approved: false },
        tasks: { generated: true, approved: false },
      },
      workflow_options: { review_test_cases: true },
      checkpoints: { test_cases: { required: true, reviewed: false } },
      ...overrides,
    };
    await writeFile(path.join(featureRoot, 'spec.json'), JSON.stringify(spec), 'utf8');
  }

  function createWorkflow(currentFileSystem = fileSystem): WorkflowEngineService {
    const compact = currentFileSystem === fileSystem ? context : new ContextCompactionService(currentFileSystem, logger);
    return new WorkflowEngineService(repository(), undefined!, undefined!, compact, logger, undefined!, currentFileSystem);
  }

  beforeEach(async () => {
    projectRoot = await mkdtemp(path.join(os.tmpdir(), 'sdd-workflow-v4-'));
    featureRoot = path.join(projectRoot, '.spec', 'specs', 'payments');
    await mkdir(featureRoot, { recursive: true });
    await Promise.all([
      writeFile(path.join(featureRoot, 'requirements.md'), '# Requirements\n- Payments MUST be authorized.\n', 'utf8'),
      writeFile(path.join(featureRoot, 'design.md'), '# Design\n- Use a payment gateway.\n', 'utf8'),
      writeFile(path.join(featureRoot, 'tasks.md'), '# Tasks\n- Test authorization.\n', 'utf8'),
    ]);
    await writeSpec();
    fileSystem = new FailureInjectingFileSystem();
    context = new ContextCompactionService(fileSystem, logger);
    workflow = createWorkflow();
  });

  afterEach(async () => { await rm(projectRoot, { recursive: true, force: true }); jest.clearAllMocks(); });

  it('approves from disk after restart, enforces ordering, and is idempotent under concurrency', async () => {
    await expect(workflow.approve({ projectRoot, featureName: 'payments', phase: 'design' })).rejects.toThrow('requirements is not approved');
    const restarted = createWorkflow();
    const [first, second] = await Promise.all([
      restarted.approve({ projectRoot, featureName: 'payments', phase: 'requirements' }),
      restarted.approve({ projectRoot, featureName: 'payments', phase: 'requirements' }),
    ]);
    expect(first.approved).toBe(true);
    expect(second.approved).toBe(true);
    expect(first.handoff.status).toBe('published');
    const persisted = JSON.parse(await readFile(path.join(featureRoot, 'spec.json'), 'utf8')) as { approvals: { requirements: { approved: boolean } } };
    expect(persisted.approvals.requirements.approved).toBe(true);
  });

  it('enforces and idempotently records the configured tasks review checkpoint', async () => {
    await writeSpec({
      phase: 'tasks-generated',
      approvals: { requirements: { generated: true, approved: true }, design: { generated: true, approved: true }, tasks: { generated: true, approved: false } },
    });
    await expect(workflow.approve({ projectRoot, featureName: 'payments', phase: 'tasks' })).rejects.toThrow('test-case review is required');
    const review = await workflow.reviewTestCases({ projectRoot, featureName: 'payments' });
    expect(review).toMatchObject({ reviewed: true, canApproveTasks: true });
    const repeated = await workflow.reviewTestCases({ projectRoot, featureName: 'payments' });
    expect(repeated.reviewed).toBe(true);
    await expect(workflow.approve({ projectRoot, featureName: 'payments', phase: 'tasks' })).resolves.toMatchObject({ approved: true });
  });

  it('does not commit on atomic spec replacement failure', async () => {
    fileSystem.failSpecCode = 'EEXIST';
    await expect(workflow.approve({ projectRoot, featureName: 'payments', phase: 'requirements' })).rejects.toMatchObject({ code: 'EEXIST' });
    const persisted = JSON.parse(await readFile(path.join(featureRoot, 'spec.json'), 'utf8')) as { approvals: { requirements: { approved: boolean } } };
    expect(persisted.approvals.requirements.approved).toBe(false);
  });

  it('keeps committed approval on handoff EPERM and lazily repairs the invalid cache', async () => {
    fileSystem.failHandoffCode = 'EPERM';
    const approved = await workflow.approve({ projectRoot, featureName: 'payments', phase: 'requirements' });
    expect(approved.handoff.status).toBe('pending-regeneration');
    const persisted = JSON.parse(await readFile(path.join(featureRoot, 'spec.json'), 'utf8')) as { approvals: { requirements: { approved: boolean } } };
    expect(persisted.approvals.requirements.approved).toBe(true);
    const repaired = await context.loadContext({ projectRoot, featureName: 'payments' });
    expect(repaired.cacheStatus).toBe('regenerated');
    await expect(readFile(path.join(featureRoot, 'context', 'handoff.md'), 'utf8')).resolves.toContain(repaired.fingerprint);
  });

  it('rolls back durable approvals, invalidates the cache, and republishes prior context', async () => {
    await writeSpec({
      phase: 'design-approved',
      approvals: { requirements: { generated: true, approved: true }, design: { generated: true, approved: true }, tasks: { generated: true, approved: false } },
    });
    await context.loadContext({ projectRoot, featureName: 'payments' });
    const rolledBack = await createWorkflow().rollback({ projectRoot, featureName: 'payments', triggeredBy: 'test' });
    expect(rolledBack.rolledBackPhase).toBe('design');
    expect(rolledBack.handoff.status).toBe('published');
    const persisted = JSON.parse(await readFile(path.join(featureRoot, 'spec.json'), 'utf8')) as { approvals: { requirements: { approved: boolean }; design: { approved: boolean } } };
    expect(persisted.approvals.requirements.approved).toBe(true);
    expect(persisted.approvals.design.approved).toBe(false);
    const contextResult = await context.loadContext({ projectRoot, featureName: 'payments' });
    expect(contextResult.effectivePhase).toBe('requirements');
  });

  it('rejects traversal and symlink escapes before approval writes', async () => {
    await expect(workflow.approve({ projectRoot, featureName: '../payments', phase: 'requirements' })).rejects.toThrow('Invalid feature name');
    const outside = await mkdtemp(path.join(os.tmpdir(), 'sdd-approval-outside-'));
    await writeFile(path.join(outside, 'spec.json'), '{}', 'utf8');
    await symlink(outside, path.join(projectRoot, '.spec', 'specs', 'escaped'));
    await expect(workflow.approve({ projectRoot, featureName: 'escaped', phase: 'requirements' })).rejects.toThrow('escapes');
    const outsideDocument = path.join(outside, 'requirements.md');
    await writeFile(outsideDocument, 'outside', 'utf8');
    await unlink(path.join(featureRoot, 'requirements.md'));
    await symlink(outsideDocument, path.join(featureRoot, 'requirements.md'));
    await expect(workflow.approve({ projectRoot, featureName: 'payments', phase: 'requirements' })).rejects.toThrow('escapes');
    await rm(outside, { recursive: true, force: true });
  });
});
