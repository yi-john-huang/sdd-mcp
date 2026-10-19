import * as fs from 'fs';
import * as path from 'path';
import { renderClaudeCodeAgent, renderCodexAgent, renderOmpAgent } from '../../../cli/tool-support/target-agent-renderer';
import { renderTargetSkill } from '../../../cli/tool-support/target-installer';
import type { InstallTarget } from '../../../cli/install-target';

const root = process.cwd();
const read = (relative: string): string => fs.readFileSync(path.join(root, relative), 'utf8');
const skill = (name: string): string => read(`skills/${name}/SKILL.md`);
const bytes = (text: string): number => Buffer.byteLength(text, 'utf8');

/** Each affected Skill and the phrase that proves it carries its JEV step. */
const STEPS: Array<[string, RegExp[]]> = [
  ['sdd-requirements', [/internally run the JEV `requirements` check/, /never affects approval/i]],
  ['sdd-design', [/internally run the JEV `design` check/, /never affects approval/i]],
  ['sdd-tasks', [/internally run the JEV `testcases` check/, /case list/, /never records the checkpoint/i]],
  ['sdd-implement', [/internally run the JEV `red` check/, /never blocks recording/i]],
  ['sdd-review', [/parent \(never an agent\)/, /JEV `security` and `principles` checks/, /only violated principles/i]],
  ['sdd-security-check', [/parent \(never an agent\)/, /JEV `security` check/]],
  ['sdd-commit', [/JEV `commit` lookup/, /local, read-only/, /never blocks/i]],
];
const AFFECTED = STEPS.map(([name]) => name);

describe('JEV Skill steps', () => {
  it.each(STEPS)('%s carries its JEV step', (name, phrases) => {
    const text = skill(name);
    expect(text).toContain('JEV');
    for (const phrase of phrases) expect(text).toMatch(phrase);
  });

  it.each(AFFECTED)('%s holds no endpoint, key handling, regex, or redaction logic', (name) => {
    const text = skill(name);
    for (const forbidden of [/jevtypesafeai/i, /SDD_JEV/, /api\/v1\/decide/, /Bearer/, /AKIA/, /\\d\{/, /\[REDACTED\]/, /https?:\/\//]) {
      expect(text).not.toMatch(forbidden);
    }
  });

  it.each(AFFECTED)('%s never asks the user to operate an MCP tool for JEV', (name) => {
    const text = skill(name);
    expect(text).not.toContain('sdd-jev-check');
    expect(text).not.toMatch(/(?:you|user)\s+(?:must|should|can|then)?\s*(?:call|run|invoke)\s+`?sdd-/i);
  });

  it('keeps the commit lookup local, read-only, and free of extra questions', () => {
    const text = skill('sdd-commit');
    expect(text).toMatch(/local, read-only/);
    expect(text).toMatch(/never blocks, skips hooks, or asks a question/i);
  });

  it('keeps every Skill within the byte budgets', () => {
    for (const name of AFFECTED) expect(bytes(skill(name))).toBeLessThanOrEqual(4_000);
    const all = fs.readdirSync(path.join(root, 'skills')).map((name) => bytes(skill(name)));
    expect(all.reduce((sum, size) => sum + size, 0)).toBeLessThanOrEqual(40_000);
  });
});

describe('security contact wording', () => {
  const securitySkill = skill('sdd-security-check');
  const auditor = read('agents/security-auditor.md');

  it('defines forbidden contact as the audited target or its systems, with one parent-only exception', () => {
    expect(securitySkill).toMatch(/contact the audited target or its systems/);
    expect(securitySkill).toMatch(/only permitted outbound call is the parent's opt-in JEV triage after the audit returns/);
    expect(securitySkill).not.toMatch(/contact external systems/);
    expect(auditor).toMatch(/audited target or its systems/);
    expect(auditor).toMatch(/Only the parent may make the opt-in JEV triage call after this assignment returns/);
    expect(auditor).not.toMatch(/external contact/);
  });

  it('still forbids the agent itself from any network access', () => {
    expect(auditor).toMatch(/no network access of any kind/);
    expect(auditor).toMatch(/depth-one read-only assignment/);
    expect(bytes(auditor)).toBeLessThanOrEqual(4_000);
  });
});

describe('rendered targets carry the new wording', () => {
  const targets: InstallTarget[] = ['claude-code', 'codex', 'omp'];
  const sourceAgent = (): Parameters<typeof renderClaudeCodeAgent>[0] => {
    const content = read('agents/security-auditor.md');
    return {
      name: 'security-auditor', description: 'Focused threat and vulnerability assessment specialist', role: 'security-auditor',
      expertise: 'Trust boundaries', instructions: content.split(/^---\n[\s\S]*?\n---\n/m).pop()!.trim(),
    } as never;
  };

  it.each(targets.flatMap((target) => STEPS.map(([name, phrases]) => [target, name, phrases] as const)))(
    'renders %s %s with its JEV step',
    (target, name, phrases) => {
      const rendered = renderTargetSkill(target, name, skill(name));
      expect(rendered).toContain('JEV');
      for (const phrase of phrases) expect(rendered).toMatch(phrase);
    },
  );

  it.each([
    ['claude-code', () => renderClaudeCodeAgent(sourceAgent())],
    ['codex', () => renderCodexAgent(sourceAgent())],
    ['omp', () => renderOmpAgent(sourceAgent())],
  ] as const)('renders the %s security auditor with the narrowed contact rule', (_target, render) => {
    const rendered = render();
    expect(rendered).toMatch(/audited target or its systems/);
    expect(rendered).toMatch(/Only the parent may make the opt-in JEV triage call/);
    expect(rendered).toMatch(/no network access of any kind/);
  });
});
