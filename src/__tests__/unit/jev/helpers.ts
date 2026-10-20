import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type {
  GitPort, GitResult, JevHttpPort, JevHttpRequest, JevHttpResponse, LoggerPort,
} from '../../../domain/ports';
import { NodeFileSystemAdapter } from '../../../infrastructure/adapters/NodeFileSystemAdapter';

import { ContextCompactionService } from '../../../application/services/ContextCompactionService';
import { WorkflowEngineService } from '../../../application/services/WorkflowEngineService';
import type { JevQuestionSet } from '../../../application/services/JevResponseValidator';

export const TEST_KEY = 'sk-test-abcdef123456';

export const FIXTURE_REQUIREMENTS = [
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
export const FIXTURE_DESIGN = [
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
export const FIXTURE_TASKS = [
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

type Phase = 'requirements' | 'design' | 'tasks';
export interface EngineProject {
  root: string;
  feature: string;
  engine: WorkflowEngineService;
  fileSystem: NodeFileSystemAdapter;
  submit(phase: Phase, content: string, revision?: number, hash?: string | null): ReturnType<WorkflowEngineService['submitPhaseArtifact']>;
  approve(phase: Phase, result: { revision: number; artifact: { sha256: string } }): ReturnType<WorkflowEngineService['approve']>;
  cleanup(): Promise<void>;
}

/** A real engine over a temporary project; the feature is initialized and ready for submissions. */
export async function createEngineProject(feature = 'payments'): Promise<EngineProject> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'jev-engine-'));
  const fileSystem = new NodeFileSystemAdapter();
  const logger = silentLogger();
  const repository = { save: async () => undefined, findById: async () => null, findByPath: async () => null, list: async () => [], delete: async () => undefined };
  const engine = new WorkflowEngineService(repository, new ContextCompactionService(fileSystem, logger), logger, fileSystem);
  await engine.initializeFeature({ projectRoot: root, featureName: feature, description: 'Govern checkout', language: 'en' });
  return {
    root, feature, engine, fileSystem,
    submit: (phase, content, revision = 0, hash = null) => engine.submitPhaseArtifact({
      projectRoot: root, featureName: feature, phase, content, expectedRevision: revision, expectedArtifactSha256: hash,
      reviewTestCases: phase === 'tasks' ? false : undefined,
    }),
    approve: (phase, result) => engine.approve({ projectRoot: root, featureName: feature, phase, expectedRevision: result.revision, expectedArtifactSha256: result.artifact.sha256 }),
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

type Answer = { choice: string } | { score: number } | { noul: number };

/** A valid, unflagged answer for every posted question, with per-id overrides. */
export function benignAnswers(requestBody: string, overrides: Record<string, Answer> = {}): string {
  const { questions } = JSON.parse(requestBody) as { questions: JevQuestionSet };
  const answers: Record<string, Answer> = {};
  const benignChoice: Record<string, string> = {
    ambiguity: 'bounded', scope: 'all', fidelity: 'fully', mechanism: 'concrete', missing: 'none-missing',
    proportion: 'proportionate', observability: 'public-interface', tddReason: 'justified', cause: 'missing-behavior',
    classification: 'confirmed', remediation: 'yes',
  };
  for (const [id, question] of Object.entries(questions)) {
    const template = id.slice(id.lastIndexOf('.') + 1);
    if (question.type === 'choice') {
      answers[id] = { choice: benignChoice[template] ?? 'followed' };
    } else if (question.type === 'score') {
      answers[id] = { score: question.criteria.length - 2 };
    } else {
      answers[id] = { noul: 0.1 };
    }
  }
  return JSON.stringify({ answers: { ...answers, ...overrides }, model: 'test-model' });
}

export class FakeJevHttpPort implements JevHttpPort {
  readonly calls: JevHttpRequest[] = [];
  respond: (request: JevHttpRequest) => Promise<JevHttpResponse> = async () => ({ status: 200, body: '{}' });
  async post(request: JevHttpRequest): Promise<JevHttpResponse> {
    this.calls.push(request);
    return this.respond(request);
  }
}

export class FakeGitPort implements GitPort {
  readonly calls: string[][] = [];
  handler: (args: readonly string[]) => GitResult = () => ({ ok: false });
  async run(args: readonly string[]): Promise<GitResult> {
    this.calls.push([...args]);
    return this.handler(args);
  }
}

/** Real filesystem that records every call so tests can prove what was (not) touched. */
export class SpyFileSystem extends NodeFileSystemAdapter {
  readonly calls: Array<{ method: string; path: string }> = [];
  throwOn?: { method: string; match: RegExp };
  private record(method: string, target: string): void {
    this.calls.push({ method, path: target });
    if (this.throwOn?.method === method && this.throwOn.match.test(target)) throw new Error('spy failure');
  }
  override async readFile(target: string): Promise<string> { this.record('readFile', target); return super.readFile(target); }
  override async writeFile(target: string, content: string): Promise<void> { this.record('writeFile', target); return super.writeFile(target, content); }
  override async writeFileAtomic(target: string, content: string): Promise<void> { this.record('writeFileAtomic', target); return super.writeFileAtomic(target, content); }
  override async exists(target: string): Promise<boolean> { this.record('exists', target); return super.exists(target); }
  override async mkdir(target: string): Promise<void> { this.record('mkdir', target); return super.mkdir(target); }
  override async readdir(target: string): Promise<string[]> { this.record('readdir', target); return super.readdir(target); }
  override async stat(target: string) { this.record('stat', target); return super.stat(target); }
  override async unlink(target: string): Promise<void> { this.record('unlink', target); return super.unlink(target); }
}

export const silentLogger = (): LoggerPort & { all(): unknown[] } => {
  const calls: unknown[] = [];
  const log = (...args: unknown[]): void => { calls.push(args); };
  return { info: log, warn: log, error: log, debug: log, all: () => calls };
};

/** Sorted `path|dir` and `path|file|sha256` lines for the whole tree. */
export async function snapshotTree(root: string): Promise<string[]> {
  const lines: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const relative = path.relative(root, full);
      if (entry.isDirectory()) {
        lines.push(`${relative}|dir`);
        await walk(full);
      } else {
        const digest = createHash('sha256').update(await readFile(full)).digest('hex');
        lines.push(`${relative}|file|${digest}`);
      }
    }
  };
  await walk(root);
  return lines.sort();
}

export async function readAllFiles(root: string): Promise<string> {
  const parts: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if ((await stat(full)).size < 2_000_000) parts.push(await readFile(full, 'utf8'));
    }
  };
  await walk(root);
  return parts.join('\n');
}

export interface TempProject {
  root: string;
  cleanup(): Promise<void>;
}

/** A project root with `.spec/specs/<feature>/spec.json` and a source file. */
export async function createTempProject(feature = 'demo'): Promise<TempProject> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'jev-service-'));
  await mkdir(path.join(root, '.spec', 'specs', feature), { recursive: true });
  await writeFile(path.join(root, '.spec', 'specs', feature, 'spec.json'), '{"schema_version":5}\n', 'utf8');
  await mkdir(path.join(root, 'src'), { recursive: true });
  await writeFile(path.join(root, 'src', 'a.ts'), 'export const a = 1;\n', 'utf8');
  return { root, cleanup: () => rm(root, { recursive: true, force: true }) };
}

/** Scripts a FakeGitPort so the review manifest sees one modified file, `src/a.ts`. */
export function scriptOneChangedFile(git: FakeGitPort, options: { blob?: string; head?: string | null } = {}): void {
  const blob = options.blob ?? 'a'.repeat(40);
  const head = options.head === undefined ? 'c'.repeat(40) : options.head;
  git.handler = (args) => {
    const joined = args.join(' ');
    if (joined.includes('status')) return { ok: true, stdout: Buffer.from(' M src/a.ts\0') };
    if (joined.includes('hash-object')) return { ok: true, stdout: Buffer.from(`${blob}\n`) };
    if (joined.includes('rev-parse')) return head === null ? { ok: false } : { ok: true, stdout: Buffer.from(`${head}\n`) };
    return { ok: false };
  };
}
