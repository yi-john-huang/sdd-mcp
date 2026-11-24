import { createHash } from 'node:crypto';
import type { GitPort } from '../../domain/ports.js';
import type { TreeBinding, TreeDirtyEntry, TreeUnavailableReason } from '../../domain/types.js';
import { dirtyEntries } from './JevChangeManifest.js';
import { MAX_STORED_DIRTY_ENTRIES } from './TreeBindingCodec.js';

/**
 * A content-addressed fingerprint of the project's working tree: the map from path to the git object id
 * `git add -A` would store, built from HEAD plus the dirty entries, without writing to the index.
 * Equal content gives an equal hash whether or not it was committed; HEAD only selects the base.
 */

export type BoundTree = Extract<TreeBinding, { status: 'bound' }>;
export type ChangedPaths = { status: 'ok'; paths: string[] } | { status: 'unavailable' };

export const DEFAULT_TREE_DEADLINE_MS = 10_000;
/** Spec state and JEV sidecars are workflow records, not project content. */
const EXCLUDED = ['.spec/specs/', '.spec/reviews/'] as const;
const DELETED = 'deleted';
const REGULAR_FILE_MODE = '100644';

/** The fingerprint value of one path: its object id, prefixed with its git mode unless it is a regular file. */
const entryValue = (mode: string, id: string): string => (mode === REGULAR_FILE_MODE ? id : `${mode} ${id}`);

class Unavailable extends Error {
  constructor(readonly reason: TreeUnavailableReason) {
    super(reason);
  }
}

const trimmed = (stdout: Buffer): string => stdout.toString('utf8').trim();
const excluded = (file: string): boolean => EXCLUDED.some((prefix) => file.startsWith(prefix));
const byPath = (a: { path: string }, b: { path: string }): number => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);

async function required(git: GitPort, args: readonly string[], cwd: string, reason: TreeUnavailableReason): Promise<Buffer> {
  const result = await git.run(args, cwd);
  if (!result.ok) throw new Unavailable(reason);
  return result.stdout;
}

interface Location {
  readonly top: string;
  readonly prefix: string;
}

async function locate(git: GitPort, projectRoot: string): Promise<Location> {
  const top = trimmed(await required(git, ['rev-parse', '--show-toplevel'], projectRoot, 'not-a-git-repo'));
  const prefix = trimmed(await required(git, ['rev-parse', '--show-prefix'], projectRoot, 'not-a-git-repo'));
  return { top, prefix };
}

async function headCommit(git: GitPort, top: string): Promise<string | null> {
  const result = await git.run(['rev-parse', '--verify', '--quiet', 'HEAD'], top);
  return result.ok ? trimmed(result.stdout) || null : null;
}

/** Project-relative path to blob or gitlink id at `commit`; empty for an unborn branch. */
async function baseMap(git: GitPort, { top, prefix }: Location, commit: string | null): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!commit) return map;
  const args = ['ls-tree', '-r', '-z', '--full-tree', commit, ...(prefix ? ['--', prefix] : [])];
  const listing = await required(git, args, top, 'git-failed');
  for (const record of listing.toString('utf8').split('\0')) {
    const match = /^(\d+) \w+ ([0-9a-f]+)\t(.*)$/s.exec(record);
    if (!match) continue;
    const file = (match[3] as string).slice(prefix.length);
    if (!excluded(file)) map.set(file, entryValue(match[1] as string, match[2] as string));
  }
  return map;
}

async function liveDirty(git: GitPort, { top, prefix }: Location): Promise<TreeDirtyEntry[]> {
  const result = await dirtyEntries(git, top, prefix || undefined);
  if (result.status === 'too-many') throw new Unavailable('too-many-changes');
  if (result.status === 'failed') throw new Unavailable('git-failed');
  return result.entries
    .filter((entry) => entry.path.startsWith(prefix))
    .map((entry) => ({ path: entry.path.slice(prefix.length), token: entry.token, ...(entry.mode ? { mode: entry.mode } : {}) }))
    .filter((entry) => !excluded(entry.path))
    .sort(byPath);
}

function overlay(base: ReadonlyMap<string, string>, dirty: readonly TreeDirtyEntry[]): Map<string, string> {
  const map = new Map(base);
  for (const { path, token, mode } of dirty) {
    if (token === DELETED) map.delete(path);
    else map.set(path, entryValue(mode ?? REGULAR_FILE_MODE, token));
  }
  return map;
}

function hashOf(map: ReadonlyMap<string, string>): string {
  const hash = createHash('sha256');
  for (const file of [...map.keys()].sort()) hash.update(`${file}\0${map.get(file) as string}\n`);
  return hash.digest('hex');
}

async function withDeadline<T>(work: Promise<T>, deadlineMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Unavailable('timeout')), deadlineMs);
  });
  try {
    return await Promise.race([work, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

interface Observation {
  readonly tree: BoundTree;
  readonly map: ReadonlyMap<string, string>;
  readonly location: Location;
}

async function observe(git: GitPort, projectRoot: string): Promise<Observation> {
  const location = await locate(git, projectRoot);
  const head = await headCommit(git, location.top);
  const dirty = await liveDirty(git, location);
  const map = overlay(await baseMap(git, location, head), dirty);
  const truncated = dirty.length > MAX_STORED_DIRTY_ENTRIES;
  const tree: BoundTree = {
    status: 'bound',
    sha256: hashOf(map),
    head,
    prefix: location.prefix,
    dirty: truncated ? [] : dirty,
    dirtyTruncated: truncated,
  };
  return { tree, map, location };
}

/** Never rejects: any git failure or the deadline yields `unavailable` with a reason. */
export async function observeTree(git: GitPort | undefined, projectRoot: string, deadlineMs = DEFAULT_TREE_DEADLINE_MS): Promise<TreeBinding> {
  if (!git) return { status: 'unavailable', reason: 'git-unavailable' };
  try {
    return (await withDeadline(observe(git, projectRoot), deadlineMs)).tree;
  } catch (error) {
    return { status: 'unavailable', reason: error instanceof Unavailable ? error.reason : 'git-failed' };
  }
}

async function diffAgainst(git: GitPort, projectRoot: string, from: BoundTree): Promise<ChangedPaths> {
  const current = await observe(git, projectRoot);
  if (current.location.prefix !== from.prefix) return { status: 'unavailable' };
  const before = overlay(await baseMap(git, current.location, from.head), from.dirty ?? []);
  const paths = new Set<string>();
  for (const [file, token] of current.map) if (before.get(file) !== token) paths.add(file);
  for (const file of before.keys()) if (!current.map.has(file)) paths.add(file);
  return { status: 'ok', paths: [...paths].sort() };
}

/**
 * Paths whose content differs between `from` and the live tree, sorted. Changes committed after `from` count,
 * because the comparison is content to content. Unavailable when `from` cannot be rebuilt.
 */
export async function changedPaths(git: GitPort, projectRoot: string, from: BoundTree, deadlineMs = DEFAULT_TREE_DEADLINE_MS): Promise<ChangedPaths> {
  if (from.dirtyTruncated || !from.dirty) return { status: 'unavailable' };
  try {
    return await withDeadline(diffAgainst(git, projectRoot, from), deadlineMs);
  } catch {
    return { status: 'unavailable' };
  }
}
