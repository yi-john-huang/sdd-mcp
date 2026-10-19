import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import type { FileSystemPort } from '../../domain/ports.js';

export const DEFAULT_JEV_TIMEOUT_MS = 5000;
const MIN_TIMEOUT_MS = 1000;
const MAX_TIMEOUT_MS = 15000;
const MAX_KEY_LENGTH = 512;
const MAX_CONFIG_BYTES = 16 * 1024;
const TRUTHY = new Set(['1', 'true', 'yes', 'on']);

export interface JevSettings {
  readonly enabled: boolean;
  readonly hasKey: boolean;
  readonly allowCode: boolean;
  readonly timeoutMs: number;
  /** The only accessor for the key; used solely at the HTTP call site. */
  apiKey(): string | undefined;
}

type Env = Readonly<Record<string, string | undefined>>;

function isTruthy(value: string | undefined): boolean {
  return value !== undefined && TRUTHY.has(value.trim().toLowerCase());
}

function resolveEnabled(env: Env, projectSetting: boolean | undefined): boolean {
  const raw = env.SDD_JEV_ENABLED?.trim().toLowerCase();
  if (raw === undefined || raw === '') return projectSetting === true;
  // Falsy and unrecognized values both disable JEV, even when the project setting is true.
  return TRUTHY.has(raw);
}

function resolveKey(env: Env): string | undefined {
  const key = env.SDD_JEV_API_KEY?.trim();
  if (!key || key.length > MAX_KEY_LENGTH) return undefined;
  return /^[\x21-\x7E]+$/.test(key) ? key : undefined;
}

function resolveTimeout(env: Env): number {
  const raw = env.SDD_JEV_TIMEOUT_MS?.trim();
  if (raw === undefined || !/^\d+$/.test(raw)) return DEFAULT_JEV_TIMEOUT_MS;
  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, Number(raw)));
}

export function resolveJevSettings(env: Env, projectSetting: boolean | undefined): JevSettings {
  const key = resolveKey(env);
  const settings = {
    enabled: resolveEnabled(env, projectSetting),
    hasKey: key !== undefined,
    allowCode: isTruthy(env.SDD_JEV_ALLOW_CODE),
    timeoutMs: resolveTimeout(env),
  };
  // Non-enumerable accessor keeps the key out of JSON.stringify, spreads, and logs.
  Object.defineProperty(settings, 'apiKey', { value: () => key, enumerable: false });
  Object.defineProperty(settings, 'toString', { value: () => '[JevSettings]', enumerable: false });
  return settings as JevSettings;
}

function enabledFlag(parsed: unknown): boolean | undefined {
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined;
  const jev = (parsed as Record<string, unknown>).jev;
  if (typeof jev !== 'object' || jev === null || Array.isArray(jev)) return undefined;
  const enabled = (jev as Record<string, unknown>).enabled;
  return typeof enabled === 'boolean' ? enabled : undefined;
}

/**
 * Reads `.spec/sdd-config.json` once, read-only. Any problem means "no project setting".
 * With a port, only `exists`, `stat`, and `readFile` are used, so callers can observe the reads.
 */
export async function readProjectJevSetting(projectRoot: string, fileSystem?: FileSystemPort): Promise<boolean | undefined> {
  const configPath = path.join(path.resolve(projectRoot), '.spec', 'sdd-config.json');
  try {
    if (fileSystem && !(await fileSystem.exists(configPath))) return undefined;
    const info = await (fileSystem ? fileSystem.stat(configPath) : stat(configPath));
    if (!info.isFile() || (info.size ?? 0) > MAX_CONFIG_BYTES) return undefined;
    const content = fileSystem ? await fileSystem.readFile(configPath) : await readFile(configPath, 'utf8');
    return content.length > MAX_CONFIG_BYTES ? undefined : enabledFlag(JSON.parse(content));
  } catch {
    return undefined;
  }
}
