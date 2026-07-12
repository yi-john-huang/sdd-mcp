#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import { createInterface } from 'readline/promises';
import { SkillManager } from '../skills/SkillManager.js';
import { RulesManager } from '../rules/RulesManager.js';
import { ContextManager } from '../contexts/ContextManager.js';
import { AgentManager } from '../agents/AgentManager.js';
import { HookLoader } from '../hooks/HookLoader.js';
import { generateCodexAgentsMd } from './tool-support/codex.js';
import { createAntigravitySymlinks } from './tool-support/antigravity.js';
import { getDistCliDir } from './utils/find-package-root.js';
import {
  CliUsageError,
  InstallCancelledError,
  getTargetPolicy,
  isInstallTarget,
  resolveInstallPaths,
  resolveInstallTarget,
  type ComponentType,
  type InstallProfile,
  type InstallTarget,
  type PathOverrides,
  type TargetPromptIO,
} from './install-target.js';
import { installClaudeCodeTarget } from './tool-support/claude-code.js';
import { installCodexTarget } from './tool-support/codex.js';
import { updateGeneratedIgnores } from './utils/gitignore-manager.js';

/**
 * Component types that can be installed
 */
export type { ComponentType, InstallProfile } from './install-target.js';

/**
 * CLI options for install-skills command
 */
export interface CLIOptions {
  /** Primary native agent target. Undefined invokes compatibility resolution. */
  target?: InstallTarget;
  /** Path flags explicitly supplied by the user. */
  pathOverrides?: PathOverrides;
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
  /** Installation profile for default unified install */
  installProfile: InstallProfile;
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
  private promptIO: TargetPromptIO;

  /**
   * Create CLI instance
   * @param skillsPath - Optional path to skills directory (for testing)
   * @param steeringPath - Optional path to steering directory (for testing)
   */
  constructor(skillsPath?: string, steeringPath?: string, promptIO?: TargetPromptIO) {
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
    this.promptIO = promptIO ?? createProcessTargetPromptIO();
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
      installProfile: 'lean',
      pathOverrides: {},
    };

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];

      switch (arg) {
        case '--path':
          options.targetPath = requireOptionValue(args, ++i, '--path');
          options.pathOverrides!.skills = options.targetPath;
          break;
        case '--steering-path':
          options.steeringPath = requireOptionValue(args, ++i, '--steering-path');
          options.pathOverrides!.steering = options.steeringPath;
          break;
        case '--rules-path':
          options.rulesPath = requireOptionValue(args, ++i, '--rules-path');
          options.pathOverrides!.rules = options.rulesPath;
          break;
        case '--contexts-path':
          options.contextsPath = requireOptionValue(args, ++i, '--contexts-path');
          options.pathOverrides!.contexts = options.contextsPath;
          break;
        case '--agents-path':
          options.agentsPath = requireOptionValue(args, ++i, '--agents-path');
          options.pathOverrides!.agents = options.agentsPath;
          break;
        case '--hooks-path':
          options.hooksPath = requireOptionValue(args, ++i, '--hooks-path');
          options.pathOverrides!.hooks = options.hooksPath;
          break;
        case '--target': {
          const target = requireOptionValue(args, ++i, '--target');
          if (!isInstallTarget(target)) {
            throw new CliUsageError(`Unsupported target "${target}". Choose codex or claude-code.`);
          }
          options.target = target;
          break;
        }
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
        case '--profile':
          {
            const profile = requireOptionValue(args, ++i, '--profile');
            if (profile !== 'lean' && profile !== 'full') {
              throw new CliUsageError(`Unsupported profile "${profile}". Choose lean or full.`);
            }
            options.installProfile = profile;
          }
          break;
        case '--all':
          // Install all component types
          options.installProfile = 'full';
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
   * Run a target-aware component install
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

    const resolvedTarget = await resolveInstallTarget({
      target: options.target,
      legacyCodex: options.codex,
      profile: options.installProfile,
    }, this.promptIO);
    const policy = getTargetPolicy(resolvedTarget.target);
    const paths = resolveInstallPaths(policy, options.pathOverrides ?? legacyPathOverrides(options));

    // If specific components requested, install only those
    const hasSpecificComponents = options.components.length > 0;
    const componentsToInstall = hasSpecificComponents
      ? options.components
      : this.getDefaultComponents(options.installProfile);

    console.log(`\n🚀 SDD Component Installer (${options.installProfile} profile, ${resolvedTarget.target})\n`);

    const projectRoot = process.cwd();
    const request = {
      projectRoot,
      paths,
      components: componentsToInstall,
      sources: {
        skillManager: this.skillManager,
        rulesManager: this.rulesManager,
        contextManager: this.contextManager,
        agentManager: this.agentManager,
        hookLoader: this.hookLoader,
        steeringSource: this.steeringPath,
      },
    };
    const report = resolvedTarget.target === 'codex'
      ? await installCodexTarget(request)
      : await installClaudeCodeTarget(request);

    try {
      const ignore = await updateGeneratedIgnores(projectRoot, policy.ignoreEntries);
      console.log(`  .gitignore: ${ignore.status}`);
    } catch (error) {
      report.failed.push({
        component: 'root',
        name: '.gitignore',
        path: path.join(projectRoot, '.gitignore'),
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Multi-tool support: Codex CLI
    if (options.allTools && resolvedTarget.target !== 'codex') {
      await generateCodexAgentsMd(
        projectRoot,
        {
          skillManager: this.skillManager,
          rulesManager: this.rulesManager,
          agentManager: this.agentManager,
          listSteering: () => this.listSteering(),
        },
        {
          skillsPath: paths.skills,
          rulesPath: paths.rules,
          agentsPath: paths.agents,
          steeringPath: paths.steering,
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
      await createAntigravitySymlinks(projectRoot, {
        skillsPath: paths.skills,
        rulesPath: paths.rules,
      });
    }

    console.log(`\nTarget: ${resolvedTarget.target} (${resolvedTarget.source})`);
    console.log(`Installed: ${report.installed.length}`);
    console.log(`Skipped: ${report.skipped.length}`);
    console.log(`Failed: ${report.failed.length}`);
    if (report.failed.length > 0) {
      for (const failure of report.failed) {
        console.error(`  ${failure.component}/${failure.name} (${failure.path}): ${failure.error}`);
      }
      process.exitCode = 1;
      console.error('\nInstallation incomplete.\n');
      return;
    }
    console.log('\n✨ Installation complete!\n');
  }

  private getDefaultComponents(profile: InstallProfile): ComponentType[] {
    if (profile === 'full') {
      return ['skills', 'steering', 'rules', 'contexts', 'agents', 'hooks'];
    }

    return ['skills', 'steering', 'hooks'];
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

    console.log('Run "npx sdd-mcp-server install --profile full" to install all components.\n');
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

Installs SDD components to your project. The default lean profile installs skills,
steering, and hooks only to reduce always-on context and token usage.

Component Options (install specific types):
  --target <target>     Primary agent target: codex or claude-code
  --skills              Install skills only (to the selected target)
  --steering            Install steering documents only (to .spec/steering)
  --rules               Install rules only (to the selected target)
  --contexts            Install contexts only (to the selected target)
  --agents              Install agents only (to the selected target)
  --hooks               Install hooks only (to the selected target)
  --all                 Install all component types
  --profile <profile>   Install profile when no component flags are provided:
                        lean (default) or full

Path Options (customize installation targets):
  --path <dir>          Override the selected target's skills path
  --steering-path <dir> Target for steering (default: .spec/steering)
  --rules-path <dir>    Override the selected target's rules path
  --contexts-path <dir> Override the selected target's contexts path
  --agents-path <dir>   Override the selected target's agents path
  --hooks-path <dir>    Override the selected target's hooks path

Multi-Tool Support:
  --codex               Deprecated alias for --target codex
  --antigravity         Also create .agent/ symlinks for Google Antigravity
  --all-tools           Enable all tool integrations (codex + antigravity)

Other Options:
  --list, -l            List all available components
  --help, -h            Show this help message

Examples:
  npx sdd-mcp-server install                     # Lean install for lower token usage
  npx sdd-mcp-server install --skills --rules    # Install skills and rules only
  npx sdd-mcp-server install --list              # List available components
  npx sdd-mcp-server install --profile full       # Prompt for Codex or Claude Code
  npx sdd-mcp-server install --target codex       # Native Codex files
  npx sdd-mcp-server install --target claude-code # Native Claude Code files
  npx sdd-mcp-server install --antigravity       # Add Antigravity support
  npx sdd-mcp-server install --all-tools         # Add all tool integrations

Component Types:
  Skills    - Workflow guidance for SDD phases (/sdd-requirements, /sdd-design, etc.)
  Steering  - Project-wide rules and conventions
  Rules     - Always-active guidelines (coding-style, security, etc.)
  Contexts  - Mode-specific system prompts (dev, review, planning)
  Agents    - Specialized AI personas (planner, architect, reviewer)
  Hooks     - Event-driven automation (pre-tool-use, post-tool-use, etc.)

After installation, use skills in the selected agent:
  /sdd-requirements <feature-name>
  /sdd-design <feature-name>
  /sdd-tasks <feature-name>
  /sdd-implement <feature-name>
  /sdd-review [file-path]
  /sdd-security-check [scope]
  /sdd-test-gen [file-path]

Model Routing:
  Codex high-level roles: gpt-5.6-sol (xhigh); default implementation/TDD: gpt-5.6-luna (max)
  Codex supported models: gpt-5.6-sol, gpt-5.6-luna, gpt-5.6-terra
  Claude Code high-level roles: opus; implementation/TDD: sonnet
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

export function cliExitCode(error: unknown): number {
  if (error instanceof InstallCancelledError) return 130;
  return 1;
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
    process.exit(cliExitCode(error));
  });
}

function requireOptionValue(args: string[], index: number, option: string): string {
  const value = args[index];
  if (!value || value.startsWith('--')) {
    throw new CliUsageError(`${option} requires a value`);
  }
  return value;
}

function legacyPathOverrides(options: CLIOptions): PathOverrides {
  const defaults = getTargetPolicy('claude-code').defaultPaths;
  return {
    ...(options.targetPath !== defaults.skills ? { skills: options.targetPath } : {}),
    ...(options.steeringPath !== defaults.steering ? { steering: options.steeringPath } : {}),
    ...(options.rulesPath !== defaults.rules ? { rules: options.rulesPath } : {}),
    ...(options.contextsPath !== defaults.contexts ? { contexts: options.contextsPath } : {}),
    ...(options.agentsPath !== defaults.agents ? { agents: options.agentsPath } : {}),
    ...(options.hooksPath !== defaults.hooks ? { hooks: options.hooksPath } : {}),
  };
}

function createProcessTargetPromptIO(): TargetPromptIO {
  return {
    isInteractive: () => Boolean(process.stdin.isTTY && process.stdout.isTTY),
    writeNotice: message => console.warn(message),
    async chooseTarget() {
      const prompt = createInterface({ input: process.stdin, output: process.stdout });
      let cancelled = false;
      prompt.once('SIGINT', () => {
        cancelled = true;
        prompt.close();
      });
      try {
        while (!cancelled) {
          const answer = (await prompt.question(
            'Choose the primary LLM agent target:\n  1) Codex\n  2) Claude Code\nSelection: ',
          )).trim().toLowerCase();
          if (answer === '1' || answer === 'codex') return 'codex';
          if (answer === '2' || answer === 'claude' || answer === 'claude-code') return 'claude-code';
          console.warn('Choose 1 (Codex) or 2 (Claude Code).');
        }
      } catch {
        return null;
      } finally {
        prompt.close();
      }
      return null;
    },
  };
}
