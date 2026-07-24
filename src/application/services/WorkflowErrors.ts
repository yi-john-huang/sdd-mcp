export type GovernanceErrorCode =
  | 'InvalidParams'
  | 'InvalidFeatureName'
  | 'RevisionConflict'
  | 'PhaseValidationFailed'
  | 'ArtifactDrift'
  | 'PhaseNotApproved'
  | 'TaskTransitionInvalid'
  | 'TaskDependencyIncomplete'
  | 'RecoveryConflict'
  | 'LegacyStateConflict'
  | 'LegacyTaskConflict'
  | 'StateInvariantViolation'
  | 'LockTimeout'
  | 'LockCompromised'
  | 'InternalError';

export class GovernanceError extends Error {
  constructor(
    public readonly code: GovernanceErrorCode,
    message: string,
    public readonly details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = 'GovernanceError';
  }

  toJSON(): { code: string; message: string; details?: Readonly<Record<string, unknown>> } {
    return this.details
      ? { code: this.code, message: this.message, details: this.details }
      : { code: this.code, message: this.message };
  }
}

const PUBLIC_ERROR_CODES = new Set<string>([
  'InvalidParams',
  'InvalidFeatureName',
  'SpecPathEscape',
  'RevisionConflict',
  'PhaseValidationFailed',
  'ArtifactDrift',
  'PhaseNotApproved',
  'TaskTransitionInvalid',
  'TaskDependencyIncomplete',
  'RecoveryConflict',
  'LegacyStateConflict',
  'LegacyTaskConflict',
  'StateInvariantViolation',
  'LockTimeout',
  'LockCompromised',
  'ContextBudgetTooSmall',
  'ContextBudgetExceeded',
  'ContextSourceError',
]);

export function serializeToolError(error: unknown, validation = false): {
  code: string;
  message: string;
  details?: Readonly<Record<string, unknown>>;
} {
  if (error instanceof GovernanceError) return error.toJSON();
  if (
    error
    && typeof error === 'object'
    && 'code' in error
    && typeof error.code === 'string'
    && PUBLIC_ERROR_CODES.has(error.code)
  ) {
    return {
      code: error.code,
      message: error instanceof Error ? error.message : 'The operation could not be completed',
    };
  }
  if (validation) return { code: 'InvalidParams', message: error instanceof Error ? error.message : 'Invalid tool parameters' };
  return { code: 'InternalError', message: 'The operation failed unexpectedly' };
}
