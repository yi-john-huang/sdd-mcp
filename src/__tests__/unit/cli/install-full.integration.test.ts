import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { InstallSkillsCLI } from '../../../cli/install-skills';
import type { InstallTarget, TargetPromptIO } from '../../../cli/install-target';

const repositoryRoot = process.cwd();

describe('full-profile target journeys', () => {
  let outputRoot: string;
  let originalCwd: string;
  let log: jest.SpyInstance;
  let error: jest.SpyInstance;
  let warn: jest.SpyInstance;

  beforeEach(() => {
    outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-full-install-'));
    originalCwd = process.cwd();
    log = jest.spyOn(console, 'log').mockImplementation();
    error = jest.spyOn(console, 'error').mockImplementation();
    warn = jest.spyOn(console, 'warn').mockImplementation();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(outputRoot, { recursive: true, force: true });
    log.mockRestore();
    warn.mockRestore();
    error.mockRestore();
    process.exitCode = undefined;
  });

  it.each([
    ['codex' as const, '.codex/agents/planner.toml', 'gpt-5.6-sol', '.claude', 'CLAUDE.md'],
    ['claude-code' as const, '.claude/agents/planner.md', 'model: opus', '.codex', 'AGENTS.md'],
  ])('installs a complete %s-native tree', async (
    target,
    agentPath,
    model,
    forbiddenDirectory,
    forbiddenGuidance,
  ) => {
    const prompt = promptDouble();
    const cli = new InstallSkillsCLI(
      path.join(repositoryRoot, 'skills'),
      path.join(repositoryRoot, 'steering'),
      prompt,
    );
    process.chdir(outputRoot);

    await cli.runUnified(cli.parseArgs(['--target', target, '--profile', 'full']));

    expect(prompt.chooseTarget).not.toHaveBeenCalled();
    expect(fs.readFileSync(path.join(outputRoot, agentPath), 'utf8')).toContain(model);
    expect(fs.existsSync(path.join(outputRoot, forbiddenDirectory))).toBe(false);
    expect(fs.existsSync(path.join(outputRoot, forbiddenGuidance))).toBe(false);
    const ignore = fs.readFileSync(path.join(outputRoot, '.gitignore'), 'utf8');
    if (target === 'codex') {
      expect(ignore).toContain('.agents/');
      expect(ignore).toContain('.codex/');
      expect(ignore).not.toContain('.claude/');
    } else {
      expect(ignore).toContain('.claude/');
      expect(ignore).not.toContain('.codex/');
    }
    expect(process.exitCode).toBeUndefined();
  });

  it('applies YAML role selectors to Codex and OMP agents and Claude model overrides', async () => {
    fs.writeFileSync(path.join(outputRoot, 'models.yaml'), `modelRoles:
  planner:
    codex: openai-codex/gpt-6-sol:high
    omp: xai-oauth/grok-4.7:xhigh
    claudeCode:
      model: sonnet
      effort: xhigh
  reviewer:
    claudeCode:
      effort: low
  implementer: openai-codex/gpt-6-luna:max
`);
    const cli = new InstallSkillsCLI(
      path.join(repositoryRoot, 'skills'),
      path.join(repositoryRoot, 'steering'),
      promptDouble(),
    );
    process.chdir(outputRoot);
    for (const target of ['codex', 'omp', 'claude-code'] as const) {
      await cli.runUnified(cli.parseArgs(['--target', target, '--profile', 'full', '--model-roles', 'models.yaml']));
    }
    const codex = fs.readFileSync(path.join(outputRoot, '.codex/agents/planner.toml'), 'utf8');
    expect(codex).toContain('model = "gpt-6-sol"');
    expect(codex).toContain('model_reasoning_effort = "high"');
    expect(fs.readFileSync(path.join(outputRoot, '.codex/agents/reviewer.toml'), 'utf8'))
      .toContain('model_reasoning_effort = "xhigh"');
    const implementer = fs.readFileSync(path.join(outputRoot, '.codex/agents/implementer.toml'), 'utf8');
    expect(implementer).toContain('model = "gpt-6-luna"');
    expect(implementer).toContain('model_reasoning_effort = "max"');
    const omp = fs.readFileSync(path.join(outputRoot, '.omp/agents/planner.md'), 'utf8');
    expect(omp).toContain('model: xai-oauth/grok-4.7');
    expect(omp).toContain('thinkingLevel: xhigh');
    expect(fs.readFileSync(path.join(outputRoot, '.omp/agents/implementer.md'), 'utf8')).toContain('thinkingLevel: max');
    expect(fs.readFileSync(path.join(outputRoot, '.claude/skills/sdd-requirements/SKILL.md'), 'utf8')).toContain('model: sonnet');
    expect(fs.readFileSync(path.join(outputRoot, '.claude/agents/planner.md'), 'utf8')).toContain('effort: xhigh');
    expect(fs.readFileSync(path.join(outputRoot, '.claude/skills/sdd-requirements/SKILL.md'), 'utf8')).toContain('effort: xhigh');
    expect(fs.readFileSync(path.join(outputRoot, '.claude/agents/reviewer.md'), 'utf8')).toContain('model: opus\neffort: low');
    expect(fs.readFileSync(path.join(outputRoot, '.claude/skills/sdd-review/SKILL.md'), 'utf8'))
      .toContain('effort: low');
    expect(fs.readFileSync(path.join(outputRoot, '.claude/agents/implementer.md'), 'utf8'))
      .toContain('model: sonnet\neffort: medium');
    expect(process.exitCode).toBeUndefined();
  });

  it('rejects unknown roles before writing an install', async () => {
    fs.writeFileSync(path.join(outputRoot, 'models.yaml'), 'modelRoles:\n  smol: openai-codex/gpt-6-luna:medium\n');
    const cli = new InstallSkillsCLI(
      path.join(repositoryRoot, 'skills'),
      path.join(repositoryRoot, 'steering'),
      promptDouble(),
    );
    process.chdir(outputRoot);
    await expect(cli.runUnified(cli.parseArgs(['--target', 'omp', '--model-roles', 'models.yaml'])))
      .rejects.toThrow('modelRoles');
    expect(fs.existsSync(path.join(outputRoot, '.omp'))).toBe(false);
  });

  it('rejects unsupported Claude effort before writing an install', async () => {
    fs.writeFileSync(path.join(outputRoot, 'models.yaml'), 'modelRoles:\n  planner:\n    claudeCode:\n      effort: minimal\n');
    const cli = new InstallSkillsCLI(
      path.join(repositoryRoot, 'skills'),
      path.join(repositoryRoot, 'steering'),
      promptDouble(),
    );
    process.chdir(outputRoot);
    await expect(cli.runUnified(cli.parseArgs(['--target', 'claude-code', '--model-roles', 'models.yaml'])))
      .rejects.toThrow('Invalid model roles file');
    expect(fs.existsSync(path.join(outputRoot, '.claude'))).toBe(false);
  });

  it('uses the interactive full-profile selection before writing files', async () => {
    const prompt = promptDouble('codex');
    const cli = new InstallSkillsCLI(
      path.join(repositoryRoot, 'skills'),
      path.join(repositoryRoot, 'steering'),
      prompt,
    );
    process.chdir(outputRoot);

    await cli.runUnified(cli.parseArgs(['--profile', 'full']));

    expect(prompt.chooseTarget).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(path.join(outputRoot, 'AGENTS.md'))).toBe(true);
    expect(fs.existsSync(path.join(outputRoot, 'CLAUDE.md'))).toBe(false);
  });

  it('switches targets without deleting prior artifacts and unions generated ignores', async () => {
    const cli = new InstallSkillsCLI(
      path.join(repositoryRoot, 'skills'),
      path.join(repositoryRoot, 'steering'),
      promptDouble(),
    );
    process.chdir(outputRoot);

    await cli.runUnified(cli.parseArgs(['--target', 'codex', '--profile', 'full']));
    await cli.runUnified(cli.parseArgs(['--target', 'claude-code', '--profile', 'full']));

    expect(fs.existsSync(path.join(outputRoot, 'AGENTS.md'))).toBe(true);
    expect(fs.existsSync(path.join(outputRoot, 'CLAUDE.md'))).toBe(true);
    expect(fs.existsSync(path.join(outputRoot, '.codex/agents/planner.toml'))).toBe(true);
    expect(fs.existsSync(path.join(outputRoot, '.claude/agents/planner.md'))).toBe(true);
    const ignore = fs.readFileSync(path.join(outputRoot, '.gitignore'), 'utf8');
    expect(ignore.match(/BEGIN sdd-mcp/g)).toHaveLength(1);
    expect(ignore).toContain('.agents/');
    expect(ignore).toContain('.codex/');
    expect(ignore).toContain('.claude/');
  });

  it('propagates optional integration failures into the CLI result', async () => {
    fs.writeFileSync(path.join(outputRoot, '.agent'), 'not a directory');
    const cli = new InstallSkillsCLI(
      path.join(repositoryRoot, 'skills'),
      path.join(repositoryRoot, 'steering'),
      promptDouble(),
    );
    process.chdir(outputRoot);

    await cli.runUnified(cli.parseArgs([
      '--target', 'claude-code', '--skills', '--antigravity',
    ]));

    expect(process.exitCode).toBe(1);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('.agent/workflows'));
  });

  it('reports optional integration setup failures without throwing', async () => {
    fs.symlinkSync('/nonexistent/sdd-agent-target', path.join(outputRoot, '.agent'), 'dir');
    const cli = new InstallSkillsCLI(
      path.join(repositoryRoot, 'skills'),
      path.join(repositoryRoot, 'steering'),
      promptDouble(),
    );
    process.chdir(outputRoot);

    await cli.runUnified(cli.parseArgs([
      '--target', 'claude-code', '--skills', '--antigravity',
    ]));

    expect(process.exitCode).toBe(1);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('root/.agent'));
  });
});

function promptDouble(choice?: InstallTarget): jest.Mocked<TargetPromptIO> {
  return {
    isInteractive: jest.fn().mockReturnValue(Boolean(choice)),
    chooseTarget: jest.fn().mockResolvedValue(choice ?? null),
    writeNotice: jest.fn(),
  };
}
