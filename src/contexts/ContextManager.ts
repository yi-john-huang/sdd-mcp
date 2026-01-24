import * as path from 'path';
import { BaseManager, ComponentDescriptor } from '../shared/BaseManager.js';

/**
 * Descriptor for a context component
 */
export interface ContextDescriptor extends ComponentDescriptor {
  /** Context name */
  name: string;
  /** Brief description of the context */
  description: string;
  /** Path to the context file */
  path: string;
  /** Mode identifier (dev, review, planning, security-audit, research) */
  mode: string;
}

/**
 * Manages context components - discovery, listing, and installation
 *
 * Contexts are mode-specific system prompts that modify AI behavior
 * for different workflows (development, review, planning, etc.).
 *
 * @example
 * ```typescript
 * const manager = new ContextManager('/path/to/contexts');
 * const contexts = await manager.listComponents();
 * const devContext = await manager.getContextByMode('dev');
 * await manager.installComponents('/project/.claude/contexts');
 * ```
 */
export class ContextManager extends BaseManager<ContextDescriptor> {
  /**
   * Create a new ContextManager
   * @param contextsPath - Path to the contexts directory
   */
  constructor(contextsPath: string) {
    super({
      componentPath: contextsPath,
      structureType: 'file',
      fileExtension: '.md',
    });
  }

  /**
   * Parse metadata from context file content
   * @param content - Raw content of the context file
   * @param filePath - Path to the context file
   * @returns Parsed context descriptor
   */
  protected parseMetadata(content: string, filePath: string): ContextDescriptor {
    const metadata = this.parseYamlFrontmatter(content);
    const fileName = path.basename(filePath, this.config.fileExtension);

    return {
      name: (metadata.name as string) || fileName,
      description: (metadata.description as string) || '',
      path: filePath,
      mode: (metadata.mode as string) || 'dev', // Default to dev mode
    };
  }

  /**
   * Get a context by its mode identifier
   * @param mode - Mode identifier to search for
   * @returns Context descriptor if found, null otherwise
   */
  async getContextByMode(mode: string): Promise<ContextDescriptor | null> {
    const contexts = await this.listComponents();
    return contexts.find(context => context.mode === mode) || null;
  }

  /**
   * Get all available modes
   * @returns Array of unique mode identifiers
   */
  async listModes(): Promise<string[]> {
    const contexts = await this.listComponents();
    const modes = contexts.map(context => context.mode);
    return [...new Set(modes)]; // Return unique modes
  }
}
