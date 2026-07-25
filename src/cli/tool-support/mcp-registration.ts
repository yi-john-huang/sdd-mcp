import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { applyEdits, modify, parse as parseJsonc, parseTree, type Node as JsoncNode, type ParseError } from 'jsonc-parser';
import { parse as parseToml } from 'smol-toml';
import { atomicWriteFile } from '../../utils/atomicWrite.js';
import { PACKAGE_VERSION } from '../../shared/version.js';
import type { InstallTarget, ResolvedInstallPaths } from '../install-target.js';
import { PreservingWriter, validateDestinationPath } from '../utils/preserving-writer.js';
export interface RuntimeRegistrationRecord {
  path: string;
  serverName: 'sdd-mcp';
  entrySemanticSha256: string;
  managedRegionSha256?: string;
  permissionPath?: string;
  permissionSemanticSha256?: string;
}

export interface RuntimeRegistrationResult {
  registration: RuntimeRegistrationRecord;
  installed: string[];
  skipped: string[];
  verify(): Promise<void>;
  rollback(): Promise<boolean>;
}

const SERVER_NAME = 'sdd-mcp' as const;
const COMMAND = 'npx';
const ARGS = ['-y', `sdd-mcp-server@${PACKAGE_VERSION}`] as const;
const START_MARKER = '# >>> sdd-mcp managed runtime';
export async function installRuntimeRegistration(
  projectRoot: string,
  target: InstallTarget,
  paths?: ResolvedInstallPaths,
): Promise<{ installed: string[]; skipped: string[]; warnings: string[] }> {
  return new PreservingWriter(projectRoot).installRuntimeRegistration(
    target,
    paths,
  );
}

const END_MARKER = '# <<< sdd-mcp managed runtime';

export async function registerRuntimeLocked(
  projectRoot: string,
  target: InstallTarget,
  paths: ResolvedInstallPaths,
  previous?: RuntimeRegistrationRecord,
  assertHeld: () => Promise<void> = async () => undefined,
): Promise<RuntimeRegistrationResult> {
  const configPath = path.resolve(projectRoot, paths.runtimeConfig);
  validateDestinationPath(projectRoot, configPath);
  const configPrior = await readOptional(configPath);
  const installed: string[] = [];
  const skipped: string[] = [];
  const relativeConfig = relative(projectRoot, configPath);
  let configNext: Buffer;
  let entrySemanticSha256: string;
  let managedRegionSha256: string | undefined;

  if (target === 'codex') {
    const prepared = prepareCodex(configPrior, previous);
    configNext = prepared.bytes;
    entrySemanticSha256 = prepared.semanticHash;
    managedRegionSha256 = prepared.regionHash;
  } else {
    const prepared = prepareJsonc(configPrior, target, previous);
    configNext = prepared.bytes;
    entrySemanticSha256 = prepared.semanticHash;
  }

  let permissionPath: string | undefined;
  let permissionSemanticSha256: string | undefined;
  let permissionPrior: Buffer | null = null;
  let permissionNext: Buffer | null = null;
  if (target === 'claude-code') {
    permissionPath = path.resolve(projectRoot, paths.runtimePermissionConfig!);
    validateDestinationPath(projectRoot, permissionPath);
    permissionPrior = await readOptional(permissionPath);
    const prepared = prepareClaudePermissions(permissionPrior);
    permissionNext = prepared.bytes;
    permissionSemanticSha256 = prepared.semanticHash;
  }

  const writes: Array<{ file: string; prior: Buffer | null; next: Buffer }> = [
    { file: configPath, prior: configPrior, next: configNext },
  ];
  if (permissionPath && permissionNext) writes.push({ file: permissionPath, prior: permissionPrior, next: permissionNext });
  const committed: typeof writes = [];
  try {
    for (const write of writes) {
      if (buffersEqual(write.prior, write.next)) {
        skipped.push(relative(projectRoot, write.file));
        continue;
      }
      await replaceCas(write.file, write.prior, write.next, assertHeld);
      committed.push(write);
      installed.push(relative(projectRoot, write.file));
    }
  } catch (error) {
    for (const write of committed.reverse()) {
      await assertHeld();
      const current = await readOptional(write.file);
      if (buffersEqual(current, write.next)) {
        if (write.prior === null) await fs.promises.rm(write.file, { force: true });
        else await atomicWriteFile(write.file, write.prior.toString('utf8'));
        await assertHeld();
      }
    }
    throw error;
  }

  return {
    registration: {
      path: relativeConfig,
      serverName: SERVER_NAME,
      entrySemanticSha256,
      managedRegionSha256,
      permissionPath: permissionPath ? relative(projectRoot, permissionPath) : undefined,
      permissionSemanticSha256,
    },
    installed,
    skipped,
    verify: async () => {
      for (const write of writes) {
        if (!buffersEqual(await readOptional(write.file), write.next)) {
          throw new Error(`Runtime changed before manifest commit: ${write.file}`);
        }
      }
      await assertHeld();
    },
    rollback: async () => {
      let restored = true;
      for (const write of [...committed].reverse()) {
        await assertHeld();
        const current = await readOptional(write.file);
        if (!buffersEqual(current, write.next)) {
          restored = false;
          continue;
        }
        if (write.prior === null) await fs.promises.rm(write.file, { force: true });
        else await atomicWriteFile(write.file, write.prior.toString('utf8'));
        await assertHeld();
      }
      return restored;
    },
  };
}

function uniqueJsoncProperty(node: JsoncNode | undefined, key: string, context: string): JsoncNode | undefined {
  if (!node || node.type !== 'object') return undefined;
  const matches = (node.children ?? []).filter((child) =>
    child.type === 'property' && child.children?.[0]?.value === key);
  if (matches.length > 1) throw new Error(`Duplicate JSONC property ${context}.${key}`);
  return matches[0]?.children?.[1];
}

function prepareJsonc(prior: Buffer | null, target: 'claude-code' | 'omp', previous?: RuntimeRegistrationRecord) {
  const source = prior?.toString('utf8') ?? '{}\n';
  const errors: ParseError[] = [];
  const parsed = parseJsonc(source, errors, { allowTrailingComma: true }) as Record<string, unknown> | undefined;
  if (errors.length || !parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Malformed JSONC runtime config');
  const tree = parseTree(source, [], { allowTrailingComma: true });
  const serversNode = uniqueJsoncProperty(tree, 'mcpServers', 'root');
  uniqueJsoncProperty(serversNode, SERVER_NAME, 'mcpServers');
  const desired = { type: 'stdio', command: COMMAND, args: [...ARGS] };
  const servers = parsed.mcpServers;
  if (
    servers !== undefined
    && (servers === null || typeof servers !== 'object' || Array.isArray(servers))
  ) {
    throw new Error('JSONC runtime config mcpServers must be an object');
  }
  const existing = servers && typeof servers === 'object' && !Array.isArray(servers)
    ? (servers as Record<string, unknown>)[SERVER_NAME]
    : undefined;
  assertOwnedOrDesired(existing, desired, previous?.entrySemanticSha256, 'runtime server');
  const edits = modify(source, ['mcpServers', SERVER_NAME], desired, {
    formattingOptions: { insertSpaces: true, tabSize: 2, eol: source.includes('\r\n') ? '\r\n' : '\n' },
  });
  return { bytes: Buffer.from(applyEdits(source, edits)), semanticHash: semanticHash(desired), target };
}

function prepareClaudePermissions(prior: Buffer | null) {
  const source = prior?.toString('utf8') ?? '{}\n';
  const errors: ParseError[] = [];
  const parsed = parseJsonc(source, errors, { allowTrailingComma: true }) as Record<string, unknown> | undefined;
  if (errors.length || !parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Malformed Claude permission settings');
  const tree = parseTree(source, [], { allowTrailingComma: true });
  const permissionsNode = uniqueJsoncProperty(tree, 'permissions', 'root');
  uniqueJsoncProperty(permissionsNode, 'allow', 'permissions');
  const permissions = parsed.permissions;
  if (permissions !== undefined && (typeof permissions !== 'object' || permissions === null || Array.isArray(permissions))) {
    throw new Error('Claude permissions must be an object');
  }
  const allow = (permissions as Record<string, unknown> | undefined)?.allow;
  if (allow !== undefined && (!Array.isArray(allow) || allow.some(value => typeof value !== 'string'))) {
    throw new Error('Claude permissions.allow must be a string array');
  }
  const desiredRule = 'mcp__sdd-mcp__*';
  const desiredAllow = [...(allow as string[] | undefined ?? [])];
  if (!desiredAllow.includes(desiredRule)) desiredAllow.push(desiredRule);
  const edits = modify(source, ['permissions', 'allow'], desiredAllow, {
    formattingOptions: { insertSpaces: true, tabSize: 2, eol: source.includes('\r\n') ? '\r\n' : '\n' },
  });
  return { bytes: Buffer.from(applyEdits(source, edits)), semanticHash: semanticHash(desiredRule) };
}

function prepareCodex(prior: Buffer | null, previous?: RuntimeRegistrationRecord) {
  const source = prior?.toString('utf8') ?? '';
  let parsed: Record<string, unknown>;
  try { parsed = parseToml(source) as Record<string, unknown>; } catch { throw new Error('Malformed TOML runtime config'); }
  const lines = source.split(/(?<=\n)/);
  const starts = lines.map((line, index) => line.replace(/[\r\n]+$/, '') === START_MARKER ? index : -1).filter(index => index >= 0);
  const ends = lines.map((line, index) => line.replace(/[\r\n]+$/, '') === END_MARKER ? index : -1).filter(index => index >= 0);
  if (starts.length !== ends.length || starts.length > 1 || (starts.length === 1 && starts[0] >= ends[0])) {
    throw new Error('Partial or multiple sdd-mcp managed runtime markers');
  }
  const desiredEntry = {
    command: COMMAND,
    args: [...ARGS],
    required: true,
    default_tools_approval_mode: 'auto',
    startup_timeout_sec: 30,
  };
  const existing = ((parsed.mcp_servers as Record<string, unknown> | undefined) ?? {})[SERVER_NAME];
  const block = `${START_MARKER}\n[mcp_servers.'sdd-mcp']\ncommand = "npx"\nargs = ["-y", "sdd-mcp-server@${PACKAGE_VERSION}"]\nrequired = true\ndefault_tools_approval_mode = "auto"\nstartup_timeout_sec = 30\n${END_MARKER}\n`;
  if (starts.length === 0) {
    if (existing !== undefined) {
      if (semanticHash(existing) !== semanticHash(desiredEntry)) throw new Error('Unmanaged sdd-mcp runtime server already exists');
      throw new Error('Exact Codex runtime entry lacks managed markers');
    }
  } else {
    const currentRegion = Buffer.from(lines.slice(starts[0], ends[0] + 1).join(''));
    const currentRegionHash = sha256(currentRegion);
    if (previous?.managedRegionSha256) {
      if (
        currentRegionHash !== previous.managedRegionSha256
        || existing === undefined
        || semanticHash(existing) !== previous.entrySemanticSha256
      ) {
        throw new Error('Managed Codex runtime region was modified');
      }
    } else if (
      currentRegionHash !== sha256(Buffer.from(block))
      || existing === undefined
      || semanticHash(existing) !== semanticHash(desiredEntry)
    ) {
      throw new Error('Unowned Codex runtime region differs from the desired entry');
    }
  }
  const next = starts.length === 1
    ? `${lines.slice(0, starts[0]).join('')}${block}${lines.slice(ends[0] + 1).join('')}`
    : `${source}${source && !source.endsWith('\n') ? '\n' : ''}${source ? '\n' : ''}${block}`;
  try { parseToml(next); } catch { throw new Error('Generated Codex runtime config is invalid'); }
  return { bytes: Buffer.from(next), semanticHash: semanticHash(desiredEntry), regionHash: sha256(Buffer.from(block)) };
}

function assertOwnedOrDesired(existing: unknown, desired: unknown, ownedHash: string | undefined, label: string): void {
  if (existing === undefined) return;
  const existingHash = semanticHash(existing);
  if (existingHash === semanticHash(desired) || existingHash === ownedHash) return;
  throw new Error(`Conflicting unmanaged ${label} named ${SERVER_NAME}`);
}

async function replaceCas(file: string, prior: Buffer | null, next: Buffer, assertHeld: () => Promise<void>): Promise<void> {
  await assertHeld();
  const current = await readOptional(file);
  if (!buffersEqual(current, prior)) throw new Error(`Concurrent edit detected: ${file}`);
  await atomicWriteFile(file, next.toString('utf8'));
  const written = await readOptional(file);
  if (!buffersEqual(written, next)) throw new Error(`Runtime write verification failed: ${file}`);
  await assertHeld();
}

async function readOptional(file: string): Promise<Buffer | null> {
  try { return await fs.promises.readFile(file); } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, stable(child)]));
  return value;
}
function semanticHash(value: unknown): string { return sha256(Buffer.from(JSON.stringify(stable(value)))); }
function sha256(bytes: Buffer): string { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function buffersEqual(left: Buffer | null, right: Buffer | null): boolean { return left === null || right === null ? left === right : left.equals(right); }
function relative(root: string, file: string): string { return path.relative(root, file).split(path.sep).join('/'); }
