import * as path from 'path';
import { BaseManager, ComponentDescriptor, InstallResult } from '../shared/BaseManager.js';

/**
 * Descriptor for a rule component
 */
export interface RuleDescriptor extends ComponentDescriptor {
  /** Rule name */
  name: string;
  /** Brief description of the rule */
  description: string;
  /** Path to the rule file */
  path: string;
  /** Execution priority (higher = first) */
  priority: number;
  /** Whether rule is always applied */
  alwaysActive: boolean;
}

/**
 * Manages rule components - discovery, listing, and installation
 *
 * Rules are always-active guidelines that apply across all AI interactions.
 * They define coding standards, security requirements, testing practices, etc.
 *
 * @example
 * ```typescript
 * const manager = new RulesManager('/path/to/rules');
 * const rules = await manager.listComponents();
 * await manager.installComponents('/project/.claude/rules');
 * ```
 */
export class RulesManager extends BaseManager<RuleDescriptor> {
  /**
   * Create a new RulesManager
   * @param rulesPath - Path to the rules directory
   */
  constructor(rulesPath: string) {
    super({
      componentPath: rulesPath,
      structureType: 'file',
      fileExtension: '.md',
    });
  }

  /**
   * Parse metadata from rule file content
   * @param content - Raw content of the rule file
   * @param filePath - Path to the rule file
   * @returns Parsed rule descriptor
   */
  protected parseMetadata(content: string, filePath: string): RuleDescriptor {
    const metadata = this.parseYamlFrontmatter(content);
    const fileName = path.basename(filePath, this.config.fileExtension);

    return {
      name: (metadata.name as string) || fileName,
      description: (metadata.description as string) || '',
      path: filePath,
      priority: typeof metadata.priority === 'number' ? metadata.priority : 0,
      alwaysActive: metadata.alwaysActive !== false, // Default to true
    };
  }

  /**
   * Get rules sorted by priority (highest first)
   * @returns Array of rule descriptors sorted by priority
   */
  async listByPriority(): Promise<RuleDescriptor[]> {
    const rules = await this.listComponents();
    return rules.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Get only active rules
   * @returns Array of rule descriptors that are always active
   */
  async listActiveRules(): Promise<RuleDescriptor[]> {
    const rules = await this.listComponents();
    return rules.filter(rule => rule.alwaysActive);
  }
}
