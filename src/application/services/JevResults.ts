import type { JevCheckKind, JevCheckResult, JevSkipReason } from './JevCheckTypes.js';
import { renderJevLine } from './JevReport.js';

const base = (check: JevCheckKind): JevCheckResult => ({
  check, status: 'skipped', line: null, flagged: [], details: [], persisted: false, truncated: false, redactions: 0,
});

export const skippedResult = (check: JevCheckKind, skipReason: JevSkipReason): JevCheckResult =>
  ({ ...base(check), status: 'skipped', skipReason });

export const unavailableResult = (check: JevCheckKind, reason: string): JevCheckResult =>
  ({ ...base(check), status: 'unavailable', reason, line: renderJevLine({ status: 'unavailable', reason, flagged: [] }) });
