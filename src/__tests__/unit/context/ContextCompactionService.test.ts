import { mkdtemp, readFile, rm, mkdir, writeFile, readdir, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ContextCompactionService } from '../../../application/services/ContextCompactionService';
import { FileSystemPort, LoggerPort } from '../../../domain/ports';
import { Project, WorkflowPhase } from '../../../domain/types';

class NodeTestFileSystem implements FileSystemPort {
  readFile(filePath: string): Promise<string> {
    return readFile(filePath, 'utf8');
  }

  writeFile(filePath: string, content: string): Promise<void> {
    return writeFile(filePath, content, 'utf8');
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      await stat(filePath);
      return true;
    } catch {
      return false;
    }
  }

  mkdir(dirPath: string): Promise<void> {
    return mkdir(dirPath, { recursive: true }).then(() => undefined);
  }

  readdir(dirPath: string): Promise<string[]> {
    return readdir(dirPath);
  }

  stat(filePath: string): Promise<{ isFile(): boolean; isDirectory(): boolean }> {
    return stat(filePath);
  }
}

const logger: LoggerPort = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
};

function createProject(projectRoot: string): Project {
  return {
    id: 'project-1',
    name: 'auth-flow',
    path: projectRoot,
    phase: WorkflowPhase.TASKS,
    metadata: {
      createdAt: new Date('2026-06-21T00:00:00.000Z'),
      updatedAt: new Date('2026-06-21T00:00:00.000Z'),
      language: 'en',
      approvals: {
        requirements: { generated: true, approved: true },
        design: { generated: true, approved: true },
        tasks: { generated: true, approved: true }
      },
      workflowOptions: { reviewTestCases: true },
      checkpoints: {
        testCases: { required: true, reviewed: true }
      }
    }
  };
}

describe('ContextCompactionService', () => {
  let projectRoot: string;
  let service: ContextCompactionService;
  let project: Project;

  beforeEach(async () => {
    projectRoot = await mkdtemp(path.join(os.tmpdir(), 'sdd-context-'));
    project = createProject(projectRoot);
    const specDir = path.join(projectRoot, '.spec', 'specs', project.name);
    await mkdir(specDir, { recursive: true });
    await writeFile(
      path.join(specDir, 'requirements.md'),
      `# Requirements Document

## Functional Requirements
- User MUST be able to sign in with valid credentials.
- WHEN credentials are invalid THEN the system SHALL reject access.

## Non-Functional Requirements
- Security controls MUST avoid leaking authentication state.
`.repeat(8),
      'utf8'
    );
    await writeFile(
      path.join(specDir, 'design.md'),
      `# Technical Design

## Architecture
- AuthService validates credentials.
- SessionRepository stores session metadata.

## Risks
- Token expiration MUST be deterministic.
`.repeat(8),
      'utf8'
    );
    await writeFile(
      path.join(specDir, 'tasks.md'),
      `# Tasks

- [ ] 1. Write failing tests for valid sign-in.
- [ ] 2. Implement minimal AuthService.
- [ ] 3. Refactor session handling.
`.repeat(8),
      'utf8'
    );

    service = new ContextCompactionService(new NodeTestFileSystem(), logger);
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
    jest.clearAllMocks();
  });

  it('generates compact handoff files after phase approval', async () => {
    const result = await service.generatePhaseHandoff(project, 'tasks');

    expect(result.path).toBe(path.join(projectRoot, '.spec', 'specs', project.name, 'context', 'handoff.md'));
    expect(result.content).toContain('SDD Context Handoff: auth-flow');
    expect(result.content).toContain('TDD test-case review: reviewed');
    expect(result.estimate.reductionPercentage).toBeGreaterThan(40);

    const persisted = await readFile(result.path, 'utf8');
    expect(persisted).toContain('Context Budget Estimate');
    await expect(readFile(path.join(projectRoot, '.spec', 'specs', project.name, 'context', 'tasks-handoff.md'), 'utf8'))
      .resolves.toContain('Approved phase: tasks');
  });

  it('loads compact handoff by default and full context only when requested', async () => {
    await service.generatePhaseHandoff(project, 'tasks');

    const compact = await service.loadContext(project);
    const full = await service.loadContext(project, 'full');

    expect(compact).toContain('Compact Phase Summaries');
    expect(full).toContain('Full SDD Context');
    expect(compact.length).toBeLessThan(full.length);
  });
});
