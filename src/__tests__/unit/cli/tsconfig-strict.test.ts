import * as fs from 'fs';
import * as path from 'path';

const STRICT_FAMILY = [
  'noImplicitAny',
  'strictNullChecks',
  'strictFunctionTypes',
  'strictBindCallApply',
  'strictPropertyInitialization',
  'noImplicitThis',
  'useUnknownInCatchVariables',
  'alwaysStrict',
] as const;

describe('tsconfig strict mode', () => {
  const compilerOptions = JSON.parse(
    fs.readFileSync(path.resolve(process.cwd(), 'tsconfig.json'), 'utf8'),
  ).compilerOptions as Record<string, unknown>;

  it('enables strict, noImplicitReturns, and noEmitOnError', () => {
    expect(compilerOptions.strict).toBe(true);
    expect(compilerOptions.noImplicitReturns).toBe(true);
    expect(compilerOptions.noEmitOnError).toBe(true);
  });

  it('sets no strict-family flag to false', () => {
    for (const flag of STRICT_FAMILY) {
      expect(compilerOptions[flag]).not.toBe(false);
    }
  });
});
