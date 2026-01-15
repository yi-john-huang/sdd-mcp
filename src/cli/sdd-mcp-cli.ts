#!/usr/bin/env node

/**
 * Main CLI entry point for sdd-mcp commands
 *
 * Usage:
 *   npx sdd-mcp install [options]           # Install skills AND steering (unified)
 *   npx sdd-mcp install-skills [options]    # Install skills only (legacy)
 *   npx sdd-mcp migrate-kiro [options]
 *   npx sdd-mcp --help
 */

import { main as installSkillsMain, mainInstall as installMain } from './install-skills.js';
import { main as migrateKiroMain } from './migrate-kiro.js';

const HELP = `
SDD MCP CLI

Usage: npx sdd-mcp <command> [options]

Commands:
  install           Install SDD skills AND steering documents (recommended)
  install-skills    Install SDD skills only (legacy)
  migrate-kiro      Migrate .kiro directory to .spec (v2.1.0+)

Options:
  --help, -h        Show this help message

Examples:
  npx sdd-mcp install                     # Install skills to .claude/skills + steering to .spec/steering
  npx sdd-mcp install --skills            # Install skills only
  npx sdd-mcp install --steering          # Install steering only
  npx sdd-mcp install --list              # List available skills and steering docs
  npx sdd-mcp install-skills              # Legacy: Install skills to .claude/skills
  npx sdd-mcp install-skills --list       # List available skills
  npx sdd-mcp migrate-kiro                # Migrate .kiro to .spec
  npx sdd-mcp migrate-kiro --dry-run      # Preview migration

For MCP server usage, use: npx sdd-mcp-server
`;

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === '--help' || command === '-h') {
    console.log(HELP);
    process.exit(0);
  }

  switch (command) {
    case 'install':
      // Unified install command - both skills and steering
      process.argv = [process.argv[0], process.argv[1], ...args.slice(1)];
      await installMain();
      break;

    case 'install-skills':
      // Legacy: Install skills only
      process.argv = [process.argv[0], process.argv[1], ...args.slice(1)];
      await installSkillsMain();
      break;

    case 'migrate-kiro':
      // Remove the command from args and pass the rest to migrate-kiro
      process.argv = [process.argv[0], process.argv[1], ...args.slice(1)];
      await migrateKiroMain();
      break;

    default:
      console.error(`Unknown command: ${command}`);
      console.log(HELP);
      process.exit(1);
  }
}

main().catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});
