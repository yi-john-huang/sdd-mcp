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
});

function promptDouble(choice?: InstallTarget): jest.Mocked<TargetPromptIO> {
  return {
    isInteractive: jest.fn().mockReturnValue(Boolean(choice)),
    chooseTarget: jest.fn().mockResolvedValue(choice ?? null),
    writeNotice: jest.fn(),
  };
}
