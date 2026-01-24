import { HookLoader, HookDescriptor } from '../../../hooks/HookLoader';
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

describe('HookLoader', () => {
  let hookLoader: HookLoader;
  const mockHooksPath = '/mock/hooks';

  beforeEach(() => {
    jest.clearAllMocks();
    hookLoader = new HookLoader(mockHooksPath);
  });

  describe('listComponents', () => {
    it('should return list of hooks from nested directory structure', async () => {
      // Arrange - hooks are organized as hooks/{event-type}/*.md
      const mockEventDirs = [
        { name: 'pre-tool-use', isFile: () => false, isDirectory: () => true },
        { name: 'post-tool-use', isFile: () => false, isDirectory: () => true },
        { name: 'session-start', isFile: () => false, isDirectory: () => true },
      ];

      const mockPreToolHooks = [
        { name: 'validate-input.md', isFile: () => true, isDirectory: () => false },
        { name: 'log-request.md', isFile: () => true, isDirectory: () => false },
      ];

      const mockPostToolHooks = [
        { name: 'format-output.md', isFile: () => true, isDirectory: () => false },
      ];

      const mockSessionStartHooks = [
        { name: 'load-context.md', isFile: () => true, isDirectory: () => false },
      ];

      (fs.promises.readdir as jest.Mock).mockImplementation((dirPath: string) => {
        if (dirPath === mockHooksPath) {
          return Promise.resolve(mockEventDirs);
        }
        if (dirPath.includes('pre-tool-use')) {
          return Promise.resolve(mockPreToolHooks);
        }
        if (dirPath.includes('post-tool-use')) {
          return Promise.resolve(mockPostToolHooks);
        }
        if (dirPath.includes('session-start')) {
          return Promise.resolve(mockSessionStartHooks);
        }
        return Promise.resolve([]);
      });

      (fs.promises.readFile as jest.Mock).mockImplementation((filePath: string) => {
        if (filePath.includes('validate-input')) {
          return Promise.resolve(`---
name: validate-input
description: Validate tool input before execution
event: pre-tool-use
priority: 100
enabled: true
---
# Validate Input Hook`);
        }
        if (filePath.includes('log-request')) {
          return Promise.resolve(`---
name: log-request
description: Log all tool requests
event: pre-tool-use
priority: 50
enabled: true
---
# Log Request Hook`);
        }
        if (filePath.includes('format-output')) {
          return Promise.resolve(`---
name: format-output
description: Format tool output
event: post-tool-use
priority: 100
enabled: true
---
# Format Output Hook`);
        }
        if (filePath.includes('load-context')) {
          return Promise.resolve(`---
name: load-context
description: Load session context on start
event: session-start
priority: 100
enabled: true
---
# Load Context Hook`);
        }
        return Promise.reject(new Error('File not found'));
      });

      // Act
      const hooks = await hookLoader.listComponents();

      // Assert
      expect(hooks).toHaveLength(4);
      expect(hooks.some(h => h.name === 'validate-input' && h.event === 'pre-tool-use')).toBe(true);
      expect(hooks.some(h => h.name === 'log-request' && h.event === 'pre-tool-use')).toBe(true);
      expect(hooks.some(h => h.name === 'format-output' && h.event === 'post-tool-use')).toBe(true);
      expect(hooks.some(h => h.name === 'load-context' && h.event === 'session-start')).toBe(true);
    });

    it('should return empty array when hooks directory is empty', async () => {
      // Arrange
      (fs.promises.readdir as jest.Mock).mockResolvedValue([]);

      // Act
      const hooks = await hookLoader.listComponents();

      // Assert
      expect(hooks).toHaveLength(0);
    });

    it('should skip non-directory entries in root hooks folder', async () => {
      // Arrange
      const mockEntries = [
        { name: 'pre-tool-use', isFile: () => false, isDirectory: () => true },
        { name: 'README.md', isFile: () => true, isDirectory: () => false },
        { name: '.gitkeep', isFile: () => true, isDirectory: () => false },
      ];

      const mockPreToolHooks = [
        { name: 'validate.md', isFile: () => true, isDirectory: () => false },
      ];

      (fs.promises.readdir as jest.Mock).mockImplementation((dirPath: string) => {
        if (dirPath === mockHooksPath) {
          return Promise.resolve(mockEntries);
        }
        if (dirPath.includes('pre-tool-use')) {
          return Promise.resolve(mockPreToolHooks);
        }
        return Promise.resolve([]);
      });

      (fs.promises.readFile as jest.Mock).mockResolvedValue(`---
name: validate
description: Test hook
event: pre-tool-use
---
# Content`);

      // Act
      const hooks = await hookLoader.listComponents();

      // Assert
      expect(hooks).toHaveLength(1);
      expect(hooks[0].name).toBe('validate');
    });

    it('should skip non-markdown files in event directories', async () => {
      // Arrange
      const mockEventDirs = [
        { name: 'pre-tool-use', isFile: () => false, isDirectory: () => true },
      ];

      const mockHookFiles = [
        { name: 'validate.md', isFile: () => true, isDirectory: () => false },
        { name: 'config.json', isFile: () => true, isDirectory: () => false },
        { name: 'helper.ts', isFile: () => true, isDirectory: () => false },
      ];

      (fs.promises.readdir as jest.Mock).mockImplementation((dirPath: string) => {
        if (dirPath === mockHooksPath) {
          return Promise.resolve(mockEventDirs);
        }
        return Promise.resolve(mockHookFiles);
      });

      (fs.promises.readFile as jest.Mock).mockResolvedValue(`---
name: validate
description: Test hook
event: pre-tool-use
---
# Content`);

      // Act
      const hooks = await hookLoader.listComponents();

      // Assert
      expect(hooks).toHaveLength(1);
    });

    it('should infer event type from directory name if not in frontmatter', async () => {
      // Arrange
      const mockEventDirs = [
        { name: 'post-tool-use', isFile: () => false, isDirectory: () => true },
      ];

      const mockHookFiles = [
        { name: 'cleanup.md', isFile: () => true, isDirectory: () => false },
      ];

      (fs.promises.readdir as jest.Mock).mockImplementation((dirPath: string) => {
        if (dirPath === mockHooksPath) {
          return Promise.resolve(mockEventDirs);
        }
        return Promise.resolve(mockHookFiles);
      });

      (fs.promises.readFile as jest.Mock).mockResolvedValue(`---
name: cleanup
description: Cleanup after tool execution
---
# Content without event`);

      // Act
      const hooks = await hookLoader.listComponents();

      // Assert
      expect(hooks).toHaveLength(1);
      expect(hooks[0].event).toBe('post-tool-use');
    });

    it('should handle missing frontmatter gracefully', async () => {
      // Arrange
      const mockEventDirs = [
        { name: 'session-end', isFile: () => false, isDirectory: () => true },
      ];

      const mockHookFiles = [
        { name: 'save-state.md', isFile: () => true, isDirectory: () => false },
      ];

      (fs.promises.readdir as jest.Mock).mockImplementation((dirPath: string) => {
        if (dirPath === mockHooksPath) {
          return Promise.resolve(mockEventDirs);
        }
        return Promise.resolve(mockHookFiles);
      });

      (fs.promises.readFile as jest.Mock).mockResolvedValue('# Just markdown content\n\nNo frontmatter here');

      // Act
      const hooks = await hookLoader.listComponents();

      // Assert
      expect(hooks).toHaveLength(1);
      expect(hooks[0].name).toBe('save-state'); // Falls back to filename
      expect(hooks[0].event).toBe('session-end'); // Inferred from directory
      expect(hooks[0].enabled).toBe(true); // Default
    });
  });

  describe('getComponentContent', () => {
    it('should return content of a specific hook by name', async () => {
      // Arrange
      const mockEventDirs = [
        { name: 'pre-tool-use', isFile: () => false, isDirectory: () => true },
      ];

      const mockHookFiles = [
        { name: 'validate.md', isFile: () => true, isDirectory: () => false },
      ];

      (fs.promises.readdir as jest.Mock).mockImplementation((dirPath: string) => {
        if (dirPath === mockHooksPath) {
          return Promise.resolve(mockEventDirs);
        }
        return Promise.resolve(mockHookFiles);
      });

      const expectedContent = `---
name: validate
description: Test
event: pre-tool-use
---
# Content`;
      (fs.promises.readFile as jest.Mock).mockResolvedValue(expectedContent);

      // Act
      const content = await hookLoader.getComponentContent('validate');

      // Assert
      expect(content).toBe(expectedContent);
    });

    it('should throw error for non-existent hook', async () => {
      // Arrange
      (fs.promises.readdir as jest.Mock).mockResolvedValue([]);

      // Act & Assert
      await expect(hookLoader.getComponentContent('non-existent'))
        .rejects.toThrow('Component "non-existent" not found');
    });
  });

  describe('installComponents', () => {
    it('should copy hooks preserving nested directory structure', async () => {
      // Arrange
      const targetPath = '/target/.claude/hooks';
      const mockEventDirs = [
        { name: 'pre-tool-use', isFile: () => false, isDirectory: () => true },
        { name: 'post-tool-use', isFile: () => false, isDirectory: () => true },
      ];

      const mockPreToolHooks = [
        { name: 'validate.md', isFile: () => true, isDirectory: () => false },
      ];

      const mockPostToolHooks = [
        { name: 'format.md', isFile: () => true, isDirectory: () => false },
      ];

      (fs.promises.readdir as jest.Mock).mockImplementation((dirPath: string) => {
        if (dirPath === mockHooksPath) {
          return Promise.resolve(mockEventDirs);
        }
        if (dirPath.includes('pre-tool-use')) {
          return Promise.resolve(mockPreToolHooks);
        }
        if (dirPath.includes('post-tool-use')) {
          return Promise.resolve(mockPostToolHooks);
        }
        return Promise.resolve([]);
      });

      // Return content WITHOUT event field so event is inferred from directory name
      (fs.promises.readFile as jest.Mock).mockResolvedValue(`---
name: test
---
# Content`);

      (fs.promises.mkdir as jest.Mock).mockResolvedValue(undefined);
      (fs.promises.copyFile as jest.Mock).mockResolvedValue(undefined);

      // Act
      const result = await hookLoader.installComponents(targetPath);

      // Assert
      expect(result.installed).toHaveLength(2);
      // Should create nested directories - order depends on iteration
      const mkdirCalls = (fs.promises.mkdir as jest.Mock).mock.calls.map(c => c[0]);
      expect(mkdirCalls).toContain(path.join(targetPath, 'pre-tool-use'));
      expect(mkdirCalls).toContain(path.join(targetPath, 'post-tool-use'));
    });

    it('should track failed installations', async () => {
      // Arrange
      const targetPath = '/target/.claude/hooks';
      const mockEventDirs = [
        { name: 'pre-tool-use', isFile: () => false, isDirectory: () => true },
      ];

      const mockHookFiles = [
        { name: 'validate.md', isFile: () => true, isDirectory: () => false },
      ];

      (fs.promises.readdir as jest.Mock).mockImplementation((dirPath: string) => {
        if (dirPath === mockHooksPath) {
          return Promise.resolve(mockEventDirs);
        }
        return Promise.resolve(mockHookFiles);
      });

      (fs.promises.readFile as jest.Mock).mockResolvedValue(`---
name: validate
event: pre-tool-use
---
# Content`);

      (fs.promises.mkdir as jest.Mock).mockResolvedValue(undefined);
      (fs.promises.copyFile as jest.Mock).mockRejectedValue(new Error('Permission denied'));

      // Act
      const result = await hookLoader.installComponents(targetPath);

      // Assert
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].name).toBe('validate');
      expect(result.failed[0].error).toContain('Permission denied');
    });
  });

  describe('getHooksByEvent', () => {
    it('should return hooks filtered by event type', async () => {
      // Arrange
      const mockEventDirs = [
        { name: 'pre-tool-use', isFile: () => false, isDirectory: () => true },
        { name: 'post-tool-use', isFile: () => false, isDirectory: () => true },
      ];

      const mockPreToolHooks = [
        { name: 'validate.md', isFile: () => true, isDirectory: () => false },
        { name: 'log.md', isFile: () => true, isDirectory: () => false },
      ];

      const mockPostToolHooks = [
        { name: 'format.md', isFile: () => true, isDirectory: () => false },
      ];

      (fs.promises.readdir as jest.Mock).mockImplementation((dirPath: string) => {
        if (dirPath === mockHooksPath) {
          return Promise.resolve(mockEventDirs);
        }
        if (dirPath.includes('pre-tool-use')) {
          return Promise.resolve(mockPreToolHooks);
        }
        if (dirPath.includes('post-tool-use')) {
          return Promise.resolve(mockPostToolHooks);
        }
        return Promise.resolve([]);
      });

      (fs.promises.readFile as jest.Mock).mockImplementation((filePath: string) => {
        const event = filePath.includes('pre-tool-use') ? 'pre-tool-use' : 'post-tool-use';
        return Promise.resolve(`---
name: test
event: ${event}
priority: 100
---
# Content`);
      });

      // Act
      const preToolHooks = await hookLoader.getHooksByEvent('pre-tool-use');
      const postToolHooks = await hookLoader.getHooksByEvent('post-tool-use');

      // Assert
      expect(preToolHooks).toHaveLength(2);
      expect(postToolHooks).toHaveLength(1);
      expect(preToolHooks.every(h => h.event === 'pre-tool-use')).toBe(true);
      expect(postToolHooks.every(h => h.event === 'post-tool-use')).toBe(true);
    });
  });

  describe('listEventTypes', () => {
    it('should return list of all event types with hooks', async () => {
      // Arrange
      const mockEventDirs = [
        { name: 'pre-tool-use', isFile: () => false, isDirectory: () => true },
        { name: 'post-tool-use', isFile: () => false, isDirectory: () => true },
        { name: 'session-start', isFile: () => false, isDirectory: () => true },
      ];

      (fs.promises.readdir as jest.Mock).mockImplementation((dirPath: string) => {
        if (dirPath === mockHooksPath) {
          return Promise.resolve(mockEventDirs);
        }
        return Promise.resolve([
          { name: 'hook.md', isFile: () => true, isDirectory: () => false },
        ]);
      });

      (fs.promises.readFile as jest.Mock).mockResolvedValue(`---
name: test
---
# Content`);

      // Act
      const eventTypes = await hookLoader.listEventTypes();

      // Assert
      expect(eventTypes).toHaveLength(3);
      expect(eventTypes).toContain('pre-tool-use');
      expect(eventTypes).toContain('post-tool-use');
      expect(eventTypes).toContain('session-start');
    });
  });

  describe('getEnabledHooks', () => {
    it('should return only enabled hooks', async () => {
      // Arrange
      const mockEventDirs = [
        { name: 'pre-tool-use', isFile: () => false, isDirectory: () => true },
      ];

      const mockHookFiles = [
        { name: 'enabled-hook.md', isFile: () => true, isDirectory: () => false },
        { name: 'disabled-hook.md', isFile: () => true, isDirectory: () => false },
      ];

      (fs.promises.readdir as jest.Mock).mockImplementation((dirPath: string) => {
        if (dirPath === mockHooksPath) {
          return Promise.resolve(mockEventDirs);
        }
        return Promise.resolve(mockHookFiles);
      });

      (fs.promises.readFile as jest.Mock).mockImplementation((filePath: string) => {
        if (filePath.includes('enabled-hook')) {
          return Promise.resolve(`---
name: enabled-hook
event: pre-tool-use
enabled: true
---
# Enabled`);
        }
        return Promise.resolve(`---
name: disabled-hook
event: pre-tool-use
enabled: false
---
# Disabled`);
      });

      // Act
      const enabledHooks = await hookLoader.getEnabledHooks();

      // Assert
      expect(enabledHooks).toHaveLength(1);
      expect(enabledHooks[0].name).toBe('enabled-hook');
    });
  });

  describe('parseMetadata', () => {
    it('should parse YAML frontmatter correctly', () => {
      // Arrange
      const content = `---
name: validate-input
description: Validate all tool inputs before execution
event: pre-tool-use
priority: 100
enabled: true
---

# Validate Input Hook

Content here...`;

      // Act - access protected method via any
      const metadata = (hookLoader as any).parseMetadata(
        content,
        '/mock/hooks/pre-tool-use/validate-input.md'
      );

      // Assert
      expect(metadata.name).toBe('validate-input');
      expect(metadata.description).toBe('Validate all tool inputs before execution');
      expect(metadata.event).toBe('pre-tool-use');
      expect(metadata.priority).toBe(100);
      expect(metadata.enabled).toBe(true);
    });

    it('should use filename as fallback name', () => {
      // Arrange
      const content = `---
description: A hook without name
---
# Content`;

      // Act
      const metadata = (hookLoader as any).parseMetadata(
        content,
        '/mock/hooks/pre-tool-use/my-hook.md'
      );

      // Assert
      expect(metadata.name).toBe('my-hook');
    });

    it('should use directory name as fallback event', () => {
      // Arrange
      const content = `---
name: test-hook
---
# Content`;

      // Act
      const metadata = (hookLoader as any).parseMetadata(
        content,
        '/mock/hooks/session-end/test-hook.md'
      );

      // Assert
      expect(metadata.event).toBe('session-end');
    });

    it('should default priority to 0 if not specified', () => {
      // Arrange
      const content = `---
name: test-hook
---
# Content`;

      // Act
      const metadata = (hookLoader as any).parseMetadata(
        content,
        '/mock/hooks/pre-tool-use/test-hook.md'
      );

      // Assert
      expect(metadata.priority).toBe(0);
    });

    it('should default enabled to true if not specified', () => {
      // Arrange
      const content = `---
name: test-hook
---
# Content`;

      // Act
      const metadata = (hookLoader as any).parseMetadata(
        content,
        '/mock/hooks/pre-tool-use/test-hook.md'
      );

      // Assert
      expect(metadata.enabled).toBe(true);
    });
  });
});
