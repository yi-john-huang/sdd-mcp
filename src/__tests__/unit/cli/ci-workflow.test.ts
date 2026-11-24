import * as fs from 'fs';
import * as path from 'path';

const workflow = fs.readFileSync(path.resolve(process.cwd(), '.github/workflows/ci.yml'), 'utf8');

function jobBody(name: string): string {
  const start = workflow.indexOf(`  ${name}:`);
  expect(start).toBeGreaterThanOrEqual(0);
  const rest = workflow.slice(start + name.length + 3);
  const next = rest.search(/^ {2}[A-Za-z0-9_-]+:/m);
  return next < 0 ? rest : rest.slice(0, next);
}

function positions(body: string): { typecheck: number; lint: number; test: number } {
  return {
    typecheck: body.indexOf('npm run typecheck'),
    lint: body.indexOf('npm run lint'),
    test: body.indexOf('npm test'),
  };
}

describe('CI workflow', () => {
  it.each(['test-linux', 'test-macos'])('%s runs typecheck and lint before tests', (job) => {
    const at = positions(jobBody(job));
    expect(at.typecheck).toBeGreaterThanOrEqual(0);
    expect(at.lint).toBeGreaterThan(at.typecheck);
    expect(at.test).toBeGreaterThan(at.lint);
  });

  it('chains the Linux container steps with && so any failure fails the job', () => {
    expect(jobBody('test-linux')).toMatch(/npm run build && npm run typecheck && npm run lint && npm test/);
  });
});
