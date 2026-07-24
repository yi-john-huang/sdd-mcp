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
