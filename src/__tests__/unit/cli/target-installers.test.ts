import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { installClaudeCodeTarget } from '../../../cli/tool-support/claude-code';
import { installCodexTarget } from '../../../cli/tool-support/codex';
import { getTargetPolicy } from '../../../cli/install-target';

function sourceFile(root: string, relative: string, content: string): string {
  const filePath = path.join(root, relative);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
  return filePath;
}

function sourceAgent(role: string): string {
  return `---\nname: ${role}\ndescription: ${role} agent\nrole: ${role}\nexpertise: tests\n---\n\nFollow the approved plan.\n`;
}

function makeSources(root: string) {
  const skillDir = path.join(root, 'skills', 'sdd-design');
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# Design');
  const rule = sourceFile(root, 'rules/security.md', '# Security');
  const context = sourceFile(root, 'contexts/review.md', '# Review');
  const planner = sourceFile(root, 'agents/planner.md', sourceAgent('planner'));
  const implementer = sourceFile(root, 'agents/implementer.md', sourceAgent('implementer'));
  const hook = sourceFile(root, 'hooks/session-start/load-context.md', '# Hook');
  const steering = path.join(root, 'steering');
  sourceFile(root, 'steering/product.md', '# Product');

  return {
    skillManager: {
      listSkills: jest.fn().mockResolvedValue([
        { name: 'sdd-design', description: 'Design', path: skillDir },
      ]),
    } as any,
    rulesManager: {
      listComponents: jest.fn().mockResolvedValue([
        { name: 'security', description: 'Security', path: rule },
      ]),
    } as any,
    contextManager: {
      listComponents: jest.fn().mockResolvedValue([
        { name: 'review', description: 'Review', path: context },
      ]),
    } as any,
    agentManager: {
      listComponents: jest.fn().mockResolvedValue([
        { name: 'planner', description: 'Planner', role: 'planner', path: planner },
        { name: 'implementer', description: 'Implementer', role: 'implementer', path: implementer },
      ]),
    } as any,
    hookLoader: {
      listComponents: jest.fn().mockResolvedValue([
        { name: 'load-context', description: 'Load', event: 'session-start', path: hook },
      ]),
    } as any,
    steeringSource: steering,
  };
}

describe('target-specific installers', () => {
  let root: string;
  let sourceRoot: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-target-output-'));
    sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-target-source-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(sourceRoot, { recursive: true, force: true });
  });

  it('installs only native Claude Code artifacts and renders model aliases', async () => {
    const report = await installClaudeCodeTarget({
      projectRoot: root,
      paths: getTargetPolicy('claude-code').defaultPaths,
      components: ['skills', 'steering', 'rules', 'contexts', 'agents', 'hooks'],
      sources: makeSources(sourceRoot),
      rootGuidanceContent: '# Claude guidance\n',
    });

    expect(report.failed).toEqual([]);
    expect(fs.existsSync(path.join(root, '.claude/skills/sdd-design/SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(root, '.claude/rules/security.md'))).toBe(true);
    expect(fs.existsSync(path.join(root, '.claude/contexts/review.md'))).toBe(true);
    expect(fs.existsSync(path.join(root, '.claude/hooks/session-start/load-context.md'))).toBe(true);
    expect(fs.readFileSync(path.join(root, '.claude/agents/planner.md'), 'utf8')).toContain('model: opus');
    expect(fs.readFileSync(path.join(root, '.claude/agents/implementer.md'), 'utf8')).toContain('model: sonnet');
    expect(fs.existsSync(path.join(root, 'CLAUDE.md'))).toBe(true);
    expect(fs.existsSync(path.join(root, '.codex'))).toBe(false);
    expect(fs.existsSync(path.join(root, 'AGENTS.md'))).toBe(false);
  });

  it('renders Claude root guidance for selected components and custom paths', async () => {
    await installClaudeCodeTarget({
      projectRoot: root,
      paths: {
        ...getTargetPolicy('claude-code').defaultPaths,
        skills: 'custom/skills',
        agents: 'custom/agents',
      },
      components: ['skills', 'agents'],
      sources: makeSources(sourceRoot),
      rootGuidanceContent: '# Claude guidance\n\n## Installed Components\n\n## MCP Tools\n',
    });

    const guidance = fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf8');
    expect(guidance).toContain('### Skills (`custom/skills/`)');
    expect(guidance).toContain('`custom/skills/sdd-design/`');
    expect(guidance).toContain('### Agents (`custom/agents/`)');
    expect(guidance).toContain('`custom/agents/planner.md`');
    expect(guidance.indexOf('### Skills')).toBeLessThan(guidance.indexOf('## MCP Tools'));
    expect(guidance).not.toContain('### Rules');
    expect(guidance).not.toContain('.claude/skills');
    expect(fs.existsSync(path.join(root, 'custom/skills/sdd-design/SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'custom/agents/planner.md'))).toBe(true);
  });

  it('installs only native Codex artifacts and renders exact role models', async () => {
    const report = await installCodexTarget({
      projectRoot: root,
      paths: getTargetPolicy('codex').defaultPaths,
      components: ['skills', 'steering', 'rules', 'contexts', 'agents', 'hooks'],
      sources: makeSources(sourceRoot),
      rootGuidancePreamble: '# Codex guidance\n\n',
      hookRunnerContent: 'process.stdout.write(JSON.stringify({ continue: true }));\n',
    });

    expect(report.failed).toEqual([]);
    expect(fs.existsSync(path.join(root, '.agents/skills/sdd-design/SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(root, '.codex/guidance/rules/security.md'))).toBe(true);
    expect(fs.existsSync(path.join(root, '.codex/guidance/contexts/review.md'))).toBe(true);
    expect(fs.readFileSync(path.join(root, '.codex/agents/planner.toml'), 'utf8')).toContain('model = "gpt-5.6-sol"');
    expect(fs.readFileSync(path.join(root, '.codex/agents/planner.toml'), 'utf8')).toContain('model_reasoning_effort = "xhigh"');
    expect(fs.readFileSync(path.join(root, '.codex/agents/implementer.toml'), 'utf8')).toContain('model = "gpt-5.6-luna"');
    expect(fs.readFileSync(path.join(root, '.codex/agents/implementer.toml'), 'utf8')).toContain('model_reasoning_effort = "max"');
    expect(JSON.parse(fs.readFileSync(path.join(root, '.codex/hooks.json'), 'utf8'))).toHaveProperty('hooks.SessionStart');
    expect(fs.existsSync(path.join(root, '.codex/hooks/sdd-hook-runner.js'))).toBe(true);
    expect(fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8')).toContain('.codex/agents/planner.toml');
    expect(fs.existsSync(path.join(root, '.claude'))).toBe(false);
    expect(fs.existsSync(path.join(root, 'CLAUDE.md'))).toBe(false);
  });

  it('preserves existing root and agent files on repeated installs', async () => {
    const request = {
      projectRoot: root,
      paths: getTargetPolicy('codex').defaultPaths,
      components: ['agents'] as const,
      sources: makeSources(sourceRoot),
      rootGuidancePreamble: '# Codex guidance\n\n',
      hookRunnerContent: '',
    };

    await installCodexTarget(request);
    fs.writeFileSync(path.join(root, '.codex/agents/planner.toml'), 'user-owned');
    fs.writeFileSync(path.join(root, 'AGENTS.md'), 'user guidance');
    const report = await installCodexTarget(request);

    expect(fs.readFileSync(path.join(root, '.codex/agents/planner.toml'), 'utf8')).toBe('user-owned');
    expect(fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8')).toBe('user guidance');
    expect(report.skipped).toEqual(expect.arrayContaining([
      '.codex/agents/planner.toml',
      'AGENTS.md',
    ]));
  });

  it('references custom Codex paths and omits unselected sections', async () => {
    const sources = makeSources(sourceRoot);
    await installCodexTarget({
      projectRoot: root,
      paths: {
        ...getTargetPolicy('codex').defaultPaths,
        skills: 'custom/skills',
        agents: 'custom/agents',
      },
      components: ['skills'],
      sources,
      rootGuidancePreamble: '# Codex guidance\n\n',
      hookRunnerContent: '',
    });

    const guidance = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
    expect(guidance).toContain('custom/skills/sdd-design/');
    expect(guidance).not.toContain('custom/agents');
    expect(fs.existsSync(path.join(root, 'custom/skills/sdd-design/SKILL.md'))).toBe(true);
  });
});
