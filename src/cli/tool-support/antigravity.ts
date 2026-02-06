import * as fs from 'fs';
import * as path from 'path';

/**
 * Symlink mappings from Antigravity directories to Claude canonical locations.
 * Keys are relative to `.agent/`, values are relative symlink targets.
 */
const SYMLINK_MAP: ReadonlyArray<{ link: string; target: string }> = [
  { link: 'workflows', target: path.join('..', '.claude', 'skills') },
  { link: 'rules', target: path.join('..', '.claude', 'rules') },
];

/**
 * Create `.agent/` symlinks pointing to `.claude/` directories
 * for Google Antigravity compatibility.
 *
 * Uses relative symlinks for portability — the project can be
 * moved or cloned without breaking links.
 */
export async function createAntigravitySymlinks(projectRoot: string): Promise<void> {
  const agentDir = path.join(projectRoot, '.agent');

  // Warn on Windows where symlinks may require elevated privileges
  if (process.platform === 'win32') {
    console.log('  ⚠️  Symlinks on Windows may require administrator privileges');
  }

  // Create .agent/ directory if needed
  if (!fs.existsSync(agentDir)) {
    fs.mkdirSync(agentDir, { recursive: true });
  }

  for (const { link, target } of SYMLINK_MAP) {
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
