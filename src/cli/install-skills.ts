#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { SkillManager } from '../skills/SkillManager.js';

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * CLI options for install-skills command
 */
export interface CLIOptions {
  /** Target path for skill installation */
  targetPath: string;
  /** Target path for steering installation */
  steeringPath: string;
  /** Only list skills, don't install */
  listOnly: boolean;
  /** Show help message */
  showHelp: boolean;
  /** Install skills only (for unified install) */
  skillsOnly: boolean;
  /** Install steering only (for unified install) */
  steeringOnly: boolean;
}

/**
 * CLI for installing SDD skills to a project
 */
export class InstallSkillsCLI {
  private skillManager: SkillManager;
  private steeringPath: string;

  /**
   * Create CLI instance
   * @param skillsPath - Optional path to skills directory (for testing)
   * @param steeringPath - Optional path to steering directory (for testing)
   */
  constructor(skillsPath?: string, steeringPath?: string) {
    // If no path provided, determine from package location
    const resolvedSkillsPath = skillsPath || this.getDefaultSkillsPath();
    const resolvedSteeringPath = steeringPath || this.getDefaultSteeringPath();
    this.skillManager = new SkillManager(resolvedSkillsPath);
    this.steeringPath = resolvedSteeringPath;
  }

  /**
   * Get the default skills path based on package location
   */
  private getDefaultSkillsPath(): string {
    // Try multiple paths and return the first one that exists
    const possiblePaths = [
      // Relative to this file (dist/cli/install-skills.js -> skills/)
      path.resolve(__dirname, '../../skills'),
      // Alternative: one level up
      path.resolve(__dirname, '../skills'),
      // From package root when installed globally or via npx
      path.resolve(__dirname, '../../../skills'),
      // From current working directory
      path.resolve(process.cwd(), 'node_modules/sdd-mcp-server/skills'),
      path.resolve(process.cwd(), 'skills'),
    ];

    // Return the first path that exists
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        return p;
      }
    }

    // Fallback to first path (will error in SkillManager if not found)
    return possiblePaths[0];
  }

  /**
   * Get the default steering path based on package location
   */
  private getDefaultSteeringPath(): string {
    // Try multiple paths and return the first one that exists
    const possiblePaths = [
      // Relative to this file (dist/cli/install-skills.js -> steering/)
      path.resolve(__dirname, '../../steering'),
      // Alternative: one level up
      path.resolve(__dirname, '../steering'),
      // From package root when installed globally or via npx
      path.resolve(__dirname, '../../../steering'),
      // From current working directory
      path.resolve(process.cwd(), 'node_modules/sdd-mcp-server/steering'),
      path.resolve(process.cwd(), 'steering'),
    ];

    // Return the first path that exists
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        return p;
      }
    }

    // Fallback to first path
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
      listOnly: false,
      showHelp: false,
      skillsOnly: false,
      steeringOnly: false,
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
          break;
        case '--steering':
          options.steeringOnly = true;
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
   * Run unified install (skills + steering)
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

    // Determine what to install
    const installSkills = !options.steeringOnly;
    const installSteering = !options.skillsOnly;

    if (installSkills) {
      await this.installSkills(options.targetPath);
    }

    if (installSteering) {
      await this.installSteering(options.steeringPath);
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
    console.log('Run "npx sdd-mcp install-skills" to install all skills.\n');
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
   * List all available skills and steering documents
   */
  private async listAll(): Promise<void> {
    const skills = await this.skillManager.listSkills();
    const steeringDocs = await this.listSteering();

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

    console.log('📄 Available Steering Documents:\n');
    if (steeringDocs.length === 0) {
      console.log('  (none)\n');
    } else {
      for (const doc of steeringDocs) {
        console.log(`  • ${doc}`);
      }
      console.log(`\n  Total: ${steeringDocs.length} steering documents\n`);
    }

    console.log('Run "npx sdd-mcp install" to install all skills and steering documents.\n');
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
   * Install steering documents to target directory
   * @param targetPath - Target directory (e.g., .spec/steering)
   */
  private async installSteering(targetPath: string): Promise<void> {
    console.log(`\n📄 Installing steering documents to: ${targetPath}\n`);

    const installed: string[] = [];
    const failed: Array<{ name: string; error: string }> = [];

    try {
      // Create target directory
      await fs.promises.mkdir(targetPath, { recursive: true });

      // Read source steering directory
      const entries = await fs.promises.readdir(this.steeringPath);

      for (const entry of entries) {
        if (entry.endsWith('.md')) {
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
      }
    } catch (error) {
      console.error(`❌ Failed to read steering directory: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }

    if (installed.length > 0) {
      const plural = installed.length === 1 ? 'document' : 'documents';
      console.log(`✅ Installed ${installed.length} steering ${plural}:`);
      for (const name of installed) {
        console.log(`   • ${name}`);
      }
      console.log('');
    }

    if (failed.length > 0) {
      console.error(`❌ Failed to install ${failed.length} document(s):`);
      for (const failure of failed) {
        console.error(`   • ${failure.name}: ${failure.error}`);
      }
      console.log('');
    }

    if (installed.length > 0) {
      console.log('🎉 Steering documents installed successfully!');
      console.log('   These provide project-wide guidance for AI interactions.\n');
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

  /**
   * Get unified install help text
   * @returns Help message for unified install
   */
  getUnifiedHelp(): string {
    return `
SDD Unified Installer

Usage: npx sdd-mcp install [options]

Installs both SDD skills and steering documents to your project.

Options:
  --skills              Install skills only (to .claude/skills)
  --steering            Install steering documents only (to .spec/steering)
  --path <dir>          Target directory for skills (default: .claude/skills)
  --steering-path <dir> Target directory for steering (default: .spec/steering)
  --list, -l            List available skills and steering documents
  --help, -h            Show this help message

Examples:
  npx sdd-mcp install                     # Install both skills and steering
  npx sdd-mcp install --skills            # Install skills only
  npx sdd-mcp install --steering          # Install steering only
  npx sdd-mcp install --list              # List available content

Skills are installed to .claude/skills/ and provide workflow guidance.
Steering documents are installed to .spec/steering/ and provide project-wide rules.

After installation, use skills in Claude Code:
  /sdd-requirements <feature-name>
  /sdd-design <feature-name>
  /sdd-tasks <feature-name>
  /sdd-implement <feature-name>
  /sdd-steering
  /sdd-commit

Steering documents are automatically loaded by the SDD MCP server.
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
const isMainModule = process.argv[1] && (
  process.argv[1] === __filename ||
  process.argv[1].endsWith('/install-skills.js') ||
  process.argv[1].endsWith('/sdd-install-skills')
);

if (isMainModule) {
  main().catch((error) => {
    console.error('Error:', error.message);
    process.exit(1);
  });
}
