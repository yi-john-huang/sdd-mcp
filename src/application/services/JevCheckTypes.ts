export const JEV_CHECK_KINDS = ['requirements', 'design', 'testcases', 'red', 'security', 'principles', 'commit'] as const;
export type JevCheckKind = (typeof JEV_CHECK_KINDS)[number];

export type JevSkipReason = 'not-ready' | 'cases-required' | 'feature-not-found' | 'no-changes' | 'disabled';

export interface JevCase {
  taskId: string;
  kind: 'behavior' | 'boundary' | 'error' | 'transition' | 'security';
  given: string;
  when: string;
  then: string;
  covers: string;
}

export interface JevFindingInput {
  id: string;
  path: string;
  line: number;
  title: string;
  severity: string;
  description?: string;
  preconditions?: string;
  remediation?: string;
}

export interface JevUnitInput {
  id: string;
  path: string;
  line: number;
  summary: string;
}

export interface JevEvidenceInput {
  command: string;
  exitCode: number;
  summary: string;
}

export interface JevCheckRequest {
  check: JevCheckKind;
  projectRoot: string;
  featureName?: string;
  cases?: readonly JevCase[];
  taskNumber?: string;
  testName?: string;
  evidence?: JevEvidenceInput;
  findings?: readonly JevFindingInput[];
  units?: readonly JevUnitInput[];
}

export interface JevItemDetail {
  id: string;
  flagged: boolean;
  location?: string;
  principle?: string;
  note?: string;
}

export interface JevCheckResult {
  check: JevCheckKind;
  status: 'answered' | 'unavailable' | 'skipped';
  /** Present for `unavailable`: disabled, no-key, network, timeout, http-<n>, invalid-response, code-disabled. */
  reason?: string;
  /** Present for `skipped`. */
  skipReason?: JevSkipReason;
  /** The one report line to show, or null when there is nothing to show. */
  line: string | null;
  flagged: string[];
  details: JevItemDetail[];
  persisted: boolean;
  /** Project-relative path of the sidecar, when one was written. */
  sidecar?: string;
  truncated: boolean;
  redactions: number;
  classification?: 'setup' | 'assertion' | 'ambiguous';
  matchedPattern?: string;
  droppedFindingIds?: string[];
  unknownTasks?: string[];
}
