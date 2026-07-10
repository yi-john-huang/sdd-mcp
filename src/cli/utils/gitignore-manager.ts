import * as fs from 'fs';
import * as path from 'path';

const START = '# BEGIN sdd-mcp generated agent files';
const END = '# END sdd-mcp generated agent files';

export interface GitignoreUpdate {
  status: 'created' | 'updated' | 'unchanged';
  added: string[];
}

export async function updateGeneratedIgnores(
  projectRoot: string,
  entries: readonly string[],
): Promise<GitignoreUpdate> {
  const filePath = path.join(projectRoot, '.gitignore');
  const exists = await pathExists(filePath);
  const original = exists ? await fs.promises.readFile(filePath, 'utf8') : '';
  const newline = original.includes('\r\n') ? '\r\n' : '\n';
  const update = buildGitignore(original, entries, newline);
  if (update.content === original) return { status: 'unchanged', added: [] };
  await atomicReplace(filePath, update.content, exists);
  return { status: exists ? 'updated' : 'created', added: update.added };
}

function buildGitignore(original: string, entries: readonly string[], newline: string) {
  const startIndex = original.indexOf(START);
  const endIndex = original.indexOf(END);
  const hasBlock = startIndex >= 0 && endIndex > startIndex;
  const blockEnd = hasBlock ? endIndex + END.length : -1;
  const outside = hasBlock
    ? `${original.slice(0, startIndex)}${original.slice(blockEnd)}`
    : original;
  const covered = new Set(
    outside.split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#') && !line.startsWith('!'))
      .map(normalizePattern),
  );
  const existingBlockEntries = hasBlock
    ? original.slice(startIndex + START.length, endIndex).split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'))
    : [];
  const desired = new Map<string, string>();
  for (const entry of existingBlockEntries) desired.set(normalizePattern(entry), entry);
  const added: string[] = [];
  for (const entry of entries) {
    const normalized = normalizePattern(entry);
    if (covered.has(normalized) || desired.has(normalized)) continue;
    desired.set(normalized, entry);
    added.push(entry);
  }
  if (added.length === 0 && !hasBlock) return { content: original, added };
  const block = [START, ...[...desired.values()].sort(), END].join(newline);
  let content: string;
  if (hasBlock) {
    content = `${original.slice(0, startIndex)}${block}${original.slice(blockEnd)}`;
  } else {
    const separator = original.length === 0 ? '' : original.endsWith(newline) ? newline : `${newline}${newline}`;
    content = `${original}${separator}${block}${newline}`;
  }
  return { content, added };
}

function normalizePattern(value: string): string {
  return value.trim().replace(/^\//, '').replace(/\/+$/, '');
}

async function atomicReplace(filePath: string, content: string, existed: boolean): Promise<void> {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.sdd-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );
  try {
    await fs.promises.writeFile(tempPath, content, { encoding: 'utf8', flag: 'wx' });
    if (existed) {
      const stat = await fs.promises.stat(filePath);
      await fs.promises.chmod(tempPath, stat.mode);
    }
    await fs.promises.rename(tempPath, filePath);
  } catch (error) {
    await fs.promises.rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath);
    return true;
  } catch {
    return false;
  }
}
