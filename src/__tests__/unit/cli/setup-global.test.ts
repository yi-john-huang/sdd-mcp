import { parse as parseJsonc } from 'jsonc-parser';
import { parse as parseToml } from 'smol-toml';
import { PACKAGE_VERSION } from '../../../shared/version';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CliUsageError } from '../../../cli/install-target';
import {
  GlobalSetupCLI,
  mainGlobalSetup,
  type GlobalTargetLocations,
} from '../../../cli/setup-global';

describe('GlobalSetupCLI argument and native location resolution', () => {
  let fixtureRoot: string;
  let home: string;
  let env: NodeJS.ProcessEnv;
  let runOmpConfigPath: jest.Mock<Promise<string>, []>;
  let cli: GlobalSetupCLI;

  beforeEach(() => {
    fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-global-setup-'));
    home = path.join(fixtureRoot, 'home with spaces');
    fs.mkdirSync(home);
    home = fs.realpathSync(home);
    env = {};
    runOmpConfigPath = jest.fn().mockResolvedValue(path.join(home, '.omp', 'agent'));
    cli = new GlobalSetupCLI({ env, homedir: () => home, runOmpConfigPath });
  });

  afterEach(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }));

  it('accepts only the approved optional target syntax', () => {
    expect(cli.parseArgs([])).toEqual({});
    expect(cli.parseArgs(['--target', 'claude-code'])).toEqual({ target: 'claude-code' });
    expect(cli.parseArgs(['--target', 'codex'])).toEqual({ target: 'codex' });
    expect(cli.parseArgs(['--target', 'omp'])).toEqual({ target: 'omp' });
  });

  it.each([
    ['missing target value', ['--target']],
    ['switch in place of target value', ['--target', '--target']],
    ['repeated target', ['--target', 'codex', '--target', 'codex']],
    ['unsupported target', ['--target', 'claude']],
    ['unknown switch', ['--all-tools']],
    ['positional input', ['codex']],
  ])('rejects %s before filesystem or OMP side effects', (_case, args) => {
    const before = fs.readdirSync(fixtureRoot, { recursive: true });

    expect(() => cli.parseArgs(args)).toThrow(CliUsageError);
    expect(fs.readdirSync(fixtureRoot, { recursive: true })).toEqual(before);
    expect(runOmpConfigPath).not.toHaveBeenCalled();
  });

  it.each([undefined, ''])('uses native Claude default locations for override %p', async override => {
    if (override !== undefined) env.CLAUDE_CONFIG_DIR = override;

    await expect(cli.resolveLocations('claude-code')).resolves.toEqual<GlobalTargetLocations>({
      target: 'claude-code',
      runtimeRoot: home,
      runtimeConfig: '.claude.json',
      runtimeStateDirectory: path.join('.claude', '.sdd-mcp', 'global-runtime'),
      skillsRoot: path.join(home, '.claude'),
      skillsDirectory: 'skills',
      skillsStateDirectory: path.join('.sdd-mcp', 'global-skills'),
    });
    expect(runOmpConfigPath).not.toHaveBeenCalled();
  });

  it('uses the Claude personal directory for every override-owned location', async () => {
    const personal = path.join(home, 'custom claude');
    env.CLAUDE_CONFIG_DIR = '~/custom claude';

    await expect(cli.resolveLocations('claude-code')).resolves.toEqual<GlobalTargetLocations>({
      target: 'claude-code',
      runtimeRoot: personal,
      runtimeConfig: '.claude.json',
      runtimeStateDirectory: path.join('.sdd-mcp', 'global-runtime'),
      skillsRoot: personal,
      skillsDirectory: 'skills',
      skillsStateDirectory: path.join('.sdd-mcp', 'global-skills'),
    });
  });

  it('retains override semantics when Claude personal directory equals the default', async () => {
    env.CLAUDE_CONFIG_DIR = path.join(home, '.claude');

    await expect(cli.resolveLocations('claude-code')).resolves.toMatchObject({
      runtimeRoot: path.join(home, '.claude'),
      runtimeConfig: '.claude.json',
      runtimeStateDirectory: path.join('.sdd-mcp', 'global-runtime'),
      skillsRoot: path.join(home, '.claude'),
    });
  });

  it('relocates only Codex runtime locations when CODEX_HOME is set', async () => {
    env.CODEX_HOME = '~/codex runtime';

    await expect(cli.resolveLocations('codex')).resolves.toEqual<GlobalTargetLocations>({
      target: 'codex',
      runtimeRoot: path.join(home, 'codex runtime'),
      runtimeConfig: 'config.toml',
      runtimeStateDirectory: path.join('.sdd-mcp', 'global-runtime'),
      skillsRoot: path.join(home, '.agents'),
      skillsDirectory: 'skills',
      skillsStateDirectory: path.join('.sdd-mcp', 'global-skills'),
    });
    expect(runOmpConfigPath).not.toHaveBeenCalled();
  });

  it('uses default Codex runtime locations for absent and empty overrides', async () => {
    await expect(cli.resolveLocations('codex')).resolves.toMatchObject({
      runtimeRoot: path.join(home, '.codex'),
      skillsRoot: path.join(home, '.agents'),
    });

    env.CODEX_HOME = '';
    await expect(cli.resolveLocations('codex')).resolves.toMatchObject({
      runtimeRoot: path.join(home, '.codex'),
      skillsRoot: path.join(home, '.agents'),
    });
  });

  it.each([
    ['CLAUDE_CONFIG_DIR', 'relative/claude'],
    ['CLAUDE_CONFIG_DIR', '../escape'],
    ['CLAUDE_CONFIG_DIR', 'bad\npath'],
    ['CODEX_HOME', '~other/codex'],
    ['CODEX_HOME', 'bad\0path'],
  ])('rejects unsafe %s=%p instead of resolving it against cwd', async (name, value) => {
    env[name] = value;

    await expect(cli.resolveLocations(name === 'CODEX_HOME' ? 'codex' : 'claude-code'))
      .rejects.toBeInstanceOf(CliUsageError);
    expect(runOmpConfigPath).not.toHaveBeenCalled();
  });

  it('rejects generated locations that traverse a symlink outside the writer root', async () => {
    const personal = path.join(home, 'personal');
    const outside = path.join(fixtureRoot, 'outside');
    fs.mkdirSync(personal);
    fs.mkdirSync(outside);
    fs.symlinkSync(outside, path.join(personal, 'skills'), 'dir');
    env.CLAUDE_CONFIG_DIR = personal;

    await expect(cli.resolveLocations('claude-code')).rejects.toThrow('symlink');
    expect(fs.readdirSync(outside)).toEqual([]);
  });

  describe('OMP discovery and profile fallback', () => {
    it.each(['\n', '\r\n'])('accepts one absolute discovery path with a %p terminator', async lineEnding => {
      const agent = path.join(home, 'discovered agent');
      fs.mkdirSync(agent);
      runOmpConfigPath.mockResolvedValue(`${agent}${lineEnding}`);

      await expect(cli.resolveLocations('omp')).resolves.toEqual<GlobalTargetLocations>({
        target: 'omp',
        runtimeRoot: agent,
        runtimeConfig: 'mcp.json',
        runtimeStateDirectory: path.join('.sdd-mcp', 'global-runtime'),
        skillsRoot: agent,
        skillsDirectory: 'skills',
        skillsStateDirectory: path.join('.sdd-mcp', 'global-skills'),
      });
      expect(runOmpConfigPath).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['empty output', ''],
      ['relative output', 'relative/agent\n'],
      ['multiple output lines', '/first/agent\n/second/agent\n'],
      ['extra blank output line', '/first/agent\n\n'],
      ['quoted output', '\"/quoted/agent\"\n'],
      ['embedded control character', '/bad\tagent\n'],
    ])('uses one explicit fallback for %s', async (_case, output) => {
      runOmpConfigPath.mockResolvedValue(output);
      const fallback = path.join(home, '.omp', 'agent');

      await expect(cli.resolveLocations('omp')).resolves.toMatchObject({
        target: 'omp',
        runtimeRoot: fallback,
        skillsRoot: fallback,
        fallbackNotice: expect.stringContaining(fallback),
      });
      expect(runOmpConfigPath).toHaveBeenCalledTimes(1);
    });

    it('uses the same single fallback when discovery is unavailable', async () => {
      runOmpConfigPath.mockRejectedValue(new Error('ENOENT'));
      const fallback = path.join(home, '.omp', 'agent');

      const locations = await cli.resolveLocations('omp');
      expect(locations.runtimeRoot).toBe(fallback);
      expect(locations.fallbackNotice).toContain(fallback);
      expect(runOmpConfigPath).toHaveBeenCalledTimes(1);
    });

    it('lets defined-empty OMP_PROFILE defeat PI_PROFILE and use the default agent override', async () => {
      runOmpConfigPath.mockRejectedValue(new Error('unavailable'));
      env.OMP_PROFILE = '';
      env.PI_PROFILE = 'named';
      env.PI_CODING_AGENT_DIR = '~/active agent';

      await expect(cli.resolveLocations('omp')).resolves.toMatchObject({
        runtimeRoot: path.join(home, 'active agent'),
        skillsRoot: path.join(home, 'active agent'),
      });
    });

    it.each(['', '   ', ' \t ', 'default'])(
      'selects the default profile for effective profile %p',
      async profile => {
        runOmpConfigPath.mockRejectedValue(new Error('unavailable'));
        env.OMP_PROFILE = profile;
        env.PI_CONFIG_DIR = 'custom config';

        await expect(cli.resolveLocations('omp')).resolves.toMatchObject({
          runtimeRoot: path.join(home, 'custom config', 'agent'),
        });
      },
    );

    it('uses PI_PROFILE only when OMP_PROFILE is undefined', async () => {
      runOmpConfigPath.mockRejectedValue(new Error('unavailable'));
      env.PI_PROFILE = 'review';
      env.PI_CONFIG_DIR = 'omp config';

      await expect(cli.resolveLocations('omp')).resolves.toMatchObject({
        runtimeRoot: path.join(home, 'omp config', 'profiles', 'review', 'agent'),
      });
    });

    it('ignores PI_CODING_AGENT_DIR for a named profile', async () => {
      runOmpConfigPath.mockRejectedValue(new Error('unavailable'));
      env.OMP_PROFILE = 'work';
      env.PI_CODING_AGENT_DIR = path.join(fixtureRoot, 'wrong agent');

      await expect(cli.resolveLocations('omp')).resolves.toMatchObject({
        runtimeRoot: path.join(home, '.omp', 'profiles', 'work', 'agent'),
      });
    });

    it.each(['.', '..', 'nested/profile', 'nested\\profile', 'bad\nprofile'])(
      'rejects unsafe named profile %p instead of selecting another location',
      async profile => {
        runOmpConfigPath.mockRejectedValue(new Error('unavailable'));
        env.OMP_PROFILE = profile;

        await expect(cli.resolveLocations('omp')).rejects.toBeInstanceOf(CliUsageError);
        expect(runOmpConfigPath).toHaveBeenCalledTimes(1);
      },
    );

    it.each([
      ['absolute config directory', '/other/config'],
      ['escaping config directory', '../other'],
      ['control in config directory', 'bad\nconfig'],
    ])('rejects %s during fallback', async (_case, configDirectory) => {
      runOmpConfigPath.mockRejectedValue(new Error('unavailable'));
      env.PI_CONFIG_DIR = configDirectory;

      await expect(cli.resolveLocations('omp')).rejects.toBeInstanceOf(CliUsageError);
    });

    it('rejects an unsafe accepted discovery destination without falling back', async () => {
      const agent = path.join(home, 'unsafe discovered');
      const outside = path.join(fixtureRoot, 'discovery outside');
      fs.mkdirSync(agent);
      fs.mkdirSync(outside);
      fs.symlinkSync(outside, path.join(agent, 'skills'), 'dir');
      runOmpConfigPath.mockResolvedValue(`${agent}\n`);

      await expect(cli.resolveLocations('omp')).rejects.toThrow('symlink');
      expect(runOmpConfigPath).toHaveBeenCalledTimes(1);
      expect(fs.readdirSync(outside)).toEqual([]);
    });

    it('rejects an unsafe fallback destination before writes', async () => {
      const agent = path.join(home, 'unsafe fallback');
      const outside = path.join(fixtureRoot, 'fallback outside');
      fs.mkdirSync(agent);
      fs.mkdirSync(outside);
      fs.symlinkSync(outside, path.join(agent, 'skills'), 'dir');
      runOmpConfigPath.mockRejectedValue(new Error('unavailable'));
      env.PI_CODING_AGENT_DIR = agent;

      await expect(cli.resolveLocations('omp')).rejects.toThrow('symlink');
      expect(fs.readdirSync(outside)).toEqual([]);
    });
  });

  it('installs all hosts with pinned runtime and rendered personal Skills only', async () => {
    fs.mkdirSync(path.join(home, '.claude'));
    const settings = path.join(home, '.claude/settings.json');
    fs.writeFileSync(settings, '{ personal malformed settings');
    fs.writeFileSync(path.join(home, '.claude.json'), '{\n// retained comment\n"user":true\n}\n');
    const reports = await cli.run({});
    expect(reports.map(report => report.target)).toEqual(['claude-code', 'codex', 'omp']);
    expect(reports.every(report => report.failed.length === 0 && report.conflicts.length === 0)).toBe(true);
    for (const target of ['claude-code', 'codex', 'omp'] as const) {
      const locations = await cli.resolveLocations(target);
      const config = fs.readFileSync(path.join(locations.runtimeRoot, locations.runtimeConfig), 'utf8');
      const parsed = target === 'codex' ? parseToml(config) : parseJsonc(config);
      const servers = (target === 'codex' ? parsed.mcp_servers : parsed.mcpServers) as Record<string, { args: string[] }>;
      expect(servers['sdd-mcp'].args).toEqual(['-y', `sdd-mcp-server@${PACKAGE_VERSION}`]);
      const skill = path.join(locations.skillsRoot, 'skills/sdd-requirements/SKILL.md');
      expect(fs.readFileSync(skill, 'utf8')).toContain('disable-model-invocation: true');
      expect(fs.readFileSync(path.join(locations.skillsRoot, 'skills/sdd-requirements/REFERENCE.md'), 'utf8'))
        .toBe(fs.readFileSync(path.resolve('skills/sdd-requirements/REFERENCE.md'), 'utf8'));
      const runtimeManifest = JSON.parse(fs.readFileSync(path.join(locations.runtimeRoot, locations.runtimeStateDirectory, 'install-manifest.json'), 'utf8'));
      const skillsManifest = JSON.parse(fs.readFileSync(path.join(locations.skillsRoot, locations.skillsStateDirectory, 'install-manifest.json'), 'utf8'));
      expect(runtimeManifest.targets[target].files).toEqual({});
      expect(skillsManifest.targets[target].registrations).toEqual([]);
      for (const forbidden of ['AGENTS.md', 'CLAUDE.md', '.spec', '.gitignore', 'rules', 'hooks', 'contexts']) {
        expect(fs.existsSync(path.join(locations.skillsRoot, forbidden))).toBe(false);
      }
    }
    expect(fs.readFileSync(settings, 'utf8')).toBe('{ personal malformed settings');
    expect(fs.readFileSync(path.join(home, '.claude.json'), 'utf8')).toContain('// retained comment');
    expect(fs.readFileSync(path.join(home, '.agents/skills/sdd-requirements/agents/openai.yaml'), 'utf8')).toContain('allow_implicit_invocation: false');
  });

  it('installs only the selected host without OMP discovery', async () => {
    const reports = await cli.run({ target: 'codex' });
    expect(reports.map(report => report.target)).toEqual(['codex']);
    expect(reports[0].failed).toEqual([]);
    expect(fs.existsSync(path.join(home, '.codex/config.toml'))).toBe(true);
    expect(fs.existsSync(path.join(home, '.agents/skills/sdd-design/SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(home, '.claude'))).toBe(false);
    expect(fs.existsSync(path.join(home, '.omp'))).toBe(false);
    expect(runOmpConfigPath).not.toHaveBeenCalled();
  });

  it('skips refused runtime Skills and continues independent hosts', async () => {
    const prior = '{"mcpServers":{"sdd-mcp":{"command":"private-command"}}}';
    fs.writeFileSync(path.join(home, '.claude.json'), prior);
    const reports = await cli.run({});
    expect(reports[0].conflicts).toEqual([expect.objectContaining({ component: 'runtime', reason: 'unmanaged-entry' })]);
    expect(reports[0].failed).toEqual([]);
    expect(fs.readFileSync(path.join(home, '.claude.json'), 'utf8')).toBe(prior);
    expect(fs.existsSync(path.join(home, '.claude/skills'))).toBe(false);
    expect(fs.existsSync(path.join(home, '.agents/skills/sdd-design/SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(home, '.omp/agent/skills/sdd-design/SKILL.md'))).toBe(true);
  });

  it('separates malformed runtime failures and continues independent hosts', async () => {
    fs.writeFileSync(path.join(home, '.claude.json'), '{ private malformed content');
    const reports = await cli.run({});
    expect(reports[0].conflicts).toEqual([]);
    expect(reports[0].failed).toEqual([expect.objectContaining({ component: 'runtime', path: path.join(home, '.claude.json') })]);
    expect(JSON.stringify(reports[0])).not.toContain('private malformed content');
    expect(fs.existsSync(path.join(home, '.claude/skills'))).toBe(false);
    expect(fs.existsSync(path.join(home, '.agents/skills/sdd-design/SKILL.md'))).toBe(true);
  });

  it('retains committed runtime and reports no installed Skills after a Skills state failure', async () => {
    const state = path.join(home, '.agents/.sdd-mcp/global-skills');
    fs.mkdirSync(state, { recursive: true });
    fs.writeFileSync(path.join(state, 'install-manifest.json'), '{ broken state');
    const [report] = await cli.run({ target: 'codex' });
    expect(report.failed).toEqual([expect.objectContaining({ component: 'skills', path: state })]);
    expect(report.conflicts).toEqual([]);
    expect(report.installed).toEqual([path.join(home, '.codex/config.toml')]);
    expect(fs.readFileSync(path.join(home, '.codex/config.toml'), 'utf8')).toContain(`sdd-mcp-server@${PACKAGE_VERSION}`);
    expect(fs.existsSync(path.join(home, '.agents/skills/sdd-design/SKILL.md'))).toBe(false);
  });

  it('prints ownership conflicts separately from failures with nonzero status', async () => {
    const oldClaude = process.env.CLAUDE_CONFIG_DIR;
    const oldExit = process.exitCode;
    const output = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const errors = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    process.env.CLAUDE_CONFIG_DIR = home;
    try {
      fs.writeFileSync(path.join(home, '.claude.json'), '{"mcpServers":{"sdd-mcp":{"command":"secret-command"}}}');
      await mainGlobalSetup(['--target', 'claude-code']);
      expect(process.exitCode).toBe(1);
      let text = [...output.mock.calls, ...errors.mock.calls].flat().join('\n');
      expect(text).toContain('Preserved conflicts');
      expect(text).not.toContain('Failures');
      expect(text).toContain(path.join(home, '.claude.json'));
      expect(text).not.toContain('secret-command');
      output.mockClear();
      errors.mockClear();
      fs.rmSync(path.join(home, '.claude.json'));
      fs.mkdirSync(path.join(home, '.claude.json'));
      await mainGlobalSetup(['--target', 'claude-code']);
      expect(process.exitCode).toBe(1);
      text = [...output.mock.calls, ...errors.mock.calls].flat().join('\n');
      expect(text).toContain('Failures');
      expect(text).not.toContain('Preserved conflicts');
    } finally {
      if (oldClaude === undefined) delete process.env.CLAUDE_CONFIG_DIR;
      else process.env.CLAUDE_CONFIG_DIR = oldClaude;
      process.exitCode = oldExit;
      output.mockRestore();
      errors.mockRestore();
    }
  });

  it('rolls back sibling Skills after a file I/O failure while retaining committed runtime', async () => {
    const badDestination = path.join(home, '.agents/skills/sdd-design/REFERENCE.md');
    fs.mkdirSync(badDestination, { recursive: true });
    const [report] = await cli.run({ target: 'codex' });
    expect(report.failed).toEqual([expect.objectContaining({ component: 'skills', path: badDestination })]);
    expect(report.installed).toEqual([path.join(home, '.codex/config.toml')]);
    expect(fs.existsSync(path.join(home, '.agents/skills/sdd-requirements/SKILL.md'))).toBe(false);
    expect(fs.existsSync(path.join(home, '.agents/.sdd-mcp/global-skills/install-manifest.json'))).toBe(false);
    expect(fs.statSync(badDestination).isDirectory()).toBe(true);
  });

  function versionedCli(version: string): GlobalSetupCLI {
    const source = path.join(fixtureRoot, version, 'skills');
    fs.mkdirSync(path.join(source, 'sdd-requirements'), { recursive: true });
    fs.writeFileSync(path.join(source, 'sdd-requirements/SKILL.md'),
      `---\nname: sdd-requirements\ndescription: Version fixture\n---\n\nVersion ${version}\n`);
    jest.doMock('../../../shared/version', () => ({
      ...jest.requireActual('../../../shared/version'), PACKAGE_VERSION: version,
    }));
    jest.doMock('../../../cli/utils/find-package-root', () => ({
      ...jest.requireActual('../../../cli/utils/find-package-root'),
      resolvePackageComponentPath: () => source,
    }));
    let Constructor: typeof GlobalSetupCLI = GlobalSetupCLI;
    jest.isolateModules(() => {
      Constructor = require('../../../cli/setup-global').GlobalSetupCLI;
    });
    jest.dontMock('../../../shared/version');
    jest.dontMock('../../../cli/utils/find-package-root');
    return new Constructor({ env, homedir: () => home, runOmpConfigPath });
  }

  it('upgrades owned versions, reruns without duplicates, and preserves edited Skills', async () => {
    const old = versionedCli('4.0.0');
    const current = versionedCli(PACKAGE_VERSION);
    fs.mkdirSync(path.join(home, '.codex'));
    fs.writeFileSync(path.join(home, '.codex/config.toml'), '# retained user comment\nmodel = "user-model"\n');
    expect((await old.run({ target: 'codex' }))[0].failed).toEqual([]);
    const upgraded = (await current.run({ target: 'codex' }))[0];
    expect(upgraded.failed).toEqual([]);
    expect(upgraded.conflicts).toEqual([]);
    const config = path.join(home, '.codex/config.toml');
    const skill = path.join(home, '.agents/skills/sdd-requirements/SKILL.md');
    expect(fs.readFileSync(config, 'utf8')).toContain(`sdd-mcp-server@${PACKAGE_VERSION}`);
    expect(fs.readFileSync(config, 'utf8')).toContain('# retained user comment\nmodel = "user-model"');
    expect(fs.readFileSync(skill, 'utf8')).toContain(`Version ${PACKAGE_VERSION}`);
    const rerun = (await current.run({ target: 'codex' }))[0];
    expect(rerun.failed).toEqual([]);
    expect(rerun.conflicts).toEqual([]);
    expect(rerun.installed).toEqual([]);
    expect(fs.readFileSync(config, 'utf8').match(/# >>> sdd-mcp managed runtime/g)).toHaveLength(1);
    fs.writeFileSync(skill, '# User-owned customization');
    const modified = (await current.run({ target: 'codex' }))[0];
    expect(modified.conflicts).toEqual([expect.objectContaining({ path: skill, reason: 'modified' })]);
    expect(modified.failed).toEqual([]);
    expect(fs.readFileSync(skill, 'utf8')).toBe('# User-owned customization');
  });

  it('serializes two versions across runtime and Skills commit points', async () => {
    const old = versionedCli('4.0.0');
    const current = versionedCli(PACKAGE_VERSION);
    const runtimeLock = path.join(home, '.codex/.sdd-mcp/global-runtime/install.lock');
    const skillsLock = path.join(home, '.agents/.sdd-mcp/global-skills/install.lock');
    let releaseOld!: () => void;
    let reachedOld!: () => void;
    const oldGate = new Promise<void>(resolve => { releaseOld = resolve; });
    const reached = new Promise<void>(resolve => { reachedOld = resolve; });
    let paused = false;
    const link = fs.promises.link.bind(fs.promises);
    const interception = jest.spyOn(fs.promises, 'link').mockImplementation(async (...args) => {
      if (String(args[1]) === skillsLock && !paused) {
        paused = true;
        reachedOld();
        await oldGate;
      }
      try {
        return await link(...args);
      } catch (error) {
        if (paused && String(args[1]) === runtimeLock && (error as NodeJS.ErrnoException).code === 'EEXIST') releaseOld();
        throw error;
      }
    });
    try {
      const first = old.run({ target: 'codex' });
      await reached;
      const second = current.run({ target: 'codex' }).finally(releaseOld);
      const reports = (await Promise.all([first, second])).flat();
      expect(reports.every(report => report.failed.length === 0 && report.conflicts.length === 0)).toBe(true);
      const runtime = fs.readFileSync(path.join(home, '.codex/config.toml'), 'utf8');
      const skill = fs.readFileSync(path.join(home, '.agents/skills/sdd-requirements/SKILL.md'), 'utf8');
      expect(runtime).toContain(`sdd-mcp-server@${PACKAGE_VERSION}`);
      expect(skill).toContain(`Version ${PACKAGE_VERSION}`);
    } finally {
      releaseOld();
      interception.mockRestore();
    }
  });
});
