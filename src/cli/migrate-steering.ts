#!/usr/bin/env node

/**
 * Steering Migration Tool for SDD MCP v3.1
 *
 * Migrates projects from static steering documents to the new consolidated
 * agents/rules/skills architecture.
 *
 * This tool:
 * 1. Detects old steering structure (.spec/steering/ with static docs)
 * 2. Backs up existing steering to .spec/steering.backup/
 * 3. Removes static steering docs (principles, tdd-guideline, linus-review, etc.)
 * 4. Preserves project-specific docs (product.md, tech.md, structure.md)
 *
 * The static steering content has been merged into:
 * - principles.md → rules/coding-style.md
 * - tdd-guideline.md → agents/tdd-guide.md
 * - linus-review.md → agents/reviewer.md
 * - owasp-top10-check.md → agents/security-auditor.md
 * - commit.md → skills/sdd-commit/SKILL.md
 */

import * as fs from 'fs';
import * as path from 'path';

const HELP = `
SDD Steering Migration Tool (v3.1)

Migrates from static steering documents to consolidated agents/rules/skills.

Usage: npx sdd-mcp-server migrate-steering [options]

Options:
  --path <dir>     Project directory (default: current directory)
  --dry-run, -n    Preview without making changes
  --force, -f      Skip confirmation prompts
  --help, -h       Show this help

What This Tool Does:
  1. Backs up existing .spec/steering/ to .spec/steering.backup/
  2. Removes static steering documents that have been merged:
     - AGENTS.md (meta-doc, removed)
     - commit.md (merged into skills/sdd-commit/SKILL.md)
     - linus-review.md (merged into agents/reviewer.md)
     - owasp-top10-check.md (merged into agents/security-auditor.md)
     - principles.md (merged into rules/coding-style.md)
     - tdd-guideline.md (merged into agents/tdd-guide.md)
  3. Preserves project-specific templates:
     - product.md
     - tech.md
     - structure.md

Migration Path:
  The static guidance content now lives in enhanced components:
  - Design principles: .claude/rules/coding-style.md
  - TDD methodology: .claude/agents/tdd-guide.md
  - Review criteria: .claude/agents/reviewer.md
  - Security checklist: .claude/agents/security-auditor.md
  - Commit format: .claude/skills/sdd-commit/SKILL.md

Examples:
  npx sdd-mcp-server migrate-steering              # Migrate current directory
  npx sdd-mcp-server migrate-steering --dry-run   # Preview changes
  npx sdd-mcp-server migrate-steering --path ./my-project
`;

/**
 * Static steering documents that should be removed
 * These have been merged into agents/rules/skills
 */
const STATIC_STEERING_DOCS = [
  'AGENTS.md',
  'commit.md',
  'linus-review.md',
  'owasp-top10-check.md',
  'principles.md',
  'tdd-guideline.md',
];

/**
 * Project-specific templates that should be preserved
 */
const PROJECT_SPECIFIC_DOCS = [
  'product.md',
  'tech.md',
  'structure.md',
];

/**
 * Parse command line arguments
 */
function parseArgs(args: string[]): {
  projectPath: string;
  dryRun: boolean;
  force: boolean;
  showHelp: boolean;
} {
  let projectPath = process.cwd();
  let dryRun = false;
  let force = false;
  let showHelp = false;

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
        showHelp = true;
        break;
    }
  }

  return { projectPath, dryRun, force, showHelp };
}

/**
 * Get all files in a directory recursively
 */
function getAllFiles(dir: string): string[] {
  const files: string[] = [];
  if (!fs.existsSync(dir)) return files;

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

/**
 * Check if a steering directory has static docs that need migration
 */
function detectOldStructure(steeringPath: string): {
  hasStaticDocs: boolean;
  staticDocs: string[];
  projectDocs: string[];
  otherDocs: string[];
} {
  const staticDocs: string[] = [];
  const projectDocs: string[] = [];
  const otherDocs: string[] = [];

  if (!fs.existsSync(steeringPath)) {
    return { hasStaticDocs: false, staticDocs, projectDocs, otherDocs };
  }

  const entries = fs.readdirSync(steeringPath);

  for (const entry of entries) {
    if (!entry.endsWith('.md')) continue;

    if (STATIC_STEERING_DOCS.includes(entry)) {
      staticDocs.push(entry);
    } else if (PROJECT_SPECIFIC_DOCS.includes(entry)) {
      projectDocs.push(entry);
    } else {
      otherDocs.push(entry);
    }
  }

  return {
    hasStaticDocs: staticDocs.length > 0,
    staticDocs,
    projectDocs,
    otherDocs,
  };
}

/**
 * Create backup of steering directory
 */
function backupSteering(steeringPath: string, backupPath: string, dryRun: boolean): void {
  if (dryRun) {
    console.log(`   Would backup: ${steeringPath} → ${backupPath}`);
    return;
  }

  // If backup already exists, add timestamp
  let finalBackupPath = backupPath;
  if (fs.existsSync(backupPath)) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    finalBackupPath = `${backupPath}-${timestamp}`;
  }

  // Copy all files to backup
  fs.mkdirSync(finalBackupPath, { recursive: true });
  const files = getAllFiles(steeringPath);

  for (const file of files) {
    const rel = path.relative(steeringPath, file);
    const destFile = path.join(finalBackupPath, rel);
    fs.mkdirSync(path.dirname(destFile), { recursive: true });
    fs.copyFileSync(file, destFile);
  }

  console.log(`   ✓ Backed up to: ${finalBackupPath}`);
}

/**
 * Remove static steering documents
 */
function removeStaticDocs(steeringPath: string, staticDocs: string[], dryRun: boolean): void {
  for (const doc of staticDocs) {
    const docPath = path.join(steeringPath, doc);
    if (dryRun) {
      console.log(`   Would remove: ${doc}`);
    } else {
      if (fs.existsSync(docPath)) {
        fs.unlinkSync(docPath);
        console.log(`   ✓ Removed: ${doc}`);
      }
    }
  }
}

/**
 * Main migration function
 */
export async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const { projectPath, dryRun, force, showHelp } = parseArgs(args);

  if (showHelp) {
    console.log(HELP);
    return;
  }

  const steeringPath = path.join(projectPath, '.spec', 'steering');
  const backupPath = path.join(projectPath, '.spec', 'steering.backup');

  console.log('\n🔄 SDD Steering Migration (v3.1)\n');

  // Check if .spec/steering exists
  if (!fs.existsSync(steeringPath)) {
    console.log('ℹ️  No .spec/steering directory found. Nothing to migrate.\n');
    console.log('   If this is a new project, run: npx sdd-mcp-server install\n');
    return;
  }

  // Detect structure
  const { hasStaticDocs, staticDocs, projectDocs, otherDocs } = detectOldStructure(steeringPath);

  if (!hasStaticDocs) {
    console.log('✅ No static steering documents found. Already migrated or clean install.\n');
    if (projectDocs.length > 0) {
      console.log('   Project-specific documents preserved:');
      for (const doc of projectDocs) {
        console.log(`     • ${doc}`);
      }
      console.log('');
    }
    return;
  }

  // Display what will happen
  console.log('📋 Migration Plan:\n');

  console.log('   Static documents to remove (merged into components):');
  for (const doc of staticDocs) {
    const mergedInto = getMergeTarget(doc);
    console.log(`     • ${doc} → ${mergedInto}`);
  }
  console.log('');

  if (projectDocs.length > 0) {
    console.log('   Project-specific documents to preserve:');
    for (const doc of projectDocs) {
      console.log(`     • ${doc}`);
    }
    console.log('');
  }

  if (otherDocs.length > 0) {
    console.log('   Other documents (will be preserved):');
    for (const doc of otherDocs) {
      console.log(`     • ${doc}`);
    }
    console.log('');
  }

  if (dryRun) {
    console.log('🔍 DRY RUN - No changes will be made.\n');
  }

  // Backup
  console.log('📦 Backup:\n');
  backupSteering(steeringPath, backupPath, dryRun);
  console.log('');

  // Remove static docs
  console.log('🗑️  Removing static documents:\n');
  removeStaticDocs(steeringPath, staticDocs, dryRun);
  console.log('');

  // Summary
  if (dryRun) {
    console.log('✅ Preview complete. Run without --dry-run to apply changes.\n');
  } else {
    console.log('✅ Migration complete!\n');
    console.log('   The static steering content now lives in:');
    console.log('     • .claude/rules/coding-style.md (SOLID, DRY, KISS, YAGNI)');
    console.log('     • .claude/agents/reviewer.md (Linus-style review)');
    console.log('     • .claude/agents/tdd-guide.md (TDD methodology)');
    console.log('     • .claude/agents/security-auditor.md (OWASP Top 10)');
    console.log('     • .claude/skills/sdd-commit/SKILL.md (Commit format)\n');

    console.log('   To update .claude/ components, run: npx sdd-mcp-server install\n');
  }
}

/**
 * Get the merge target description for a static doc
 */
function getMergeTarget(doc: string): string {
  const targets: Record<string, string> = {
    'AGENTS.md': '(removed - meta documentation)',
    'commit.md': 'skills/sdd-commit/SKILL.md',
    'linus-review.md': 'agents/reviewer.md',
    'owasp-top10-check.md': 'agents/security-auditor.md',
    'principles.md': 'rules/coding-style.md',
    'tdd-guideline.md': 'agents/tdd-guide.md',
  };
  return targets[doc] || '(unknown)';
}

// ESM main module detection
const isMainModule = process.argv[1] && (
  process.argv[1].endsWith('/migrate-steering.js') ||
  process.argv[1].endsWith('/migrate-steering.ts') ||
  process.argv[1].endsWith('\\migrate-steering.js') ||
  process.argv[1].endsWith('\\migrate-steering.ts')
);

if (isMainModule) {
  main().catch((error) => {
    console.error('Error:', error.message);
    process.exit(1);
  });
}
