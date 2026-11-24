import * as fs from 'fs';
import * as path from 'path';
import { classifyRedEvidence } from '../../../application/services/RedEvidenceClassifier';

const FIXTURES = path.join(__dirname, 'fixtures', 'red-classifier');
const ECOSYSTEMS = ['python', 'go', 'rust', 'jvm', 'dotnet'] as const;
const NAME = /^([a-z]+)-(setup|assertion)-\d+\.txt$/;

const fixtures = fs.readdirSync(FIXTURES).sort().map((file) => {
  const match = NAME.exec(file);
  if (!match) throw new Error(`Unexpected fixture name ${file}`);
  return { file, ecosystem: match[1] as string, expected: match[2] as 'setup' | 'assertion', output: fs.readFileSync(path.join(FIXTURES, file), 'utf8') };
});

describe('RED classifier fixture corpus', () => {
  it.each(ECOSYSTEMS)('holds at least two setup and two assertion samples for %s', (ecosystem) => {
    const samples = fixtures.filter((fixture) => fixture.ecosystem === ecosystem);
    expect(samples.filter(({ expected }) => expected === 'setup').length).toBeGreaterThanOrEqual(2);
    expect(samples.filter(({ expected }) => expected === 'assertion').length).toBeGreaterThanOrEqual(2);
  });

  it.each(fixtures.map((fixture) => [fixture.file, fixture] as const))('classifies %s by its file name with a named pattern', (...[, fixture]) => {
    const result = classifyRedEvidence('run tests', fixture.output);
    expect(result.classification).toBe(fixture.expected);
    expect(result.matchedPattern).toEqual(expect.any(String));
  });

  it('keeps setup ahead of assertion when both match', () => {
    expect(classifyRedEvidence('go test', 'undefined: CreateOrder\n--- FAIL: TestX\n x_test.go:3: boom').classification).toBe('setup');
  });

  it('keeps unmatched output ambiguous', () => {
    expect(classifyRedEvidence('make check', 'exit status 2').classification).toBe('ambiguous');
  });
});
