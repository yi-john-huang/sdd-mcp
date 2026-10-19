import { createHash } from 'node:crypto';
import { lstat } from 'node:fs/promises';
import path from 'node:path';
import type { GitPort } from '../../domain/ports.js';

export interface ManifestEntry {
  path: string;
  token: string;
}

export type ChangeManifest =
  | { status: 'ok'; diffSha256: string; baseCommit: string | null; entries: ManifestEntry[] }
  | { status: 'empty' }
  | { status: 'unavailable' };

const MAX_PATHS = 2000;
const HASH_CHUNK = 200;
const DELETED = 'deleted';
const UNAVAILABLE: ChangeManifest = { status: 'unavailable' };
/** JEV's own sidecars must not influence the hash that binds them. */
const SIDECAR_PATH = /^\.spec\/(?:reviews\/|specs\/[^/]+\/review\/)/;

const text = (stdout: Buffer): string[] => stdout.toString('utf8').split('\0').filter((part) => part.length > 0);

async function exists(root: string, file: string): Promise<boolean> {
  try {
    await lstat(path.join(root, file));
    return true;
  } catch {
    return false;
  }
}

async function baseCommit(git: GitPort, root: string): Promise<string | null> {
  const result = await git.run(['rev-parse', '--verify', '--quiet', 'HEAD'], root);
  return result.ok ? result.stdout.toString('utf8').trim() || null : null;
}

/** Blob ids for working-tree files, exactly as `git add` would store them. Symlinks hash their target. */
async function workingTreeBlobs(git: GitPort, root: string, files: string[]): Promise<Map<string, string> | undefined> {
  const blobs = new Map<string, string>();
  for (let start = 0; start < files.length; start += HASH_CHUNK) {
    const chunk = files.slice(start, start + HASH_CHUNK);
    const result = await git.run(['hash-object', '--', ...chunk], root);
    if (!result.ok) return undefined;
    const ids = result.stdout.toString('utf8').split('\n').filter((line) => line.length > 0);
    if (ids.length !== chunk.length) return undefined;
    chunk.forEach((file, index) => blobs.set(file, ids[index] as string));
  }
  return blobs;
}

function finish(entries: ManifestEntry[], base: string | null): ChangeManifest {
  const kept = entries.filter((entry) => !SIDECAR_PATH.test(entry.path)).sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  if (kept.length === 0) return { status: 'empty' };
  if (kept.length > MAX_PATHS) return UNAVAILABLE;
  const manifest = kept.map((entry) => `${entry.path}\0${entry.token}\n`).join('');
  return { status: 'ok', diffSha256: createHash('sha256').update(manifest).digest('hex'), baseCommit: base, entries: kept };
}

async function reviewEntries(git: GitPort, root: string): Promise<ManifestEntry[] | undefined> {
  const status = await git.run(['-c', 'status.renames=false', 'status', '--porcelain=v1', '-z', '--untracked-files=all'], root);
  if (!status.ok) return undefined;
  const paths = text(status.stdout).map((record) => record.slice(3));
  const present: string[] = [];
  const entries: ManifestEntry[] = [];
  for (const file of paths) {
    if (await exists(root, file)) present.push(file);
    else entries.push({ path: file, token: DELETED });
  }
  const blobs = await workingTreeBlobs(git, root, present);
  if (!blobs) return undefined;
  for (const [file, blob] of blobs) entries.push({ path: file, token: blob });
  return entries;
}

async function stagedEntries(git: GitPort, root: string): Promise<ManifestEntry[] | undefined> {
  const diff = await git.run(['diff', '--cached', '--name-status', '--no-renames', '-z'], root);
  if (!diff.ok) return undefined;
  const parts = text(diff.stdout);
  const entries: ManifestEntry[] = [];
  const live: string[] = [];
  for (let index = 0; index + 1 < parts.length; index += 2) {
    const file = parts[index + 1] as string;
    if (parts[index] === 'D') entries.push({ path: file, token: DELETED });
    else live.push(file);
  }
  if (live.length > 0) {
    const listing = await git.run(['ls-files', '-s', '-z', '--', ...live], root);
    if (!listing.ok) return undefined;
    for (const record of text(listing.stdout)) {
      const match = /^\d+ ([0-9a-f]+) \d\t(.*)$/s.exec(record);
      if (match) entries.push({ path: match[2] as string, token: match[1] as string });
    }
  }
  return entries;
}

async function build(
  git: GitPort,
  root: string,
  entriesOf: (git: GitPort, root: string) => Promise<ManifestEntry[] | undefined>,
): Promise<ChangeManifest> {
  try {
    const entries = await entriesOf(git, root);
    if (!entries) return UNAVAILABLE;
    return finish(entries, await baseCommit(git, root));
  } catch {
    return UNAVAILABLE;
  }
}

/** Working-tree changes plus untracked files; compares equal to a full stage of the same content. */
export function buildReviewManifest(git: GitPort, projectRoot: string): Promise<ChangeManifest> {
  return build(git, projectRoot, reviewEntries);
}

/** Staged changes only, hashed with the same definition as the review manifest. */
export function buildStagedManifest(git: GitPort, projectRoot: string): Promise<ChangeManifest> {
  return build(git, projectRoot, stagedEntries);
}
