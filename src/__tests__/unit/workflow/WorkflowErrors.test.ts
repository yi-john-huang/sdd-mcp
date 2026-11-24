import { GovernanceError, serializeToolError } from '../../../application/services/WorkflowErrors';

describe('workflow error serialization', () => {
  it('preserves governed public details and omits absent details', () => {
    expect(serializeToolError(new GovernanceError('RevisionConflict', 'stale', { expected: 2 }))).toEqual({
      code: 'RevisionConflict',
      message: 'stale',
      details: { expected: 2 },
    });
    expect(new GovernanceError('InvalidParams', 'invalid').toJSON()).toEqual({
      code: 'InvalidParams',
      message: 'invalid',
    });
  });

  it('passes allowlisted foreign codes without exposing unknown internals', () => {
    expect(serializeToolError(Object.assign(new Error('escaped'), { code: 'SpecPathEscape' }))).toEqual({
      code: 'SpecPathEscape',
      message: 'escaped',
    });
    expect(serializeToolError({ code: 'ContextSourceError' })).toEqual({
      code: 'ContextSourceError',
      message: 'The operation could not be completed',
    });
    expect(serializeToolError(Object.assign(new Error('secret'), { code: 'EACCES' }))).toEqual({
      code: 'InternalError',
      message: 'The operation failed unexpectedly',
    });
  });

  it.each([
    'SelfReportedEvidenceRejected',
    'EvidenceCommandNotAllowed',
    'EvidenceRunTimedOut',
    'EvidenceRunnerUnavailable',
    'RedSetupFailure',
    'EvidenceContinuityViolation',
    'ObservedArtifactMismatch',
    'VerifyCommandMismatch',
    'EvidenceCommandInlineEval',
  ])('passes the %s evidence code through to the tool result', (code) => {
    expect(serializeToolError(new GovernanceError(code as never, 'why', { observed: { exitCode: 1 } }))).toEqual({ code, message: 'why', details: { observed: { exitCode: 1 } } });
    expect(serializeToolError(Object.assign(new Error('foreign'), { code }))).toEqual({ code, message: 'foreign' });
  });

  it('returns useful validation errors without leaking arbitrary values', () => {
    expect(serializeToolError(new Error('featureName required'), true)).toEqual({
      code: 'InvalidParams',
      message: 'featureName required',
    });
    expect(serializeToolError('bad input', true)).toEqual({
      code: 'InvalidParams',
      message: 'Invalid tool parameters',
    });
    expect(serializeToolError(null)).toEqual({
      code: 'InternalError',
      message: 'The operation failed unexpectedly',
    });
  });
});
