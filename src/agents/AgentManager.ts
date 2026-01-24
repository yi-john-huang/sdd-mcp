import * as path from 'path';
import { BaseManager, ComponentDescriptor } from '../shared/BaseManager.js';

/**
 * Descriptor for an agent component
 */
export interface AgentDescriptor extends ComponentDescriptor {
  /** Agent name */
  name: string;
  /** Brief description of the agent */
  description: string;
  /** Path to the agent file */
  path: string;
  /** Role identifier (planner, architect, reviewer, implementer, etc.) */
  role: string;
  /** Area of expertise */
  expertise: string;
}

/**
 * Manages agent components - discovery, listing, and installation
 *
 * Agents are specialized AI personas that can be invoked for different tasks.
 * Each agent has a specific role and expertise area.
 *
 * @example
 * ```typescript
 * const manager = new AgentManager('/path/to/agents');
 * const agents = await manager.listComponents();
 * const reviewer = await manager.getAgentByRole('reviewer');
 * await manager.installComponents('/project/.claude/agents');
 * ```
 */
export class AgentManager extends BaseManager<AgentDescriptor> {
  /**
   * Create a new AgentManager
   * @param agentsPath - Path to the agents directory
   */
  constructor(agentsPath: string) {
    super({
      componentPath: agentsPath,
      structureType: 'file',
      fileExtension: '.md',
    });
  }

  /**
   * Parse metadata from agent file content
   * @param content - Raw content of the agent file
   * @param filePath - Path to the agent file
   * @returns Parsed agent descriptor
   */
  protected parseMetadata(content: string, filePath: string): AgentDescriptor {
    const metadata = this.parseYamlFrontmatter(content);
    const fileName = path.basename(filePath, this.config.fileExtension);

    return {
      name: (metadata.name as string) || fileName,
      description: (metadata.description as string) || '',
      path: filePath,
      role: (metadata.role as string) || 'assistant', // Default role
      expertise: (metadata.expertise as string) || '',
    };
  }

  /**
   * Get an agent by its role identifier
   * @param role - Role identifier to search for
   * @returns Agent descriptor if found, null otherwise
   */
  async getAgentByRole(role: string): Promise<AgentDescriptor | null> {
    const agents = await this.listComponents();
    return agents.find(agent => agent.role === role) || null;
  }

  /**
   * Get all available roles
   * @returns Array of unique role identifiers
   */
  async listRoles(): Promise<string[]> {
    const agents = await this.listComponents();
    const roles = agents.map(agent => agent.role);
    return [...new Set(roles)]; // Return unique roles
  }

  /**
   * Get agents filtered by expertise keyword
   * @param keyword - Keyword to search in expertise field
   * @returns Array of agents with matching expertise
   */
  async findByExpertise(keyword: string): Promise<AgentDescriptor[]> {
    const agents = await this.listComponents();
    const lowerKeyword = keyword.toLowerCase();
    return agents.filter(agent => 
      agent.expertise.toLowerCase().includes(lowerKeyword)
    );
  }
}
