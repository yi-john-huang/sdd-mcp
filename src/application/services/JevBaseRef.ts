import type { GitPort } from '../../domain/ports.js';

export const MAX_BASE_REF_LENGTH = 256;

const DEL = 0x7f;
const LAST_C0_CONTROL = 0x1f;

const hasControlCharacter = (value: string): boolean =>
  [...value].some((char) => {
    const code = char.codePointAt(0) ?? 0;
    return code <= LAST_C0_CONTROL || code === DEL;
  });

/**
 * Strict shape check for a caller-supplied base ref. It runs before any git command, so a value
 * that could be read as an option (leading `-`) or that carries whitespace or control characters
 * never reaches git.
 */
export function isWellFormedBaseRef(value: string): boolean {
  return value.length > 0
    && value.length <= MAX_BASE_REF_LENGTH
    && !value.startsWith('-')
    && !/\s/u.test(value)
    && !hasControlCharacter(value);
}

export type ResolvedRange =
  | { ok: true; rangeBaseCommit: string; headCommit: string }
  | { ok: false };

/** SHA-1 or SHA-256 object id, as git prints it. */
const OBJECT_ID = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;
const FAILED: ResolvedRange = { ok: false };

/** One read-only git command whose whole output must be a single object id. */
async function objectId(git: GitPort, root: string, args: readonly string[]): Promise<string | undefined> {
  const result = await git.run(args, root);
  if (!result.ok) return undefined;
  const id = result.stdout.toString('utf8').trim();
  return OBJECT_ID.test(id) ? id : undefined;
}

/**
 * Resolves a well-formed `baseRef` to the merge base with HEAD. The caller's ref appears in exactly
 * one argument vector, after `--end-of-options`; every later command receives only object ids that
 * git itself printed and that matched the object-id shape.
 */
export async function resolveRange(git: GitPort, root: string, baseRef: string): Promise<ResolvedRange> {
  const base = await objectId(git, root, ['rev-parse', '--verify', '--quiet', '--end-of-options', `${baseRef}^{commit}`]);
  if (!base) return FAILED;
  const head = await objectId(git, root, ['rev-parse', '--verify', '--quiet', 'HEAD']);
  if (!head) return FAILED;
  const rangeBaseCommit = await objectId(git, root, ['merge-base', base, head]);
  return rangeBaseCommit ? { ok: true, rangeBaseCommit, headCommit: head } : FAILED;
}
