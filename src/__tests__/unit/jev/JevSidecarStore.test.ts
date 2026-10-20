import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { LoggerPort } from '../../../domain/ports';
import { NodeFileSystemAdapter } from '../../../infrastructure/adapters/NodeFileSystemAdapter';
import { JevSidecarStore, type JevSidecar, type SidecarBinding } from '../../../application/services/JevSidecarStore';

const logger: LoggerPort = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
const SHA = 'a'.repeat(64);
const SHA2 = 'b'.repeat(64);
const KEY = 'sk-test-abcdef123456';

const binding = (overrides: Partial<SidecarBinding> = {}): SidecarBinding => ({
  questionSetVersion: 1, revision: 3, artifactSha256: SHA, ...overrides,
});
const sidecar = (overrides: Partial<JevSidecar> = {}): JevSidecar => ({
  schema: 1,
  kind: 'requirements',
  createdAt: '2026-10-19T00:00:00.000Z',
  binding: binding(),
  status: 'answered',
  source: 'jev',
  answers: { 'FR-1.testability': { type: 'score', raw: 2, index: 2 }, 'FR-1.ambiguity': { type: 'choice', choice: 'bounded' } },
  meta: { model: 'm1' },
  truncated: false,
  omittedIds: [],
  droppedFindingIds: [],
  redactions: 2,
  ...overrides,
});

describe('JevSidecarStore', () => {
  let root: string;
  let store: JevSidecarStore;
  const feature = 'demo';
  const reviewDir = (): string => path.join(root, '.spec', 'specs', feature, 'review');
  const tree = async (dir: string): Promise<string[]> => {
    const out: string[] = [];
    const walk = async (current: string): Promise<void> => {
      for (const entry of await readdir(current, { withFileTypes: true })) {
        const full = path.join(current, entry.name);
        out.push(path.relative(dir, full));
        if (entry.isDirectory()) await walk(full);
      }
    };
    await walk(dir);
    return out.sort();
  };

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'jev-sidecar-'));
    await mkdir(path.join(root, '.spec', 'specs', feature), { recursive: true });
    store = new JevSidecarStore(new NodeFileSystemAdapter(), logger);
    jest.clearAllMocks();
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  describe('file names and locations', () => {
    it.each([
      ['requirements', binding({ revision: 3 }), undefined, 'jev-requirements-r3.json'],
      ['design', binding({ revision: 1 }), undefined, 'jev-design-r1.json'],
      ['testcases', binding({ revision: 2 }), undefined, 'jev-testcases-r2.json'],
      ['red', binding({ evidenceSha256: 'c'.repeat(64) }), '2.1', `jev-red-2.1-${'c'.repeat(12)}.json`],
      ['security', binding({ diffSha256: 'd'.repeat(64) }), undefined, `jev-review-security-${'d'.repeat(12)}.json`],
      ['principles', binding({ diffSha256: 'e'.repeat(64) }), undefined, `jev-review-principles-${'e'.repeat(12)}.json`],
    ] as const)('names a %s sidecar', (kind, bound, task, expected) => {
      expect(store.fileNameFor(kind, bound, task)).toBe(expected);
    });

    it('writes feature sidecars under the feature review directory', async () => {
      const result = await store.write(root, feature, sidecar());
      expect(result).toEqual({ persisted: true, path: '.spec/specs/demo/review/jev-requirements-r3.json' });
      expect(await readdir(reviewDir())).toEqual(['jev-requirements-r3.json']);
    });

    it('writes review sidecars without a feature under .spec/reviews', async () => {
      const diff = binding({ diffSha256: SHA2, revision: undefined, artifactSha256: undefined });
      const result = await store.write(root, undefined, sidecar({ kind: 'security', binding: diff }));
      expect(result.persisted).toBe(true);
      expect(await readdir(path.join(root, '.spec', 'reviews'))).toEqual([`jev-review-security-${SHA2.slice(0, 12)}.json`]);
    });
  });

  describe('content', () => {
    it('stores binding, answers, raw scores, reason, redaction count, and excerpt hashes', async () => {
      const item = { id: 'F1', location: 'src/a.ts:10', excerptSha256: SHA2, modelSeverity: 'important', jevSeverity: 'low', disagreement: true };
      const timeout = sidecar({ status: 'unavailable', reason: 'timeout', answers: undefined, meta: undefined, items: [item], baseCommit: 'f'.repeat(40) });
      await store.write(root, feature, timeout);
      const stored = JSON.parse(await readFile(path.join(reviewDir(), 'jev-requirements-r3.json'), 'utf8'));
      expect(stored).toMatchObject({ schema: 1, status: 'unavailable', reason: 'timeout', redactions: 2, binding: binding(), items: [item], baseCommit: 'f'.repeat(40) });
      await store.write(root, feature, sidecar());
      const answered = JSON.parse(await readFile(path.join(reviewDir(), 'jev-requirements-r3.json'), 'utf8'));
      expect(answered.answers['FR-1.testability']).toEqual({ type: 'score', raw: 2, index: 2 });
      expect(Object.keys(answered).sort()).toEqual(
        ['answers', 'binding', 'createdAt', 'droppedFindingIds', 'kind', 'meta', 'omittedIds', 'redactions', 'schema', 'source', 'status', 'truncated'],
      );
    });

    it('drops unknown fields so a key, request body, or excerpt text can never reach disk', async () => {
      const hostile = {
        ...sidecar({ items: [{ id: 'F1', excerptSha256: SHA2, excerpt: 'const secret = 1', apiKey: KEY } as never] }),
        apiKey: KEY, authorization: `Bearer ${KEY}`, requestBody: '{"state":{}}', excerpt: 'const password = "x"',
      } as unknown as JevSidecar;
      await store.write(root, feature, hostile);
      const text = await readFile(path.join(reviewDir(), 'jev-requirements-r3.json'), 'utf8');
      for (const forbidden of [KEY, 'Bearer', 'requestBody', 'const secret', 'const password', 'excerpt"']) {
        expect(text).not.toContain(forbidden);
      }
      expect(text).toContain(SHA2);
    });
  });

  describe('reasons that must leave no trace', () => {
    it.each(['disabled', 'no-key'])('never touches disk for reason %s', async (reason) => {
      const before = await tree(root);
      const result = await store.write(root, feature, sidecar({ status: 'unavailable', reason, answers: undefined }));
      expect(result).toEqual({ persisted: false });
      expect(await tree(root)).toEqual(before);
    });

    it.each(['network', 'timeout', 'http-503', 'invalid-response', 'code-disabled'])('persists reason %s', async (reason) => {
      const result = await store.write(root, feature, sidecar({ status: 'unavailable', reason, answers: undefined }));
      expect(result.persisted).toBe(true);
    });

    it('does not create a feature directory that does not exist', async () => {
      const result = await store.write(root, 'ghost', sidecar());
      expect(result).toEqual({ persisted: false });
      expect(await readdir(path.join(root, '.spec', 'specs'))).toEqual([feature]);
    });
  });

  describe('answered vs unavailable replacement', () => {
    const timeout = (): JevSidecar => sidecar({ status: 'unavailable', reason: 'timeout', answers: undefined });
    const readStored = async (): Promise<JevSidecar> => JSON.parse(await readFile(path.join(reviewDir(), 'jev-requirements-r3.json'), 'utf8')) as JevSidecar;

    it('does not replace an answered sidecar with an unavailable one', async () => {
      await store.write(root, feature, sidecar());
      const result = await store.write(root, feature, timeout());
      expect(result).toEqual({ persisted: false });
      const stored = await readStored();
      expect(stored.status).toBe('answered');
      expect(stored.answers?.['FR-1.ambiguity']).toEqual({ type: 'choice', choice: 'bounded' });
    });

    it('replaces an answered sidecar with a newer answered result', async () => {
      await store.write(root, feature, sidecar());
      const newer = sidecar({
        answers: { 'FR-1.testability': { type: 'score', raw: 0, index: 0 }, 'FR-1.ambiguity': { type: 'choice', choice: 'unbounded' } },
      });
      const result = await store.write(root, feature, newer);
      expect(result.persisted).toBe(true);
      expect((await readStored()).answers?.['FR-1.ambiguity']).toEqual({ type: 'choice', choice: 'unbounded' });
    });

    it('replaces an unavailable sidecar with an answered result', async () => {
      await store.write(root, feature, timeout());
      expect((await readStored()).status).toBe('unavailable');
      const result = await store.write(root, feature, sidecar());
      expect(result.persisted).toBe(true);
      const stored = await readStored();
      expect(stored.status).toBe('answered');
      expect(stored.answers?.['FR-1.ambiguity']).toEqual({ type: 'choice', choice: 'bounded' });
    });
  });

  describe('matching reads', () => {
    it('returns an answered sidecar whose binding is identical', async () => {
      await store.write(root, feature, sidecar());
      const found = await store.readMatching(root, feature, 'requirements', binding());
      expect(found?.answers?.['FR-1.ambiguity']).toEqual({ type: 'choice', choice: 'bounded' });
    });

    it.each([
      ['artifactSha256', { artifactSha256: SHA2 }],
      ['revision', { revision: 4 }],
      ['questionSetVersion', { questionSetVersion: 2 }],
      ['caseListSha256', { caseListSha256: SHA2 }],
      ['evidenceSha256', { evidenceSha256: SHA2 }],
      ['diffSha256', { diffSha256: SHA2 }],
      ['inputSha256', { inputSha256: SHA2 }],
    ])('ignores a sidecar when %s differs', async (_name, change) => {
      await store.write(root, feature, sidecar());
      const current = { ...binding(), ...change };
      expect(await store.readMatching(root, feature, 'requirements', current)).toBeUndefined();
      // The file at the current revision's name must also be rejected when it holds another binding.
      await writeFile(path.join(reviewDir(), store.fileNameFor('requirements', current)), JSON.stringify(sidecar()), 'utf8');
      expect(await store.readMatching(root, feature, 'requirements', current)).toBeUndefined();
    });

    it('does not reuse an unavailable sidecar', async () => {
      await store.write(root, feature, sidecar({ status: 'unavailable', reason: 'timeout', answers: undefined }));
      expect(await store.readMatching(root, feature, 'requirements', binding())).toBeUndefined();
    });

    it('ignores corrupt JSON, a wrong shape, a wrong kind, and an oversized file without throwing', async () => {
      await mkdir(reviewDir(), { recursive: true });
      const file = path.join(reviewDir(), 'jev-requirements-r3.json');
      for (const content of ['{not json', '{"schema":1}', JSON.stringify(sidecar({ kind: 'design' })), JSON.stringify({ ...sidecar(), pad: 'x'.repeat(1_100_000) })]) {
        await writeFile(file, content, 'utf8');
        await expect(store.readMatching(root, feature, 'requirements', binding())).resolves.toBeUndefined();
      }
    });

    it('returns undefined when there is no sidecar', async () => {
      await expect(store.readMatching(root, feature, 'requirements', binding())).resolves.toBeUndefined();
    });
  });

  describe('committed-range review sidecars', () => {
    const MERGE = '1'.repeat(40);
    const HEAD = '2'.repeat(40);
    const range = (overrides: Partial<SidecarBinding> = {}): SidecarBinding => ({
      questionSetVersion: 3, inputSha256: SHA, diffSha256: SHA2, rangeBaseCommit: MERGE, headCommit: HEAD, ...overrides,
    });
    const reviewSidecar = (bound: SidecarBinding, overrides: Partial<JevSidecar> = {}): JevSidecar =>
      sidecar({ kind: 'security', binding: bound, ...overrides });
    const readRange = (bound: SidecarBinding) => store.readMatching(root, feature, 'security', bound);

    it.each(['security', 'principles'] as const)('names a %s range sidecar from the diff hash', (kind) => {
      expect(store.fileNameFor(kind, range())).toBe(`jev-review-${kind}-range-${SHA2.slice(0, 12)}.json`);
    });

    it('keeps the plain file name when the binding has no range', () => {
      expect(store.fileNameFor('security', range({ rangeBaseCommit: undefined, headCommit: undefined }))).toBe(`jev-review-security-${SHA2.slice(0, 12)}.json`);
    });

    it('stores exactly the five binding fields and reads the sidecar back', async () => {
      const result = await store.write(root, feature, reviewSidecar(range()));
      expect(result).toEqual({ persisted: true, path: `.spec/specs/demo/review/jev-review-security-range-${SHA2.slice(0, 12)}.json` });
      const stored = JSON.parse(await readFile(path.join(reviewDir(), `jev-review-security-range-${SHA2.slice(0, 12)}.json`), 'utf8'));
      expect(stored.binding).toEqual(range());
      expect(Object.keys(stored.binding).sort()).toEqual(['diffSha256', 'headCommit', 'inputSha256', 'questionSetVersion', 'rangeBaseCommit']);
      expect((await readRange(range()))?.binding).toEqual(range());
    });

    it.each([
      ['headCommit', { headCommit: '3'.repeat(40) }],
      ['rangeBaseCommit', { rangeBaseCommit: '4'.repeat(40) }],
      ['inputSha256', { inputSha256: 'c'.repeat(64) }],
      ['questionSetVersion', { questionSetVersion: 4 }],
    ])('ignores a range sidecar when %s differs', async (_name, change) => {
      await store.write(root, feature, reviewSidecar(range()));
      const current = range(change);
      expect(await readRange(current)).toBeUndefined();
      await writeFile(path.join(reviewDir(), store.fileNameFor('security', current)), JSON.stringify(reviewSidecar(range())), 'utf8');
      expect(await readRange(current)).toBeUndefined();
    });

    it('treats a different diff hash as a different file, so the old range sidecar is never matched', async () => {
      await store.write(root, feature, reviewSidecar(range()));
      expect(await readRange(range({ diffSha256: 'd'.repeat(64) }))).toBeUndefined();
    });

    it('does not match a plain sidecar to a range binding or the reverse', async () => {
      const plain = range({ rangeBaseCommit: undefined, headCommit: undefined });
      await store.write(root, feature, reviewSidecar(plain));
      expect(await readRange(range())).toBeUndefined();
      await store.write(root, feature, reviewSidecar(range()));
      expect((await store.readMatching(root, feature, 'security', plain))?.binding).toEqual(plain);
    });

    it('does not replace an answered range sidecar with an unavailable one', async () => {
      await store.write(root, feature, reviewSidecar(range()));
      const result = await store.write(root, feature, reviewSidecar(range(), { status: 'unavailable', reason: 'timeout', answers: undefined }));
      expect(result).toEqual({ persisted: false });
      expect((await readRange(range()))?.status).toBe('answered');
    });

    it('persists a code-disabled range sidecar when nothing was answered before', async () => {
      const result = await store.write(root, feature, reviewSidecar(range(), { status: 'unavailable', reason: 'code-disabled', answers: undefined }));
      expect(result.persisted).toBe(true);
    });

    it('leaves a plain review sidecar byte-compatible: no range keys are written', async () => {
      const plain = range({ rangeBaseCommit: undefined, headCommit: undefined });
      await store.write(root, feature, reviewSidecar(plain));
      const text = await readFile(path.join(reviewDir(), `jev-review-security-${SHA2.slice(0, 12)}.json`), 'utf8');
      expect(text).not.toContain('rangeBaseCommit');
      expect(text).not.toContain('headCommit');
    });
  });

  describe('containment and failures', () => {
    it('refuses to persist through a review symlink that points outside .spec', async () => {
      const outside = await mkdtemp(path.join(os.tmpdir(), 'jev-outside-'));
      try {
        await symlink(outside, reviewDir());
        const result = await store.write(root, feature, sidecar());
        expect(result.persisted).toBe(false);
        expect(await readdir(outside)).toEqual([]);
        expect(await store.readMatching(root, feature, 'requirements', binding())).toBeUndefined();
      } finally {
        await rm(outside, { recursive: true, force: true });
      }
    });

    it('returns persisted false instead of throwing when the review path cannot be created', async () => {
      await writeFile(reviewDir(), 'a file, not a directory', 'utf8');
      await expect(store.write(root, feature, sidecar())).resolves.toEqual({ persisted: false });
      expect(logger.warn).toHaveBeenCalled();
      const logged = JSON.stringify((logger.warn as jest.Mock).mock.calls);
      expect(logged).not.toContain(root);
    });
  });
});
