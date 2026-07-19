import {
  parseSourceAgent,
  renderClaudeCodeAgent,
  renderCodexAgent,
} from '../../../cli/tool-support/target-agent-renderer';

const PLANNER = `---
name: planner
description: Plans work
role: planner
expertise: Planning
---

# Planner

Plan "carefully" across lines.
`;

describe('target agent rendering', () => {
  it('renders Claude Code metadata with opus for high-level roles', () => {
    const rendered = renderClaudeCodeAgent(parseSourceAgent(PLANNER));
    expect(rendered).toContain('model: opus');
    expect(rendered).toContain('role: planner');
    expect(rendered).toContain('# Planner');
  });

  it('renders Claude Code sonnet for implementation roles', () => {
    const source = PLANNER.replaceAll('planner', 'implementer');
    expect(renderClaudeCodeAgent(parseSourceAgent(source))).toContain('model: sonnet');
  });

  it('renders Codex TOML with Sol xhigh for high-level roles', () => {
    const rendered = renderCodexAgent(parseSourceAgent(PLANNER));
    expect(rendered).toContain('model = "gpt-5.6-sol"');
    expect(rendered).toContain('model_reasoning_effort = "xhigh"');
    expect(rendered).toContain('developer_instructions = ');
    expect(rendered).toContain('\\"carefully\\"');
  });

  it('renders Codex Sol medium for implementation roles', () => {
    const source = PLANNER.replaceAll('planner', 'implementer');
    const rendered = renderCodexAgent(parseSourceAgent(source));
    expect(rendered).toContain('model = "gpt-5.6-sol"');
    expect(rendered).toContain('model_reasoning_effort = "medium"');
  });

  it('rejects an unknown role', () => {
    expect(() => parseSourceAgent(PLANNER.replaceAll('planner', 'unknown'))).toThrow();
  });
});
