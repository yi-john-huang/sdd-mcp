import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ContextCompactionService } from '../../../application/services/ContextCompactionService';
import { EvidenceRunner } from '../../../application/services/EvidenceRunner';
import { WorkflowEngineService } from '../../../application/services/WorkflowEngineService';
import type { LoggerPort, ProcessPort, ProcessRunRequest, ProcessRunResult, ProjectRepository } from '../../../domain/ports';
import type { Project } from '../../../domain/types';
import { NodeFileSystemAdapter } from '../../../infrastructure/adapters/NodeFileSystemAdapter';

export const requirements = [
  '# Requirements',
  '### FR-1: Checkout',
  '**Objective:** Complete checkout',
  '**EARS Specification:** WHEN a cart is valid, THE system SHALL create an order.',
  '**Acceptance Criteria:** 1. A persisted order is returned.',
].join('\n');

export const design = [
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

/** One TDD task 1.1 and one not-applicable task 1.2 that depends on it. */
export const tasks = [
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

/** `count` independent TDD tasks numbered 1.1 to 1.count. */
export function independentTasks(count: number): string {
  const sections = Array.from({ length: count }, (_, index) => [
    `### 1.${index + 1} Slice ${index + 1}`,
    '**Covers:** FR-1, D-1',
    '**Dependencies:** none',
    '**TDD:** required',
    `**Affected artifacts:** src/slice-${index + 1}.ts`,
    '**Acceptance criteria:** 1. The slice behaves.',
    '**Verification:** Run the focused test.',
  ].join('\n'));
  return ['# Tasks', ...sections].join('\n');
}

export const logger: LoggerPort = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

export function repository(): ProjectRepository {
  const projects: Project[] = [];
  return {
    async save(project) { const index = projects.findIndex(({ id }) => id === project.id); if (index < 0) projects.push(project); else projects[index] = project; },
    async findById(id) { return projects.find((project) => project.id === id) ?? null; },
    async findByPath(projectPath) { return projects.find((project) => project.path === projectPath) ?? null; },
    async list() { return [...projects]; },
    async delete(id) { const index = projects.findIndex((project) => project.id === id); if (index >= 0) projects.splice(index, 1); },
  };
}

/** Returns scripted results in order (the last one repeats), after an optional delay, and counts calls. */
export class ScriptedProcessPort implements ProcessPort {
  readonly requests: ProcessRunRequest[] = [];
  constructor(private readonly results: ProcessRunResult[], private readonly delayMs = 0) {}
  async run(request: ProcessRunRequest): Promise<ProcessRunResult> {
    this.requests.push(request);
    if (this.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    return this.results[Math.min(this.requests.length, this.results.length) - 1];
  }
}

export const exited = (output: string, exitCode: number, truncated = false): ProcessRunResult => {
  const bytes = Buffer.from(output, 'utf8');
  return { kind: 'exited', exitCode, output: bytes, truncated, totalOutputBytes: truncated ? bytes.length * 2 : bytes.length, durationMs: 7 };
};

export interface EngineOptions {
  readonly port?: ProcessPort;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly withoutRunner?: boolean;
}

export function createEngine(fileSystem: NodeFileSystemAdapter, options: EngineOptions = {}): WorkflowEngineService {
  const runner = options.withoutRunner ? undefined : new EvidenceRunner(options.port ?? new ScriptedProcessPort([exited('', 0)]));
  return new WorkflowEngineService(repository(), new ContextCompactionService(fileSystem, logger), logger, fileSystem, runner, options.env ?? {});
}

/** Drives a feature through approved requirements, design, and tasks into implementation. */
export async function prepareImplementation(
  workflow: WorkflowEngineService,
  projectRoot: string,
  featureName: string,
  tasksContent: string = tasks,
): Promise<void> {
  await workflow.initializeFeature({ projectRoot, featureName, description: 'Govern checkout', language: 'en' });
  for (const [phase, content] of [['requirements', requirements], ['design', design]] as const) {
    const submitted = await workflow.submitPhaseArtifact({ projectRoot, featureName, phase, content, expectedRevision: 0, expectedArtifactSha256: null });
    await workflow.approve({ projectRoot, featureName, phase, expectedRevision: submitted.revision, expectedArtifactSha256: submitted.artifact.sha256 });
  }
  const submitted = await workflow.submitPhaseArtifact({ projectRoot, featureName, phase: 'tasks', content: tasksContent, expectedRevision: 0, expectedArtifactSha256: null, reviewTestCases: false });
  await workflow.approve({ projectRoot, featureName, phase: 'tasks', expectedRevision: submitted.revision, expectedArtifactSha256: submitted.artifact.sha256 });
  await workflow.beginImplementation({ projectRoot, featureName });
}

export const specPathOf = (projectRoot: string, featureName: string): string =>
  path.join(projectRoot, '.spec', 'specs', featureName, 'spec.json');

export const specBytes = (projectRoot: string, featureName: string): Promise<string> =>
  readFile(specPathOf(projectRoot, featureName), 'utf8');
