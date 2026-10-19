import { classifyRedEvidence } from '../../../application/services/RedEvidenceClassifier';

describe('classifyRedEvidence', () => {
  it.each([
    ["Error: Cannot find module './JevSettings'", 'module-not-found'],
    ["Module not found: Can't resolve 'x'", 'module-not-found'],
    ['Error [ERR_MODULE_NOT_FOUND]: Cannot find package', 'module-not-found'],
    ['SyntaxError: Unexpected token }', 'syntax-error'],
    ['error TS2304: Cannot find name foo', 'typescript'],
    ["ENOENT: no such file or directory, open 'x.json'", 'enoent'],
    ['ReferenceError: widget is not defined', 'reference-error'],
    ['bash: jest: command not found', 'command-not-found'],
  ])('classifies %p as setup (%s)', (summary, pattern) => {
    expect(classifyRedEvidence('npx jest a.test.ts', summary)).toEqual({ classification: 'setup', matchedPattern: pattern });
  });

  it.each([
    'AssertionError: expected 1 to equal 2',
    'Expected: 1\nReceived: 2',
    'expect(received).toBe(expected)',
  ])('classifies %p as assertion', (summary) => {
    const result = classifyRedEvidence('npx jest a.test.ts', summary);
    expect(result.classification).toBe('assertion');
    expect(result.matchedPattern).toBeDefined();
  });

  it('prefers setup when both setup and assertion patterns match', () => {
    const result = classifyRedEvidence('npx jest', "Cannot find module './x'\nexpect(received).toBe(expected)");
    expect(result).toEqual({ classification: 'setup', matchedPattern: 'module-not-found' });
  });

  it('returns ambiguous when nothing matches', () => {
    expect(classifyRedEvidence('npm test', '3 tests failed')).toEqual({ classification: 'ambiguous' });
    expect(classifyRedEvidence('', '')).toEqual({ classification: 'ambiguous' });
  });

  it('matches against the command as well as the summary', () => {
    expect(classifyRedEvidence('tsc --noEmit # TS2339', 'failed').classification).toBe('setup');
  });

  it.each(['TS12 appeared', 'ENOENTITY is a name', 'TS12345 is too long'])('does not treat %p as a setup error', (summary) => {
    expect(classifyRedEvidence('run', summary).classification).toBe('ambiguous');
  });
});
