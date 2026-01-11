import { SkillManager, SkillDescriptor } from '../../../skills/SkillManager';
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

describe('SkillManager', () => {
  let skillManager: SkillManager;
  const mockSkillsPath = '/mock/skills';

  beforeEach(() => {
    jest.clearAllMocks();
    skillManager = new SkillManager(mockSkillsPath);
  });

  describe('listSkills', () => {
    it('should return list of available skills', async () => {
      // Arrange
      const mockDirs = ['sdd-requirements', 'sdd-design', 'sdd-tasks'];
      (fs.promises.readdir as jest.Mock).mockResolvedValue(
        mockDirs.map(name => ({ name, isDirectory: () => true }))
      );
      (fs.promises.readFile as jest.Mock).mockImplementation((filePath: string) => {
        if (filePath.includes('sdd-requirements')) {
          return Promise.resolve(`---
name: sdd-requirements
description: Generate requirements
---
# Content`);
        }
        if (filePath.includes('sdd-design')) {
          return Promise.resolve(`---
name: sdd-design
description: Create design
---
# Content`);
        }
        if (filePath.includes('sdd-tasks')) {
          return Promise.resolve(`---
name: sdd-tasks
description: Generate tasks
---
# Content`);
        }
        return Promise.reject(new Error('File not found'));
      });

      // Act
      const skills = await skillManager.listSkills();

      // Assert
      expect(skills).toHaveLength(3);
      expect(skills[0].name).toBe('sdd-requirements');
      expect(skills[0].description).toBe('Generate requirements');
      expect(skills[1].name).toBe('sdd-design');
      expect(skills[2].name).toBe('sdd-tasks');
    });

    it('should return empty array when skills directory is empty', async () => {
      // Arrange
      (fs.promises.readdir as jest.Mock).mockResolvedValue([]);

      // Act
      const skills = await skillManager.listSkills();

      // Assert
      expect(skills).toHaveLength(0);
    });

    it('should skip directories without SKILL.md file', async () => {
      // Arrange
      const mockDirs = ['sdd-requirements', 'invalid-dir'];
      (fs.promises.readdir as jest.Mock).mockResolvedValue(
        mockDirs.map(name => ({ name, isDirectory: () => true }))
      );
      (fs.promises.readFile as jest.Mock).mockImplementation((filePath: string) => {
        if (filePath.includes('sdd-requirements')) {
          return Promise.resolve(`---
name: sdd-requirements
description: Generate requirements
---
# Content`);
        }
        return Promise.reject(new Error('ENOENT: no such file'));
      });

      // Act
      const skills = await skillManager.listSkills();

      // Assert
      expect(skills).toHaveLength(1);
      expect(skills[0].name).toBe('sdd-requirements');
    });
  });

  describe('getSkillPath', () => {
    it('should return correct path for existing skill', async () => {
      // Arrange
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      // Act
      const skillPath = await skillManager.getSkillPath('sdd-requirements');

      // Assert
      expect(skillPath).toBe(path.join(mockSkillsPath, 'sdd-requirements'));
    });

    it('should throw error for non-existent skill', async () => {
      // Arrange
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      // Act & Assert
      await expect(skillManager.getSkillPath('non-existent'))
        .rejects.toThrow('Skill "non-existent" not found');
    });
  });

  describe('installSkills', () => {
    it('should copy all skills to target directory', async () => {
      // Arrange
      const targetPath = '/target/.claude/skills';
      const mockDirs = ['sdd-requirements', 'sdd-design'];

      (fs.promises.readdir as jest.Mock).mockImplementation((dirPath: string) => {
        if (dirPath === mockSkillsPath) {
          return Promise.resolve(
            mockDirs.map(name => ({ name, isDirectory: () => true }))
          );
        }
        // Return files in skill directory
        return Promise.resolve([
          { name: 'SKILL.md', isDirectory: () => false }
        ]);
      });

      (fs.promises.mkdir as jest.Mock).mockResolvedValue(undefined);
      (fs.promises.copyFile as jest.Mock).mockResolvedValue(undefined);
      (fs.promises.readFile as jest.Mock).mockResolvedValue(`---
name: test
description: Test skill
---
# Content`);

      // Act
      const result = await skillManager.installSkills(targetPath);

      // Assert
      expect(result.installed).toHaveLength(2);
      expect(result.installed).toContain('sdd-requirements');
      expect(result.installed).toContain('sdd-design');
      expect(fs.promises.mkdir).toHaveBeenCalledWith(
        expect.stringContaining('sdd-requirements'),
        { recursive: true }
      );
    });

    it('should create target directory if it does not exist', async () => {
      // Arrange
      const targetPath = '/target/.claude/skills';
      (fs.promises.readdir as jest.Mock).mockResolvedValue([]);
      (fs.promises.mkdir as jest.Mock).mockResolvedValue(undefined);

      // Act
      await skillManager.installSkills(targetPath);

      // Assert
      expect(fs.promises.mkdir).toHaveBeenCalledWith(targetPath, { recursive: true });
    });

    it('should return empty result when no skills to install', async () => {
      // Arrange
      const targetPath = '/target/.claude/skills';
      (fs.promises.readdir as jest.Mock).mockResolvedValue([]);
      (fs.promises.mkdir as jest.Mock).mockResolvedValue(undefined);

      // Act
      const result = await skillManager.installSkills(targetPath);

      // Assert
      expect(result.installed).toHaveLength(0);
      expect(result.failed).toHaveLength(0);
    });

    it('should track failed installations', async () => {
      // Arrange
      const targetPath = '/target/.claude/skills';
      const mockDirs = ['sdd-requirements'];

      (fs.promises.readdir as jest.Mock).mockImplementation((dirPath: string) => {
        if (dirPath === mockSkillsPath) {
          return Promise.resolve(
            mockDirs.map(name => ({ name, isDirectory: () => true }))
          );
        }
        return Promise.resolve([{ name: 'SKILL.md', isDirectory: () => false }]);
      });

      (fs.promises.mkdir as jest.Mock).mockResolvedValue(undefined);
      (fs.promises.copyFile as jest.Mock).mockRejectedValue(new Error('Permission denied'));
      (fs.promises.readFile as jest.Mock).mockResolvedValue(`---
name: test
description: Test
---`);

      // Act
      const result = await skillManager.installSkills(targetPath);

      // Assert
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].name).toBe('sdd-requirements');
      expect(result.failed[0].error).toContain('Permission denied');
    });
  });

  describe('parseSkillMetadata', () => {
    it('should parse YAML frontmatter correctly', () => {
      // Arrange
      const content = `---
name: sdd-requirements
description: Generate EARS-formatted requirements for SDD workflow.
---

# SDD Requirements Generation

Content here...`;

      // Act
      const metadata = skillManager.parseSkillMetadata(content);

      // Assert
      expect(metadata.name).toBe('sdd-requirements');
      expect(metadata.description).toBe('Generate EARS-formatted requirements for SDD workflow.');
    });

    it('should handle missing frontmatter', () => {
      // Arrange
      const content = '# Just markdown content';

      // Act
      const metadata = skillManager.parseSkillMetadata(content);

      // Assert
      expect(metadata.name).toBeUndefined();
      expect(metadata.description).toBeUndefined();
    });

    it('should handle malformed frontmatter', () => {
      // Arrange
      const content = `---
name: test
invalid yaml here
---
# Content`;

      // Act
      const metadata = skillManager.parseSkillMetadata(content);

      // Assert
      expect(metadata.name).toBe('test');
    });
  });
});
