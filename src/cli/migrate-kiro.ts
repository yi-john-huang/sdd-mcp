#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';

const HELP = `
SDD Directory Migration Tool

Migrates .kiro directory to .spec for updated SDD workflow.

Usage: npx sdd-mcp-server migrate-kiro [options]

Options:
  --path <dir>     Project directory (default: current directory)
  --dry-run, -n    Preview without making changes
  --force, -f      Overwrite existing .spec directory
  --help, -h       Show this help

Examples:
  npx sdd-mcp-server migrate-kiro
  npx sdd-mcp-server migrate-kiro --dry-run
  npx sdd-mcp-server migrate-kiro --path ./my-project
`;

function getAllFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getAllFiles(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

export async function main() {
  const args = process.argv.slice(2);

  // Parse args
  let projectPath = process.cwd();
  let dryRun = false;
  let force = false;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--path':
        projectPath = path.resolve(args[++i] || '.');
        break;
      case '--dry-run':
      case '-n':
        dryRun = true;
        break;
      case '--force':
      case '-f':
        force = true;
        break;
      case '--help':
      case '-h':
        console.log(HELP);
        return;
    }
  }

  const kiroPath = path.join(projectPath, '.kiro');
  const specPath = path.join(projectPath, '.spec');

  console.log('\n🔄 SDD Directory Migration: .kiro → .spec\n');

  if (!fs.existsSync(kiroPath)) {
    console.log('✅ No .kiro directory found. Nothing to migrate.\n');
    return;
  }

  if (fs.existsSync(specPath) && !force) {
    console.log('⚠️  .spec already exists. Use --force to overwrite.\n');
    return;
  }

  const files = getAllFiles(kiroPath);
  console.log(dryRun ? '📋 Would migrate:\n' : '📦 Migrating:\n');

  for (const file of files) {
    const rel = path.relative(kiroPath, file);
    const newPath = path.join(specPath, rel);

    if (dryRun) {
      console.log(`   .kiro/${rel} → .spec/${rel}`);
    } else {
      fs.mkdirSync(path.dirname(newPath), { recursive: true });
      fs.copyFileSync(file, newPath);
      console.log(`   ✓ .kiro/${rel} → .spec/${rel}`);
    }
  }

  if (!dryRun && files.length > 0) {
    fs.rmSync(kiroPath, { recursive: true });
    console.log('\n   ✓ Removed .kiro directory');
  }

  console.log(`\n✅ ${dryRun ? 'Preview' : 'Migration'} complete! (${files.length} files)\n`);
}
