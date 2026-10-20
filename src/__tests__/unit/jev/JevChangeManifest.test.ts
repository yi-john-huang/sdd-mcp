import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { GitPort } from '../../../domain/ports';
import { NodeGitAdapter } from '../../../infrastructure/adapters/NodeGitAdapter';
import { buildRangeManifest, buildReviewManifest, buildStagedManifest } from '../../../application/services/JevChangeManifest';

let repo: string;
const git = (...args: string[]): string =>
  execFileSync('git', args, { cwd: repo, encoding: 'utf8', env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' } });
const write = (file: string, content: string): void => {
  fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
  fs.writeFileSync(path.join(repo, file), content);
};
const hashOf = async (kind: 'review' | 'staged'): Promise<string> => {
  const manifest = await (kind === 'review' ? buildReviewManifest : buildStagedManifest)(new NodeGitAdapter(), repo);
  if (manifest.status !== 'ok') throw new Error(`manifest was ${manifest.status}`);
  return manifest.diffSha256;
};
const countObjects = (): number => {
  let total = 0;
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(path.join(dir, entry.name));
      else total += 1;
    }
  };
  walk(path.join(repo, '.git', 'objects'));
  return total;
};

beforeEach(() => {
  repo = fs.mkdtempSync(path.join(os.tmpdir(), 'jev-manifest-'));
  git('init', '-q');
  git('config', 'user.email', 't@example.com');
  git('config', 'user.name', 'T');
  git('config', 'commit.gpgsign', 'false');
});
afterEach(() => {
  fs.rmSync(repo, { recursive: true, force: true });
});

const commitBase = (): void => {
  write('src/a.ts', 'export const a = 1;\n');
  write('src/old.ts', 'export const old = 1;\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'base');
};

describe('change manifest', () => {
  it('hashes review changes and staged changes identically, including new untracked files', async () => {
    commitBase();
    write('src/a.ts', 'export const a = 2;\n');
    write('src/new.ts', 'export const added = true;\n');
    const review = await hashOf('review');
    git('add', '-A');
    expect(await hashOf('staged')).toBe(review);
  });

  it('differs after one more edit or a partial stage', async () => {
    commitBase();
    write('src/a.ts', 'export const a = 2;\n');
    write('src/new.ts', 'export const added = true;\n');
    const review = await hashOf('review');
    git('add', 'src/a.ts');
    expect(await hashOf('staged')).not.toBe(review);
    git('add', '-A');
    write('src/new.ts', 'export const added = false;\n');
    git('add', '-A');
    expect(await hashOf('staged')).not.toBe(review);
  });

  it('represents a deleted file as deleted in both manifests', async () => {
    commitBase();
    fs.rmSync(path.join(repo, 'src/old.ts'));
    write('src/a.ts', 'export const a = 3;\n');
    const review = await buildReviewManifest(new NodeGitAdapter(), repo);
    git('add', '-A');
    const staged = await buildStagedManifest(new NodeGitAdapter(), repo);
    if (review.status !== 'ok' || staged.status !== 'ok') throw new Error('expected ok manifests');
    expect(review.entries).toContainEqual({ path: 'src/old.ts', token: 'deleted' });
    expect(staged.entries).toContainEqual({ path: 'src/old.ts', token: 'deleted' });
    expect(staged.diffSha256).toBe(review.diffSha256);
  });

  it('does not write to the index or the object store', async () => {
    commitBase();
    write('src/a.ts', 'export const a = 2;\n');
    write('src/new.ts', 'export const added = true;\n');
    const indexBefore = fs.statSync(path.join(repo, '.git', 'index')).mtimeMs;
    const objectsBefore = countObjects();
    await hashOf('review');
    expect(fs.statSync(path.join(repo, '.git', 'index')).mtimeMs).toBe(indexBefore);
    expect(countObjects()).toBe(objectsBefore);
    git('add', '-A');
    const indexStaged = fs.statSync(path.join(repo, '.git', 'index')).mtimeMs;
    const objectsStaged = countObjects();
    await hashOf('staged');
    await hashOf('review');
    expect(fs.statSync(path.join(repo, '.git', 'index')).mtimeMs).toBe(indexStaged);
    expect(countObjects()).toBe(objectsStaged);
  });

  it('reports unavailable without throwing when git fails or throws', async () => {
    const failing: GitPort = { run: async () => ({ ok: false }) };
    const throwing: GitPort = { run: async () => { throw new Error('boom'); } };
    for (const port of [failing, throwing]) {
      await expect(buildReviewManifest(port, repo)).resolves.toEqual({ status: 'unavailable' });
      await expect(buildStagedManifest(port, repo)).resolves.toEqual({ status: 'unavailable' });
    }
  });

  it('reports empty when nothing changed or staged', async () => {
    commitBase();
    await expect(buildReviewManifest(new NodeGitAdapter(), repo)).resolves.toEqual({ status: 'empty' });
    await expect(buildStagedManifest(new NodeGitAdapter(), repo)).resolves.toEqual({ status: 'empty' });
  });

  it('uses a null base commit in a repository without commits', async () => {
    write('src/a.ts', 'export const a = 1;\n');
    const manifest = await buildReviewManifest(new NodeGitAdapter(), repo);
    expect(manifest).toMatchObject({ status: 'ok', baseCommit: null });
  });

  it('records the HEAD commit as the base commit', async () => {
    commitBase();
    write('src/a.ts', 'export const a = 2;\n');
    const manifest = await buildReviewManifest(new NodeGitAdapter(), repo);
    expect(manifest).toMatchObject({ status: 'ok', baseCommit: git('rev-parse', 'HEAD').trim() });
  });

  it('hashes a changed symlink by its link text, equal to the staged 120000 blob', async () => {
    commitBase();
    fs.symlinkSync('a.ts', path.join(repo, 'src/link.ts'));
    git('add', '-A');
    git('commit', '-q', '-m', 'link');
    fs.rmSync(path.join(repo, 'src/link.ts'));
    fs.symlinkSync('old.ts', path.join(repo, 'src/link.ts'));
    fs.symlinkSync('../src', path.join(repo, 'dirlink'));
    const review = await hashOf('review');
    git('add', '-A');
    expect(await hashOf('staged')).toBe(review);
  });

  it('keeps the manifest available for a dangling symlink', async () => {
    commitBase();
    fs.symlinkSync('missing.ts', path.join(repo, 'src/dangling.ts'));
    const review = await hashOf('review');
    git('add', '-A');
    expect(await hashOf('staged')).toBe(review);
  });

  it('records an embedded repository by its HEAD commit, as git add stores the gitlink', async () => {
    commitBase();
    const nested = path.join(repo, 'vendor/nested');
    fs.mkdirSync(nested, { recursive: true });
    const nestedGit = (...args: string[]): string => execFileSync('git', args, { cwd: nested, encoding: 'utf8' });
    nestedGit('init', '-q');
    fs.writeFileSync(path.join(nested, 'x.txt'), 'x\n');
    nestedGit('add', '-A');
    nestedGit('-c', 'user.email=t@example.com', '-c', 'user.name=T', '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'n');
    write('src/a.ts', 'export const a = 2;\n');
    const review = await buildReviewManifest(new NodeGitAdapter(), repo);
    if (review.status !== 'ok') throw new Error(`manifest was ${review.status}`);
    expect(review.entries).toContainEqual({ path: 'vendor/nested', token: nestedGit('rev-parse', 'HEAD').trim() });
    git('add', '-A');
    expect(await hashOf('staged')).toBe(review.diffSha256);
  });

  it('skips a directory entry that cannot be staged instead of failing the manifest', async () => {
    commitBase();
    fs.mkdirSync(path.join(repo, 'empty-repo'));
    execFileSync('git', ['init', '-q'], { cwd: path.join(repo, 'empty-repo') });
    write('src/a.ts', 'export const a = 2;\n');
    const review = await buildReviewManifest(new NodeGitAdapter(), repo);
    if (review.status !== 'ok') throw new Error(`manifest was ${review.status}`);
    expect(review.entries.map((entry) => entry.path)).toEqual(['src/a.ts']);
  });

  it('ignores JEV sidecar directories so writing a sidecar cannot change the hash', async () => {
    commitBase();
    write('src/a.ts', 'export const a = 2;\n');
    const before = await hashOf('review');
    write('.spec/reviews/jev-review-security-abc.json', '{}');
    write('.spec/specs/demo/review/jev-review-principles-abc.json', '{}');
    expect(await hashOf('review')).toBe(before);
  });
});

describe('committed-range manifest', () => {
  const rangeOf = (baseRef: string, port: GitPort = new NodeGitAdapter()) => buildRangeManifest(port, repo, baseRef);
  const okRange = async (baseRef: string): Promise<Extract<Awaited<ReturnType<typeof rangeOf>>, { status: 'ok' }>> => {
    const manifest = await rangeOf(baseRef);
    if (manifest.status !== 'ok') throw new Error(`manifest was ${manifest.status}`);
    return manifest;
  };
  const head = (): string => git('rev-parse', 'HEAD').trim();
  const commitAll = (message: string): void => {
    git('add', '-A');
    git('commit', '-q', '-m', message);
  };
  /** A base commit, then one committed feature change on top, with a clean working tree. */
  const withCommittedChange = (): string => {
    commitBase();
    const base = head();
    write('src/a.ts', 'export const a = 2;\n');
    commitAll('feature');
    return base;
  };

  it('lists a committed change when the working tree is clean', async () => {
    const base = withCommittedChange();
    const manifest = await okRange(base);
    expect(manifest.entries.map((entry) => entry.path)).toEqual(['src/a.ts']);
    expect(manifest.entries[0]!.token).toBe(git('rev-parse', 'HEAD:src/a.ts').trim());
    expect(manifest.baseCommit).toBe(head());
    expect(manifest.range).toEqual({ rangeBaseCommit: base, headCommit: head() });
    expect(manifest.diffSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('adds uncommitted, staged, and untracked paths and changes the hash', async () => {
    const base = withCommittedChange();
    const committedOnly = await okRange(base);
    write('src/old.ts', 'export const old = 2;\n');
    write('src/staged.ts', 'export const staged = 1;\n');
    git('add', 'src/staged.ts');
    write('src/untracked.ts', 'export const untracked = 1;\n');
    const manifest = await okRange(base);
    expect(manifest.entries.map((entry) => entry.path)).toEqual(['src/a.ts', 'src/old.ts', 'src/staged.ts', 'src/untracked.ts']);
    expect(manifest.diffSha256).not.toBe(committedOnly.diffSha256);
  });

  it('changes the hash when a committed file is edited again, and when HEAD moves', async () => {
    const base = withCommittedChange();
    const first = await okRange(base);
    write('src/a.ts', 'export const a = 3;\n');
    const edited = await okRange(base);
    expect(edited.diffSha256).not.toBe(first.diffSha256);
    commitAll('more');
    const recommitted = await okRange(base);
    expect(recommitted.diffSha256).toBe(edited.diffSha256);
    expect(recommitted.range?.headCommit).not.toBe(first.range?.headCommit);
  });

  it('reports empty when the base is HEAD and the tree is clean', async () => {
    commitBase();
    await expect(rangeOf('HEAD')).resolves.toEqual({ status: 'empty' });
  });

  it('equals the review manifest hash when the base is HEAD', async () => {
    commitBase();
    write('src/a.ts', 'export const a = 2;\n');
    write('src/new.ts', 'export const added = true;\n');
    fs.rmSync(path.join(repo, 'src/old.ts'));
    const range = await okRange('HEAD');
    expect(range.diffSha256).toBe(await hashOf('review'));
  });

  it('marks a file deleted in a commit, and one deleted in the working tree, as deleted', async () => {
    commitBase();
    const base = head();
    write('src/extra.ts', 'export const extra = 1;\n');
    commitAll('extra');
    const extraBase = head();
    fs.rmSync(path.join(repo, 'src/old.ts'));
    commitAll('remove old');
    fs.rmSync(path.join(repo, 'src/extra.ts'));
    const manifest = await okRange(base);
    expect(manifest.entries).toContainEqual({ path: 'src/old.ts', token: 'deleted' });
    expect(manifest.entries.find((entry) => entry.path === 'src/extra.ts')).toBeUndefined();
    const fromExtra = await okRange(extraBase);
    expect(fromExtra.entries).toEqual(expect.arrayContaining([{ path: 'src/old.ts', token: 'deleted' }, { path: 'src/extra.ts', token: 'deleted' }]));
  });

  it('keeps a file that was replaced by a directory as deleted', async () => {
    commitBase();
    const base = head();
    fs.rmSync(path.join(repo, 'src/old.ts'));
    write('src/old.ts/inner.ts', 'export const inner = 1;\n');
    commitAll('file to directory');
    const manifest = await okRange(base);
    expect(manifest.entries).toEqual(expect.arrayContaining([
      { path: 'src/old.ts', token: 'deleted' },
      { path: 'src/old.ts/inner.ts', token: git('rev-parse', 'HEAD:src/old.ts/inner.ts').trim() },
    ]));
  });

  it('hashes a committed symlink by its link text', async () => {
    commitBase();
    const base = head();
    fs.symlinkSync('a.ts', path.join(repo, 'src/link.ts'));
    commitAll('link');
    const manifest = await okRange(base);
    expect(manifest.entries).toContainEqual({ path: 'src/link.ts', token: git('rev-parse', 'HEAD:src/link.ts').trim() });
  });

  it('records an embedded repository committed on the branch by its HEAD commit', async () => {
    commitBase();
    const base = head();
    const nested = path.join(repo, 'vendor/nested');
    fs.mkdirSync(nested, { recursive: true });
    const nestedGit = (...args: string[]): string => execFileSync('git', args, { cwd: nested, encoding: 'utf8' });
    nestedGit('init', '-q');
    fs.writeFileSync(path.join(nested, 'x.txt'), 'x\n');
    nestedGit('add', '-A');
    nestedGit('-c', 'user.email=t@example.com', '-c', 'user.name=T', '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'n');
    commitAll('embed');
    const manifest = await okRange(base);
    expect(manifest.entries).toContainEqual({ path: 'vendor/nested', token: nestedGit('rev-parse', 'HEAD').trim() });
  });

  it('ignores JEV sidecar paths, committed or not', async () => {
    commitBase();
    const base = head();
    write('src/a.ts', 'export const a = 2;\n');
    commitAll('feature');
    const before = await okRange(base);
    write('.spec/reviews/jev-review-security-range-abc.json', '{}');
    write('.spec/specs/demo/review/jev-review-principles-range-abc.json', '{}');
    commitAll('sidecars');
    write('.spec/specs/demo/review/jev-review-security-range-def.json', '{}');
    expect((await okRange(base)).diffSha256).toBe(before.diffSha256);
  });

  it('is unavailable above 2000 changed paths', async () => {
    commitBase();
    const base = head();
    for (let index = 0; index < 2001; index += 1) write(`bulk/f${index}.txt`, `${index}\n`);
    commitAll('bulk');
    await expect(rangeOf(base)).resolves.toEqual({ status: 'unavailable' });
  });

  it.each([
    ['a missing ref', 'origin/ghost'],
    ['an option-looking ref', '--output=injected'],
  ])('reports invalid-base-ref for %s and leaves the repository untouched', async (_name, baseRef) => {
    commitBase();
    const before = fs.readdirSync(repo).sort();
    await expect(rangeOf(baseRef)).resolves.toEqual({ status: 'invalid-base-ref' });
    expect(fs.readdirSync(repo).sort()).toEqual(before);
  });

  it('reports unavailable without throwing when git fails after the range resolved', async () => {
    const base = withCommittedChange();
    const real = new NodeGitAdapter();
    const failDiff: GitPort = { run: (args, cwd, input) => (args[0] === 'diff' ? Promise.resolve({ ok: false }) : real.run(args, cwd, input)) };
    const throwing: GitPort = { run: (args, cwd, input) => (args[0] === 'diff' ? Promise.reject(new Error('boom')) : real.run(args, cwd, input)) };
    for (const port of [failDiff, throwing]) await expect(rangeOf(base, port)).resolves.toEqual({ status: 'unavailable' });
  });

  it('adds at most four git invocations over the review manifest and runs only read-only commands', async () => {
    const base = withCommittedChange();
    write('src/new.ts', 'export const added = true;\n');
    const count = async (build: (port: GitPort) => Promise<unknown>): Promise<string[][]> => {
      const calls: string[][] = [];
      const real = new NodeGitAdapter();
      await build({ run: (args, cwd, input) => { calls.push([...args]); return real.run(args, cwd, input); } });
      return calls;
    };
    const review = await count((port) => buildReviewManifest(port, repo));
    const range = await count((port) => buildRangeManifest(port, repo, base));
    expect(range.length - review.length).toBeLessThanOrEqual(4);
    const allowed = ['rev-parse', 'merge-base', 'diff', 'status', 'ls-files', 'ls-tree', 'hash-object'];
    for (const call of range) {
      const command = call[0] === '-c' ? call[2]! : call[0]!;
      expect(allowed).toContain(command);
      expect(call.join(' ')).not.toMatch(/--output|--stdin-paths|\s-w(\s|$)|--write/);
    }
  });

  it('does not write to the index or the object store', async () => {
    const base = withCommittedChange();
    write('src/new.ts', 'export const added = true;\n');
    const indexBefore = fs.statSync(path.join(repo, '.git', 'index')).mtimeMs;
    const objectsBefore = countObjects();
    await okRange(base);
    expect(fs.statSync(path.join(repo, '.git', 'index')).mtimeMs).toBe(indexBefore);
    expect(countObjects()).toBe(objectsBefore);
  });
});
