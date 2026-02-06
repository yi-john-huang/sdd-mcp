#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import { SkillManager } from '../skills/SkillManager.js';
import { RulesManager } from '../rules/RulesManager.js';
import { ContextManager } from '../contexts/ContextManager.js';
import { AgentManager } from '../agents/AgentManager.js';
import { HookLoader } from '../hooks/HookLoader.js';
import { generateCodexAgentsMd } from './tool-support/codex.js';
import { createAntigravitySymlinks } from './tool-support/antigravity.js';
import { getDistCliDir, findTemplate } from './utils/find-package-root.js';

/**
 * Component types that can be installed
 */
export type ComponentType = 'skills' | 'steering' | 'rules' | 'contexts' | 'agents' | 'hooks';

/**
 * CLI options for install-skills command
 */
export interface CLIOptions {
  /** Target path for skill installation */
  targetPath: string;
  /** Target path for steering installation */
  steeringPath: string;
  /** Target path for rules installation */
  rulesPath: string;
  /** Target path for contexts installation */
  contextsPath: string;
  /** Target path for agents installation */
  agentsPath: string;
  /** Target path for hooks installation */
  hooksPath: string;
  /** Only list skills, don't install */
  listOnly: boolean;
  /** Show help message */
  showHelp: boolean;
  /** Install skills only (for unified install) */
  skillsOnly: boolean;
  /** Install steering only (for unified install) */
  steeringOnly: boolean;
  /** Install rules only */
  rulesOnly: boolean;
  /** Install contexts only */
  contextsOnly: boolean;
  /** Install agents only */
  agentsOnly: boolean;
  /** Install hooks only */
  hooksOnly: boolean;
  /** Components to install (empty means all) */
  components: ComponentType[];
  /** Generate Codex CLI AGENTS.md */
  codex: boolean;
  /** Create Antigravity symlinks (.agent/) */
  antigravity: boolean;
  /** Enable all tool integrations (codex + antigravity) */
  allTools: boolean;
}

/**
 * CLI for installing SDD components to a project
 */
export class InstallSkillsCLI {
  private skillManager: SkillManager;
  private rulesManager: RulesManager;
  private contextManager: ContextManager;
  private agentManager: AgentManager;
  private hookLoader: HookLoader;
  private steeringPath: string;

  /**
   * Create CLI instance
   * @param skillsPath - Optional path to skills directory (for testing)
   * @param steeringPath - Optional path to steering directory (for testing)
   */
  constructor(skillsPath?: string, steeringPath?: string) {
    // If no path provided, determine from package location
    const resolvedSkillsPath = skillsPath || this.getDefaultPath('skills');
    const resolvedSteeringPath = steeringPath || this.getDefaultPath('steering');
    const resolvedRulesPath = this.getDefaultPath('rules');
    const resolvedContextsPath = this.getDefaultPath('contexts');
    const resolvedAgentsPath = this.getDefaultPath('agents');
    const resolvedHooksPath = this.getDefaultPath('hooks');

    this.skillManager = new SkillManager(resolvedSkillsPath);
    this.rulesManager = new RulesManager(resolvedRulesPath);
    this.contextManager = new ContextManager(resolvedContextsPath);
    this.agentManager = new AgentManager(resolvedAgentsPath);
    this.hookLoader = new HookLoader(resolvedHooksPath);
    this.steeringPath = resolvedSteeringPath;
  }

  /**
   * Get the default path for a component type based on package location
   * @param componentDir - The component directory name (skills, steering, rules, etc.)
   */
  private getDefaultPath(componentDir: string): string {
    const dirname = getDistCliDir();
    // Try multiple paths and return the first one that exists
    const possiblePaths = [
      // Relative to this file (dist/cli/install-skills.js -> componentDir/)
      path.resolve(dirname, `../../${componentDir}`),
      // Alternative: one level up
      path.resolve(dirname, `../${componentDir}`),
      // From package root when installed globally or via npx
      path.resolve(dirname, `../../../${componentDir}`),
      // From current working directory
      path.resolve(process.cwd(), `node_modules/sdd-mcp-server/${componentDir}`),
      path.resolve(process.cwd(), componentDir),
    ];

    // Debug output when DEBUG env is set
    if (process.env.DEBUG) {
      console.error(`[DEBUG] getDistCliDir() = ${dirname}`);
      console.error(`[DEBUG] Looking for ${componentDir}:`);
      for (const p of possiblePaths) {
        console.error(`  ${fs.existsSync(p) ? '✓' : '✗'} ${p}`);
      }
    }

    // Return the first path that exists
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        return p;
      }
    }

    // Fallback to first path (will error in manager if not found)
    return possiblePaths[0];
  }

  /**
   * Parse command line arguments
   * @param args - Command line arguments (process.argv.slice(2))
   * @returns Parsed options
   */
  parseArgs(args: string[]): CLIOptions {
    const options: CLIOptions = {
      targetPath: '.claude/skills',
      steeringPath: '.spec/steering',
      rulesPath: '.claude/rules',
      contextsPath: '.claude/contexts',
      agentsPath: '.claude/agents',
      hooksPath: '.claude/hooks',
      listOnly: false,
      showHelp: false,
      skillsOnly: false,
      steeringOnly: false,
      rulesOnly: false,
      contextsOnly: false,
      agentsOnly: false,
      hooksOnly: false,
      components: [],
      codex: false,
      antigravity: false,
      allTools: false,
    };

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];

      switch (arg) {
        case '--path':
          if (i + 1 < args.length) {
            options.targetPath = args[++i];
          }
          break;
        case '--steering-path':
          if (i + 1 < args.length) {
            options.steeringPath = args[++i];
          }
          break;
        case '--rules-path':
          if (i + 1 < args.length) {
            options.rulesPath = args[++i];
          }
          break;
        case '--contexts-path':
          if (i + 1 < args.length) {
            options.contextsPath = args[++i];
          }
          break;
        case '--agents-path':
          if (i + 1 < args.length) {
            options.agentsPath = args[++i];
          }
          break;
        case '--hooks-path':
          if (i + 1 < args.length) {
            options.hooksPath = args[++i];
          }
          break;
        case '--list':
        case '-l':
          options.listOnly = true;
          break;
        case '--help':
        case '-h':
          options.showHelp = true;
          break;
        case '--skills':
          options.skillsOnly = true;
          options.components.push('skills');
          break;
        case '--steering':
          options.steeringOnly = true;
          options.components.push('steering');
          break;
        case '--rules':
          options.rulesOnly = true;
          options.components.push('rules');
          break;
        case '--contexts':
          options.contextsOnly = true;
          options.components.push('contexts');
          break;
        case '--agents':
          options.agentsOnly = true;
          options.components.push('agents');
          break;
        case '--hooks':
          options.hooksOnly = true;
          options.components.push('hooks');
          break;
        case '--all':
          // Install all component types
          options.components = ['skills', 'steering', 'rules', 'contexts', 'agents', 'hooks'];
          break;
        case '--codex':
          options.codex = true;
          break;
        case '--antigravity':
          options.antigravity = true;
          break;
        case '--all-tools':
          options.allTools = true;
          break;
      }
    }

    return options;
  }

  /**
   * Run the CLI with given options (legacy skills-only mode)
   * @param options - CLI options
   */
  async run(options: CLIOptions): Promise<void> {
    if (options.showHelp) {
      console.log(this.getHelp());
      return;
    }

    if (options.listOnly) {
      await this.listSkills();
      return;
    }

    await this.installSkills(options.targetPath);
  }

  /**
   * Run unified install (all components)
   * @param options - CLI options
   */
  async runUnified(options: CLIOptions): Promise<void> {
    if (options.showHelp) {
      console.log(this.getUnifiedHelp());
      return;
    }

    if (options.listOnly) {
      await this.listAll();
      return;
    }

    // If specific components requested, install only those
    const hasSpecificComponents = options.components.length > 0;
    const componentsToInstall = hasSpecificComponents
      ? options.components
      : ['skills', 'steering', 'rules', 'contexts', 'agents', 'hooks'] as ComponentType[];

    console.log('\n🚀 SDD Component Installer\n');

    for (const component of componentsToInstall) {
      switch (component) {
        case 'skills':
          await this.installSkills(options.targetPath);
          break;
        case 'steering':
          await this.installSteering(options.steeringPath);
          break;
        case 'rules':
          await this.installRules(options.rulesPath);
          break;
        case 'contexts':
          await this.installContexts(options.contextsPath);
          break;
        case 'agents':
          await this.installAgents(options.agentsPath);
          break;
        case 'hooks':
          await this.installHooks(options.hooksPath);
          break;
      }
    }

    // Generate CLAUDE.md in project root
    this.generateClaudeMd();

    // Multi-tool support: Codex CLI
    if (options.codex || options.allTools) {
      const projectRoot = process.cwd();
      await generateCodexAgentsMd(
        projectRoot,
        {
          skillManager: this.skillManager,
          rulesManager: this.rulesManager,
          agentManager: this.agentManager,
          listSteering: () => this.listSteering(),
        },
        {
          skillsPath: options.targetPath,
          rulesPath: options.rulesPath,
          agentsPath: options.agentsPath,
          steeringPath: options.steeringPath,
        },
        {
          skills: componentsToInstall.includes('skills'),
          rules: componentsToInstall.includes('rules'),
          agents: componentsToInstall.includes('agents'),
          steering: componentsToInstall.includes('steering'),
        },
      );
    }

    // Multi-tool support: Google Antigravity
    if (options.antigravity || options.allTools) {
      const projectRoot = process.cwd();
      await createAntigravitySymlinks(projectRoot, {
        skillsPath: options.targetPath,
        rulesPath: options.rulesPath,
      });
    }

    console.log('\n✨ Installation complete!\n');
  }

  /**
   * Generate CLAUDE.md in the user's project root from the template
   */
  private generateClaudeMd(): void {
    const targetPath = path.resolve(process.cwd(), 'CLAUDE.md');

    // Don't overwrite if user already has one
    if (fs.existsSync(targetPath)) {
      console.log('  ⏭️  CLAUDE.md already exists, skipping');
      return;
    }

    // Find the template
    const templatePath = findTemplate('CLAUDE.md');

    if (!templatePath) {
      console.log('  ⚠️  CLAUDE.md template not found, skipping');
      return;
    }

    try {
      fs.copyFileSync(templatePath, targetPath);
      console.log('  ✅ Created CLAUDE.md in project root');
    } catch (error) {
      console.error('  ❌ Failed to create CLAUDE.md:', (error as Error).message);
    }
  }

  /**
   * List available skills
   */
  private async listSkills(): Promise<void> {
    const skills = await this.skillManager.listSkills();

    if (skills.length === 0) {
      console.log('No skills available');
      return;
    }

    console.log('\n📚 Available Skills:\n');

    for (const skill of skills) {
      console.log(`  • ${skill.name}`);
      if (skill.description) {
        console.log(`    ${skill.description}`);
      }
      console.log('');
    }

    console.log(`Total: ${skills.length} skills\n`);
    console.log('Run "npx sdd-mcp-server install-skills" to install all skills.\n');
  }

  /**
   * List available steering documents
   */
  private async listSteering(): Promise<string[]> {
    const steeringDocs: string[] = [];

    try {
      const entries = await fs.promises.readdir(this.steeringPath);
      for (const entry of entries) {
        if (entry.endsWith('.md')) {
          steeringDocs.push(entry);
        }
      }
    } catch {
      // Return empty array if steering directory doesn't exist
    }

    return steeringDocs;
  }

  /**
   * List all available components
   */
  private async listAll(): Promise<void> {
    const skills = await this.skillManager.listSkills();
    const steeringDocs = await this.listSteering();
    const rules = await this.rulesManager.listComponents();
    const contexts = await this.contextManager.listComponents();
    const agents = await this.agentManager.listComponents();
    const hooks = await this.hookLoader.listComponents();

    console.log('\n📚 Available Skills:\n');
    if (skills.length === 0) {
      console.log('  (none)\n');
    } else {
      for (const skill of skills) {
        console.log(`  • ${skill.name}`);
        if (skill.description) {
          console.log(`    ${skill.description}`);
        }
        console.log('');
      }
      console.log(`  Total: ${skills.length} skills\n`);
    }

    console.log('📄 Steering Documents:\n');
    if (steeringDocs.length === 0) {
      console.log('  (none)\n');
    } else {
      for (const doc of steeringDocs) {
        console.log(`  • ${doc}`);
      }
      console.log(`\n  Total: ${steeringDocs.length} documents\n`);
    }

    console.log('📏 Rules:\n');
    if (rules.length === 0) {
      console.log('  (none)\n');
    } else {
      for (const rule of rules) {
        console.log(`  • ${rule.name} (priority: ${rule.priority})`);
        if (rule.description) {
          console.log(`    ${rule.description}`);
        }
      }
      console.log(`\n  Total: ${rules.length} rules\n`);
    }

    console.log('🎭 Contexts:\n');
    if (contexts.length === 0) {
      console.log('  (none)\n');
    } else {
      for (const ctx of contexts) {
        console.log(`  • ${ctx.name} (mode: ${ctx.mode})`);
        if (ctx.description) {
          console.log(`    ${ctx.description}`);
        }
      }
      console.log(`\n  Total: ${contexts.length} contexts\n`);
    }

    console.log('🤖 Agents:\n');
    if (agents.length === 0) {
      console.log('  (none)\n');
    } else {
      for (const agent of agents) {
        console.log(`  • ${agent.name} (${agent.role})`);
        if (agent.description) {
          console.log(`    ${agent.description}`);
        }
      }
      console.log(`\n  Total: ${agents.length} agents\n`);
    }

    console.log('🪝 Hooks:\n');
    if (hooks.length === 0) {
      console.log('  (none)\n');
    } else {
      // Group hooks by event type
      const hooksByEvent = new Map<string, typeof hooks>();
      for (const hook of hooks) {
        const existing = hooksByEvent.get(hook.event) || [];
        existing.push(hook);
        hooksByEvent.set(hook.event, existing);
      }

      for (const [event, eventHooks] of hooksByEvent) {
        console.log(`  ${event}/`);
        for (const hook of eventHooks) {
          const status = hook.enabled ? '✓' : '○';
          console.log(`    ${status} ${hook.name}`);
        }
      }
      console.log(`\n  Total: ${hooks.length} hooks\n`);
    }

    console.log('Run "npx sdd-mcp-server install" to install all components.\n');
  }

  /**
   * Install skills to target directory
   */
  private async installSkills(targetPath: string): Promise<void> {
    console.log(`\nInstalling SDD skills to: ${targetPath}\n`);
    const result = await this.skillManager.installSkills(targetPath);
    this.logInstallResult(result, 'skills');

    if (result.installed.length > 0) {
      console.log('Skills installed successfully!');
      console.log('   Use /sdd-requirements, /sdd-design, etc. in Claude Code.\n');
    }
  }

  /**
   * Install steering documents to target directory
   */
  private async installSteering(targetPath: string): Promise<void> {
    console.log(`\nInstalling steering documents to: ${targetPath}\n`);

    const result = await this.installSteeringFiles(targetPath);
    this.logInstallResult(result, 'steering documents');

    if (result.installed.length > 0) {
      console.log('Steering documents installed successfully!');
      console.log('   These provide project-wide guidance for AI interactions.\n');
    }
  }

  /**
   * Copy steering files to target directory
   */
  private async installSteeringFiles(targetPath: string): Promise<{ installed: string[]; failed: Array<{ name: string; error: string }> }> {
    const installed: string[] = [];
    const failed: Array<{ name: string; error: string }> = [];

    try {
      await fs.promises.mkdir(targetPath, { recursive: true });
      const entries = await fs.promises.readdir(this.steeringPath);

      for (const entry of entries) {
        if (!entry.endsWith('.md')) continue;

        try {
          const sourceFile = path.join(this.steeringPath, entry);
          const destFile = path.join(targetPath, entry);
          await fs.promises.copyFile(sourceFile, destFile);
          installed.push(entry);
        } catch (error) {
          failed.push({
            name: entry,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } catch (error) {
      console.error(`Failed to read steering directory: ${error instanceof Error ? error.message : String(error)}`);
    }

    return { installed, failed };
  }

  /**
   * Log installation results with consistent formatting
   */
  private logInstallResult(result: { installed: string[]; failed: Array<{ name: string; error: string }> }, typeName: string): void {
    if (result.installed.length > 0) {
      console.log(`Installed ${result.installed.length} ${typeName}:`);
      for (const name of result.installed) {
        console.log(`   - ${name}`);
      }
      console.log('');
    }

    if (result.failed.length > 0) {
      console.error(`Failed to install ${result.failed.length} ${typeName}:`);
      for (const failure of result.failed) {
        console.error(`   - ${failure.name}: ${failure.error}`);
      }
      console.log('');
    }
  }

  /**
   * Install rules to target directory
   */
  private async installRules(targetPath: string): Promise<void> {
    console.log(`Installing rules to: ${targetPath}\n`);
    const result = await this.rulesManager.installComponents(targetPath);
    this.logInstallResult(result, 'rules');
  }

  /**
   * Install contexts to target directory
   */
  private async installContexts(targetPath: string): Promise<void> {
    console.log(`Installing contexts to: ${targetPath}\n`);
    const result = await this.contextManager.installComponents(targetPath);
    this.logInstallResult(result, 'contexts');
  }

  /**
   * Install agents to target directory
   */
  private async installAgents(targetPath: string): Promise<void> {
    console.log(`Installing agents to: ${targetPath}\n`);
    const result = await this.agentManager.installComponents(targetPath);
    this.logInstallResult(result, 'agents');
  }

  /**
   * Install hooks to target directory
   */
  private async installHooks(targetPath: string): Promise<void> {
    console.log(`Installing hooks to: ${targetPath}\n`);
    const result = await this.hookLoader.installComponents(targetPath);
    this.logInstallResult(result, 'hooks');
  }

  /**
   * Get help text
   * @returns Help message
   */
  getHelp(): string {
    return `
SDD Skills Installer

Usage: npx sdd-mcp-server install-skills [options]

Options:
  --path <dir>   Target directory for skills (default: .claude/skills)
  --list, -l     List available skills without installing
  --help, -h     Show this help message

Examples:
  npx sdd-mcp-server install-skills              # Install to .claude/skills
  npx sdd-mcp-server install-skills --path ./    # Install to current directory
  npx sdd-mcp-server install-skills --list       # List available skills

Skills will be installed to your project's .claude/skills directory.
After installation, you can use them in Claude Code with:
  /sdd-requirements <feature-name>
  /sdd-design <feature-name>
  /sdd-tasks <feature-name>
  /sdd-implement <feature-name>
  /sdd-steering
  /sdd-commit
`;
  }

  /**
   * Get unified install help text
   * @returns Help message for unified install
   */
  getUnifiedHelp(): string {
    return `
SDD Unified Installer

Usage: npx sdd-mcp-server install [options]

Installs SDD components (skills, steering, rules, contexts, agents, hooks) to your project.

Component Options (install specific types):
  --skills              Install skills only (to .claude/skills)
  --steering            Install steering documents only (to .spec/steering)
  --rules               Install rules only (to .claude/rules)
  --contexts            Install contexts only (to .claude/contexts)
  --agents              Install agents only (to .claude/agents)
  --hooks               Install hooks only (to .claude/hooks)
  --all                 Install all component types (default behavior)

Path Options (customize installation targets):
  --path <dir>          Target for skills (default: .claude/skills)
  --steering-path <dir> Target for steering (default: .spec/steering)
  --rules-path <dir>    Target for rules (default: .claude/rules)
  --contexts-path <dir> Target for contexts (default: .claude/contexts)
  --agents-path <dir>   Target for agents (default: .claude/agents)
  --hooks-path <dir>    Target for hooks (default: .claude/hooks)

Multi-Tool Support:
  --codex               Also generate AGENTS.md for OpenAI Codex CLI
  --antigravity         Also create .agent/ symlinks for Google Antigravity
  --all-tools           Enable all tool integrations (codex + antigravity)

Other Options:
  --list, -l            List all available components
  --help, -h            Show this help message

Examples:
  npx sdd-mcp-server install                     # Install all components
  npx sdd-mcp-server install --skills --rules    # Install skills and rules only
  npx sdd-mcp-server install --list              # List available components
  npx sdd-mcp-server install --codex             # Claude + Codex CLI support
  npx sdd-mcp-server install --antigravity       # Claude + Antigravity support
  npx sdd-mcp-server install --all-tools         # Claude + all tool integrations

Component Types:
  Skills    - Workflow guidance for SDD phases (/sdd-requirements, /sdd-design, etc.)
  Steering  - Project-wide rules and conventions
  Rules     - Always-active guidelines (coding-style, security, etc.)
  Contexts  - Mode-specific system prompts (dev, review, planning)
  Agents    - Specialized AI personas (planner, architect, reviewer)
  Hooks     - Event-driven automation (pre-tool-use, post-tool-use, etc.)

After installation, use skills in Claude Code:
  /sdd-requirements <feature-name>
  /sdd-design <feature-name>
  /sdd-tasks <feature-name>
  /sdd-implement <feature-name>
  /sdd-review [file-path]
  /sdd-security-check [scope]
  /sdd-test-gen [file-path]
`;
  }
}

// Main entry point when run directly (legacy install-skills)
export async function main() {
  const cli = new InstallSkillsCLI();
  const options = cli.parseArgs(process.argv.slice(2));
  await cli.run(options);
}

// Main entry point for unified install command
export async function mainInstall() {
  const cli = new InstallSkillsCLI();
  const options = cli.parseArgs(process.argv.slice(2));
  await cli.runUnified(options);
}

// ESM main module detection: check if this file is the entry point
// Use path matching instead of import.meta.url for Jest compatibility
const isMainModule = process.argv[1] && (
  process.argv[1].endsWith('/install-skills.js') ||
  process.argv[1].endsWith('/sdd-install-skills') ||
  process.argv[1].endsWith('\\install-skills.js') ||
  process.argv[1].endsWith('\\sdd-install-skills')
);

if (isMainModule) {
  main().catch((error) => {
    console.error('Error:', error.message);
    process.exit(1);
  });
}
