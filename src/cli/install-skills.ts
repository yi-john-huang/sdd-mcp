#!/usr/bin/env node

import * as path from 'path';
import { SkillManager } from '../skills/SkillManager.js';

/**
 * CLI options for install-skills command
 */
export interface CLIOptions {
  /** Target path for skill installation */
  targetPath: string;
  /** Only list skills, don't install */
  listOnly: boolean;
  /** Show help message */
  showHelp: boolean;
}

/**
 * CLI for installing SDD skills to a project
 */
export class InstallSkillsCLI {
  private skillManager: SkillManager;

  /**
   * Create CLI instance
   * @param skillsPath - Optional path to skills directory (for testing)
   */
  constructor(skillsPath?: string) {
    // If no path provided, determine from package location
    const resolvedPath = skillsPath || this.getDefaultSkillsPath();
    this.skillManager = new SkillManager(resolvedPath);
  }

  /**
   * Get the default skills path based on package location
   */
  private getDefaultSkillsPath(): string {
    // In production, skills are at package root
    // Try to find skills directory relative to common locations
    const possiblePaths = [
      path.resolve(process.cwd(), 'node_modules/sdd-mcp-server/skills'),
      path.resolve(process.cwd(), 'skills'),
      path.resolve(__dirname, '../../skills'),
      path.resolve(__dirname, '../../../skills'),
    ];

    // Return first path (we'll validate in SkillManager)
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
      listOnly: false,
      showHelp: false,
    };

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];

      switch (arg) {
        case '--path':
          if (i + 1 < args.length) {
            options.targetPath = args[++i];
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
      }
    }

    return options;
  }

  /**
   * Run the CLI with given options
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
    console.log('Run "npx sdd-mcp install-skills" to install all skills.\n');
  }

  /**
   * Install skills to target directory
   * @param targetPath - Target directory
   */
  private async installSkills(targetPath: string): Promise<void> {
    console.log(`\n📦 Installing SDD skills to: ${targetPath}\n`);

    const result = await this.skillManager.installSkills(targetPath);

    if (result.installed.length > 0) {
      const plural = result.installed.length === 1 ? 'skill' : 'skills';
      console.log(`✅ Installed ${result.installed.length} ${plural}:`);
      for (const name of result.installed) {
        console.log(`   • ${name}`);
      }
      console.log('');
    }

    if (result.failed.length > 0) {
      console.error(`❌ Failed to install ${result.failed.length} skill(s):`);
      for (const failure of result.failed) {
        console.error(`   • ${failure.name}: ${failure.error}`);
      }
      console.log('');
    }

    if (result.installed.length > 0) {
      console.log('🎉 Skills installed successfully!');
      console.log('   Use /sdd-requirements, /sdd-design, etc. in Claude Code.\n');
    }
  }

  /**
   * Get help text
   * @returns Help message
   */
  getHelp(): string {
    return `
SDD Skills Installer

Usage: npx sdd-mcp install-skills [options]

Options:
  --path <dir>   Target directory for skills (default: .claude/skills)
  --list, -l     List available skills without installing
  --help, -h     Show this help message

Examples:
  npx sdd-mcp install-skills              # Install to .claude/skills
  npx sdd-mcp install-skills --path ./    # Install to current directory
  npx sdd-mcp install-skills --list       # List available skills

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
}

// Main entry point when run directly
export async function main() {
  const cli = new InstallSkillsCLI();
  const options = cli.parseArgs(process.argv.slice(2));
  await cli.run(options);
}

// Only run main if this is the entry point (works in both ESM and CJS)
const isMainModule = typeof require !== 'undefined' && require.main === module;

if (isMainModule) {
  main().catch((error) => {
    console.error('Error:', error.message);
    process.exit(1);
  });
}
