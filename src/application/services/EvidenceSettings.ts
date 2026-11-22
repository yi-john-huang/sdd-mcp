import type { ProjectConfig } from './ProjectConfig.js';

export type EvidenceMode = 'verified' | 'self-reported';

export interface EvidenceSettings {
  readonly mode: EvidenceMode;
  readonly timeoutMs: number;
  readonly allowedCommands: ReadonlySet<string>;
  readonly passEnv: ReadonlySet<string>;
  /** Invalid configuration values, one line each, for the caller to report once. */
  readonly warnings: readonly string[];
}

export const DEFAULT_EVIDENCE_TIMEOUT_MS = 120_000;
export const MIN_EVIDENCE_TIMEOUT_MS = 5_000;
export const MAX_EVIDENCE_TIMEOUT_MS = 600_000;
export const DEFAULT_ALLOWED_COMMANDS: readonly string[] = [
  'node', 'npm', 'npx', 'pnpm', 'yarn', 'bun', 'jest', 'vitest', 'tsc',
  'pytest', 'python', 'python3', 'go', 'cargo', 'make', 'mvn', 'gradle', 'dotnet',
];

const MODES: ReadonlySet<string> = new Set<EvidenceMode>(['verified', 'self-reported']);
const BARE_PROGRAM_NAME = /^[A-Za-z0-9._+-]+$/;
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

type Env = Readonly<Record<string, string | undefined>>;

interface Resolution {
  readonly warnings: string[];
}

function evidenceSection(config: ProjectConfig | undefined): Record<string, unknown> {
  const section = config?.evidence;
  return typeof section === 'object' && section !== null && !Array.isArray(section) ? (section as Record<string, unknown>) : {};
}

function resolveMode(env: Env, section: Record<string, unknown>, out: Resolution): EvidenceMode {
  const fromEnv = env.SDD_EVIDENCE_MODE?.trim().toLowerCase();
  if (fromEnv) {
    if (MODES.has(fromEnv)) return fromEnv as EvidenceMode;
    out.warnings.push(`SDD_EVIDENCE_MODE "${fromEnv}" is not recognized; using "verified"`);
    return 'verified';
  }
  const fromConfig = section.mode;
  if (fromConfig === undefined) return 'verified';
  if (typeof fromConfig === 'string' && MODES.has(fromConfig)) return fromConfig as EvidenceMode;
  out.warnings.push(`evidence.mode ${JSON.stringify(fromConfig)} is not recognized; using "verified"`);
  return 'verified';
}

const clampTimeout = (value: number): number => Math.min(MAX_EVIDENCE_TIMEOUT_MS, Math.max(MIN_EVIDENCE_TIMEOUT_MS, value));

function resolveTimeout(env: Env, section: Record<string, unknown>, out: Resolution): number {
  const fromEnv = env.SDD_EVIDENCE_TIMEOUT_MS?.trim();
  if (fromEnv) {
    if (/^\d+$/.test(fromEnv)) return clampTimeout(Number(fromEnv));
    out.warnings.push(`SDD_EVIDENCE_TIMEOUT_MS "${fromEnv}" is not an integer; ignoring it`);
  }
  const fromConfig = section.timeoutMs;
  if (fromConfig === undefined) return DEFAULT_EVIDENCE_TIMEOUT_MS;
  if (typeof fromConfig === 'number' && Number.isInteger(fromConfig)) return clampTimeout(fromConfig);
  out.warnings.push(`evidence.timeoutMs ${JSON.stringify(fromConfig)} is not an integer; using ${DEFAULT_EVIDENCE_TIMEOUT_MS}`);
  return DEFAULT_EVIDENCE_TIMEOUT_MS;
}

/** A whole list is accepted or rejected, so one typo can never widen or narrow it silently. */
function resolveNameList(
  value: unknown,
  key: string,
  pattern: RegExp,
  fallback: readonly string[],
  out: Resolution,
): ReadonlySet<string> {
  if (value === undefined) return new Set(fallback);
  const valid = Array.isArray(value)
    && value.length > 0
    && value.every((entry) => typeof entry === 'string' && pattern.test(entry));
  if (valid) return new Set(value as string[]);
  out.warnings.push(`${key} must be a non-empty list of names matching ${pattern}; using the default`);
  return new Set(fallback);
}

export function resolveEvidenceSettings(env: Env, projectConfig: ProjectConfig | undefined): EvidenceSettings {
  const section = evidenceSection(projectConfig);
  const out: Resolution = { warnings: [] };
  const settings = {
    mode: resolveMode(env, section, out),
    timeoutMs: resolveTimeout(env, section, out),
    allowedCommands: resolveNameList(section.allowedCommands, 'evidence.allowedCommands', BARE_PROGRAM_NAME, DEFAULT_ALLOWED_COMMANDS, out),
    passEnv: resolveNameList(section.passEnv, 'evidence.passEnv', ENV_NAME, [], out),
    warnings: Object.freeze([...out.warnings]),
  };
  // Keep only the two scalar fields in logs and serialized results.
  Object.defineProperty(settings, 'toJSON', { value: () => ({ mode: settings.mode, timeoutMs: settings.timeoutMs }), enumerable: false });
  Object.defineProperty(settings, 'toString', { value: () => '[EvidenceSettings]', enumerable: false });
  return Object.freeze(settings);
}
