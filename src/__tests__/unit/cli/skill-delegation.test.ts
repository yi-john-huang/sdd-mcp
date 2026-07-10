import * as fs from 'fs';
import * as path from 'path';
import { SKILL_AGENT_ROUTES } from '../../../cli/install-target';

describe('phase skill specialist delegation', () => {
  it.each(Object.entries(SKILL_AGENT_ROUTES))('%s delegates to %s with a compact fallback-safe handoff', (
    skill,
    role,
  ) => {
    const content = fs.readFileSync(
      path.resolve(process.cwd(), 'skills', skill, 'SKILL.md'),
      'utf8',
    );

    expect(content).toContain('## Specialist Delegation');
    expect(content).toContain(`\`${role}\``);
    expect(content).toMatch(/compact handoff/i);
    expect(content).toMatch(/wait for.*integrate/i);
    expect(content).toMatch(/unavailable.*state the fallback.*continue/i);
  });

  it('does not add an unapproved specialist route to commit guidance', () => {
    expect(SKILL_AGENT_ROUTES['sdd-commit']).toBeUndefined();
  });
});
