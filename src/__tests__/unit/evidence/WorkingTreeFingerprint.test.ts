import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { GitPort, GitResult } from '../../../domain/ports';
import type { TreeBinding } from '../../../domain/types';
import { NodeGitAdapter } from '../../../infrastructure/adapters/NodeGitAdapter';
import { changedPaths, observeTree } from '../../../application/services/WorkingTreeFingerprint';

type Bound = Extract<TreeBinding, { status: 'bound' }>;

let repo: string;
const adapter = new NodeGitAdapter();
const git = (...args: string[]): string =>
  execFileSync('git', args, { cwd: repo, encoding: 'utf8', env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' } });
const write = (file: string, content: string): void => {
  fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
  fs.writeFileSync(path.join(repo, file), content);
};
const bound = async (root = repo): Promise<Bound> => {
  const tree = await observeTree(adapter, root);
  if (tree.status !== 'bound') throw new Error(`tree was ${JSON.stringify(tree)}`);
  return tree;
};
const commit = (message: string): void => {
  git('add', '-A');
  git('commit', '-q', '-m', message);
};

beforeEach(() => {
  repo = fs.mkdtempSync(path.join(os.tmpdir(), 'tree-fingerprint-'));
  git('init', '-q');
  git('config', 'user.email', 't@example.com');
  git('config', 'user.name', 'T');
  git('config', 'commit.gpgsign', 'false');
  write('src/a.ts', 'export const a = 1;\n');
  write('src/b.ts', 'export const b = 1;\n');
  write('.gitignore', 'ignored/\n');
  commit('base');
});
afterEach(() => {
  fs.rmSync(repo, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

describe('observeTree', () => {
  it('gives an equal hash before and after committing identical content', async () => {
    write('src/a.ts', 'export const a = 2;\n');
    const dirty = await bound();
    commit('edit');
    const clean = await bound();
    expect(clean.sha256).toBe(dirty.sha256);
    expect(clean.head).not.toBe(dirty.head);
    expect(clean.dirty).toEqual([]);
  });

  it.each<[string, () => void]>([
    ['an edit', () => write('src/a.ts', 'export const a = 3;\n')],
    ['an added file', () => write('src/c.ts', 'export const c = 1;\n')],
    ['a deleted file', () => fs.rmSync(path.join(repo, 'src/b.ts'))],
    ['a mode-only change', () => fs.chmodSync(path.join(repo, 'src/a.ts'), 0o755)],
    ['a tracked file replaced by an empty directory', () => {
      fs.rmSync(path.join(repo, 'src/b.ts'));
      fs.mkdirSync(path.join(repo, 'src/b.ts'));
    }],
  ])('changes the hash on %s', async (...[, change]) => {
    const before = await bound();
    change();
    expect((await bound()).sha256).not.toBe(before.sha256);
  });

  it('ignores edits under .spec/specs and ignored files', async () => {
    const before = await bound();
    write('.spec/specs/feature/spec.json', '{"x":1}\n');
    write('ignored/cache.bin', 'cache');
    expect((await bound()).sha256).toBe(before.sha256);
  });

  it('records dirty entries with git tokens and deleted markers', async () => {
    write('src/a.ts', 'export const a = 4;\n');
    fs.rmSync(path.join(repo, 'src/b.ts'));
    const tree = await bound();
    expect(tree.dirtyTruncated).toBe(false);
    expect(tree.dirty).toEqual([
      { path: 'src/a.ts', token: git('hash-object', 'src/a.ts').trim() },
      { path: 'src/b.ts', token: 'deleted' },
    ]);
  });

  it('uses project-relative paths when the project is a repository subdirectory', async () => {
    write('packages/app/src/x.ts', 'export const x = 1;\n');
    write('other/y.ts', 'export const y = 1;\n');
    commit('nested');
    const project = path.join(repo, 'packages/app');
    const before = await bound(project);
    expect(before.prefix).toBe('packages/app/');
    write('other/y.ts', 'export const y = 2;\n');
    expect((await bound(project)).sha256).toBe(before.sha256);
    write('packages/app/src/x.ts', 'export const x = 2;\n');
    const after = await bound(project);
    expect(after.dirty).toEqual([{ path: 'src/x.ts', token: expect.stringMatching(/^[0-9a-f]{40}$/) }]);
  });

  it('works in a repository with no commit yet', async () => {
    const fresh = fs.mkdtempSync(path.join(os.tmpdir(), 'tree-unborn-'));
    try {
      execFileSync('git', ['init', '-q'], { cwd: fresh });
      fs.writeFileSync(path.join(fresh, 'a.txt'), 'a');
      const tree = await observeTree(adapter, fresh);
      expect(tree).toMatchObject({ status: 'bound', head: null });
    } finally {
      fs.rmSync(fresh, { recursive: true, force: true });
    }
  });

  it('marks more than 200 dirty entries as truncated and more than 2000 as too many changes', async () => {
    for (let index = 0; index < 201; index += 1) write(`many/f${index}.txt`, String(index));
    const truncated = await bound();
    expect(truncated.dirtyTruncated).toBe(true);
    expect(truncated.dirty).toEqual([]);
    for (let index = 201; index < 2001; index += 1) write(`many/f${index}.txt`, String(index));
    expect(await observeTree(adapter, repo)).toEqual({ status: 'unavailable', reason: 'too-many-changes' });
  }, 60_000);

  it.each<[string, GitPort | undefined, string]>([
    ['a missing git port', undefined, 'git-unavailable'],
    ['a failing git port', { run: async (): Promise<GitResult> => ({ ok: false }) }, 'not-a-git-repo'],
  ])('reports %s as unavailable', async (...[, port, reason]) => {
    expect(await observeTree(port, repo)).toEqual({ status: 'unavailable', reason });
  });

  it('reports git-failed when git fails after the repository is found', async () => {
    const failing: GitPort = {
      run: (args, cwd, input) => (args[0] === 'ls-tree' ? Promise.resolve({ ok: false }) : adapter.run(args, cwd, input)),
    };
    expect(await observeTree(failing, repo)).toEqual({ status: 'unavailable', reason: 'git-failed' });
  });

  it('reports a non-repository directory as not-a-git-repo', async () => {
    const plain = fs.mkdtempSync(path.join(os.tmpdir(), 'tree-plain-'));
    try {
      expect(await observeTree(adapter, plain)).toEqual({ status: 'unavailable', reason: 'not-a-git-repo' });
    } finally {
      fs.rmSync(plain, { recursive: true, force: true });
    }
  });

  it('reports timeout within the deadline when git never answers', async () => {
    const hanging: GitPort = { run: () => new Promise<GitResult>(() => undefined) };
    const started = Date.now();
    expect(await observeTree(hanging, repo, 50)).toEqual({ status: 'unavailable', reason: 'timeout' });
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it('observes this repository within 2 s', async () => {
    const started = Date.now();
    const tree = await observeTree(adapter, process.cwd());
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(tree.status).toBe('bound');
  });
});

describe('changedPaths', () => {
  it('lists edited, added, and deleted paths, including content committed after the first reading', async () => {
    const from = await bound();
    write('src/a.ts', 'export const a = 5;\n');
    commit('mid-task');
    write('src/c.ts', 'export const c = 1;\n');
    fs.rmSync(path.join(repo, 'src/b.ts'));
    expect(await changedPaths(adapter, repo, from)).toEqual({ status: 'ok', paths: ['src/a.ts', 'src/b.ts', 'src/c.ts'] });
  });

  it('reports a mode-only change, and nothing once it is committed', async () => {
    const from = await bound();
    fs.chmodSync(path.join(repo, 'src/a.ts'), 0o755);
    expect(await changedPaths(adapter, repo, from)).toEqual({ status: 'ok', paths: ['src/a.ts'] });
    const dirty = await bound();
    commit('chmod');
    expect(await changedPaths(adapter, repo, dirty)).toEqual({ status: 'ok', paths: [] });
    expect((await bound()).sha256).toBe(dirty.sha256);
  });

  it('reports a file replaced by a directory, and nothing once it is committed', async () => {
    const from = await bound();
    fs.rmSync(path.join(repo, 'src/b.ts'));
    write('src/b.ts/inner.ts', 'export const inner = 1;\n');
    expect(await changedPaths(adapter, repo, from)).toEqual({ status: 'ok', paths: ['src/b.ts', 'src/b.ts/inner.ts'] });
    const dirty = await bound();
    commit('file to directory');
    expect(await changedPaths(adapter, repo, dirty)).toEqual({ status: 'ok', paths: [] });
    expect((await bound()).sha256).toBe(dirty.sha256);
  });

  it('reports no paths when nothing changed', async () => {
    const from = await bound();
    expect(await changedPaths(adapter, repo, from)).toEqual({ status: 'ok', paths: [] });
  });

  it('is unavailable for a truncated binding', async () => {
    const from = await bound();
    expect(await changedPaths(adapter, repo, { ...from, dirty: [], dirtyTruncated: true })).toEqual({ status: 'unavailable' });
  });

  it('is unavailable when the old HEAD no longer exists', async () => {
    const from = await bound();
    write('src/a.ts', 'export const a = 6;\n');
    expect(await changedPaths(adapter, repo, { ...from, head: 'f'.repeat(40) })).toEqual({ status: 'unavailable' });
  });
});
