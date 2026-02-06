import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { generateCodexAgentsMd, ManagerRefs, InstallPaths, InstalledComponents } from '../../../../cli/tool-support/codex';

const DEFAULT_PATHS: InstallPaths = {
  skillsPath: '.claude/skills',
  rulesPath: '.claude/rules',
  agentsPath: '.claude/agents',
  steeringPath: '.spec/steering',
};

const ALL_INSTALLED: InstalledComponents = {
  skills: true,
  rules: true,
  agents: true,
  steering: true,
};

describe('generateCodexAgentsMd', () => {
  let tmpDir: string;
  let managers: ManagerRefs;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-codex-test-'));

    managers = {
      skillManager: {
        listSkills: jest.fn().mockResolvedValue([
          { name: 'sdd-requirements', description: 'Generate requirements', path: '/skills/sdd-requirements' },
          { name: 'sdd-design', description: 'Create design', path: '/skills/sdd-design' },
        ]),
      } as any,
      rulesManager: {
        listComponents: jest.fn().mockResolvedValue([
          { name: 'coding-style', description: 'Coding standards', path: '/rules/coding-style.md', priority: 100, alwaysActive: true },
        ]),
      } as any,
      agentManager: {
        listComponents: jest.fn().mockResolvedValue([
          { name: 'reviewer', description: 'Code reviewer', path: '/agents/reviewer.md', role: 'reviewer', expertise: 'code quality' },
        ]),
      } as any,
      listSteering: jest.fn().mockResolvedValue(['product.md', 'tech.md']),
    };
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should create AGENTS.md in project root', async () => {
    await generateCodexAgentsMd(tmpDir, managers, DEFAULT_PATHS, ALL_INSTALLED);

    const agentsPath = path.join(tmpDir, 'AGENTS.md');
    expect(fs.existsSync(agentsPath)).toBe(true);
  });

  it('should include skill names and descriptions', async () => {
    await generateCodexAgentsMd(tmpDir, managers, DEFAULT_PATHS, ALL_INSTALLED);

    const content = fs.readFileSync(path.join(tmpDir, 'AGENTS.md'), 'utf-8');
    expect(content).toContain('sdd-requirements');
    expect(content).toContain('Generate requirements');
    expect(content).toContain('sdd-design');
  });

  it('should include rule names and file paths', async () => {
    await generateCodexAgentsMd(tmpDir, managers, DEFAULT_PATHS, ALL_INSTALLED);

    const content = fs.readFileSync(path.join(tmpDir, 'AGENTS.md'), 'utf-8');
    expect(content).toContain('coding-style');
    expect(content).toContain('.claude/rules/coding-style.md');
  });

  it('should include agent names', async () => {
    await generateCodexAgentsMd(tmpDir, managers, DEFAULT_PATHS, ALL_INSTALLED);

    const content = fs.readFileSync(path.join(tmpDir, 'AGENTS.md'), 'utf-8');
    expect(content).toContain('reviewer');
    expect(content).toContain('Code reviewer');
  });

  it('should include steering document paths', async () => {
    await generateCodexAgentsMd(tmpDir, managers, DEFAULT_PATHS, ALL_INSTALLED);

    const content = fs.readFileSync(path.join(tmpDir, 'AGENTS.md'), 'utf-8');
    expect(content).toContain('.spec/steering/product.md');
    expect(content).toContain('.spec/steering/tech.md');
  });

  it('should skip if AGENTS.md already exists', async () => {
    const agentsPath = path.join(tmpDir, 'AGENTS.md');
    fs.writeFileSync(agentsPath, 'existing content');

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

    await generateCodexAgentsMd(tmpDir, managers, DEFAULT_PATHS, ALL_INSTALLED);

    const content = fs.readFileSync(agentsPath, 'utf-8');
    expect(content).toBe('existing content');
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('already exists'));

    consoleSpy.mockRestore();
  });

  it('should handle empty component lists gracefully', async () => {
    const emptyManagers: ManagerRefs = {
      skillManager: { listSkills: jest.fn().mockResolvedValue([]) } as any,
      rulesManager: { listComponents: jest.fn().mockResolvedValue([]) } as any,
      agentManager: { listComponents: jest.fn().mockResolvedValue([]) } as any,
      listSteering: jest.fn().mockResolvedValue([]),
    };

    await generateCodexAgentsMd(tmpDir, emptyManagers, DEFAULT_PATHS, ALL_INSTALLED);

    const content = fs.readFileSync(path.join(tmpDir, 'AGENTS.md'), 'utf-8');
    expect(content).toBeTruthy();
    // Should not contain component section headers when empty
    expect(content).not.toContain('### Skills');
    expect(content).not.toContain('### Rules');
  });

  it('should use custom paths in generated content', async () => {
    const customPaths: InstallPaths = {
      skillsPath: 'custom/skills',
      rulesPath: 'custom/rules',
      agentsPath: 'custom/agents',
      steeringPath: 'custom/steering',
    };

    await generateCodexAgentsMd(tmpDir, managers, customPaths, ALL_INSTALLED);

    const content = fs.readFileSync(path.join(tmpDir, 'AGENTS.md'), 'utf-8');
    expect(content).toContain('custom/skills/sdd-requirements/');
    expect(content).toContain('custom/rules/coding-style.md');
    expect(content).toContain('custom/agents/reviewer.md');
    expect(content).toContain('custom/steering/product.md');
    // Should NOT contain default paths
    expect(content).not.toContain('.claude/skills');
    expect(content).not.toContain('.claude/rules');
  });

  it('should only render sections for installed components', async () => {
    const partialInstall: InstalledComponents = {
      skills: true,
      rules: false,
      agents: false,
      steering: true,
    };

    await generateCodexAgentsMd(tmpDir, managers, DEFAULT_PATHS, partialInstall);

    const content = fs.readFileSync(path.join(tmpDir, 'AGENTS.md'), 'utf-8');
    expect(content).toContain('### Skills');
    expect(content).toContain('### Steering');
    expect(content).not.toContain('### Rules');
    expect(content).not.toContain('### Agents');
    // Managers for non-installed types should not have been called
    expect(managers.rulesManager.listComponents).not.toHaveBeenCalled();
    expect(managers.agentManager.listComponents).not.toHaveBeenCalled();
  });

  it('should handle manager errors gracefully', async () => {
    const errorManagers: ManagerRefs = {
      skillManager: { listSkills: jest.fn().mockRejectedValue(new Error('skill error')) } as any,
      rulesManager: { listComponents: jest.fn().mockResolvedValue([]) } as any,
      agentManager: { listComponents: jest.fn().mockResolvedValue([]) } as any,
      listSteering: jest.fn().mockResolvedValue([]),
    };

    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    await generateCodexAgentsMd(tmpDir, errorManagers, DEFAULT_PATHS, ALL_INSTALLED);

    // Should not crash — file should still be created (with whatever content was built)
    expect(fs.existsSync(path.join(tmpDir, 'AGENTS.md'))).toBe(true);
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to gather'), expect.any(String));

    consoleErrorSpy.mockRestore();
  });
});
