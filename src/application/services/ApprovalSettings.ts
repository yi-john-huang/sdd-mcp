import type { ProjectConfig } from './ProjectConfig.js';

/**
 * Who may approve a phase revision.
 * - `human` (default): only the person answering the phase Skill's approval question.
 * - `delegated-reviewer`: a named reviewer may also approve, but only through a review sidecar
 *   bound to the exact revision and artifact SHA-256. A human can still approve in this mode.
 */
export type ApprovalMode = 'human' | 'delegated-reviewer';

export interface ApprovalSettings {
  readonly mode: ApprovalMode;
  /** Reviewer names allowed to approve in delegated mode. */
  readonly reviewers: ReadonlySet<string>;
  /** Invalid configuration values, one line each. */
  readonly warnings: readonly string[];
}

export const DEFAULT_DELEGATED_REVIEWERS: readonly string[] = ['agy'];
export const REVIEWER_NAME = /^[a-z0-9][a-z0-9._-]{0,39}$/;
const MODES: ReadonlySet<string> = new Set<ApprovalMode>(['human', 'delegated-reviewer']);

function approvalSection(config: ProjectConfig | undefined): Record<string, unknown> {
  const section = config?.approval;
  return typeof section === 'object' && section !== null && !Array.isArray(section) ? (section as Record<string, unknown>) : {};
}

/**
 * Resolves `.spec/sdd-config.json` `approval`. There is deliberately no environment override:
 * delegation must be a committed, reviewable project decision.
 */
export function resolveApprovalSettings(config: ProjectConfig | undefined): ApprovalSettings {
  const section = approvalSection(config);
  const warnings: string[] = [];
  let mode: ApprovalMode = 'human';
  if (section.mode !== undefined) {
    if (typeof section.mode === 'string' && MODES.has(section.mode)) mode = section.mode as ApprovalMode;
    else warnings.push(`approval.mode ${JSON.stringify(section.mode)} is not recognized; using "human"`);
  }
  let reviewers = new Set(DEFAULT_DELEGATED_REVIEWERS);
  if (section.reviewers !== undefined) {
    const list = Array.isArray(section.reviewers) ? section.reviewers : [];
    const valid = list.filter((name): name is string => typeof name === 'string' && REVIEWER_NAME.test(name));
    if (!Array.isArray(section.reviewers) || valid.length !== list.length || valid.length === 0) {
      warnings.push('approval.reviewers must be a nonempty list of lowercase reviewer names; using ["agy"]');
    } else {
      reviewers = new Set(valid);
    }
  }
  return { mode, reviewers, warnings };
}

/** The only sidecar path a delegated approval may cite, relative to the feature directory. */
export function reviewSidecarPath(reviewer: string, phase: string, revision: number): string {
  return `review/${reviewer}-${phase}-r${revision}.json`;
}
