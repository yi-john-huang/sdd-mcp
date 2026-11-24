import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Exercise the ESM script in a real Node process, like context-usage-report.test.ts.
const scriptPath = path.resolve('scripts/lint-ratchet.mjs');
const scriptUrl = pathToFileURL(scriptPath).href;
const bridge = `
  const request = JSON.parse(process.env.RATCHET_REQUEST);
  const ratchet = await import(${JSON.stringify(scriptUrl)});
  process.stdout.write(JSON.stringify(ratchet[request.name](...request.args)));
`;

function invoke(name: string, args: unknown[]): any {
  const output = execFileSync(process.execPath, ['--input-type=module', '--eval', bridge], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...process.env, RATCHET_REQUEST: JSON.stringify({ name, args }) },
  });
  return JSON.parse(output);
}

const root = process.cwd();
const result = (file: string, ruleIds: Array<string | null>, severity = 1) => ({
  filePath: path.join(root, file),
  messages: ruleIds.map((ruleId) => ({ ruleId, severity })),
});

describe('lint ratchet', () => {
  it('counts warnings per posix file and rule, ignoring errors', () => {
    const counts = invoke('countWarnings', [[
      result('src/a.ts', ['no-x', 'no-x', 'no-y']),
      result('src/b.ts', ['no-x'], 2),
    ], root]);
    expect(counts).toEqual({ 'src/a.ts|no-x': 2, 'src/a.ts|no-y': 1 });
  });

  it('fails when a count rises and prints baseline and current', () => {
    const outcome = invoke('compare', [{ 'src/a.ts|no-x': 2 }, { 'src/a.ts|no-x': 3 }]);
    expect(outcome.ok).toBe(false);
    expect(outcome.lines).toEqual(['src/a.ts  no-x  2 → 3']);
  });

  it('fails when a file missing from the baseline gains one warning', () => {
    const outcome = invoke('compare', [{}, { 'src/new.ts|no-x': 1 }]);
    expect(outcome.ok).toBe(false);
    expect(outcome.lines).toEqual(['src/new.ts  no-x  0 → 1']);
  });

  it('passes when counts fall', () => {
    expect(invoke('compare', [{ 'src/a.ts|no-x': 3 }, { 'src/a.ts|no-x': 2 }]).ok).toBe(true);
  });

  it('lowers counts without raising any or adding keys', () => {
    const lowered = invoke('lower', [
      { 'src/a.ts|no-x': 3, 'src/b.ts|no-y': 1, 'src/c.ts|no-z': 2 },
      { 'src/a.ts|no-x': 2, 'src/c.ts|no-z': 5, 'src/new.ts|no-x': 4 },
    ]);
    expect(lowered).toEqual({ 'src/a.ts|no-x': 2, 'src/c.ts|no-z': 2 });
  });

  describe('baseline file errors', () => {
    let dir: string;
    beforeAll(async () => {
      dir = await mkdtemp(path.join(tmpdir(), 'lint-ratchet-'));
    });

    const run = (baseline: string) => spawnSync(process.execPath, [scriptPath, '--baseline', baseline], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });

    it('exits 2 and names --init when the baseline is missing', () => {
      const missing = path.join(dir, 'missing.json');
      const outcome = run(missing);
      expect(outcome.status).toBe(2);
      expect(outcome.stderr).toContain(missing);
      expect(outcome.stderr).toContain('--init');
    });

    it('passes and tells the maintainer how to lower the baseline when warnings drop', async () => {
      const current = JSON.parse(await readFile(path.join(process.cwd(), 'scripts/lint-baseline.json'), 'utf8')) as Record<string, number>;
      const higher = path.join(dir, 'higher.json');
      await writeFile(higher, JSON.stringify({ ...current, 'src/removed.ts|no-x': 1 }));
      const outcome = run(higher);
      expect(outcome.status).toBe(0);
      expect(outcome.stdout).toContain('npm run lint:baseline');
    }, 120_000);

    it('prints nothing when the baseline matches', () => {
      const outcome = run(path.join(process.cwd(), 'scripts/lint-baseline.json'));
      expect(outcome.status).toBe(0);
      expect(outcome.stdout).toBe('');
    }, 120_000);

    it('exits 2 and names the file when the baseline is malformed', async () => {
      const malformed = path.join(dir, 'malformed.json');
      await writeFile(malformed, '{"src/a.ts|no-x": "two"}');
      const outcome = run(malformed);
      expect(outcome.status).toBe(2);
      expect(outcome.stderr).toContain(malformed);
    });
  });
});
