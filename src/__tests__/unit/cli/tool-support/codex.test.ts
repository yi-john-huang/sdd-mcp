import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { generateCodexAgentsMd, ManagerRefs } from '../../../../cli/tool-support/codex';

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
    await generateCodexAgentsMd(tmpDir, managers);

    const agentsPath = path.join(tmpDir, 'AGENTS.md');
    expect(fs.existsSync(agentsPath)).toBe(true);
  });

  it('should include skill names and descriptions', async () => {
    await generateCodexAgentsMd(tmpDir, managers);

    const content = fs.readFileSync(path.join(tmpDir, 'AGENTS.md'), 'utf-8');
    expect(content).toContain('sdd-requirements');
    expect(content).toContain('Generate requirements');
    expect(content).toContain('sdd-design');
  });

  it('should include rule names and file paths', async () => {
    await generateCodexAgentsMd(tmpDir, managers);

    const content = fs.readFileSync(path.join(tmpDir, 'AGENTS.md'), 'utf-8');
    expect(content).toContain('coding-style');
    expect(content).toContain('.claude/rules/coding-style.md');
  });

  it('should include agent names', async () => {
    await generateCodexAgentsMd(tmpDir, managers);

    const content = fs.readFileSync(path.join(tmpDir, 'AGENTS.md'), 'utf-8');
    expect(content).toContain('reviewer');
    expect(content).toContain('Code reviewer');
  });

  it('should include steering document paths', async () => {
    await generateCodexAgentsMd(tmpDir, managers);

    const content = fs.readFileSync(path.join(tmpDir, 'AGENTS.md'), 'utf-8');
    expect(content).toContain('.spec/steering/product.md');
    expect(content).toContain('.spec/steering/tech.md');
  });

  it('should skip if AGENTS.md already exists', async () => {
    const agentsPath = path.join(tmpDir, 'AGENTS.md');
    fs.writeFileSync(agentsPath, 'existing content');

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

    await generateCodexAgentsMd(tmpDir, managers);

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

    await generateCodexAgentsMd(tmpDir, emptyManagers);

    const content = fs.readFileSync(path.join(tmpDir, 'AGENTS.md'), 'utf-8');
    expect(content).toBeTruthy();
    // Should not contain component section headers when empty
    expect(content).not.toContain('### Skills');
    expect(content).not.toContain('### Rules');
  });
});
