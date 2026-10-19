import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { MAX_EXCERPT_BYTES, buildExcerpts, isExcludedPath } from '../../../application/services/JevCodeExcerpts';

const sha = (text: string): string => createHash('sha256').update(text).digest('hex');
const numbered = (count: number, width = 0): string =>
  Array.from({ length: count }, (_, index) => `line ${index + 1}${'x'.repeat(width)}`).join('\n');

describe('code excerpts', () => {
  let root: string;
  const put = async (relative: string, content: string): Promise<void> => {
    await mkdir(path.dirname(path.join(root, relative)), { recursive: true });
    await writeFile(path.join(root, relative), content, 'utf8');
  };
  const one = async (relative: string, line: number) => (await buildExcerpts(root, [{ id: 'F1', path: relative, line }])).items[0]!;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'jev-excerpt-'));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  describe('line window', () => {
    it('returns lines 85-115 for a finding at line 100 of a 300-line file', async () => {
      await put('src/a.ts', numbered(300));
      const item = await one('src/a.ts', 100);
      const lines = item.excerpt!.split('\n');
      expect(lines[0]).toBe('line 85');
      expect(lines[lines.length - 1]).toBe('line 115');
      expect(lines).toHaveLength(31);
    });

    it('starts at line 1 for a finding at line 3', async () => {
      await put('src/a.ts', numbered(300));
      const lines = (await one('src/a.ts', 3)).excerpt!.split('\n');
      expect(lines[0]).toBe('line 1');
      expect(lines[lines.length - 1]).toBe('line 18');
    });

    it('stops at the last line near the end of the file', async () => {
      await put('src/a.ts', numbered(300));
      const lines = (await one('src/a.ts', 298)).excerpt!.split('\n');
      expect(lines[0]).toBe('line 283');
      expect(lines[lines.length - 1]).toBe('line 300');
    });

    it('handles CRLF files and a line beyond the end of the file', async () => {
      await put('src/crlf.ts', 'one\r\ntwo\r\nthree');
      expect((await one('src/crlf.ts', 2)).excerpt).toBe('one\ntwo\nthree');
      expect((await one('src/crlf.ts', 99)).excerpt).toBeNull();
    });
  });

  describe('byte budget', () => {
    it('drops the overflowing finding and every later one as whole items', async () => {
      await put('src/big.ts', numbered(200, 90));
      const requests = [
        { id: 'F1', path: 'src/big.ts', line: 20 },
        { id: 'F2', path: 'src/big.ts', line: 60 },
        { id: 'F3', path: 'src/big.ts', line: 100 },
        { id: 'F4', path: 'src/big.ts', line: 3 },
      ];
      const batch = await buildExcerpts(root, requests);
      expect(batch.items.map((item) => item.excerpt !== null)).toEqual([true, true, false, false]);
      expect(batch.droppedFindingIds).toEqual(['F3', 'F4']);
      const total = batch.items.reduce((sum, item) => sum + Buffer.byteLength(item.excerpt ?? '', 'utf8'), 0);
      expect(total).toBeLessThanOrEqual(MAX_EXCERPT_BYTES);
    });

    it('does not list excluded or missing files as dropped', async () => {
      await put('.env', 'A=1');
      const batch = await buildExcerpts(root, [{ id: 'F1', path: '.env', line: 1 }, { id: 'F2', path: 'src/missing.ts', line: 1 }]);
      expect(batch.droppedFindingIds).toEqual([]);
    });
  });

  describe('exclusions', () => {
    const excluded = [
      '.env', '.env.local', 'config/.env.production', 'cert.pem', 'server.key', 'a.p12', 'a.pfx', 'a.crt',
      'id_rsa', 'id_ed25519.pub', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb', 'Cargo.lock',
      'poetry.lock', 'Gemfile.lock', 'go.sum', 'dist/x.js', 'build/x.js', 'node_modules/x.js', 'pkg/dist/x.js',
      'x.min.js', '.claude/x.md', '.agents/x.md', '.codex/x.md', '.omp/x.md', 'CERT.PEM',
    ];

    it.each(excluded)('yields no excerpt for %s even though the file exists', async (relative) => {
      expect(isExcludedPath(relative)).toBe(true);
      await put(relative, 'secret = 1\nline 2\n');
      const item = await one(relative, 1);
      expect(item).toMatchObject({ excerpt: null, excerptSha256: null });
    });

    it.each(['src/index.ts', 'src/environment.ts', 'src/builder/index.ts', 'docs/keys.md', 'lib/mini.js'])('keeps %s', (relative) => {
      expect(isExcludedPath(relative)).toBe(false);
    });
  });

  describe('unsafe or unreadable files', () => {
    it('gives no excerpt for a symlink to a file outside the project', async () => {
      const outside = await mkdtemp(path.join(os.tmpdir(), 'jev-outside-'));
      try {
        await writeFile(path.join(outside, 'secret.ts'), 'outside = 1\n');
        await mkdir(path.join(root, 'src'), { recursive: true });
        await symlink(path.join(outside, 'secret.ts'), path.join(root, 'src', 'link.ts'));
        expect((await one('src/link.ts', 1)).excerpt).toBeNull();
      } finally {
        await rm(outside, { recursive: true, force: true });
      }
    });

    it('gives no excerpt for a file over 1 MiB, a file with NUL bytes, or a missing file', async () => {
      await put('src/huge.ts', 'x\n'.repeat(600_000));
      await put('src/bin.ts', 'abc\u0000def\n');
      expect((await one('src/huge.ts', 1)).excerpt).toBeNull();
      expect((await one('src/bin.ts', 1)).excerpt).toBeNull();
      expect((await one('src/missing.ts', 1)).excerpt).toBeNull();
    });

    it.each(['../outside.ts', '/etc/passwd', 'src/../../x.ts', 'a\u0000b.ts', 'C:\\x.ts'])('gives no excerpt for the path %p', async (relative) => {
      expect((await one(relative, 1)).excerpt).toBeNull();
    });
  });

  describe('redaction', () => {
    it('redacts secrets in an excerpt and hashes the redacted text', async () => {
      await put('src/cfg.ts', 'const a = 1;\nconst apiKey = "sk_live_123456789";\nconst b = 2;\n');
      const batch = await buildExcerpts(root, [{ id: 'F1', path: 'src/cfg.ts', line: 2 }]);
      const item = batch.items[0]!;
      expect(item.excerpt).not.toContain('sk_live_123456789');
      expect(item.excerpt).toContain('[REDACTED]');
      expect(item.excerptSha256).toBe(sha(item.excerpt!));
      expect(item.redactions).toBe(1);
      expect(batch.redactions).toBe(1);
    });
  });
});
