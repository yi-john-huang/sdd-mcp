import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import type { FileSystemPort } from '../../domain/ports.js';

export type ProjectConfig = Readonly<Record<string, unknown>>;

const MAX_CONFIG_BYTES = 16 * 1024;

function asRecord(parsed: unknown): ProjectConfig | undefined {
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined;
  return parsed as ProjectConfig;
}

/**
 * Reads `.spec/sdd-config.json` once, read-only. Any problem means "no project config".
 * With a port, only `exists`, `stat`, and `readFile` are used, so callers can observe the reads.
 */
export async function readProjectConfig(projectRoot: string, fileSystem?: FileSystemPort): Promise<ProjectConfig | undefined> {
  const configPath = path.join(path.resolve(projectRoot), '.spec', 'sdd-config.json');
  try {
    if (fileSystem && !(await fileSystem.exists(configPath))) return undefined;
    const info = await (fileSystem ? fileSystem.stat(configPath) : stat(configPath));
    if (!info.isFile() || (info.size ?? 0) > MAX_CONFIG_BYTES) return undefined;
    const content = fileSystem ? await fileSystem.readFile(configPath) : await readFile(configPath, 'utf8');
    return content.length > MAX_CONFIG_BYTES ? undefined : asRecord(JSON.parse(content));
  } catch {
    return undefined;
  }
}
