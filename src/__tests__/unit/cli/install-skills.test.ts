import { InstallSkillsCLI, CLIOptions } from '../../../cli/install-skills';
import { SkillManager } from '../../../skills/SkillManager';
import { RulesManager } from '../../../rules/RulesManager';
import { ContextManager } from '../../../contexts/ContextManager';
import { AgentManager } from '../../../agents/AgentManager';
import { HookLoader } from '../../../hooks/HookLoader';

// Mock all managers
jest.mock('../../../skills/SkillManager');
jest.mock('../../../rules/RulesManager');
jest.mock('../../../contexts/ContextManager');
jest.mock('../../../agents/AgentManager');
jest.mock('../../../hooks/HookLoader');

/**
 * Helper to create default CLIOptions with overrides
 */
function createOptions(overrides: Partial<CLIOptions> = {}): CLIOptions {
  return {
    targetPath: '.claude/skills',
    steeringPath: '.spec/steering',
    rulesPath: '.claude/rules',
    contextsPath: '.claude/contexts',
    agentsPath: '.claude/agents',
    hooksPath: '.claude/hooks',
    listOnly: false,
    showHelp: false,
    skillsOnly: false,
    steeringOnly: false,
    rulesOnly: false,
    contextsOnly: false,
    agentsOnly: false,
    hooksOnly: false,
    components: [],
    codex: false,
    antigravity: false,
    allTools: false,
    ...overrides,
  };
}

describe('InstallSkillsCLI', () => {
  let cli: InstallSkillsCLI;
  let mockSkillManager: jest.Mocked<SkillManager>;
  let mockRulesManager: jest.Mocked<RulesManager>;
  let mockContextManager: jest.Mocked<ContextManager>;
  let mockAgentManager: jest.Mocked<AgentManager>;
  let mockHookLoader: jest.Mocked<HookLoader>;
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock managers
    mockSkillManager = new SkillManager('/mock/skills') as jest.Mocked<SkillManager>;
    mockRulesManager = new RulesManager('/mock/rules') as jest.Mocked<RulesManager>;
    mockContextManager = new ContextManager('/mock/contexts') as jest.Mocked<ContextManager>;
    mockAgentManager = new AgentManager('/mock/agents') as jest.Mocked<AgentManager>;
    mockHookLoader = new HookLoader('/mock/hooks') as jest.Mocked<HookLoader>;

    (SkillManager as jest.Mock).mockImplementation(() => mockSkillManager);
    (RulesManager as jest.Mock).mockImplementation(() => mockRulesManager);
    (ContextManager as jest.Mock).mockImplementation(() => mockContextManager);
    (AgentManager as jest.Mock).mockImplementation(() => mockAgentManager);
    (HookLoader as jest.Mock).mockImplementation(() => mockHookLoader);

    // Setup default mock returns
    mockRulesManager.listComponents.mockResolvedValue([]);
    mockContextManager.listComponents.mockResolvedValue([]);
    mockAgentManager.listComponents.mockResolvedValue([]);
    mockHookLoader.listComponents.mockResolvedValue([]);

    // Spy on console
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    cli = new InstallSkillsCLI();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('parseArgs', () => {
    it('should parse --path argument', () => {
      const args = ['--path', '/custom/path'];
      const options = cli.parseArgs(args);

      expect(options.targetPath).toBe('/custom/path');
    });

    it('should use default path when not specified', () => {
      const args: string[] = [];
      const options = cli.parseArgs(args);

      expect(options.targetPath).toBe('.claude/skills');
      expect(options.steeringPath).toBe('.spec/steering');
      expect(options.rulesPath).toBe('.claude/rules');
      expect(options.contextsPath).toBe('.claude/contexts');
      expect(options.agentsPath).toBe('.claude/agents');
      expect(options.hooksPath).toBe('.claude/hooks');
    });

    it('should parse --list flag', () => {
      const args = ['--list'];
      const options = cli.parseArgs(args);

      expect(options.listOnly).toBe(true);
    });

    it('should parse -l shorthand for --list', () => {
      const args = ['-l'];
      const options = cli.parseArgs(args);

      expect(options.listOnly).toBe(true);
    });

    it('should parse --help flag', () => {
      const args = ['--help'];
      const options = cli.parseArgs(args);

      expect(options.showHelp).toBe(true);
    });

    it('should parse -h shorthand for --help', () => {
      const args = ['-h'];
      const options = cli.parseArgs(args);

      expect(options.showHelp).toBe(true);
    });

    it('should handle multiple arguments', () => {
      const args = ['--path', '/custom', '--list'];
      const options = cli.parseArgs(args);

      expect(options.targetPath).toBe('/custom');
      expect(options.listOnly).toBe(true);
    });

    it('should parse --steering-path argument', () => {
      const args = ['--steering-path', '/custom/steering'];
      const options = cli.parseArgs(args);

      expect(options.steeringPath).toBe('/custom/steering');
    });

    it('should parse --skills flag', () => {
      const args = ['--skills'];
      const options = cli.parseArgs(args);

      expect(options.skillsOnly).toBe(true);
      expect(options.components).toContain('skills');
    });

    it('should parse --steering flag', () => {
      const args = ['--steering'];
      const options = cli.parseArgs(args);

      expect(options.steeringOnly).toBe(true);
      expect(options.components).toContain('steering');
    });

    it('should parse --rules flag', () => {
      const args = ['--rules'];
      const options = cli.parseArgs(args);

      expect(options.rulesOnly).toBe(true);
      expect(options.components).toContain('rules');
    });

    it('should parse --contexts flag', () => {
      const args = ['--contexts'];
      const options = cli.parseArgs(args);

      expect(options.contextsOnly).toBe(true);
      expect(options.components).toContain('contexts');
    });

    it('should parse --agents flag', () => {
      const args = ['--agents'];
      const options = cli.parseArgs(args);

      expect(options.agentsOnly).toBe(true);
      expect(options.components).toContain('agents');
    });

    it('should parse --hooks flag', () => {
      const args = ['--hooks'];
      const options = cli.parseArgs(args);

      expect(options.hooksOnly).toBe(true);
      expect(options.components).toContain('hooks');
    });

    it('should parse --all flag', () => {
      const args = ['--all'];
      const options = cli.parseArgs(args);

      expect(options.components).toEqual(['skills', 'steering', 'rules', 'contexts', 'agents', 'hooks']);
    });

    it('should parse multiple component flags', () => {
      const args = ['--skills', '--rules', '--agents'];
      const options = cli.parseArgs(args);

      expect(options.components).toContain('skills');
      expect(options.components).toContain('rules');
      expect(options.components).toContain('agents');
      expect(options.components).not.toContain('steering');
    });

    it('should parse --codex flag', () => {
      const args = ['--codex'];
      const options = cli.parseArgs(args);

      expect(options.codex).toBe(true);
      expect(options.antigravity).toBe(false);
      expect(options.allTools).toBe(false);
    });

    it('should parse --antigravity flag', () => {
      const args = ['--antigravity'];
      const options = cli.parseArgs(args);

      expect(options.antigravity).toBe(true);
      expect(options.codex).toBe(false);
      expect(options.allTools).toBe(false);
    });

    it('should parse --all-tools flag', () => {
      const args = ['--all-tools'];
      const options = cli.parseArgs(args);

      expect(options.allTools).toBe(true);
    });

    it('should parse --codex and --antigravity together', () => {
      const args = ['--codex', '--antigravity'];
      const options = cli.parseArgs(args);

      expect(options.codex).toBe(true);
      expect(options.antigravity).toBe(true);
    });
  });

  describe('run', () => {
    it('should display help when --help is passed', async () => {
      const options = createOptions({ showHelp: true });

      await cli.run(options);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Usage:'));
    });

    it('should list skills when --list is passed', async () => {
      const options = createOptions({ listOnly: true });

      mockSkillManager.listSkills.mockResolvedValue([
        { name: 'sdd-requirements', description: 'Generate requirements', path: '/skills/sdd-requirements' },
        { name: 'sdd-design', description: 'Create design', path: '/skills/sdd-design' },
      ]);

      await cli.run(options);

      expect(mockSkillManager.listSkills).toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Available Skills'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('sdd-requirements'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('sdd-design'));
    });

    it('should install skills to target path', async () => {
      const options = createOptions({ targetPath: '/target/.claude/skills' });

      mockSkillManager.installSkills.mockResolvedValue({
        installed: ['sdd-requirements', 'sdd-design'],
        failed: [],
      });

      await cli.run(options);

      expect(mockSkillManager.installSkills).toHaveBeenCalledWith('/target/.claude/skills');
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Installed 2 skills'));
    });

    it('should report installation failures', async () => {
      const options = createOptions({ targetPath: '/target/.claude/skills' });

      mockSkillManager.installSkills.mockResolvedValue({
        installed: ['sdd-requirements'],
        failed: [{ name: 'sdd-design', error: 'Permission denied' }],
      });

      await cli.run(options);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Installed 1 skill'));
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to install'));
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('sdd-design'));
    });

    it('should handle empty skill list gracefully', async () => {
      const options = createOptions({ listOnly: true });

      mockSkillManager.listSkills.mockResolvedValue([]);

      await cli.run(options);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('No skills available'));
    });
  });

  describe('getHelp', () => {
    it('should return help text with usage examples', () => {
      const help = cli.getHelp();

      expect(help).toContain('Usage:');
      expect(help).toContain('--path');
      expect(help).toContain('--list');
      expect(help).toContain('--help');
      expect(help).toContain('Examples:');
    });
  });

  describe('getUnifiedHelp', () => {
    it('should return unified help text with all component options', () => {
      const help = cli.getUnifiedHelp();

      expect(help).toContain('Usage:');
      expect(help).toContain('--skills');
      expect(help).toContain('--steering');
      expect(help).toContain('--rules');
      expect(help).toContain('--contexts');
      expect(help).toContain('--agents');
      expect(help).toContain('--hooks');
      expect(help).toContain('--all');
    });

    it('should include multi-tool support flags', () => {
      const help = cli.getUnifiedHelp();

      expect(help).toContain('--codex');
      expect(help).toContain('--antigravity');
      expect(help).toContain('--all-tools');
    });
  });
});
