import * as fs from 'fs';
import * as path from 'path';

/**
 * Antigravity link name → install paths key mapping.
 * Each entry maps an Antigravity directory name to the corresponding
 * effective install path field.
 */
const LINK_DEFS: ReadonlyArray<{ link: string; pathKey: 'skillsPath' | 'rulesPath' }> = [
  { link: 'workflows', pathKey: 'skillsPath' },
  { link: 'rules', pathKey: 'rulesPath' },
];

/**
 * Paths for the component directories that Antigravity symlinks point to.
 */
export interface AntigravityPaths {
  skillsPath: string;
  rulesPath: string;
}

/**
 * Create `.agent/` symlinks pointing to component directories
 * for Google Antigravity compatibility.
 *
 * Uses relative symlinks for portability — the project can be
 * moved or cloned without breaking links.
 *
 * Symlink targets are derived from effective install paths,
 * so custom `--path` / `--rules-path` flags are respected.
 */
export async function createAntigravitySymlinks(
  projectRoot: string,
  paths: AntigravityPaths = { skillsPath: '.claude/skills', rulesPath: '.claude/rules' },
): Promise<void> {
  const agentDir = path.join(projectRoot, '.agent');

  // Warn on Windows where symlinks may require elevated privileges
  if (process.platform === 'win32') {
    console.log('  ⚠️  Symlinks on Windows may require administrator privileges');
  }

  // Create .agent/ directory if needed
  if (!fs.existsSync(agentDir)) {
    fs.mkdirSync(agentDir, { recursive: true });
  }

  for (const { link, pathKey } of LINK_DEFS) {
    // Compute relative symlink target: from .agent/ back to project root, then to effective path
    const target = path.join('..', paths[pathKey]);
    const linkPath = path.join(agentDir, link);

    // Check if something already exists at the link path
    if (fs.existsSync(linkPath) || isSymlink(linkPath)) {
      if (isSymlink(linkPath)) {
        const existingTarget = fs.readlinkSync(linkPath);
        if (existingTarget === target) {
          console.log(`  ⏭️  .agent/${link} symlink already exists, skipping`);
          continue;
        }
        // Symlink points somewhere else — warn, remove, and recreate
        console.log(`  ⚠️  .agent/${link} symlink points to ${existingTarget}, replacing with ${target}`);
        fs.unlinkSync(linkPath);
      } else {
        console.log(`  ⚠️  .agent/${link} exists as a regular directory, skipping`);
        continue;
      }
    }

    // Verify the target directory exists before creating the symlink
    const resolvedTarget = path.resolve(agentDir, target);
    if (!fs.existsSync(resolvedTarget)) {
      console.log(`  ⚠️  Target ${target} does not exist yet, creating symlink anyway`);
    }

    try {
      fs.symlinkSync(target, linkPath, 'dir');
      console.log(`  ✅ Created .agent/${link} → ${target}`);
    } catch (error) {
      console.error(`  ❌ Failed to create .agent/${link} symlink:`, (error as Error).message);
    }
  }
}

/**
 * Check if a path is a symlink (even if the target doesn't exist)
 */
function isSymlink(filePath: string): boolean {
  try {
    const stats = fs.lstatSync(filePath);
    return stats.isSymbolicLink();
  } catch {
    return false;
  }
}
