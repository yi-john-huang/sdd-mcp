import { ContextManager, ContextDescriptor } from '../../../contexts/ContextManager';
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

describe('ContextManager', () => {
  let contextManager: ContextManager;
  const mockContextsPath = '/mock/contexts';

  beforeEach(() => {
    jest.clearAllMocks();
    contextManager = new ContextManager(mockContextsPath);
  });

  describe('listComponents', () => {
    it('should return list of available contexts', async () => {
      // Arrange
      const mockFiles = [
        { name: 'dev.md', isFile: () => true, isDirectory: () => false },
        { name: 'review.md', isFile: () => true, isDirectory: () => false },
        { name: 'planning.md', isFile: () => true, isDirectory: () => false },
      ];
      (fs.promises.readdir as jest.Mock).mockResolvedValue(mockFiles);
      (fs.promises.readFile as jest.Mock).mockImplementation((filePath: string) => {
        if (filePath.includes('dev')) {
          return Promise.resolve(`---
name: dev
description: Development mode with implementation focus
mode: dev
---
# Development Context`);
        }
        if (filePath.includes('review')) {
          return Promise.resolve(`---
name: review
description: Code review mode
mode: review
---
# Review Context`);
        }
        if (filePath.includes('planning')) {
          return Promise.resolve(`---
name: planning
description: Planning and architecture mode
mode: planning
---
# Planning Context`);
        }
        return Promise.reject(new Error('File not found'));
      });

      // Act
      const contexts = await contextManager.listComponents();

      // Assert
      expect(contexts).toHaveLength(3);
      expect(contexts[0].name).toBe('dev');
      expect(contexts[0].description).toBe('Development mode with implementation focus');
      expect(contexts[0].mode).toBe('dev');
    });

    it('should return empty array when contexts directory is empty', async () => {
      // Arrange
      (fs.promises.readdir as jest.Mock).mockResolvedValue([]);

      // Act
      const contexts = await contextManager.listComponents();

      // Assert
      expect(contexts).toHaveLength(0);
    });

    it('should skip non-markdown files', async () => {
      // Arrange
      const mockFiles = [
        { name: 'dev.md', isFile: () => true, isDirectory: () => false },
        { name: 'readme.txt', isFile: () => true, isDirectory: () => false },
        { name: 'subdir', isFile: () => false, isDirectory: () => true },
      ];
      (fs.promises.readdir as jest.Mock).mockResolvedValue(mockFiles);
      (fs.promises.readFile as jest.Mock).mockResolvedValue(`---
name: dev
description: Test context
mode: dev
---
# Content`);

      // Act
      const contexts = await contextManager.listComponents();

      // Assert
      expect(contexts).toHaveLength(1);
      expect(contexts[0].name).toBe('dev');
    });

    it('should handle missing frontmatter gracefully', async () => {
      // Arrange
      const mockFiles = [
        { name: 'no-frontmatter.md', isFile: () => true, isDirectory: () => false },
      ];
      (fs.promises.readdir as jest.Mock).mockResolvedValue(mockFiles);
      (fs.promises.readFile as jest.Mock).mockResolvedValue('# Just markdown content');

      // Act
      const contexts = await contextManager.listComponents();

      // Assert
      expect(contexts).toHaveLength(1);
      expect(contexts[0].name).toBe('no-frontmatter'); // Falls back to filename
      expect(contexts[0].description).toBe('');
      expect(contexts[0].mode).toBe('dev'); // Default mode
    });
  });

  describe('getComponentContent', () => {
    it('should return content of a specific context', async () => {
      // Arrange
      const expectedContent = `---
name: dev
description: Test context
mode: dev
---
# Content`;
      (fs.promises.readFile as jest.Mock).mockResolvedValue(expectedContent);

      // Act
      const content = await contextManager.getComponentContent('dev');

      // Assert
      expect(content).toBe(expectedContent);
      expect(fs.promises.readFile).toHaveBeenCalledWith(
        path.join(mockContextsPath, 'dev.md'),
        'utf-8'
      );
    });

    it('should throw error for non-existent context', async () => {
      // Arrange
      (fs.promises.readFile as jest.Mock).mockRejectedValue(new Error('ENOENT'));

      // Act & Assert
      await expect(contextManager.getComponentContent('non-existent'))
        .rejects.toThrow('Component "non-existent" not found');
    });
  });

  describe('installComponents', () => {
    it('should copy all contexts to target directory', async () => {
      // Arrange
      const targetPath = '/target/.claude/contexts';
      const mockFiles = [
        { name: 'dev.md', isFile: () => true, isDirectory: () => false },
        { name: 'review.md', isFile: () => true, isDirectory: () => false },
      ];
      (fs.promises.readdir as jest.Mock).mockResolvedValue(mockFiles);
      (fs.promises.mkdir as jest.Mock).mockResolvedValue(undefined);
      (fs.promises.copyFile as jest.Mock).mockResolvedValue(undefined);

      // Act
      const result = await contextManager.installComponents(targetPath);

      // Assert
      expect(result.installed).toHaveLength(2);
      expect(result.installed).toContain('dev');
      expect(result.installed).toContain('review');
      expect(fs.promises.mkdir).toHaveBeenCalledWith(targetPath, { recursive: true });
      expect(fs.promises.copyFile).toHaveBeenCalledTimes(2);
    });

    it('should create target directory if it does not exist', async () => {
      // Arrange
      const targetPath = '/target/.claude/contexts';
      (fs.promises.readdir as jest.Mock).mockResolvedValue([]);
      (fs.promises.mkdir as jest.Mock).mockResolvedValue(undefined);

      // Act
      await contextManager.installComponents(targetPath);

      // Assert
      expect(fs.promises.mkdir).toHaveBeenCalledWith(targetPath, { recursive: true });
    });

    it('should track failed installations', async () => {
      // Arrange
      const targetPath = '/target/.claude/contexts';
      const mockFiles = [
        { name: 'dev.md', isFile: () => true, isDirectory: () => false },
      ];
      (fs.promises.readdir as jest.Mock).mockResolvedValue(mockFiles);
      (fs.promises.mkdir as jest.Mock).mockResolvedValue(undefined);
      (fs.promises.copyFile as jest.Mock).mockRejectedValue(new Error('Permission denied'));

      // Act
      const result = await contextManager.installComponents(targetPath);

      // Assert
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].name).toBe('dev');
      expect(result.failed[0].error).toContain('Permission denied');
    });
  });

  describe('parseMetadata', () => {
    it('should parse YAML frontmatter correctly', () => {
      // Arrange
      const content = `---
name: dev
description: Development mode with implementation focus
mode: dev
---

# Development Context

Content here...`;

      // Act
      const metadata = (contextManager as any).parseMetadata(content, '/mock/contexts/dev.md');

      // Assert
      expect(metadata.name).toBe('dev');
      expect(metadata.description).toBe('Development mode with implementation focus');
      expect(metadata.mode).toBe('dev');
    });

    it('should use filename as fallback name', () => {
      // Arrange
      const content = `---
description: A context without name
mode: review
---
# Content`;

      // Act
      const metadata = (contextManager as any).parseMetadata(content, '/mock/contexts/my-context.md');

      // Assert
      expect(metadata.name).toBe('my-context');
    });

    it('should default mode to dev if not specified', () => {
      // Arrange
      const content = `---
name: test-context
---
# Content`;

      // Act
      const metadata = (contextManager as any).parseMetadata(content, '/mock/contexts/test-context.md');

      // Assert
      expect(metadata.mode).toBe('dev');
    });
  });

  describe('getContextByMode', () => {
    it('should return context matching the specified mode', async () => {
      // Arrange
      const mockFiles = [
        { name: 'dev.md', isFile: () => true, isDirectory: () => false },
        { name: 'review.md', isFile: () => true, isDirectory: () => false },
      ];
      (fs.promises.readdir as jest.Mock).mockResolvedValue(mockFiles);
      (fs.promises.readFile as jest.Mock).mockImplementation((filePath: string) => {
        if (filePath.includes('dev')) {
          return Promise.resolve(`---
name: dev
mode: dev
---
# Dev`);
        }
        if (filePath.includes('review')) {
          return Promise.resolve(`---
name: review
mode: review
---
# Review`);
        }
        return Promise.reject(new Error('File not found'));
      });

      // Act
      const context = await contextManager.getContextByMode('review');

      // Assert
      expect(context).not.toBeNull();
      expect(context?.name).toBe('review');
      expect(context?.mode).toBe('review');
    });

    it('should return null if no context matches the mode', async () => {
      // Arrange
      const mockFiles = [
        { name: 'dev.md', isFile: () => true, isDirectory: () => false },
      ];
      (fs.promises.readdir as jest.Mock).mockResolvedValue(mockFiles);
      (fs.promises.readFile as jest.Mock).mockResolvedValue(`---
name: dev
mode: dev
---
# Dev`);

      // Act
      const context = await contextManager.getContextByMode('security-audit');

      // Assert
      expect(context).toBeNull();
    });
  });
});
