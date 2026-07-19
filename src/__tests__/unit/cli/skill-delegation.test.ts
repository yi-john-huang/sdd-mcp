import * as fs from 'fs';
import * as path from 'path';

const advisorRoutes = {
  'sdd-requirements': 'planner',
  'sdd-tasks': 'planner',
  'sdd-steering': 'planner',
  'sdd-steering-custom': 'planner',
  'sdd-design': 'architect',
  'sdd-review': 'reviewer',
  'sdd-security-check': 'security-auditor',
} as const;

describe('skill execution guidance', () => {
  it.each(Object.entries(advisorRoutes))('%s names its %s route with one fallback-safe depth-one handoff', (
    skill,
    role,
  ) => {
    const content = fs.readFileSync(
      path.resolve(process.cwd(), 'skills', skill, 'SKILL.md'),
      'utf8',
    );

    expect(content).toContain('## Specialist Delegation');
    expect(content).toContain(`\`${role}\``);
    expect(content).toContain('specialistDepth: 1');
    expect(content).toMatch(/exactly one compact handoff/i);
    expect(content).toMatch(/must not delegate again/i);
    expect(content).toMatch(/unavailable.*continue in the parent/i);
  });

  it.each(['sdd-implement', 'sdd-test-gen', 'simple-task', 'sdd-commit'])(
    '%s remains inline for serial work',
    skill => {
      const content = fs.readFileSync(
        path.resolve(process.cwd(), 'skills', skill, 'SKILL.md'),
        'utf8',
      );

      expect(content).not.toContain('## Specialist Delegation');
      expect(content).toMatch(/current turn|work inline/i);
    },
  );
});
