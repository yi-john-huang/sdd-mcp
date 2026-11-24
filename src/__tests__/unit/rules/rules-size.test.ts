import * as fs from 'fs';
import * as path from 'path';

const RULES = ['coding-style.md', 'error-handling.md', 'security.md', 'testing.md'] as const;
const read = (file: string): string => fs.readFileSync(path.resolve(process.cwd(), 'rules', file), 'utf8');

describe('canonical rule text budget', () => {
  it('keeps the four rule files at or below 6,000 bytes together', () => {
    const total = RULES.reduce((sum, file) => sum + Buffer.byteLength(read(file), 'utf8'), 0);
    expect(total).toBeLessThanOrEqual(6_000);
  });

  it.each(RULES)('keeps the %s frontmatter', (file) => {
    expect(read(file)).toMatch(/^---\nname: [a-z-]+\ndescription: .+\npriority: \d+\nalwaysActive: true\n---\n/);
  });

  it.each<[string, RegExp]>([
    ['the false kebab-case file-name convention', /kebab-case/i],
    ['the strict-mode instruction, now enforced by tsconfig', /enable strict mode/i],
    ['generic password storage advice', /bcrypt|password polic/i],
    ['the AAA template', /\/\/ Arrange/],
    ['unenforced coverage percentages', /\d+% (code )?coverage/i],
    ['the anti-pattern table', /\| Anti-Pattern \|/],
  ])('no longer contains %s', (...[, pattern]) => {
    for (const file of RULES) expect(read(file)).not.toMatch(pattern);
  });
});
