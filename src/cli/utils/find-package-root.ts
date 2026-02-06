import * as fs from 'fs';
import * as path from 'path';

/**
 * Walk up the directory tree from `startDir` looking for the
 * sdd-mcp-server package root (a directory containing package.json
 * with `name === 'sdd-mcp-server'`).
 *
 * @returns The package root directory, or null if not found.
 */
export function findPackageRoot(startDir: string): string | null {
  let dir = startDir;
  while (dir !== path.dirname(dir)) {
    const pkgPath = path.join(dir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        if (pkg.name === 'sdd-mcp-server') {
          return dir;
        }
      } catch {
        // Continue searching — invalid JSON, read error, etc.
      }
    }
    dir = path.dirname(dir);
  }
  return null;
}

/**
 * Resolve `dist/cli` within the sdd-mcp-server package.
 *
 * Tries multiple strategies to locate the package:
 * 1. From the running script's real location (works with npx symlinks)
 * 2. From process.cwd() (works in local dev)
 * 3. Fallback to cwd-based path
 */
export function getDistCliDir(): string {
  // Strategy 1: From the running script's real location (works with npx)
  if (process.argv[1]) {
    try {
      const realPath = fs.realpathSync(process.argv[1]);
      const scriptDir = path.dirname(realPath);
      const root = findPackageRoot(scriptDir);
      if (root) return path.join(root, 'dist', 'cli');
    } catch {
      // If realpathSync fails, fall through to other strategies
    }
  }

  // Strategy 2: From process.cwd() (works in local dev)
  const root = findPackageRoot(process.cwd());
  if (root) return path.join(root, 'dist', 'cli');

  // Strategy 3: Fallback to process.cwd() based path
  return path.join(process.cwd(), 'dist', 'cli');
}

/**
 * Find a template file by name within the sdd-mcp-server package.
 *
 * @returns Absolute path to the template, or null if not found.
 */
export function findTemplate(templateName: string): string | null {
  const searchRoots: string[] = [];

  // Strategy 1: From the running script's real location
  if (process.argv[1]) {
    try {
      searchRoots.push(path.dirname(fs.realpathSync(process.argv[1])));
    } catch {
      // Fall through
    }
  }

  // Strategy 2: From cwd
  searchRoots.push(process.cwd());

  for (const startDir of searchRoots) {
    const pkgRoot = findPackageRoot(startDir);
    if (pkgRoot) {
      const templatePath = path.join(pkgRoot, 'templates', templateName);
      if (fs.existsSync(templatePath)) {
        return templatePath;
      }
    }
  }

  return null;
}
