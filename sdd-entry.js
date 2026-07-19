#!/usr/bin/env node
/**
 * Unified entry point for sdd-mcp-server
 *
 * Handles both:
 * - CLI commands (install, install-skills, migrate-kiro)
 * - MCP server mode (default)
 *
 * Usage:
 *   npx sdd-mcp-server install --list      # CLI: List target-native components
 *   npx sdd-mcp-server install             # CLI: Install target-native components
 *   npx sdd-mcp-server                     # MCP: Start MCP server
 */

const CLI_COMMANDS = ['install', 'install-skills', 'migrate-kiro', 'migrate-steering'];
const args = process.argv.slice(2);
const command = args[0];

if (command === 'context-report') {
  import('./scripts/context-usage-report.mjs')
    .then(({ runCli }) => runCli(args.slice(1)))
    .then(exitCode => {
      process.exitCode = exitCode;
    })
    .catch(err => {
      console.error('Failed to run context report:', err.message);
      process.exitCode = 1;
    });
} else if (command && (CLI_COMMANDS.includes(command) || command === '--help' || command === '-h')) {
  // CLI mode - import and run CLI module
  import('./dist/cli/sdd-mcp-cli.js').catch(err => {
    console.error('Failed to load CLI:', err.message);
    process.exit(1);
  });
} else {
  import('./dist/index.js')
    .then(({ startMCPServer }) => startMCPServer())
    .catch(err => {
      console.error('Failed to start MCP server:', err.message);
      process.exitCode = 1;
    });
}
