#!/usr/bin/env node

/**
 * Main CLI entry point for sdd-mcp commands
 *
 * Usage:
 *   npx sdd-mcp install-skills [options]
 *   npx sdd-mcp --help
 */

import { main as installSkillsMain } from './install-skills.js';

const HELP = `
SDD MCP CLI

Usage: npx sdd-mcp <command> [options]

Commands:
  install-skills    Install SDD skills to your project

Options:
  --help, -h        Show this help message

Examples:
  npx sdd-mcp install-skills              # Install to .claude/skills
  npx sdd-mcp install-skills --list       # List available skills
  npx sdd-mcp install-skills --path ./    # Install to custom path

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
    case 'install-skills':
      // Remove the command from args and pass the rest to install-skills
      process.argv = [process.argv[0], process.argv[1], ...args.slice(1)];
      await installSkillsMain();
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
