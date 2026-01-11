import * as fs from 'fs';
import * as path from 'path';

/**
 * Descriptor for an SDD skill
 */
export interface SkillDescriptor {
  /** Skill name (e.g., 'sdd-requirements') */
  name: string;
  /** Brief description of the skill */
  description: string;
  /** Path to the skill directory */
  path: string;
}

/**
 * Result of skill installation
 */
export interface InstallResult {
  /** Successfully installed skills */
  installed: string[];
  /** Failed installations with error details */
  failed: Array<{ name: string; error: string }>;
}

/**
 * Parsed skill metadata from SKILL.md frontmatter
 */
export interface SkillMetadata {
  name?: string;
  description?: string;
  [key: string]: unknown;
}

/**
 * Manages SDD skills - discovery, listing, and installation
 *
 * Skills are markdown files in the skills directory that provide
 * guidance for Claude Code agent interactions.
 */
export class SkillManager {
  private readonly skillsPath: string;

  /**
   * Create a new SkillManager
   * @param skillsPath - Path to the skills directory in the package
   */
  constructor(skillsPath: string) {
    this.skillsPath = skillsPath;
  }

  /**
   * List all available skills
   * @returns Array of skill descriptors
   */
  async listSkills(): Promise<SkillDescriptor[]> {
    const skills: SkillDescriptor[] = [];

    try {
      const entries = await fs.promises.readdir(this.skillsPath, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const skillDir = entry.name;
          const skillMdPath = path.join(this.skillsPath, skillDir, 'SKILL.md');

          try {
            const content = await fs.promises.readFile(skillMdPath, 'utf-8');
            const metadata = this.parseSkillMetadata(content);

            skills.push({
              name: metadata.name || skillDir,
              description: metadata.description || '',
              path: path.join(this.skillsPath, skillDir),
            });
          } catch {
            // Skip directories without SKILL.md
            continue;
          }
        }
      }
    } catch {
      // Return empty array if skills directory doesn't exist
      return [];
    }

    return skills;
  }

  /**
   * Get the path to a specific skill
   * @param skillName - Name of the skill
   * @returns Path to the skill directory
   * @throws Error if skill not found
   */
  async getSkillPath(skillName: string): Promise<string> {
    const skillPath = path.join(this.skillsPath, skillName);

    if (!fs.existsSync(skillPath)) {
      throw new Error(`Skill "${skillName}" not found`);
    }

    return skillPath;
  }

  /**
   * Install skills to a target directory
   * @param targetPath - Target directory (e.g., /project/.claude/skills)
   * @returns Installation result with success and failure details
   */
  async installSkills(targetPath: string): Promise<InstallResult> {
    const result: InstallResult = {
      installed: [],
      failed: [],
    };

    // Create target directory
    await fs.promises.mkdir(targetPath, { recursive: true });

    try {
      const entries = await fs.promises.readdir(this.skillsPath, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const skillName = entry.name;
        const sourceDir = path.join(this.skillsPath, skillName);
        const destDir = path.join(targetPath, skillName);

        try {
          // Create skill destination directory
          await fs.promises.mkdir(destDir, { recursive: true });

          // Copy all files in the skill directory
          const files = await fs.promises.readdir(sourceDir, { withFileTypes: true });

          for (const file of files) {
            if (!file.isDirectory()) {
              const sourceFile = path.join(sourceDir, file.name);
              const destFile = path.join(destDir, file.name);
              await fs.promises.copyFile(sourceFile, destFile);
            }
          }

          result.installed.push(skillName);
        } catch (error) {
          result.failed.push({
            name: skillName,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } catch {
      // Return current result if reading skills directory fails
    }

    return result;
  }

  /**
   * Parse YAML frontmatter from SKILL.md content
   * @param content - Content of SKILL.md file
   * @returns Parsed metadata
   */
  parseSkillMetadata(content: string): SkillMetadata {
    const metadata: SkillMetadata = {};

    // Match YAML frontmatter between --- delimiters
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);

    if (!frontmatterMatch) {
      return metadata;
    }

    const frontmatter = frontmatterMatch[1];

    // Simple YAML parsing for key: value pairs
    const lines = frontmatter.split('\n');
    for (const line of lines) {
      const colonIndex = line.indexOf(':');
      if (colonIndex > 0) {
        const key = line.slice(0, colonIndex).trim();
        const value = line.slice(colonIndex + 1).trim();
        metadata[key] = value;
      }
    }

    return metadata;
  }
}
