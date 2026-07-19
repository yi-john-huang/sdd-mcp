import { mkdtemp, readFile, rm, mkdir, writeFile, readdir, stat, realpath, unlink, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  ContextBudgetExceededError,
  ContextBudgetTooSmallError,
  ContextCompactionService,
  PhaseNotApprovedError,
} from '../../../application/services/ContextCompactionService';
import { SpecPathEscapeError } from '../../../application/services/SpecPathResolver';
import { FileSystemPort, LoggerPort } from '../../../domain/ports';
import { atomicWriteFile } from '../../../utils/atomicWrite';

class NodeTestFileSystem implements FileSystemPort {
  readFile(filePath: string): Promise<string> { return readFile(filePath, 'utf8'); }
  writeFile(filePath: string, content: string): Promise<void> { return writeFile(filePath, content, 'utf8'); }
  writeFileAtomic(filePath: string, content: string): Promise<void> { return atomicWriteFile(filePath, content); }
  async exists(filePath: string): Promise<boolean> { try { await stat(filePath); return true; } catch { return false; } }
  mkdir(dirPath: string): Promise<void> { return mkdir(dirPath, { recursive: true }).then(() => undefined); }
  readdir(dirPath: string): Promise<string[]> { return readdir(dirPath); }
  stat(filePath: string): Promise<{ isFile(): boolean; isDirectory(): boolean }> { return stat(filePath); }
  realpath(filePath: string): Promise<string> { return realpath(filePath); }
  unlink(filePath: string): Promise<void> { return unlink(filePath); }
}

const logger: LoggerPort = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
const featureName = 'auth-flow';

describe('ContextCompactionService v4', () => {
  let projectRoot: string;
  let featureRoot: string;
  let service: ContextCompactionService;

  async function writeSpec(approvals: Record<string, { generated: boolean; approved: boolean }>, review = { required: true, reviewed: false }): Promise<void> {
    await writeFile(path.join(featureRoot, 'spec.json'), JSON.stringify({ feature_name: featureName, approvals, workflow_options: { review_test_cases: review.required }, checkpoints: { test_cases: review } }), 'utf8');
  }

  beforeEach(async () => {
    projectRoot = await mkdtemp(path.join(os.tmpdir(), 'sdd-context-v4-'));
    featureRoot = path.join(projectRoot, '.spec', 'specs', featureName);
    await mkdir(featureRoot, { recursive: true });
    await Promise.all([
      writeFile(path.join(featureRoot, 'requirements.md'), '# Requirements\n- The system MUST authenticate users.\n- Shared duplicate.\n', 'utf8'),
      writeFile(path.join(featureRoot, 'design.md'), '# Design\n- Shared duplicate.\n- Use an isolated AuthService.\n', 'utf8'),
      writeFile(path.join(featureRoot, 'tasks.md'), '# Tasks\n- Shared duplicate.\n- Write focused tests.\n'.repeat(100), 'utf8'),
    ]);
    await writeSpec({ requirements: { generated: false, approved: false }, design: { generated: false, approved: false }, tasks: { generated: false, approved: false } });
    service = new ContextCompactionService(new NodeTestFileSystem(), logger);
  });

  afterEach(async () => { await rm(projectRoot, { recursive: true, force: true }); });

  it('returns bounded init state and excludes generated unapproved drafts by default', async () => {
    const init = await service.loadContext({ projectRoot, featureName });
    expect(init.effectivePhase).toBe('init');
    expect(init.phaseStatus).toBe('init');
    expect(init.content).toContain('Generate requirements');
    expect(init.content).not.toContain('authenticate users');
    expect(init.payloadEstimatedTokens).toBeLessThanOrEqual(2048);

    await writeSpec({ requirements: { generated: true, approved: false }, design: { generated: false, approved: false }, tasks: { generated: false, approved: false } });
    const excluded = await service.loadContext({ projectRoot, featureName, mode: 'standard' });
    expect(excluded.effectivePhase).toBe('init');
    await expect(service.loadContext({ projectRoot, featureName, phase: 'requirements' })).rejects.toBeInstanceOf(PhaseNotApprovedError);
    const draft = await service.loadContext({ projectRoot, featureName, mode: 'full', phase: 'requirements', includeUnapproved: true });
    expect(draft.phaseStatus).toBe('unapproved');
    expect(draft.content).toContain('authenticate users');
  });

  it('selects only approved documents through the effective phase and deduplicates globally', async () => {
    await writeSpec({ requirements: { generated: true, approved: true }, design: { generated: true, approved: true }, tasks: { generated: true, approved: false } });
    const standard = await service.loadContext({ projectRoot, featureName, mode: 'standard' });
    expect(standard.effectivePhase).toBe('design');
    expect(standard.content).toContain('AuthService');
    expect(standard.content).not.toContain('Write focused tests');
    expect(standard.content?.match(/Shared duplicate/g)).toHaveLength(1);
    expect(standard.payloadEstimatedTokens).toBeLessThanOrEqual(4096);
  });

  it('enforces request-specific underflow and full overflow without truncation', async () => {
    await writeSpec({ requirements: { generated: true, approved: true }, design: { generated: true, approved: true }, tasks: { generated: true, approved: true } }, { required: true, reviewed: true });
    await expect(service.loadContext({ projectRoot, featureName, maxEstimatedTokens: 1 })).rejects.toBeInstanceOf(ContextBudgetTooSmallError);
    await expect(service.loadContext({ projectRoot, featureName, mode: 'full', maxEstimatedTokens: 50 })).rejects.toBeInstanceOf(ContextBudgetExceededError);
    const compact = await service.loadContext({ projectRoot, featureName, maxEstimatedTokens: 180 });
    expect(compact.payloadEstimatedTokens).toBeLessThanOrEqual(180);
  });

  it('persists one canonical compact handoff, reuses it, and honors the exact ETag', async () => {
    await writeSpec({ requirements: { generated: true, approved: true }, design: { generated: false, approved: false }, tasks: { generated: false, approved: false } });
    const first = await service.loadContext({ projectRoot, featureName });
    expect(first.cacheStatus).toBe('regenerated');
    expect(Number(first.content?.match(/Payload estimated tokens: (\d+)/)?.[1])).toBe(first.payloadEstimatedTokens);
    const second = await service.loadContext({ projectRoot, featureName });
    expect(second.cacheStatus).toBe('hit');
    expect(second.content).toBe(first.content);
    const unchanged = await service.loadContext({ projectRoot, featureName, ifNoneMatch: first.fingerprint });
    expect(unchanged.cacheStatus).toBe('not-modified');
    expect(unchanged.content).toBeUndefined();
    await writeFile(path.join(featureRoot, 'requirements.md'), '# Requirements\n- Changed source.\n', 'utf8');
    const stale = await service.loadContext({ projectRoot, featureName });
    expect(stale.cacheStatus).toBe('regenerated');
    expect(stale.fingerprint).not.toBe(first.fingerprint);
    expect(await readdir(path.join(featureRoot, 'context'))).toEqual(['handoff.md']);
  });

  it('rejects traversal and symlink escapes for feature and document reads', async () => {
    await expect(service.loadContext({ projectRoot, featureName: '../escape' })).rejects.toThrow('Invalid feature name');
    const outside = await mkdtemp(path.join(os.tmpdir(), 'sdd-outside-'));
    const escapedFeature = path.join(projectRoot, '.spec', 'specs', 'escaped');
    await symlink(outside, escapedFeature);
    await expect(service.loadContext({ projectRoot, featureName: 'escaped' })).rejects.toBeInstanceOf(SpecPathEscapeError);
    await rm(outside, { recursive: true, force: true });

    await writeSpec({ requirements: { generated: true, approved: true }, design: { generated: false, approved: false }, tasks: { generated: false, approved: false } });
    await unlink(path.join(featureRoot, 'requirements.md'));
    const outsideFile = path.join(projectRoot, 'outside.md');
    await writeFile(outsideFile, 'secret', 'utf8');
    await symlink(outsideFile, path.join(featureRoot, 'requirements.md'));
    await expect(service.loadContext({ projectRoot, featureName })).rejects.toBeInstanceOf(SpecPathEscapeError);
  });
});
