import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { JevAdvisoryService, type AdvisoryEngine, type JevEnvironment } from '../../../application/services/JevAdvisoryService';
import { JEV_CHECK_KINDS, type JevCheckKind, type JevCheckRequest } from '../../../application/services/JevCheckTypes';
import {
  FakeGitPort, FakeJevHttpPort, SpyFileSystem, TEST_KEY, createTempProject, readAllFiles, scriptOneChangedFile,
  silentLogger, snapshotTree, type TempProject,
} from './helpers';

describe('JevAdvisoryService gates', () => {
  let project: TempProject;
  let http: FakeJevHttpPort;
  let git: FakeGitPort;
  let fileSystem: SpyFileSystem;
  let logger: ReturnType<typeof silentLogger>;
  let engine: { readAdvisorySnapshot: jest.Mock };

  beforeEach(async () => {
    project = await createTempProject();
    http = new FakeJevHttpPort();
    git = new FakeGitPort();
    fileSystem = new SpyFileSystem();
    logger = silentLogger();
    engine = { readAdvisorySnapshot: jest.fn() };
  });
  afterEach(async () => {
    await project.cleanup();
  });

  const service = (env: JevEnvironment): JevAdvisoryService =>
    new JevAdvisoryService(http, git, engine as unknown as AdvisoryEngine, fileSystem, logger, env);

  const requestFor = (check: JevCheckKind, overrides: Partial<JevCheckRequest> = {}): JevCheckRequest => {
    const base: JevCheckRequest = { check, projectRoot: project.root, featureName: 'demo' };
    const extra: Partial<Record<JevCheckKind, Partial<JevCheckRequest>>> = {
      testcases: { cases: [] },
      red: { taskNumber: '1.1', testName: 't', evidence: { command: 'npx jest', exitCode: 1, summary: 'failed' } },
      security: { findings: [{ id: 'F1', path: 'src/a.ts', line: 1, title: 't', severity: 'high' }] },
      principles: { units: [{ id: 'U1', path: 'src/a.ts', line: 1, summary: 's' }] },
    };
    return { ...base, ...extra[check], ...overrides };
  };

  const expectNoSideEffects = (): void => {
    expect(http.calls).toHaveLength(0);
    expect(git.calls).toHaveLength(0);
    expect(engine.readAdvisorySnapshot).not.toHaveBeenCalled();
  };

  describe('disabled default path', () => {
    it.each(JEV_CHECK_KINDS)('reports disabled for %s with no calls and an unchanged tree', async (check) => {
      const before = await snapshotTree(project.root);
      const result = await service({}).check(requestFor(check));
      if (check === 'commit') {
        expect(result).toMatchObject({ status: 'skipped', skipReason: 'disabled', line: null });
      } else {
        expect(result).toMatchObject({ status: 'unavailable', reason: 'disabled', line: 'JEV: unavailable (disabled)', persisted: false });
      }
      expectNoSideEffects();
      expect(await snapshotTree(project.root)).toEqual(before);
      const configPath = path.join(project.root, '.spec', 'sdd-config.json');
      for (const call of fileSystem.calls) {
        expect(['exists', 'stat', 'readFile']).toContain(call.method);
        expect(call.path).toBe(configPath);
      }
    });

    it('makes no filesystem call at all when the env variable decides', async () => {
      await service({ SDD_JEV_ENABLED: '0', SDD_JEV_API_KEY: TEST_KEY }).check(requestFor('requirements'));
      expect(fileSystem.calls).toHaveLength(0);
    });

    it('stays disabled when the project file says false', async () => {
      await writeFile(path.join(project.root, '.spec', 'sdd-config.json'), '{"jev":{"enabled":false}}');
      const result = await service({ SDD_JEV_API_KEY: TEST_KEY }).check(requestFor('design'));
      expect(result).toMatchObject({ status: 'unavailable', reason: 'disabled' });
    });
  });

  describe('enabled without a key', () => {
    it.each(JEV_CHECK_KINDS)('reports no-key for %s with no http, git, or engine calls and an unchanged tree', async (check) => {
      const before = await snapshotTree(project.root);
      const result = await service({ SDD_JEV_ENABLED: '1', SDD_JEV_ALLOW_CODE: '1' }).check(requestFor(check));
      if (check === 'commit') {
        expect(result).toMatchObject({ status: 'skipped', line: null });
      } else {
        expect(result).toMatchObject({ status: 'unavailable', reason: 'no-key', line: 'JEV: unavailable (no-key)', persisted: false });
      }
      expectNoSideEffects();
      expect(await snapshotTree(project.root)).toEqual(before);
      expect(fileSystem.calls.filter((call) => ['writeFile', 'writeFileAtomic', 'mkdir', 'unlink'].includes(call.method))).toHaveLength(0);
    });

    it('treats an unusable key as no-key and does not create review directories', async () => {
      const result = await service({ SDD_JEV_ENABLED: '1', SDD_JEV_API_KEY: 'bad\r\nkey' }).check(requestFor('security'));
      expect(result).toMatchObject({ status: 'unavailable', reason: 'no-key' });
      const tree = await snapshotTree(project.root);
      expect(tree.some((line) => line.includes('review'))).toBe(false);
    });

    it('lets the project setting enable JEV and then reports no-key', async () => {
      await writeFile(path.join(project.root, '.spec', 'sdd-config.json'), '{"jev":{"enabled":true}}');
      const result = await service({}).check(requestFor('requirements'));
      expect(result).toMatchObject({ status: 'unavailable', reason: 'no-key' });
    });

    it('still reports no-key for a feature that does not exist, without creating it', async () => {
      const before = await snapshotTree(project.root);
      const result = await service({ SDD_JEV_ENABLED: '1' }).check(requestFor('requirements', { featureName: 'ghost' }));
      expect(result).toMatchObject({ status: 'unavailable', reason: 'no-key' });
      expect(await snapshotTree(project.root)).toEqual(before);
    });
  });

  describe('active JEV', () => {
    const active: JevEnvironment = { SDD_JEV_ENABLED: '1', SDD_JEV_API_KEY: TEST_KEY };

    it.each(['requirements', 'design', 'testcases', 'red'] as const)('skips %s for a feature that does not exist and creates nothing', async (check) => {
      const before = await snapshotTree(project.root);
      const result = await service(active).check(requestFor(check, { featureName: 'ghost' }));
      expect(result).toMatchObject({ status: 'skipped', skipReason: 'feature-not-found', line: null });
      expect(await snapshotTree(project.root)).toEqual(before);
      expect(http.calls).toHaveLength(0);
      expect(engine.readAdvisorySnapshot).not.toHaveBeenCalled();
    });

    it('skips a code check scoped to a feature that does not exist', async () => {
      const result = await service({ ...active, SDD_JEV_ALLOW_CODE: '1' }).check(requestFor('security', { featureName: 'ghost' }));
      expect(result).toMatchObject({ status: 'skipped', skipReason: 'feature-not-found' });
    });

    it('rejects an invalid feature name as not found', async () => {
      const result = await service(active).check(requestFor('requirements', { featureName: '../escape' }));
      expect(result).toMatchObject({ status: 'skipped', skipReason: 'feature-not-found' });
    });
  });

  describe('code opt-in', () => {
    const active: JevEnvironment = { SDD_JEV_ENABLED: '1', SDD_JEV_API_KEY: TEST_KEY };

    it.each(['security', 'principles'] as const)('reports code-disabled for %s, writes one sidecar, and makes no http call', async (check) => {
      scriptOneChangedFile(git);
      const result = await service(active).check(requestFor(check));
      expect(result).toMatchObject({ status: 'unavailable', reason: 'code-disabled', line: 'JEV: unavailable (code-disabled)', persisted: true });
      expect(http.calls).toHaveLength(0);
      const dir = path.join(project.root, '.spec', 'specs', 'demo', 'review');
      const files = (await snapshotTree(dir)).map((line) => line.split('|')[0]);
      expect(files).toHaveLength(1);
      expect(result.sidecar).toBe(`.spec/specs/demo/review/${files[0]}`);
      const stored = JSON.parse(await readFile(path.join(dir, files[0]!), 'utf8'));
      expect(stored).toMatchObject({ kind: check, status: 'unavailable', reason: 'code-disabled', source: 'jev' });
      expect(stored.binding.diffSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(stored.binding.inputSha256).toMatch(/^[a-f0-9]{64}$/);
    });

    it('writes review sidecars under .spec/reviews when no feature is in scope', async () => {
      scriptOneChangedFile(git);
      const result = await service(active).check(requestFor('security', { featureName: undefined }));
      expect(result.persisted).toBe(true);
      expect(result.sidecar).toMatch(/^\.spec\/reviews\/jev-review-security-[a-f0-9]{12}\.json$/);
    });

    it('does not persist when git cannot bind the change', async () => {
      const before = await snapshotTree(project.root);
      const result = await service(active).check(requestFor('security'));
      expect(result).toMatchObject({ status: 'unavailable', reason: 'code-disabled', persisted: false });
      expect(await snapshotTree(project.root)).toEqual(before);
    });

    it.each(['security', 'principles'] as const)('still reports code-disabled for %s on a clean tree, without a sidecar', async (check) => {
      git.handler = () => ({ ok: true, stdout: Buffer.from('') });
      const before = await snapshotTree(project.root);
      const result = await service(active).check(requestFor(check));
      expect(result).toMatchObject({ status: 'unavailable', reason: 'code-disabled', line: 'JEV: unavailable (code-disabled)', persisted: false });
      expect(http.calls).toHaveLength(0);
      expect(await snapshotTree(project.root)).toEqual(before);
    });
  });

  describe('baseRef validation', () => {
    const active: JevEnvironment = { SDD_JEV_ENABLED: '1', SDD_JEV_API_KEY: TEST_KEY, SDD_JEV_ALLOW_CODE: '1' };
    const invalid: Array<[string, string]> = [
      ['a leading dash', '--output=x'],
      ['a space', 'origin/develop branch'],
      ['a tab', 'origin/\tdevelop'],
      ['a newline', 'origin/develop\n-x'],
      ['a NUL character', 'origin/dev\u0000elop'],
      ['a DEL character', 'origin/dev\u007Felop'],
      ['an empty string', ''],
      ['257 characters', 'a'.repeat(257)],
    ];

    it.each(['security', 'principles'] as const)('skips %s with invalid-base-ref and no side effects for every malformed value', async (check) => {
      scriptOneChangedFile(git);
      const before = await snapshotTree(project.root);
      for (const [, baseRef] of invalid) {
        const result = await service(active).check(requestFor(check, { baseRef }));
        expect(result).toMatchObject({ check, status: 'skipped', skipReason: 'invalid-base-ref', line: null, persisted: false });
      }
      expectNoSideEffects();
      expect(await snapshotTree(project.root)).toEqual(before);
    });

    it.each(['requirements', 'design', 'testcases', 'red', 'commit'] as const)(
      'skips %s given a well-formed baseRef, with no git, http, or file effects',
      async (check) => {
        const before = await snapshotTree(project.root);
        const result = await service(active).check(requestFor(check, { baseRef: 'origin/develop' }));
        expect(result).toMatchObject({ check, status: 'skipped', skipReason: 'invalid-base-ref', line: null });
        expectNoSideEffects();
        expect(await snapshotTree(project.root)).toEqual(before);
      },
    );

    it.each(JEV_CHECK_KINDS)('still reports disabled for %s with a baseRef and touches nothing', async (check) => {
      const before = await snapshotTree(project.root);
      const result = await service({}).check(requestFor(check, { baseRef: '--output=x' }));
      if (check === 'commit') expect(result).toMatchObject({ status: 'skipped', skipReason: 'disabled' });
      else expect(result).toMatchObject({ status: 'unavailable', reason: 'disabled' });
      expectNoSideEffects();
      expect(await snapshotTree(project.root)).toEqual(before);
    });

    it.each(['security', 'principles'] as const)('still reports no-key for %s with a baseRef and touches nothing', async (check) => {
      const before = await snapshotTree(project.root);
      const result = await service({ SDD_JEV_ENABLED: '1', SDD_JEV_ALLOW_CODE: '1' }).check(requestFor(check, { baseRef: 'origin/develop' }));
      expect(result).toMatchObject({ status: 'unavailable', reason: 'no-key', persisted: false });
      expectNoSideEffects();
      expect(await snapshotTree(project.root)).toEqual(before);
    });
  });

  describe('failure containment and key hygiene', () => {
    it('turns an internal exception into a result value instead of rejecting', async () => {
      fileSystem.throwOn = { method: 'exists', match: /spec\.json$/ };
      const result = await service({ SDD_JEV_ENABLED: '1', SDD_JEV_API_KEY: TEST_KEY }).check(requestFor('requirements'));
      expect(result).toMatchObject({ status: 'skipped', skipReason: 'not-ready', line: null });
      const logged = JSON.stringify(logger.all());
      expect(logged).toContain('errorName');
      expect(logged).not.toContain('spy failure');
      expect(logged).not.toContain(project.root);
    });

    it('never exposes the key in results, logs, or written files', async () => {
      scriptOneChangedFile(git);
      await mkdir(path.join(project.root, 'extra'), { recursive: true });
      const results = [];
      for (const check of JEV_CHECK_KINDS) {
        results.push(await service({ SDD_JEV_ENABLED: '1', SDD_JEV_API_KEY: TEST_KEY }).check(requestFor(check)));
      }
      const haystack = [JSON.stringify(results), JSON.stringify(logger.all()), await readAllFiles(project.root)].join('\n');
      expect(haystack).not.toContain(TEST_KEY);
    });
  });
});
