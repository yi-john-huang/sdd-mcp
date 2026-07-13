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

export interface AntigravityFailure {
  name: string;
  path: string;
  error: string;
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
): Promise<AntigravityFailure[]> {
  const agentDir = path.join(projectRoot, '.agent');
  const failures: AntigravityFailure[] = [];

  // Warn on Windows where symlinks may require elevated privileges
  if (process.platform === 'win32') {
    console.log('  ⚠️  Symlinks on Windows may require administrator privileges');
  }

  // Create .agent/ directory if needed.
  try {
    if (isSymlink(agentDir)) {
      throw new Error(`Unsafe .agent destination is a symlink: ${agentDir}`);
    }
    if (!fs.existsSync(agentDir)) fs.mkdirSync(agentDir, { recursive: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('  ❌ Failed to create .agent/:', message);
    failures.push({ name: '.agent', path: agentDir, error: message });
    return failures;
  }

  for (const { link, pathKey } of LINK_DEFS) {
    // Compute a relative symlink target from .agent to the effective path.
    const resolvedTarget = path.resolve(projectRoot, paths[pathKey]);
    const target = path.relative(agentDir, resolvedTarget) || '.';
    const linkPath = path.join(agentDir, link);

    // Check if something already exists at the link path
    let existingTarget: string | undefined;
    if (fs.existsSync(linkPath) || isSymlink(linkPath)) {
      if (isSymlink(linkPath)) {
        existingTarget = fs.readlinkSync(linkPath);
        if (existingTarget === target) {
          console.log(`  ⏭️  .agent/${link} symlink already exists, skipping`);
          continue;
        }
        console.log(`  ⚠️  .agent/${link} symlink points to ${existingTarget}, replacing with ${target}`);
      } else {
        console.log(`  ⚠️  .agent/${link} exists as a regular directory, skipping`);
        continue;
      }
    }

    // Verify the target directory exists before creating the symlink.
    if (!fs.existsSync(resolvedTarget)) {
      console.log(`  ⚠️  Target ${target} does not exist yet, creating symlink anyway`);
    }

    try {
      createSymlinkSafely(target, linkPath, existingTarget);
      console.log(`  ✅ Created .agent/${link} → ${target}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`  ❌ Failed to create .agent/${link} symlink:`, message);
      failures.push({ name: link, path: linkPath, error: message });
    }
  }

  return failures;
}

function createSymlinkSafely(target: string, linkPath: string, existingTarget?: string): void {
  const temporaryPath = `${linkPath}.sdd-${process.pid}-${Date.now()}`;
  try {
    fs.symlinkSync(target, temporaryPath, 'dir');
    try {
      fs.renameSync(temporaryPath, linkPath);
    } catch (error) {
      if (existingTarget === undefined) throw error;
      fs.unlinkSync(linkPath);
      try {
        fs.renameSync(temporaryPath, linkPath);
      } catch (replacementError) {
        try {
          fs.symlinkSync(existingTarget, linkPath, 'dir');
        } catch {
          // Preserve the original replacement error for the structured report.
        }
        throw replacementError;
      }
    }
  } finally {
    if (isSymlink(temporaryPath)) fs.unlinkSync(temporaryPath);
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
