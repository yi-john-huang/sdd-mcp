import * as fs from 'fs';
import * as path from 'path';

const root = process.cwd();
const kit = path.join(root, 'evals', 'skills');
const fixtureDir = path.join(kit, 'fixtures');

const fixtureFiles = (): string[] => (fs.existsSync(fixtureDir) ? fs.readdirSync(fixtureDir).filter((file) => file.endsWith('.json')).sort() : []);

describe('Skill blind-test kit', () => {
  it('holds at least three fixtures, including the three required traps', () => {
    const files = fixtureFiles();
    expect(files.length).toBeGreaterThanOrEqual(3);
    expect(files).toEqual(expect.arrayContaining(['sdd-implement-setup-red.json', 'simple-task-unverifiable.json', 'sdd-correct-repeat.json']));
  });

  it('gives every fixture the documented shape and an existing Skill', () => {
    for (const file of fixtureFiles()) {
      const fixture = JSON.parse(fs.readFileSync(path.join(fixtureDir, file), 'utf8')) as Record<string, unknown>;
      expect(Object.keys(fixture).sort()).toEqual(['checklist', 'prompt', 'setup', 'skill']);
      for (const key of ['skill', 'prompt', 'setup'] as const) expect(fixture[key]).toEqual(expect.stringMatching(/\S/));
      expect(fs.existsSync(path.join(root, 'skills', fixture.skill as string, 'SKILL.md'))).toBe(true);
      const checklist = fixture.checklist as unknown[];
      expect(Array.isArray(checklist)).toBe(true);
      expect(checklist.length).toBeGreaterThanOrEqual(3);
      for (const item of checklist) expect(item).toEqual(expect.stringMatching(/\S/));
    }
  });

  it('documents the run steps, the blinding procedure, and a result template', () => {
    const readme = fs.existsSync(path.join(kit, 'README.md')) ? fs.readFileSync(path.join(kit, 'README.md'), 'utf8') : '';
    expect(readme).toMatch(/## Run/);
    expect(readme).toMatch(/## Blinding/);
    expect(readme).toMatch(/## Result Template/);
  });

  it('is not shipped in the package', () => {
    const files = (JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as { files: string[] }).files;
    expect(files.filter((entry) => entry.startsWith('evals'))).toEqual([]);
  });
});
