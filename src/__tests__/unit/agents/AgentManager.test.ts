import { AgentManager, AgentDescriptor } from '../../../agents/AgentManager';
import * as fs from 'fs';
import * as path from 'path';

// Mock fs module
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  promises: {
    readdir: jest.fn(),
    readFile: jest.fn(),
    mkdir: jest.fn(),
    copyFile: jest.fn(),
    access: jest.fn(),
  },
  existsSync: jest.fn(),
}));

describe('AgentManager', () => {
  let agentManager: AgentManager;
  const mockAgentsPath = '/mock/agents';

  beforeEach(() => {
    jest.clearAllMocks();
    agentManager = new AgentManager(mockAgentsPath);
  });

  describe('listComponents', () => {
    it('should return list of available agents', async () => {
      // Arrange
      const mockFiles = [
        { name: 'planner.md', isFile: () => true, isDirectory: () => false },
        { name: 'reviewer.md', isFile: () => true, isDirectory: () => false },
        { name: 'implementer.md', isFile: () => true, isDirectory: () => false },
      ];
      (fs.promises.readdir as jest.Mock).mockResolvedValue(mockFiles);
      (fs.promises.readFile as jest.Mock).mockImplementation((filePath: string) => {
        if (filePath.includes('planner')) {
          return Promise.resolve(`---
name: planner
description: Planning and roadmap agent
role: planner
expertise: Project planning, task breakdown, estimation
---
# Planner Agent`);
        }
        if (filePath.includes('reviewer')) {
          return Promise.resolve(`---
name: reviewer
description: Code review agent with Linus-style feedback
role: reviewer
expertise: Code quality, best practices, performance
---
# Reviewer Agent`);
        }
        if (filePath.includes('implementer')) {
          return Promise.resolve(`---
name: implementer
description: Implementation-focused agent
role: implementer
expertise: Coding, debugging, testing
---
# Implementer Agent`);
        }
        return Promise.reject(new Error('File not found'));
      });

      // Act
      const agents = await agentManager.listComponents();

      // Assert
      expect(agents).toHaveLength(3);
      expect(agents[0].name).toBe('planner');
      expect(agents[0].description).toBe('Planning and roadmap agent');
      expect(agents[0].role).toBe('planner');
      expect(agents[0].expertise).toBe('Project planning, task breakdown, estimation');
    });

    it('should return empty array when agents directory is empty', async () => {
      // Arrange
      (fs.promises.readdir as jest.Mock).mockResolvedValue([]);

      // Act
      const agents = await agentManager.listComponents();

      // Assert
      expect(agents).toHaveLength(0);
    });

    it('should skip non-markdown files', async () => {
      // Arrange
      const mockFiles = [
        { name: 'planner.md', isFile: () => true, isDirectory: () => false },
        { name: 'readme.txt', isFile: () => true, isDirectory: () => false },
        { name: 'subdir', isFile: () => false, isDirectory: () => true },
      ];
      (fs.promises.readdir as jest.Mock).mockResolvedValue(mockFiles);
      (fs.promises.readFile as jest.Mock).mockResolvedValue(`---
name: planner
description: Test agent
role: planner
---
# Content`);

      // Act
      const agents = await agentManager.listComponents();

      // Assert
      expect(agents).toHaveLength(1);
      expect(agents[0].name).toBe('planner');
    });

    it('should handle missing frontmatter gracefully', async () => {
      // Arrange
      const mockFiles = [
        { name: 'no-frontmatter.md', isFile: () => true, isDirectory: () => false },
      ];
      (fs.promises.readdir as jest.Mock).mockResolvedValue(mockFiles);
      (fs.promises.readFile as jest.Mock).mockResolvedValue('# Just markdown content');

      // Act
      const agents = await agentManager.listComponents();

      // Assert
      expect(agents).toHaveLength(1);
      expect(agents[0].name).toBe('no-frontmatter'); // Falls back to filename
      expect(agents[0].description).toBe('');
      expect(agents[0].role).toBe('assistant'); // Default role
      expect(agents[0].expertise).toBe('');
    });
  });

  describe('getComponentContent', () => {
    it('should return content of a specific agent', async () => {
      // Arrange
      const expectedContent = `---
name: planner
description: Test agent
role: planner
---
# Content`;
      (fs.promises.readFile as jest.Mock).mockResolvedValue(expectedContent);

      // Act
      const content = await agentManager.getComponentContent('planner');

      // Assert
      expect(content).toBe(expectedContent);
      expect(fs.promises.readFile).toHaveBeenCalledWith(
        path.join(mockAgentsPath, 'planner.md'),
        'utf-8'
      );
    });

    it('should throw error for non-existent agent', async () => {
      // Arrange
      (fs.promises.readFile as jest.Mock).mockRejectedValue(new Error('ENOENT'));

      // Act & Assert
      await expect(agentManager.getComponentContent('non-existent'))
        .rejects.toThrow('Component "non-existent" not found');
    });
  });

  describe('installComponents', () => {
    it('should copy all agents to target directory', async () => {
      // Arrange
      const targetPath = '/target/.claude/agents';
      const mockFiles = [
        { name: 'planner.md', isFile: () => true, isDirectory: () => false },
        { name: 'reviewer.md', isFile: () => true, isDirectory: () => false },
      ];
      (fs.promises.readdir as jest.Mock).mockResolvedValue(mockFiles);
      (fs.promises.mkdir as jest.Mock).mockResolvedValue(undefined);
      (fs.promises.copyFile as jest.Mock).mockResolvedValue(undefined);

      // Act
      const result = await agentManager.installComponents(targetPath);

      // Assert
      expect(result.installed).toHaveLength(2);
      expect(result.installed).toContain('planner');
      expect(result.installed).toContain('reviewer');
      expect(fs.promises.mkdir).toHaveBeenCalledWith(targetPath, { recursive: true });
      expect(fs.promises.copyFile).toHaveBeenCalledTimes(2);
    });

    it('should track failed installations', async () => {
      // Arrange
      const targetPath = '/target/.claude/agents';
      const mockFiles = [
        { name: 'planner.md', isFile: () => true, isDirectory: () => false },
      ];
      (fs.promises.readdir as jest.Mock).mockResolvedValue(mockFiles);
      (fs.promises.mkdir as jest.Mock).mockResolvedValue(undefined);
      (fs.promises.copyFile as jest.Mock).mockRejectedValue(new Error('Permission denied'));

      // Act
      const result = await agentManager.installComponents(targetPath);

      // Assert
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].name).toBe('planner');
      expect(result.failed[0].error).toContain('Permission denied');
    });
  });

  describe('parseMetadata', () => {
    it('should parse YAML frontmatter correctly', () => {
      // Arrange
      const content = `---
name: reviewer
description: Code review agent with Linus-style feedback
role: reviewer
expertise: Code quality, best practices, performance
---

# Reviewer Agent

Content here...`;

      // Act
      const metadata = (agentManager as any).parseMetadata(content, '/mock/agents/reviewer.md');

      // Assert
      expect(metadata.name).toBe('reviewer');
      expect(metadata.description).toBe('Code review agent with Linus-style feedback');
      expect(metadata.role).toBe('reviewer');
      expect(metadata.expertise).toBe('Code quality, best practices, performance');
    });

    it('should use filename as fallback name', () => {
      // Arrange
      const content = `---
description: An agent without name
role: helper
---
# Content`;

      // Act
      const metadata = (agentManager as any).parseMetadata(content, '/mock/agents/my-agent.md');

      // Assert
      expect(metadata.name).toBe('my-agent');
    });

    it('should default role to assistant if not specified', () => {
      // Arrange
      const content = `---
name: test-agent
---
# Content`;

      // Act
      const metadata = (agentManager as any).parseMetadata(content, '/mock/agents/test-agent.md');

      // Assert
      expect(metadata.role).toBe('assistant');
    });
  });

  describe('getAgentByRole', () => {
    it('should return agent matching the specified role', async () => {
      // Arrange
      const mockFiles = [
        { name: 'planner.md', isFile: () => true, isDirectory: () => false },
        { name: 'reviewer.md', isFile: () => true, isDirectory: () => false },
      ];
      (fs.promises.readdir as jest.Mock).mockResolvedValue(mockFiles);
      (fs.promises.readFile as jest.Mock).mockImplementation((filePath: string) => {
        if (filePath.includes('planner')) {
          return Promise.resolve(`---
name: planner
role: planner
---
# Planner`);
        }
        if (filePath.includes('reviewer')) {
          return Promise.resolve(`---
name: reviewer
role: reviewer
---
# Reviewer`);
        }
        return Promise.reject(new Error('File not found'));
      });

      // Act
      const agent = await agentManager.getAgentByRole('reviewer');

      // Assert
      expect(agent).not.toBeNull();
      expect(agent?.name).toBe('reviewer');
      expect(agent?.role).toBe('reviewer');
    });

    it('should return null if no agent matches the role', async () => {
      // Arrange
      const mockFiles = [
        { name: 'planner.md', isFile: () => true, isDirectory: () => false },
      ];
      (fs.promises.readdir as jest.Mock).mockResolvedValue(mockFiles);
      (fs.promises.readFile as jest.Mock).mockResolvedValue(`---
name: planner
role: planner
---
# Planner`);

      // Act
      const agent = await agentManager.getAgentByRole('security-auditor');

      // Assert
      expect(agent).toBeNull();
    });
  });
});
