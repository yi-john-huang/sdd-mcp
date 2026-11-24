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
    'Assertion failed',
    'assert failed',
  ])('classifies %p as assertion', (summary) => {
    const result = classifyRedEvidence('npx jest a.test.ts', summary);
    expect(result.classification).toBe('assertion');
    expect(result.matchedPattern).toBeDefined();
  });

  it('prefers setup when both setup and assertion patterns match', () => {
    const result = classifyRedEvidence('npx jest', "Cannot find module './x'\nexpect(received).toBe(expected)");
    expect(result).toEqual({ classification: 'setup', matchedPattern: 'module-not-found' });
  });

  it('prefers setup when a module error is mixed with Assertion failed', () => {
    const result = classifyRedEvidence('npx jest', "Cannot find module './x'\nAssertion failed");
    expect(result).toEqual({ classification: 'setup', matchedPattern: 'module-not-found' });
  });

  it.each<[string, string, string]>([
    ['a test file named after an error code', 'npx jest src/ENOENT.test.ts', 'Expected: 1\nReceived: 2'],
    ['a command that names SyntaxError', 'npx jest -t SyntaxError', '3 tests failed'],
  ])('never matches setup patterns in the command: %s', (...[, command, summary]) => {
    expect(classifyRedEvidence(command, summary).classification).not.toBe('setup');
  });

  it.each<[string, string]>([
    ['a Jest toThrow(SyntaxError) expectation', '● parse › rejects bad input\n\n    expect(received).toThrow(expected)\n\n    Expected constructor: SyntaxError\n    Received function did not throw\n'],
    ['an expected ENOENT error code', 'expect(received).toBe(expected) // Object.is equality\n\nExpected: "ENOENT"\nReceived: "EACCES"\n'],
    ['a pytest.raises(ImportError) that did not raise', ">       with pytest.raises(ImportError):\nE       Failed: DID NOT RAISE <class 'ImportError'>\nFAILED tests/test_loader.py::test_import - Failed: DID NOT RAISE\n"],
    ['an expected ReferenceError', 'AssertionError: expected [Function] to throw ReferenceError\n'],
  ])('lets an assertion frame win over an error name it mentions: %s', (...[, summary]) => {
    expect(classifyRedEvidence('npx jest a.test.ts', summary).classification).toBe('assertion');
  });

  it('returns ambiguous when nothing matches', () => {
    expect(classifyRedEvidence('npm test', '3 tests failed')).toEqual({ classification: 'ambiguous' });
    expect(classifyRedEvidence('', '')).toEqual({ classification: 'ambiguous' });
  });

  it.each(['TS12 appeared', 'ENOENTITY is a name', 'TS12345 is too long'])('does not treat %p as a setup error', (summary) => {
    expect(classifyRedEvidence('run', summary).classification).toBe('ambiguous');
  });
});
