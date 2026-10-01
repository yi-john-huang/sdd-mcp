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

  it.each(['sdd-review', 'sdd-security-check'])('%s asks once per session only when project agents are installed', skill => {
    const content = fs.readFileSync(path.resolve(process.cwd(), 'skills', skill, 'SKILL.md'), 'utf8');
    expect(content).toMatch(/Default is inline/);
    expect(content).toMatch(/only when project agents are installed, ask once per session/i);
    expect(content).toMatch(/never ask again or per phase/i);
  });

  it.each(['sdd-implement', 'sdd-test-gen', 'simple-task'])('%s asks only for independent slices and never splits to justify agents', skill => {
    const content = fs.readFileSync(path.resolve(process.cwd(), 'skills', skill, 'SKILL.md'), 'utf8');
    expect(content).toContain('## Execution Mode');
    expect(content).toMatch(/split work to justify agents/i);
    expect(content).toMatch(/at least two independent/i);
    expect(content).toMatch(/ask once per session/i);
    expect(content).toMatch(/record one fallback and finish/i);
  });

  it.each(['sdd-requirements', 'sdd-design', 'sdd-tasks', 'sdd-steering', 'sdd-steering-custom'])('%s never asks for an execution mode', skill => {
    const content = fs.readFileSync(path.resolve(process.cwd(), 'skills', skill, 'SKILL.md'), 'utf8');
    expect(content).not.toMatch(/ask once per session/i);
  });

  it.each(['sdd-requirements', 'sdd-design', 'sdd-tasks', 'sdd-steering', 'sdd-steering-custom', 'sdd-review', 'sdd-security-check', 'sdd-implement', 'sdd-test-gen', 'simple-task'])('%s reports execution mode, agents, parallelism, routes, and fallbacks', skill => {
    const content = fs.readFileSync(path.resolve(process.cwd(), 'skills', skill, 'SKILL.md'), 'utf8');
    expect(content).toMatch(/Execution report: mode \(inline\|project-agent; asked\|reused\|not offered\), agents started and whether parallel, configured model\/effort per agent \(never claim unobserved values\), and any fallback to the parent/);
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

  it('sdd-commit forbids attribution trailers and generated-with lines', () => {
    const content = fs.readFileSync(path.resolve(process.cwd(), 'skills', 'sdd-commit', 'SKILL.md'), 'utf8');
    expect(content).toContain('Never add `Co-Authored-By:` trailers');
    expect(content).toContain('"Generated with Claude Code"');
  });
});
