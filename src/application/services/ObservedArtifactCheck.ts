import path from 'node:path';

/** Spec paths are excluded from the fingerprint, so they are checked for existence instead of change. */
const SPEC_ROOT = '.spec/specs';
export const MAX_REPORTED_UNMATCHED = 20;

/** POSIX separators, no `.` or empty segments, no trailing slash: the form git reports paths in. */
const normalized = (artifact: string): string => path.posix.normalize(artifact.replace(/\\/g, '/')).replace(/\/+$/, '');
const isSpecPath = (entry: string): boolean => entry === SPEC_ROOT || entry.startsWith(`${SPEC_ROOT}/`);

/**
 * The named artifacts that neither equal a path changed since the task started nor contain one.
 * Spec paths need only exist. At most 20 are returned, as the caller wrote them.
 */
export async function unmatchedArtifacts(
  artifacts: readonly string[],
  changed: readonly string[],
  specPathExists: (projectRelative: string) => Promise<boolean>,
): Promise<string[]> {
  const unmatched: string[] = [];
  for (const artifact of artifacts) {
    const entry = normalized(artifact);
    const matched = isSpecPath(entry)
      ? await specPathExists(entry)
      : changed.some((file) => file === entry || file.startsWith(`${entry}/`));
    if (!matched) unmatched.push(artifact);
    if (unmatched.length === MAX_REPORTED_UNMATCHED) break;
  }
  return unmatched;
}
