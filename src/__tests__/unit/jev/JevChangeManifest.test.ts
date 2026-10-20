import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { GitPort } from '../../../domain/ports';
import { NodeGitAdapter } from '../../../infrastructure/adapters/NodeGitAdapter';
import { buildReviewManifest, buildStagedManifest } from '../../../application/services/JevChangeManifest';

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
