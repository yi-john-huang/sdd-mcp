import { RulesManager, RuleDescriptor } from '../../../rules/RulesManager';
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

describe('RulesManager', () => {
  let rulesManager: RulesManager;
  const mockRulesPath = '/mock/rules';

  beforeEach(() => {
    jest.clearAllMocks();
    rulesManager = new RulesManager(mockRulesPath);
  });

  describe('listComponents', () => {
    it('should return list of available rules', async () => {
      // Arrange
      const mockFiles = [
        { name: 'coding-style.md', isFile: () => true, isDirectory: () => false },
        { name: 'testing.md', isFile: () => true, isDirectory: () => false },
        { name: 'security.md', isFile: () => true, isDirectory: () => false },
      ];
      (fs.promises.readdir as jest.Mock).mockResolvedValue(mockFiles);
      (fs.promises.readFile as jest.Mock).mockImplementation((filePath: string) => {
        if (filePath.includes('coding-style')) {
          return Promise.resolve(`---
name: coding-style
description: Enforce consistent coding style
priority: 100
alwaysActive: true
---
# Coding Style Rules`);
        }
        if (filePath.includes('testing')) {
          return Promise.resolve(`---
name: testing
description: Testing requirements
priority: 90
alwaysActive: true
---
# Testing Rules`);
        }
        if (filePath.includes('security')) {
          return Promise.resolve(`---
name: security
description: Security best practices
priority: 95
alwaysActive: true
---
# Security Rules`);
        }
        return Promise.reject(new Error('File not found'));
      });

      // Act
      const rules = await rulesManager.listComponents();

      // Assert
      expect(rules).toHaveLength(3);
      expect(rules[0].name).toBe('coding-style');
      expect(rules[0].description).toBe('Enforce consistent coding style');
      expect(rules[0].priority).toBe(100);
      expect(rules[0].alwaysActive).toBe(true);
    });

    it('should return empty array when rules directory is empty', async () => {
      // Arrange
      (fs.promises.readdir as jest.Mock).mockResolvedValue([]);

      // Act
      const rules = await rulesManager.listComponents();

      // Assert
      expect(rules).toHaveLength(0);
    });

    it('should skip non-markdown files', async () => {
      // Arrange
      const mockFiles = [
        { name: 'coding-style.md', isFile: () => true, isDirectory: () => false },
        { name: 'readme.txt', isFile: () => true, isDirectory: () => false },
        { name: 'subdir', isFile: () => false, isDirectory: () => true },
      ];
      (fs.promises.readdir as jest.Mock).mockResolvedValue(mockFiles);
      (fs.promises.readFile as jest.Mock).mockResolvedValue(`---
name: coding-style
description: Test rule
priority: 50
---
# Content`);

      // Act
      const rules = await rulesManager.listComponents();

      // Assert
      expect(rules).toHaveLength(1);
      expect(rules[0].name).toBe('coding-style');
    });

    it('should handle missing frontmatter gracefully', async () => {
      // Arrange
      const mockFiles = [
        { name: 'no-frontmatter.md', isFile: () => true, isDirectory: () => false },
      ];
      (fs.promises.readdir as jest.Mock).mockResolvedValue(mockFiles);
      (fs.promises.readFile as jest.Mock).mockResolvedValue('# Just markdown content');

      // Act
      const rules = await rulesManager.listComponents();

      // Assert
      expect(rules).toHaveLength(1);
      expect(rules[0].name).toBe('no-frontmatter'); // Falls back to filename
      expect(rules[0].description).toBe('');
      expect(rules[0].priority).toBe(0); // Default priority
      expect(rules[0].alwaysActive).toBe(true); // Default to true
    });
  });

  describe('getComponentContent', () => {
    it('should return content of a specific rule', async () => {
      // Arrange
      const expectedContent = `---
name: coding-style
description: Test rule
---
# Content`;
      (fs.promises.readFile as jest.Mock).mockResolvedValue(expectedContent);

      // Act
      const content = await rulesManager.getComponentContent('coding-style');

      // Assert
      expect(content).toBe(expectedContent);
      expect(fs.promises.readFile).toHaveBeenCalledWith(
        path.join(mockRulesPath, 'coding-style.md'),
        'utf-8'
      );
    });

    it('should throw error for non-existent rule', async () => {
      // Arrange
      (fs.promises.readFile as jest.Mock).mockRejectedValue(new Error('ENOENT'));

      // Act & Assert
      await expect(rulesManager.getComponentContent('non-existent'))
        .rejects.toThrow('Component "non-existent" not found');
    });
  });

  describe('installComponents', () => {
    it('should copy all rules to target directory', async () => {
      // Arrange
      const targetPath = '/target/.claude/rules';
      const mockFiles = [
        { name: 'coding-style.md', isFile: () => true, isDirectory: () => false },
        { name: 'testing.md', isFile: () => true, isDirectory: () => false },
      ];
      (fs.promises.readdir as jest.Mock).mockResolvedValue(mockFiles);
      (fs.promises.mkdir as jest.Mock).mockResolvedValue(undefined);
      (fs.promises.copyFile as jest.Mock).mockResolvedValue(undefined);

      // Act
      const result = await rulesManager.installComponents(targetPath);

      // Assert
      expect(result.installed).toHaveLength(2);
      expect(result.installed).toContain('coding-style');
      expect(result.installed).toContain('testing');
      expect(fs.promises.mkdir).toHaveBeenCalledWith(targetPath, { recursive: true });
      expect(fs.promises.copyFile).toHaveBeenCalledTimes(2);
    });

    it('should create target directory if it does not exist', async () => {
      // Arrange
      const targetPath = '/target/.claude/rules';
      (fs.promises.readdir as jest.Mock).mockResolvedValue([]);
      (fs.promises.mkdir as jest.Mock).mockResolvedValue(undefined);

      // Act
      await rulesManager.installComponents(targetPath);

      // Assert
      expect(fs.promises.mkdir).toHaveBeenCalledWith(targetPath, { recursive: true });
    });

    it('should track failed installations', async () => {
      // Arrange
      const targetPath = '/target/.claude/rules';
      const mockFiles = [
        { name: 'coding-style.md', isFile: () => true, isDirectory: () => false },
      ];
      (fs.promises.readdir as jest.Mock).mockResolvedValue(mockFiles);
      (fs.promises.mkdir as jest.Mock).mockResolvedValue(undefined);
      (fs.promises.copyFile as jest.Mock).mockRejectedValue(new Error('Permission denied'));

      // Act
      const result = await rulesManager.installComponents(targetPath);

      // Assert
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].name).toBe('coding-style');
      expect(result.failed[0].error).toContain('Permission denied');
    });
  });

  describe('parseMetadata', () => {
    it('should parse YAML frontmatter correctly', () => {
      // Arrange
      const content = `---
name: coding-style
description: Enforce consistent coding style across the codebase
priority: 100
alwaysActive: true
---

# Coding Style Rules

Content here...`;

      // Act - access protected method via any
      const metadata = (rulesManager as any).parseMetadata(content, '/mock/rules/coding-style.md');

      // Assert
      expect(metadata.name).toBe('coding-style');
      expect(metadata.description).toBe('Enforce consistent coding style across the codebase');
      expect(metadata.priority).toBe(100);
      expect(metadata.alwaysActive).toBe(true);
    });

    it('should use filename as fallback name', () => {
      // Arrange
      const content = `---
description: A rule without name
---
# Content`;

      // Act
      const metadata = (rulesManager as any).parseMetadata(content, '/mock/rules/my-rule.md');

      // Assert
      expect(metadata.name).toBe('my-rule');
    });

    it('should default priority to 0 if not specified', () => {
      // Arrange
      const content = `---
name: test-rule
---
# Content`;

      // Act
      const metadata = (rulesManager as any).parseMetadata(content, '/mock/rules/test-rule.md');

      // Assert
      expect(metadata.priority).toBe(0);
    });

    it('should default alwaysActive to true if not specified', () => {
      // Arrange
      const content = `---
name: test-rule
---
# Content`;

      // Act
      const metadata = (rulesManager as any).parseMetadata(content, '/mock/rules/test-rule.md');

      // Assert
      expect(metadata.alwaysActive).toBe(true);
    });
  });
});
