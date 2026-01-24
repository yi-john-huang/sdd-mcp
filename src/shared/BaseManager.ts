import * as fs from 'fs';
import * as path from 'path';

/**
 * Base descriptor for all managed components
 */
export interface ComponentDescriptor {
  /** Component name (e.g., 'coding-style', 'planner') */
  name: string;
  /** Brief description of the component */
  description: string;
  /** Path to the component (file or directory) */
  path: string;
}

/**
 * Result of component installation
 */
export interface InstallResult {
  /** Successfully installed components */
  installed: string[];
  /** Failed installations with error details */
  failed: Array<{ name: string; error: string }>;
}

/**
 * Parsed component metadata from YAML frontmatter
 */
export interface ComponentMetadata {
  name?: string;
  description?: string;
  [key: string]: unknown;
}

/**
 * Configuration options for BaseManager
 */
export interface ManagerConfig {
  /** Path to the component directory */
  componentPath: string;
  /** 
   * Component structure type:
   * - 'directory': Components are in subdirectories with a main file (like skills/)
   * - 'file': Components are individual files (like agents/, rules/, contexts/)
   */
  structureType: 'directory' | 'file';
  /** 
   * Main filename for directory-based components (e.g., 'SKILL.md', 'AGENT.md')
   * Only used when structureType is 'directory'
   */
  mainFileName?: string;
  /** File extension to filter (default: '.md') */
  fileExtension?: string;
}

/**
 * Abstract base class for component managers
 * 
 * Provides common functionality for discovering, listing, and installing
 * various component types (skills, agents, rules, contexts, hooks).
 * 
 * @typeParam T - The descriptor type for the managed component
 */
export abstract class BaseManager<T extends ComponentDescriptor> {
  protected readonly config: ManagerConfig;

  /**
   * Create a new BaseManager
   * @param config - Manager configuration
   */
  constructor(config: ManagerConfig) {
    this.config = {
      ...config,
      fileExtension: config.fileExtension || '.md',
    };
  }

  /**
   * Parse metadata from component content
   * Override this method to customize metadata extraction
   * @param content - Raw content of the component file
   * @param filePath - Path to the component file (for context)
   * @returns Parsed component descriptor
   */
  protected abstract parseMetadata(content: string, filePath: string): T;

  /**
   * Get the component name from a file or directory path
   * @param entryPath - Path to the entry
   * @returns Component name
   */
  protected getComponentName(entryPath: string): string {
    return path.basename(entryPath, this.config.fileExtension);
  }

  /**
   * List all available components
   * @returns Array of component descriptors
   */
  async listComponents(): Promise<T[]> {
    const components: T[] = [];

    try {
      const entries = await fs.promises.readdir(this.config.componentPath, { withFileTypes: true });

      if (this.config.structureType === 'directory') {
        // Directory-based structure (like skills/)
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const mainFilePath = path.join(
              this.config.componentPath,
              entry.name,
              this.config.mainFileName || `${entry.name}${this.config.fileExtension}`
            );

            try {
              const content = await fs.promises.readFile(mainFilePath, 'utf-8');
              const descriptor = this.parseMetadata(content, mainFilePath);
              components.push({
                ...descriptor,
                path: path.join(this.config.componentPath, entry.name),
              });
            } catch {
              // Skip directories without main file
              continue;
            }
          }
        }
      } else {
        // File-based structure (like agents/, rules/, contexts/)
        for (const entry of entries) {
          if (entry.isFile() && entry.name.endsWith(this.config.fileExtension || '.md')) {
            const filePath = path.join(this.config.componentPath, entry.name);

            try {
              const content = await fs.promises.readFile(filePath, 'utf-8');
              const descriptor = this.parseMetadata(content, filePath);
              components.push({
                ...descriptor,
                path: filePath,
              });
            } catch {
              // Skip files that can't be read or parsed
              continue;
            }
          }
        }
      }
    } catch {
      // Return empty array if component directory doesn't exist
      return [];
    }

    return components;
  }

  /**
   * Get content of a specific component
   * @param componentName - Name of the component
   * @returns Component content
   * @throws Error if component not found
   */
  async getComponentContent(componentName: string): Promise<string> {
    let componentPath: string;

    if (this.config.structureType === 'directory') {
      componentPath = path.join(
        this.config.componentPath,
        componentName,
        this.config.mainFileName || `${componentName}${this.config.fileExtension}`
      );
    } else {
      componentPath = path.join(
        this.config.componentPath,
        `${componentName}${this.config.fileExtension}`
      );
    }

    try {
      return await fs.promises.readFile(componentPath, 'utf-8');
    } catch {
      throw new Error(`Component "${componentName}" not found`);
    }
  }

  /**
   * Get path to a specific component
   * @param componentName - Name of the component
   * @returns Path to the component
   * @throws Error if component not found
   */
  async getComponentPath(componentName: string): Promise<string> {
    let componentPath: string;

    if (this.config.structureType === 'directory') {
      componentPath = path.join(this.config.componentPath, componentName);
    } else {
      componentPath = path.join(
        this.config.componentPath,
        `${componentName}${this.config.fileExtension}`
      );
    }

    const exists = await this.pathExists(componentPath);
    if (!exists) {
      throw new Error(`Component "${componentName}" not found`);
    }

    return componentPath;
  }

  /**
   * Install components to a target directory
   * @param targetPath - Target directory for installation
   * @returns Installation result with success and failure details
   */
  async installComponents(targetPath: string): Promise<InstallResult> {
    const result: InstallResult = {
      installed: [],
      failed: [],
    };

    // Create target directory
    await fs.promises.mkdir(targetPath, { recursive: true });

    try {
      const entries = await fs.promises.readdir(this.config.componentPath, { withFileTypes: true });

      if (this.config.structureType === 'directory') {
        // Install directory-based components
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;

          const componentName = entry.name;
          const sourceDir = path.join(this.config.componentPath, componentName);
          const destDir = path.join(targetPath, componentName);

          try {
            await this.copyDirectory(sourceDir, destDir);
            result.installed.push(componentName);
          } catch (error) {
            result.failed.push({
              name: componentName,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      } else {
        // Install file-based components
        for (const entry of entries) {
          if (!entry.isFile() || !entry.name.endsWith(this.config.fileExtension || '.md')) {
            continue;
          }

          const componentName = this.getComponentName(entry.name);
          const sourceFile = path.join(this.config.componentPath, entry.name);
          const destFile = path.join(targetPath, entry.name);

          try {
            await fs.promises.copyFile(sourceFile, destFile);
            result.installed.push(componentName);
          } catch (error) {
            result.failed.push({
              name: componentName,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }
    } catch {
      // Return current result if reading component directory fails
    }

    return result;
  }

  /**
   * Parse YAML frontmatter from content
   * @param content - Content with YAML frontmatter
   * @returns Parsed metadata
   */
  protected parseYamlFrontmatter(content: string): ComponentMetadata {
    const metadata: ComponentMetadata = {};

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
        let value = line.slice(colonIndex + 1).trim();
        
        // Handle quoted values
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        
        // Handle boolean values
        if (value === 'true') {
          metadata[key] = true;
        } else if (value === 'false') {
          metadata[key] = false;
        } else if (!isNaN(Number(value)) && value !== '') {
          metadata[key] = Number(value);
        } else {
          metadata[key] = value;
        }
      }
    }

    return metadata;
  }

  /**
   * Get content body (without frontmatter)
   * @param content - Full content with possible frontmatter
   * @returns Content body
   */
  protected getContentBody(content: string): string {
    // Remove YAML frontmatter if present
    const bodyMatch = content.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/);
    return bodyMatch ? bodyMatch[1].trim() : content.trim();
  }

  /**
   * Copy a directory recursively
   * @param source - Source directory
   * @param destination - Destination directory
   */
  protected async copyDirectory(source: string, destination: string): Promise<void> {
    await fs.promises.mkdir(destination, { recursive: true });

    const entries = await fs.promises.readdir(source, { withFileTypes: true });

    for (const entry of entries) {
      const sourcePath = path.join(source, entry.name);
      const destPath = path.join(destination, entry.name);

      if (entry.isDirectory()) {
        await this.copyDirectory(sourcePath, destPath);
      } else {
        await fs.promises.copyFile(sourcePath, destPath);
      }
    }
  }

  /**
   * Check if a path exists
   * @param filePath - Path to check
   * @returns True if path exists
   */
  protected async pathExists(filePath: string): Promise<boolean> {
    try {
      await fs.promises.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
