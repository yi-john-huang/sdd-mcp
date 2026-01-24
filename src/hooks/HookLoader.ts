import * as fs from 'fs';
import * as path from 'path';
import { BaseManager, ComponentDescriptor, ManagerConfig, InstallResult } from '../shared/BaseManager.js';

/**
 * Descriptor for hook components
 * Hooks are organized by event type: hooks/{event-type}/*.md
 */
export interface HookDescriptor extends ComponentDescriptor {
  name: string;
  description: string;
  path: string;
  event: string;      // Event type: pre-tool-use, post-tool-use, session-start, session-end
  priority: number;   // Execution order (higher = runs first)
  enabled: boolean;   // Whether the hook is active
}

/**
 * HookLoader manages file-based hooks organized by event type
 *
 * Directory structure:
 * hooks/
 * ├── pre-tool-use/
 * │   ├── validate-input.md
 * │   └── log-request.md
 * ├── post-tool-use/
 * │   └── format-output.md
 * ├── session-start/
 * │   └── load-context.md
 * └── session-end/
 *     └── save-state.md
 */
export class HookLoader extends BaseManager<HookDescriptor> {
  constructor(hooksPath: string) {
    const config: ManagerConfig = {
      componentPath: hooksPath,
      structureType: 'file', // Will be overridden for nested structure
      fileExtension: '.md',
    };
    super(config);
  }

  /**
   * Parse hook metadata from content
   * The event type is inferred from the parent directory name
   * @param content - File content with YAML frontmatter
   * @param filePath - Path to the hook file
   */
  protected parseMetadata(content: string, filePath: string): HookDescriptor {
    const frontmatter = this.parseYamlFrontmatter(content);
    const fileName = path.basename(filePath, '.md');

    // Infer event type from parent directory if not in frontmatter
    const inferredEvent = path.basename(path.dirname(filePath));

    return {
      name: (frontmatter.name as string) || fileName,
      description: (frontmatter.description as string) || '',
      path: filePath,
      event: (frontmatter.event as string) || inferredEvent,
      priority: typeof frontmatter.priority === 'number' ? frontmatter.priority : 0,
      enabled: typeof frontmatter.enabled === 'boolean' ? frontmatter.enabled : true,
    };
  }

  /**
   * Override listComponents to handle nested directory structure
   * Scans hooks/{event-type}/*.md
   */
  async listComponents(): Promise<HookDescriptor[]> {
    const hooks: HookDescriptor[] = [];

    try {
      // Read top-level directories (event types)
      const entries = await fs.promises.readdir(this.config.componentPath, { withFileTypes: true });
      const eventDirs = entries.filter(entry => entry.isDirectory());

      for (const eventDir of eventDirs) {
        const eventPath = path.join(this.config.componentPath, eventDir.name);

        try {
          // Read hook files in each event directory
          const hookEntries = await fs.promises.readdir(eventPath, { withFileTypes: true });
          const hookFiles = hookEntries.filter(
            entry => entry.isFile() && entry.name.endsWith('.md')
          );

          for (const hookFile of hookFiles) {
            const hookPath = path.join(eventPath, hookFile.name);

            try {
              const content = await fs.promises.readFile(hookPath, 'utf-8');
              const descriptor = this.parseMetadata(content, hookPath);
              hooks.push(descriptor);
            } catch (error) {
              // Skip files that can't be read
              console.warn(`Warning: Could not read hook file ${hookPath}:`, error);
            }
          }
        } catch (error) {
          // Skip directories that can't be read
          console.warn(`Warning: Could not read event directory ${eventPath}:`, error);
        }
      }
    } catch (error) {
      // Return empty array if hooks directory doesn't exist
      return [];
    }

    return hooks;
  }

  /**
   * Override getComponentContent to search in nested directories
   */
  async getComponentContent(componentName: string): Promise<string> {
    const hooks = await this.listComponents();
    const hook = hooks.find(h => h.name === componentName);

    if (!hook) {
      throw new Error(`Component "${componentName}" not found`);
    }

    return fs.promises.readFile(hook.path, 'utf-8');
  }

  /**
   * Override installComponents to preserve nested directory structure
   */
  async installComponents(targetPath: string): Promise<InstallResult> {
    const result: InstallResult = {
      installed: [],
      failed: [],
    };

    try {
      // Get all hooks
      const hooks = await this.listComponents();

      // Group hooks by event type
      const hooksByEvent = new Map<string, HookDescriptor[]>();
      for (const hook of hooks) {
        const existing = hooksByEvent.get(hook.event) || [];
        existing.push(hook);
        hooksByEvent.set(hook.event, existing);
      }

      // Install hooks preserving nested structure
      for (const [eventType, eventHooks] of hooksByEvent) {
        const eventTargetPath = path.join(targetPath, eventType);

        // Create event directory
        await fs.promises.mkdir(eventTargetPath, { recursive: true });

        for (const hook of eventHooks) {
          const fileName = path.basename(hook.path);
          const targetFile = path.join(eventTargetPath, fileName);

          try {
            await fs.promises.copyFile(hook.path, targetFile);
            result.installed.push(hook.name);
          } catch (error) {
            result.failed.push({
              name: hook.name,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }
    } catch (error) {
      // If we can't read source, mark everything as failed
      result.failed.push({
        name: 'all',
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return result;
  }

  /**
   * Get hooks filtered by event type
   */
  async getHooksByEvent(eventType: string): Promise<HookDescriptor[]> {
    const hooks = await this.listComponents();
    return hooks.filter(hook => hook.event === eventType);
  }

  /**
   * Get list of all event types that have hooks
   */
  async listEventTypes(): Promise<string[]> {
    const hooks = await this.listComponents();
    const eventTypes = new Set(hooks.map(hook => hook.event));
    return Array.from(eventTypes);
  }

  /**
   * Get only enabled hooks
   */
  async getEnabledHooks(): Promise<HookDescriptor[]> {
    const hooks = await this.listComponents();
    return hooks.filter(hook => hook.enabled);
  }

  /**
   * Get enabled hooks for a specific event, sorted by priority (descending)
   */
  async getEnabledHooksByEvent(eventType: string): Promise<HookDescriptor[]> {
    const hooks = await this.getHooksByEvent(eventType);
    return hooks
      .filter(hook => hook.enabled)
      .sort((a, b) => b.priority - a.priority);
  }
}
