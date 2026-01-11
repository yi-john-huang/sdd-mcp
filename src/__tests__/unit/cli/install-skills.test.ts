import { InstallSkillsCLI, CLIOptions } from '../../../cli/install-skills';
import { SkillManager } from '../../../skills/SkillManager';

// Mock SkillManager
jest.mock('../../../skills/SkillManager');

describe('InstallSkillsCLI', () => {
  let cli: InstallSkillsCLI;
  let mockSkillManager: jest.Mocked<SkillManager>;
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock skill manager
    mockSkillManager = new SkillManager('/mock/skills') as jest.Mocked<SkillManager>;
    (SkillManager as jest.Mock).mockImplementation(() => mockSkillManager);

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
  });

  describe('run', () => {
    it('should display help when --help is passed', async () => {
      const options: CLIOptions = { showHelp: true, listOnly: false, targetPath: '' };

      await cli.run(options);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Usage:'));
    });

    it('should list skills when --list is passed', async () => {
      const options: CLIOptions = { showHelp: false, listOnly: true, targetPath: '' };

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
      const options: CLIOptions = {
        showHelp: false,
        listOnly: false,
        targetPath: '/target/.claude/skills',
      };

      mockSkillManager.installSkills.mockResolvedValue({
        installed: ['sdd-requirements', 'sdd-design'],
        failed: [],
      });

      await cli.run(options);

      expect(mockSkillManager.installSkills).toHaveBeenCalledWith('/target/.claude/skills');
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Installed 2 skills'));
    });

    it('should report installation failures', async () => {
      const options: CLIOptions = {
        showHelp: false,
        listOnly: false,
        targetPath: '/target/.claude/skills',
      };

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
      const options: CLIOptions = { showHelp: false, listOnly: true, targetPath: '' };

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
});
