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
import { main as migrateSteeringMain } from './migrate-steering.js';

const HELP = `
SDD MCP CLI

Usage: npx sdd-mcp-server <command> [options]

Commands:
  install           Install SDD skills AND steering documents (recommended)
  install-skills    Install SDD skills only (legacy)
  migrate-kiro      Migrate .kiro directory to .spec (v2.1.0+)
  migrate-steering  Migrate steering docs to consolidated components (v3.1.0+)

Options:
  --help, -h        Show this help message

Multi-Tool Support:
  --codex           Also generate AGENTS.md for OpenAI Codex CLI
  --antigravity     Also create .agent/ symlinks for Google Antigravity
  --all-tools       Enable all tool integrations (codex + antigravity)

Examples:
  npx sdd-mcp-server install                     # Install skills + steering
  npx sdd-mcp-server install --skills            # Install skills only
  npx sdd-mcp-server install --steering          # Install steering only
  npx sdd-mcp-server install --list              # List available content
  npx sdd-mcp-server install --codex             # Claude + Codex CLI
  npx sdd-mcp-server install --all-tools         # Claude + all tools
  npx sdd-mcp-server install-skills              # Legacy: Install skills
  npx sdd-mcp-server install-skills --list       # List available skills
  npx sdd-mcp-server migrate-kiro                # Migrate .kiro to .spec
  npx sdd-mcp-server migrate-kiro --dry-run      # Preview migration
  npx sdd-mcp-server migrate-steering            # Migrate static steering docs
  npx sdd-mcp-server migrate-steering --dry-run  # Preview steering migration

Running without a command starts the MCP server (for IDE integrations).
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

    case 'migrate-steering':
      // Remove the command from args and pass the rest to migrate-steering
      process.argv = [process.argv[0], process.argv[1], ...args.slice(1)];
      await migrateSteeringMain();
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
