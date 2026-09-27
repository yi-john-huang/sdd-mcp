import 'reflect-metadata';

import { createHash } from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { SDDToolAdapter } from '../../../adapters/cli/SDDToolAdapter';
import { CodebaseAnalysisService } from '../../../application/services/CodebaseAnalysisService';
import { ContextCompactionService } from '../../../application/services/ContextCompactionService';
import { SteeringDocumentService } from '../../../application/services/SteeringDocumentService';
import { WorkflowEngineService } from '../../../application/services/WorkflowEngineService';
import { NodeFileSystemAdapter } from '../../../infrastructure/adapters/NodeFileSystemAdapter';
import { InMemoryProjectRepository } from '../../../infrastructure/repositories/InMemoryProjectRepository';

const featureName = 'workspace-selection';
const originalCwd = process.cwd();
const originalClaudeProjectDir = process.env.CLAUDE_PROJECT_DIR;

async function writeApprovedRequirements(projectRoot: string, marker: string): Promise<void> {
  const featureRoot = path.join(projectRoot, '.spec', 'specs', featureName);
  const requirements = `# Requirements\n\n${marker}\n`;
  const empty = {
    generated: false,
    approved: false,
    revision: 0,
    validation: { status: 'not-run', blockers: [] },
  };
  await mkdir(featureRoot, { recursive: true });
  await writeFile(path.join(featureRoot, 'requirements.md'), requirements, 'utf8');
  await writeFile(path.join(featureRoot, 'spec.json'), `${JSON.stringify({
    schema_version: 5,
    feature_name: featureName,
    description: marker,
    language: 'en',
    phase: 'requirements',
    created_at: '2026-09-24T00:00:00.000Z',
    updated_at: '2026-09-24T00:00:00.000Z',
    approvals: {
      requirements: {
        generated: true,
        approved: true,
        revision: 1,
        artifact_sha256: createHash('sha256').update(requirements).digest('hex'),
        validation: { status: 'passed', blockers: [] },
      },
      design: empty,
      tasks: empty,
    },
    workflow_options: { review_test_cases: null },
    checkpoints: { test_cases: { required: false, reviewed: false } },
  }, null, 2)}\n`, 'utf8');
}

function handlers(): Record<string, (args: Record<string, unknown>) => Promise<unknown>> {
  const fileSystem = new NodeFileSystemAdapter();
  const logger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  const contextService = new ContextCompactionService(fileSystem, logger);
  const workflowService = new WorkflowEngineService(
    new InMemoryProjectRepository(),
    contextService,
    logger,
    fileSystem,
  );
  const steeringService = new SteeringDocumentService(
    fileSystem,
    logger,
    {} as never,
    {} as never,
  );
  const analysisService = new CodebaseAnalysisService(fileSystem, logger, {} as never);
  const adapter = new SDDToolAdapter(
    {} as never,
    {} as never,
    steeringService,
    analysisService,
    {} as never,
    workflowService,
    logger,
  );
  return Object.fromEntries(adapter.getSDDTools().map(({ name, handler }) => [name, handler]));
}
function restoreEnvironment(): void {
  process.chdir(originalCwd);
  if (originalClaudeProjectDir === undefined) delete process.env.CLAUDE_PROJECT_DIR;
  else process.env.CLAUDE_PROJECT_DIR = originalClaudeProjectDir;
}

describe('runtime workspace root selection', () => {
  let temporaryRoot: string;
  let workingRoot: string;
  let selectedRoot: string;

  beforeEach(async () => {
    temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'sdd-workspace-root-'));
    workingRoot = path.join(temporaryRoot, 'config-working-directory');
    selectedRoot = path.join(temporaryRoot, 'selected-project');
    await Promise.all([
      mkdir(workingRoot, { recursive: true }),
      mkdir(selectedRoot, { recursive: true }),
    ]);
    process.chdir(workingRoot);
  });

  afterEach(async () => {
    restoreEnvironment();
    await rm(temporaryRoot, { recursive: true, force: true });
  });

  afterAll(restoreEnvironment);

  it('uses a nonempty CLAUDE_PROJECT_DIR for status and context state', async () => {
    await Promise.all([
      writeApprovedRequirements(workingRoot, 'working-directory marker'),
      writeApprovedRequirements(selectedRoot, 'selected-project marker'),
    ]);
    process.env.CLAUDE_PROJECT_DIR = selectedRoot;

    const tools = handlers();
    const status = await tools['sdd-status']({ featureName }) as { featureName: string };
    const context = await tools['sdd-context-load']({ featureName, mode: 'full' }) as { content: string };

    expect(status.featureName).toBe(featureName);
    expect(context.content).toContain('selected-project marker');
    expect(context.content).not.toContain('working-directory marker');
  });

  it.each([
    ['absent', undefined],
    ['empty', ''],
  ])('uses cwd when CLAUDE_PROJECT_DIR is %s', async (_label, value) => {
    await writeApprovedRequirements(workingRoot, 'cwd fallback marker');
    if (value === undefined) delete process.env.CLAUDE_PROJECT_DIR;
    else process.env.CLAUDE_PROJECT_DIR = value;

    const context = await handlers()['sdd-context-load']({ featureName, mode: 'full' }) as { content: string };

    expect(context.content).toContain('cwd fallback marker');
  });

  it('does not fall back to cwd when a supplied root is invalid', async () => {
    const invalidRoot = path.join(temporaryRoot, 'not-a-directory');
    await writeFile(invalidRoot, 'file roots are invalid', 'utf8');
    process.env.CLAUDE_PROJECT_DIR = invalidRoot;

    await expect(handlers()['sdd-steering-custom']({
      fileName: 'selected.md',
      topic: 'Selected root',
      inclusionMode: 'always',
    })).rejects.toThrow();
    await expect(access(path.join(workingRoot, '.spec', 'steering', 'selected.md'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('uses the selected project package and directories when generating steering', async () => {
    await Promise.all([
      writeFile(path.join(workingRoot, 'package.json'), JSON.stringify({
        name: 'working-package',
        description: 'working package description',
      }), 'utf8'),
      writeFile(path.join(selectedRoot, 'package.json'), JSON.stringify({
        name: 'selected-package',
        description: 'selected package description',
        scripts: { build: 'selected-build' },
      }), 'utf8'),
      mkdir(path.join(selectedRoot, 'selected-source'), { recursive: true }),
    ]);
    process.env.CLAUDE_PROJECT_DIR = selectedRoot;

    const result = await handlers()['sdd-steering']({ updateMode: 'update' }) as string;
    const product = await readFile(path.join(selectedRoot, '.spec', 'steering', 'product.md'), 'utf8');
    const structure = await readFile(path.join(selectedRoot, '.spec', 'steering', 'structure.md'), 'utf8');

    expect(result).toContain('**Project**: selected-package');
    expect(result).not.toContain('working-package');
    expect(product).toContain('selected package description');
    expect(structure).toContain('- selected-source/');
    await expect(access(path.join(workingRoot, '.spec'))).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
