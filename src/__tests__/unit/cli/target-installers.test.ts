import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { installClaudeCodeTarget } from '../../../cli/tool-support/claude-code';
import { installCodexTarget } from '../../../cli/tool-support/codex';
import { installOmpTarget } from '../../../cli/tool-support/omp';
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
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: sdd-design\ndescription: Design\n---\n\n# Design');
  sourceFile(root, 'skills/sdd-design/references/example.md', '# Example');
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
    const claudeSkill = fs.readFileSync(path.join(root, '.claude/skills/sdd-design/SKILL.md'), 'utf8');
    expect(claudeSkill).toContain('disable-model-invocation: true');
    expect(claudeSkill).toContain('model: opus');
    expect(claudeSkill).toContain('do not spawn a second specialist');
    expect(fs.readFileSync(path.join(root, '.claude/rules/security.md'), 'utf8')).toContain('paths:');
    expect(fs.existsSync(path.join(root, '.claude/skills/sdd-design/references/example.md'))).toBe(true);
    expect(fs.existsSync(path.join(root, '.claude/contexts/review.md'))).toBe(true);
    expect(fs.existsSync(path.join(root, '.claude/hooks/session-start/load-context.md'))).toBe(true);
    expect(fs.readFileSync(path.join(root, '.claude/agents/planner.md'), 'utf8')).toContain('model: opus');
    expect(fs.readFileSync(path.join(root, '.claude/agents/implementer.md'), 'utf8')).toContain('model: sonnet');
    expect(fs.existsSync(path.join(root, 'CLAUDE.md'))).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(root, '.mcp.json'), 'utf8')).mcpServers['sdd-mcp'])
      .toEqual({ type: 'stdio', command: 'npx', args: ['-y', 'sdd-mcp-server@5.0.0'] });
    expect(JSON.parse(fs.readFileSync(path.join(root, '.claude/settings.json'), 'utf8')).permissions.allow)
      .toContain('mcp__sdd-mcp__*');
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
    expect(guidance).toContain('- Skills: `custom/skills/`');
    expect(guidance).toContain('- Agents: `custom/agents/`');
    expect(guidance).not.toContain('`custom/skills/sdd-design/');
    expect(guidance).not.toContain('planner.md');
    expect(Buffer.byteLength(guidance)).toBeLessThanOrEqual(2500);
    expect(guidance).not.toContain('- Rules:');
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
    expect(fs.readFileSync(path.join(root, '.codex/agents/implementer.toml'), 'utf8')).toContain('model = "gpt-5.6-sol"');
    expect(fs.readFileSync(path.join(root, '.codex/agents/implementer.toml'), 'utf8')).toContain('model_reasoning_effort = "medium"');
    expect(JSON.parse(fs.readFileSync(path.join(root, '.codex/hooks.json'), 'utf8'))).toHaveProperty('hooks.SessionStart');
    expect(fs.existsSync(path.join(root, '.codex/hooks/sdd-hook-runner.mjs'))).toBe(true);
    expect(fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8')).toContain('- Agents: `.codex/agents/`');
    expect(fs.existsSync(path.join(root, '.agents/skills/sdd-design/agents/openai.yaml'))).toBe(true);
    expect(fs.readFileSync(path.join(root, '.agents/skills/sdd-design/agents/openai.yaml'), 'utf8'))
      .toContain('allow_implicit_invocation: false');
    expect(fs.readFileSync(path.join(root, '.agents/skills/sdd-design/SKILL.md'), 'utf8'))
      .toContain('Request the configured architect custom agent once');
    expect(fs.existsSync(path.join(root, '.agents/skills/sdd-design/references/example.md'))).toBe(true);
    expect(Buffer.byteLength(fs.readFileSync(path.join(root, 'AGENTS.md')))).toBeLessThanOrEqual(2000);
    expect(fs.readFileSync(path.join(root, '.codex/config.toml'), 'utf8'))
      .toContain('sdd-mcp-server@5.0.0');
    expect(fs.existsSync(path.join(root, '.claude'))).toBe(false);
    expect(fs.existsSync(path.join(root, 'CLAUDE.md'))).toBe(false);
  });
  it.each([
    ['codex', '.agents', 'skills'],
    ['codex', '.codex', 'rules'],
    ['claude-code', '.claude', 'skills'],
  ] as const)('rejects symlinked %s component roots', async (target, componentRoot, component) => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-target-outside-'));
    fs.symlinkSync(outside, path.join(root, componentRoot), 'dir');

    try {
      const report = target === 'codex'
        ? await installCodexTarget({
          projectRoot: root,
          paths: getTargetPolicy(target).defaultPaths,
          components: [component],
          sources: makeSources(sourceRoot),
          rootGuidancePreamble: '# Codex guidance\n',
          hookRunnerContent: '',
        })
        : await installClaudeCodeTarget({
          projectRoot: root,
          paths: getTargetPolicy(target).defaultPaths,
          components: [component],
          sources: makeSources(sourceRoot),
          rootGuidanceContent: '# Claude guidance\n',
        });
      expect(report.failed.some(failure => failure.component === component)).toBe(true);
      expect(fs.readdirSync(outside)).toEqual([]);
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it('reports Codex hook template read failures', async () => {
    const originalReadFile = fs.promises.readFile.bind(fs.promises);
    const readSpy = jest.spyOn(fs.promises, 'readFile').mockImplementation(async (filePath, options) => {
      if (String(filePath).endsWith('templates/codex-hook-runner.js')) {
        throw new Error('EACCES');
      }
      return originalReadFile(filePath, options);
    });

    try {
      const report = await installCodexTarget({
        projectRoot: root,
        paths: getTargetPolicy('codex').defaultPaths,
        components: ['hooks'],
        sources: makeSources(sourceRoot),
        rootGuidancePreamble: '# Codex guidance\n',
      });
      expect(report.failed).toEqual(expect.arrayContaining([
        expect.objectContaining({ component: 'hooks', error: 'EACCES' }),
      ]));
    } finally {
      readSpy.mockRestore();
    }
  });

  it('does not write root guidance for an empty component selection', async () => {
    const report = await installClaudeCodeTarget({
      projectRoot: root,
      paths: getTargetPolicy('claude-code').defaultPaths,
      components: [],
      sources: makeSources(sourceRoot),
    });
    expect(report.failed).toEqual([]);
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
    expect(guidance).toContain('- Skills: `custom/skills/`');
    expect(guidance).not.toContain('`custom/skills/sdd-design/');
    expect(guidance).not.toContain('custom/agents');
    expect(fs.existsSync(path.join(root, 'custom/skills/sdd-design/SKILL.md'))).toBe(true);
  });

  it('installs the OMP lean component set without rules, contexts, or hooks', async () => {
    const report = await installOmpTarget({
      projectRoot: root,
      paths: getTargetPolicy('omp').defaultPaths,
      components: ['skills', 'steering', 'agents'],
      sources: makeSources(sourceRoot),
      profile: 'lean',
    });
    expect(report.failed).toEqual([]);
    expect(fs.existsSync(path.join(root, '.omp/agents/planner.md'))).toBe(true);
    expect(fs.existsSync(path.join(root, '.omp/rules'))).toBe(false);
    expect(fs.existsSync(path.join(root, '.omp/contexts'))).toBe(false);
    expect(fs.existsSync(path.join(root, '.omp/hooks'))).toBe(false);
    const guidance = fs.readFileSync(path.join(root, '.omp/AGENTS.md'), 'utf8');
    expect(guidance).toContain('- Agents: `.omp/agents/`');
    expect(guidance).not.toContain('- Rules:');
    expect(JSON.parse(fs.readFileSync(path.join(root, '.omp/mcp.json'), 'utf8')).mcpServers['sdd-mcp'])
      .toEqual({ type: 'stdio', command: 'npx', args: ['-y', 'sdd-mcp-server@5.0.0'] });
  });

  it('renders native OMP full output without hooks or spawn capability', async () => {
    const report = await installOmpTarget({
      projectRoot: root,
      paths: getTargetPolicy('omp').defaultPaths,
      components: ['skills', 'steering', 'rules', 'contexts', 'agents'],
      sources: makeSources(sourceRoot),
      profile: 'full',
    });

    expect(report.failed).toEqual([]);
    expect(fs.existsSync(path.join(root, '.omp/skills/sdd-design/SKILL.md'))).toBe(true);
    expect(fs.readFileSync(path.join(root, '.omp/rules/security.md'), 'utf8')).toContain('alwaysApply: false');
    expect(fs.readFileSync(path.join(root, '.omp/rules/security.md'), 'utf8')).toContain('globs:');
    const designSkill = fs.readFileSync(path.join(root, '.omp/skills/sdd-design/SKILL.md'), 'utf8');
    expect(designSkill).toContain('Run inline by default');
    expect(designSkill).toContain('explicit opt-in only');
    expect(designSkill).toContain('.omp/agents/architect.md');
    expect(designSkill).not.toContain('Delegate once');
    expect(fs.existsSync(path.join(root, '.omp/skills/sdd-design/references/example.md'))).toBe(true);
    const planner = fs.readFileSync(path.join(root, '.omp/agents/planner.md'), 'utf8');
    expect(planner).toContain('model: gpt-5.6-sol');
    expect(planner).toContain('thinkingLevel: xhigh');
    expect(planner).not.toMatch(/^\s*- task$/m);
    expect(planner).not.toContain('spawns:');
    const rootGuidance = fs.readFileSync(path.join(root, '.omp/AGENTS.md'), 'utf8');
    expect(rootGuidance).toContain('/skill:simple-task');
    expect(rootGuidance).toContain('explicit opt-in');
    expect(rootGuidance).not.toContain('sdd-design |');
    expect(Buffer.byteLength(rootGuidance)).toBeLessThanOrEqual(2000);
  });

  it('rejects OMP Markdown hooks explicitly', async () => {
    await expect(installOmpTarget({
      projectRoot: root,
      paths: getTargetPolicy('omp').defaultPaths,
      components: ['hooks'],
      sources: makeSources(sourceRoot),
    })).rejects.toThrow('does not support packaged Markdown hooks');
  });
  it('reports runtime conflicts without overwriting existing target config', async () => {
    const config = path.join(root, '.omp/mcp.json');
    fs.mkdirSync(path.dirname(config), { recursive: true });
    const prior = '{\n  \"mcpServers\": { \"sdd-mcp\": { \"command\": \"private-runtime\" } }\n}\n';
    fs.writeFileSync(config, prior);

    const report = await installOmpTarget({
      projectRoot: root,
      paths: getTargetPolicy('omp').defaultPaths,
      components: ['skills'],
      sources: makeSources(sourceRoot),
    });

    expect(report.failed).toEqual([
      expect.objectContaining({ component: 'runtime', path: config }),
    ]);
    expect(fs.readFileSync(config, 'utf8')).toBe(prior);
    expect(fs.existsSync(path.join(root, '.sdd-mcp/install-manifest.json'))).toBe(false);
    expect(fs.existsSync(path.join(root, '.omp/skills/sdd-design/SKILL.md'))).toBe(false);
    expect(fs.existsSync(path.join(root, '.omp/AGENTS.md'))).toBe(false);
  });

});
