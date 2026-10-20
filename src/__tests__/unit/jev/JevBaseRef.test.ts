import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { GitPort, GitResult } from '../../../domain/ports';
import { NodeGitAdapter } from '../../../infrastructure/adapters/NodeGitAdapter';
import { isWellFormedBaseRef, MAX_BASE_REF_LENGTH, resolveRange } from '../../../application/services/JevBaseRef';
import { FakeGitPort } from './helpers';

describe('isWellFormedBaseRef', () => {
  it.each([
    ['origin/develop'],
    ['feature/jev-advisory-toggle'],
    ['a'.repeat(40)],
    ['HEAD~2'],
    ['v5.4.0'],
    ['refs/remotes/origin/master'],
    ['a'.repeat(MAX_BASE_REF_LENGTH)],
  ])('accepts %s', (ref) => {
    expect(isWellFormedBaseRef(ref)).toBe(true);
  });

  it.each([
    ['an empty string', ''],
    ['a leading dash', '-main'],
    ['an option-looking value', '--output=x'],
    ['a single dash', '-'],
    ['a space', 'origin/develop branch'],
    ['a leading space', ' origin/develop'],
    ['a trailing space', 'origin/develop '],
    ['a tab', 'origin/\tdevelop'],
    ['a newline', 'origin/develop\n--output=x'],
    ['a carriage return', 'origin/develop\r'],
    ['a NUL character', 'origin/dev\u0000elop'],
    ['a unit separator', 'origin/dev\u001Felop'],
    ['a DEL character', 'origin/dev\u007Felop'],
    ['a non-breaking space', 'origin/dev elop'],
    ['a value one character too long', 'a'.repeat(MAX_BASE_REF_LENGTH + 1)],
  ])('rejects %s', (_name, ref) => {
    expect(isWellFormedBaseRef(ref)).toBe(false);
  });

  it('allows a dash that is not the first character', () => {
    expect(isWellFormedBaseRef('release-1.0')).toBe(true);
  });
});

describe('resolveRange', () => {
  const BASE = 'b'.repeat(40);
  const HEAD = 'c'.repeat(40);
  const MERGE = 'd'.repeat(40);
  const out = (text: string): GitResult => ({ ok: true, stdout: Buffer.from(`${text}\n`) });

  describe('with a scripted GitPort', () => {
    const scripted = (overrides: Partial<Record<'base' | 'head' | 'merge', GitResult>> = {}): FakeGitPort => {
      const fake = new FakeGitPort();
      fake.handler = (args) => {
        if (args[0] === 'merge-base') return overrides.merge ?? out(MERGE);
        if (args.includes('HEAD')) return overrides.head ?? out(HEAD);
        return overrides.base ?? out(BASE);
      };
      return fake;
    };

    it('issues exactly three read-only commands, with the ref only after --end-of-options', async () => {
      const fake = scripted();
      const result = await resolveRange(fake, '/repo', 'origin/develop');
      expect(result).toEqual({ ok: true, rangeBaseCommit: MERGE, headCommit: HEAD });
      expect(fake.calls).toEqual([
        ['rev-parse', '--verify', '--quiet', '--end-of-options', 'origin/develop^{commit}'],
        ['rev-parse', '--verify', '--quiet', 'HEAD'],
        ['merge-base', BASE, HEAD],
      ]);
      expect(fake.calls.filter((call) => call.some((arg) => arg.includes('origin/develop')))).toHaveLength(1);
    });

    it('accepts SHA-256 object ids', async () => {
      const long = 'e'.repeat(64);
      const result = await resolveRange(scripted({ base: out(long), head: out(long), merge: out(long) }), '/repo', 'x');
      expect(result).toEqual({ ok: true, rangeBaseCommit: long, headCommit: long });
    });

    it.each([
      ['the base cannot be resolved', { base: { ok: false } as GitResult }, 1],
      ['the base output is empty', { base: out('') }, 1],
      ['the base output is not hexadecimal', { base: out('--output=evil') }, 1],
      ['HEAD cannot be resolved', { head: { ok: false } as GitResult }, 2],
      ['HEAD output is uppercase hexadecimal', { head: out('C'.repeat(40)) }, 2],
      ['there is no merge base', { merge: { ok: false } as GitResult }, 3],
      ['the merge base output is short', { merge: out('abc123') }, 3],
    ])('fails when %s and stops there', async (_name, overrides, calls) => {
      const fake = scripted(overrides);
      expect(await resolveRange(fake, '/repo', 'origin/develop')).toEqual({ ok: false });
      expect(fake.calls).toHaveLength(calls);
    });

    it('hands merge-base only validated commit ids, never the caller ref', async () => {
      const fake = scripted();
      await resolveRange(fake, '/repo', 'origin/develop');
      const mergeCall = fake.calls.find((call) => call[0] === 'merge-base')!;
      for (const arg of mergeCall.slice(1)) expect(arg).toMatch(/^[0-9a-f]{40}([0-9a-f]{24})?$/);
    });
  });

  describe('against a real repository', () => {
    let repo: string;
    const git = (...args: string[]): string =>
      execFileSync('git', args, { cwd: repo, encoding: 'utf8', env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' } }).trim();
    const commit = (file: string, message: string): void => {
      fs.writeFileSync(path.join(repo, file), `${message}\n`);
      git('add', '-A');
      git('commit', '-q', '-m', message);
    };
    const recording = (): { port: GitPort; calls: string[][] } => {
      const calls: string[][] = [];
      const real = new NodeGitAdapter();
      return { calls, port: { run: (args, cwd, input) => { calls.push([...args]); return real.run(args, cwd, input); } } };
    };

    beforeEach(() => {
      repo = fs.mkdtempSync(path.join(os.tmpdir(), 'jev-baseref-'));
      git('init', '-q', '-b', 'main');
      git('config', 'user.email', 't@example.com');
      git('config', 'user.name', 'T');
      git('config', 'commit.gpgsign', 'false');
    });
    afterEach(() => {
      fs.rmSync(repo, { recursive: true, force: true });
    });

    it('resolves a branch name to the merge base and HEAD', async () => {
      commit('a.txt', 'base');
      const mergeBase = git('rev-parse', 'HEAD');
      git('checkout', '-q', '-b', 'feature');
      commit('b.txt', 'feature work');
      const head = git('rev-parse', 'HEAD');
      expect(await resolveRange(new NodeGitAdapter(), repo, 'main')).toEqual({ ok: true, rangeBaseCommit: mergeBase, headCommit: head });
    });

    it('uses the fork point when the base branch moved on', async () => {
      commit('a.txt', 'base');
      const fork = git('rev-parse', 'HEAD');
      git('checkout', '-q', '-b', 'feature');
      commit('b.txt', 'feature work');
      git('checkout', '-q', 'main');
      commit('c.txt', 'main moved on');
      git('checkout', '-q', 'feature');
      const result = await resolveRange(new NodeGitAdapter(), repo, 'main');
      expect(result).toMatchObject({ ok: true, rangeBaseCommit: fork });
    });

    it('resolves a full commit SHA', async () => {
      commit('a.txt', 'base');
      const sha = git('rev-parse', 'HEAD');
      commit('b.txt', 'more');
      expect(await resolveRange(new NodeGitAdapter(), repo, sha)).toMatchObject({ ok: true, rangeBaseCommit: sha });
    });

    it('fails for a ref that does not exist', async () => {
      commit('a.txt', 'base');
      expect(await resolveRange(new NodeGitAdapter(), repo, 'origin/ghost')).toEqual({ ok: false });
    });

    it('fails for a ref that names a tree, not a commit-ish', async () => {
      commit('a.txt', 'base');
      const tree = git('rev-parse', 'HEAD^{tree}');
      expect(await resolveRange(new NodeGitAdapter(), repo, tree)).toEqual({ ok: false });
    });

    it('fails for an unrelated history with no merge base', async () => {
      commit('a.txt', 'base');
      git('checkout', '-q', '--orphan', 'other');
      git('rm', '-rf', '-q', '.');
      commit('z.txt', 'unrelated root');
      expect(await resolveRange(new NodeGitAdapter(), repo, 'main')).toEqual({ ok: false });
    });

    it('fails when HEAD is unborn', async () => {
      expect(await resolveRange(new NodeGitAdapter(), repo, 'main')).toEqual({ ok: false });
    });

    it('does not let an option-looking ref act as an option, and creates no file', async () => {
      commit('a.txt', 'base');
      const before = fs.readdirSync(repo).sort();
      const { port, calls } = recording();
      expect(await resolveRange(port, repo, '--output=injected')).toEqual({ ok: false });
      expect(calls[0]).toEqual(['rev-parse', '--verify', '--quiet', '--end-of-options', '--output=injected^{commit}']);
      expect(fs.readdirSync(repo).sort()).toEqual(before);
    });

    it('issues only read-only commands', async () => {
      commit('a.txt', 'base');
      git('checkout', '-q', '-b', 'feature');
      commit('b.txt', 'work');
      const { port, calls } = recording();
      await resolveRange(port, repo, 'main');
      for (const call of calls) expect(['rev-parse', 'merge-base']).toContain(call[0]);
    });
  });
});
