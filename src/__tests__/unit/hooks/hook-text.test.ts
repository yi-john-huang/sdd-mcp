import * as fs from 'fs';
import * as path from 'path';
import { HookLoader } from '../../../hooks/HookLoader';

const HOOKS = path.resolve(process.cwd(), 'hooks');

function markdownFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return markdownFiles(full);
    return entry.name.endsWith('.md') ? [full] : [];
  });
}

describe('canonical hook text', () => {
  it.each<[string, RegExp]>([
    ['a validation bypass flag that no tool reads', /--skip-validation/],
    ['a TDD strictness variable that no tool reads', /SDD_TDD_STRICT/],
    ['the retired workflow-validation hook', /validate-sdd-workflow/],
    ['the retired test-coverage hook', /check-test-coverage/],
  ])('never mentions %s', (...[, pattern]) => {
    for (const file of markdownFiles(HOOKS)) expect({ file, text: fs.readFileSync(file, 'utf8') }).not.toEqual(expect.objectContaining({ text: expect.stringMatching(pattern) }));
  });

  it('ships exactly the five hooks that describe real behavior', async () => {
    const hooks = await new HookLoader(HOOKS).listComponents();
    expect(hooks.map(({ name }) => name).sort()).toEqual([
      'load-project-context',
      'log-tool-execution',
      'remind-uncommitted-changes',
      'save-session-summary',
      'update-spec-status',
    ]);
  });
});
