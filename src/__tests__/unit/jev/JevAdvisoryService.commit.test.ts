import { execFileSync } from 'node:child_process';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { JevAdvisoryService, type AdvisoryEngine, type JevEnvironment } from '../../../application/services/JevAdvisoryService';
import type { JevCheckRequest, JevFindingInput } from '../../../application/services/JevCheckTypes';
import { NodeGitAdapter } from '../../../infrastructure/adapters/NodeGitAdapter';
import {
  FakeGitPort, FakeJevHttpPort, SpyFileSystem, TEST_KEY, benignAnswers, createTempProject, silentLogger, snapshotTree, type TempProject,
} from './helpers';

const REVIEW_ENV: JevEnvironment = { SDD_JEV_ENABLED: '1', SDD_JEV_API_KEY: TEST_KEY, SDD_JEV_ALLOW_CODE: '1' };
const COMMIT_ENV: JevEnvironment = { SDD_JEV_ENABLED: '1' };
const WARNING = (count: number): string => `JEV: warning (${count} confirmed high/critical security findings in staged changes)`;

const finding = (id: string, line: number): JevFindingInput => ({ id, path: 'src/a.ts', line, title: `finding ${id}`, severity: 'high' });

describe('JevAdvisoryService commit lookup', () => {
  let project: TempProject;
  let http: FakeJevHttpPort;
  const git = (...args: string[]): string => execFileSync('git', args, { cwd: project.root, encoding: 'utf8' });

  beforeEach(async () => {
    project = await createTempProject();
    git('init', '-q');
    git('config', 'user.email', 't@example.com');
    git('config', 'user.name', 'T');
    git('config', 'commit.gpgsign', 'false');
    await writeFile(path.join(project.root, 'src', 'a.ts'), 'export const a = 1;\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'base');
    await writeFile(path.join(project.root, 'src', 'a.ts'), 'export const a = 2;\nexport const b = 3;\n');
    http = new FakeJevHttpPort();
    http.respond = async (request) => ({ status: 200, body: benignAnswers(request.body) });
  });
  afterEach(async () => {
    await project.cleanup();
  });

  const service = (env: JevEnvironment, gitPort = new NodeGitAdapter()): JevAdvisoryService =>
    new JevAdvisoryService(http, gitPort, { readAdvisorySnapshot: jest.fn() } as unknown as AdvisoryEngine, new SpyFileSystem(), silentLogger(), env);
  const commitRequest = (): JevCheckRequest => ({ check: 'commit', projectRoot: project.root });
  const review = async (findings: JevFindingInput[], overrides: Record<string, unknown> = {}, featureName: string | undefined = 'demo') => {
    http.respond = async (request) => ({ status: 200, body: benignAnswers(request.body, overrides as never) });
    return service(REVIEW_ENV).check({ check: 'security', projectRoot: project.root, featureName, findings });
  };
  const confirmedHigh = (id: string): Record<string, unknown> =>
    ({ [`${id}.classification`]: { choice: 'confirmed' }, [`${id}.severity`]: { score: 3 } });

  describe('warning', () => {
    it('warns once for a confirmed high finding matching the staged change, with no request and no key', async () => {
      await review([finding('F1', 1)], confirmedHigh('F1'));
      git('add', '-A');
      const requestsBefore = http.calls.length;
      const result = await service(COMMIT_ENV).check(commitRequest());
      expect(result).toMatchObject({ check: 'commit', status: 'answered', line: WARNING(1), flagged: ['F1'] });
      expect(http.calls.length).toBe(requestsBefore);
    });

    it('warns for a confirmed critical finding and counts every qualifying finding', async () => {
      await review(
        [finding('F1', 1), finding('F2', 2), finding('F3', 2)],
        {
          ...confirmedHigh('F1'),
          'F2.classification': { choice: 'confirmed' }, 'F2.severity': { score: 4 },
          'F3.classification': { choice: 'hardening' }, 'F3.severity': { score: 4 },
        },
      );
      git('add', '-A');
      expect((await service(COMMIT_ENV).check(commitRequest())).line).toBe(WARNING(2));
    });

    it('finds a sidecar written without a feature under .spec/reviews', async () => {
      await review([finding('F1', 1)], confirmedHigh('F1'), undefined);
      git('add', '-A');
      expect((await service(COMMIT_ENV).check(commitRequest())).line).toBe(WARNING(1));
    });

    it('also works when JEV is enabled with a key', async () => {
      await review([finding('F1', 1)], confirmedHigh('F1'));
      git('add', '-A');
      expect((await service(REVIEW_ENV).check(commitRequest())).line).toBe(WARNING(1));
    });

    it('keeps the warning when a later unavailable run shares the sidecar path', async () => {
      await review([finding('F1', 1)], confirmedHigh('F1'));
      const later = await service({ SDD_JEV_ENABLED: '1', SDD_JEV_API_KEY: TEST_KEY }).check({
        check: 'security', projectRoot: project.root, featureName: 'demo', findings: [finding('F1', 1)],
      });
      expect(later).toMatchObject({ status: 'unavailable', reason: 'code-disabled', persisted: false });
      git('add', '-A');
      expect((await service(COMMIT_ENV).check(commitRequest())).line).toBe(WARNING(1));
    });
  });

  describe('no warning', () => {
    it.each([
      ['hardening at high severity', { 'F1.classification': { choice: 'hardening' }, 'F1.severity': { score: 3 } }],
      ['confirmed at medium severity', { 'F1.classification': { choice: 'confirmed' }, 'F1.severity': { score: 2 } }],
      ['a false positive', { 'F1.classification': { choice: 'false-positive' }, 'F1.severity': { score: 4 } }],
    ])('stays silent for %s', async (_name, overrides) => {
      await review([finding('F1', 1)], overrides);
      git('add', '-A');
      expect(await service(COMMIT_ENV).check(commitRequest())).toMatchObject({ line: null, flagged: [] });
    });

    it('stays silent when the staged change differs from the reviewed change', async () => {
      await review([finding('F1', 1)], confirmedHigh('F1'));
      await writeFile(path.join(project.root, 'src', 'a.ts'), 'export const a = 99;\n');
      git('add', '-A');
      expect((await service(COMMIT_ENV).check(commitRequest())).line).toBeNull();
    });

    it('stays silent when only part of the reviewed change is staged', async () => {
      await writeFile(path.join(project.root, 'src', 'b.ts'), 'export const second = true;\n');
      await review([finding('F1', 1)], confirmedHigh('F1'));
      git('add', 'src/a.ts');
      expect((await service(COMMIT_ENV).check(commitRequest())).line).toBeNull();
    });

    it('stays silent for a corrupt or unreadable sidecar without raising an error', async () => {
      await review([finding('F1', 1)], confirmedHigh('F1'));
      const dir = path.join(project.root, '.spec', 'specs', 'demo', 'review');
      const [file] = await readdir(dir);
      await writeFile(path.join(dir, file!), '{not json');
      git('add', '-A');
      await expect(service(COMMIT_ENV).check(commitRequest())).resolves.toMatchObject({ line: null });
      await rm(path.join(dir, file!));
      await mkdir(path.join(dir, file!));
      await expect(service(COMMIT_ENV).check(commitRequest())).resolves.toMatchObject({ line: null });
    });

    it('stays silent when no sidecar exists and does not call git at all', async () => {
      const fakeGit = new FakeGitPort();
      const result = await service(COMMIT_ENV, fakeGit).check(commitRequest());
      expect(result).toMatchObject({ line: null });
      expect(fakeGit.calls).toHaveLength(0);
    });

    it('stays silent for an unavailable code-disabled sidecar', async () => {
      await service({ ...REVIEW_ENV, SDD_JEV_ALLOW_CODE: undefined }).check({
        check: 'security', projectRoot: project.root, featureName: 'demo', findings: [finding('F1', 1)],
      });
      git('add', '-A');
      expect((await service(COMMIT_ENV).check(commitRequest())).line).toBeNull();
    });
  });

  describe('gates and side effects', () => {
    it('is skipped without any git call when JEV is disabled', async () => {
      await review([finding('F1', 1)], confirmedHigh('F1'));
      git('add', '-A');
      const fakeGit = new FakeGitPort();
      const result = await service({}, fakeGit).check(commitRequest());
      expect(result).toMatchObject({ status: 'skipped', skipReason: 'disabled', line: null });
      expect(fakeGit.calls).toHaveLength(0);
    });

    it('never changes the project tree, with or without a warning', async () => {
      await review([finding('F1', 1)], confirmedHigh('F1'));
      git('add', '-A');
      const before = await snapshotTree(path.join(project.root, 'src'));
      const specBefore = await snapshotTree(path.join(project.root, '.spec'));
      await service(COMMIT_ENV).check(commitRequest());
      await service({}).check(commitRequest());
      expect(await snapshotTree(path.join(project.root, 'src'))).toEqual(before);
      expect(await snapshotTree(path.join(project.root, '.spec'))).toEqual(specBefore);
    });

    it('does not raise when the project has no .spec directory or no repository', async () => {
      await rm(path.join(project.root, '.spec'), { recursive: true, force: true });
      await expect(service(COMMIT_ENV).check(commitRequest())).resolves.toMatchObject({ line: null });
      await rm(path.join(project.root, '.git'), { recursive: true, force: true });
      await expect(service(COMMIT_ENV).check(commitRequest())).resolves.toMatchObject({ line: null });
    });
  });
});
