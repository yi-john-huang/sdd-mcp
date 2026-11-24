/** Spec paths are excluded from the fingerprint, so they are checked for existence instead of change. */
const SPEC_PREFIX = '.spec/specs/';
export const MAX_REPORTED_UNMATCHED = 20;

const posix = (artifact: string): string => artifact.replace(/\\/g, '/').replace(/^(?:\.\/)+/, '').replace(/\/+$/, '');

/**
 * The named artifacts that neither equal a path changed since the task started nor contain one.
 * Spec paths need only exist. At most 20 are returned.
 */
export async function unmatchedArtifacts(
  artifacts: readonly string[],
  changed: readonly string[],
  specPathExists: (projectRelative: string) => Promise<boolean>,
): Promise<string[]> {
  const unmatched: string[] = [];
  for (const artifact of artifacts) {
    const entry = posix(artifact);
    const matched = entry.startsWith(SPEC_PREFIX)
      ? await specPathExists(entry)
      : changed.some((file) => file === entry || file.startsWith(`${entry}/`));
    if (!matched) unmatched.push(artifact);
    if (unmatched.length === MAX_REPORTED_UNMATCHED) break;
  }
  return unmatched;
}
