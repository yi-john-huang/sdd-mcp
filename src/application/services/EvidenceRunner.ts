import { createHash } from 'node:crypto';
import type { ProcessPort, ProcessRunResult } from '../../domain/ports.js';
import type { EvidenceSettings } from './EvidenceSettings.js';
import { redactSecrets } from './JevRedaction.js';
import { classifyRedEvidence, type RedClassificationResult } from './RedEvidenceClassifier.js';
import { GovernanceError } from './WorkflowErrors.js';

export const MAX_OUTPUT_BYTES = 1024 * 1024;
export const EXCERPT_BYTES = 8 * 1024;
export const MAX_ARGV_LENGTH = 64;
export const MAX_ARG_BYTES = 4096;

const SECRET_ENV_NAME = /(^|_)(KEY|TOKEN|SECRET|PASSWORD)(_|$)/i;
const WINDOWS_SUFFIX = /\.(cmd|exe|bat)$/i;
const PATH_SEPARATORS = /[/\\]/;
const UTF8_CONTINUATION = 0b1000_0000;
const UTF8_CONTINUATION_MASK = 0b1100_0000;

type Env = Readonly<Record<string, string | undefined>>;

export interface EvidenceRunRequest {
  readonly argv: readonly string[];
  readonly projectRoot: string;
  readonly settings: EvidenceSettings;
  readonly serverEnv: Env;
}

export interface ObservedEvidence {
  readonly kind: 'exited';
  readonly argv: readonly string[];
  readonly command: string;
  readonly exitCode: number;
  readonly outputSha256: string;
  readonly outputExcerpt: string;
  readonly truncated: boolean;
  readonly redactions: number;
  readonly durationMs: number;
  readonly redClassification: RedClassificationResult;
}

export type EvidenceRunOutcome =
  | ObservedEvidence
  | { readonly kind: 'timed-out'; readonly outputExcerpt: string; readonly truncated: boolean; readonly redactions: number; readonly durationMs: number }
  | { readonly kind: 'spawn-failed'; readonly reason: 'not-found' | 'permission' | 'other'; readonly outputExcerpt: string; readonly durationMs: number };

const invalid = (message: string): GovernanceError => new GovernanceError('InvalidParams', `Evidence command is invalid: ${message}`);

/** The bare program name used for the allowlist: no directory, no Windows suffix, lowercased on Windows only. */
export function programName(argv0: string, platform: NodeJS.Platform = process.platform): string {
  if (argv0.length === 0 || argv0.includes('\u0000')) throw invalid('the program name is empty or contains NUL');
  const segments = argv0.split(PATH_SEPARATORS);
  if (segments.includes('..')) throw invalid('the program path contains a parent segment');
  const base = segments[segments.length - 1];
  if (base.length === 0) throw invalid('the program path ends with a separator');
  const stripped = base.replace(WINDOWS_SUFFIX, '');
  return platform === 'win32' ? stripped.toLowerCase() : stripped;
}

/** The server environment minus secrets, plus `passEnv` names and `CI=1` when unset. */
export function childEnv(serverEnv: Env, settings: EvidenceSettings): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [name, value] of Object.entries(serverEnv)) {
    if (value === undefined || name === 'SDD_JEV_API_KEY') continue;
    if (SECRET_ENV_NAME.test(name) && !settings.passEnv.has(name)) continue;
    env[name] = value;
  }
  if (env.CI === undefined) env.CI = '1';
  return env;
}

function validateArgv(argv: readonly string[]): void {
  if (argv.length === 0 || argv.length > MAX_ARGV_LENGTH) throw invalid(`argv must have 1 to ${MAX_ARGV_LENGTH} elements`);
  for (const element of argv) {
    if (typeof element !== 'string' || element.length === 0 || element.includes('\u0000') || Buffer.byteLength(element, 'utf8') > MAX_ARG_BYTES) {
      throw invalid(`every argv element must be 1 to ${MAX_ARG_BYTES} bytes without NUL`);
    }
  }
}

/** The last `maxBytes` of the text, never starting inside a multi-byte character. */
function tailUtf8(text: string, maxBytes: number): string {
  const bytes = Buffer.from(text, 'utf8');
  if (bytes.length <= maxBytes) return text;
  let start = bytes.length - maxBytes;
  while (start < bytes.length && (bytes[start] & UTF8_CONTINUATION_MASK) === UTF8_CONTINUATION) start += 1;
  return bytes.subarray(start).toString('utf8');
}

/**
 * Secrets are redacted over the whole capture first, so one straddling the excerpt boundary is never shown in part.
 * A capped capture starts with a marker, so a reader knows the tail is not the end of the real output.
 */
function excerptOf(result: ProcessRunResult): { text: string; redactions: number } {
  const redacted = redactSecrets(result.output.toString('utf8'));
  const marker = result.kind !== 'spawn-failed' && result.truncated
    ? `[output truncated: ${result.output.length} of ${result.totalOutputBytes} bytes captured]\n`
    : '';
  return { text: marker + tailUtf8(redacted.text, EXCERPT_BYTES - Buffer.byteLength(marker, 'utf8')), redactions: redacted.count };
}

const sha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

export class EvidenceRunner {
  constructor(private readonly processes: ProcessPort) {}

  /** Throws only before the process runs; every port result becomes an outcome. */
  async run(request: EvidenceRunRequest): Promise<EvidenceRunOutcome> {
    validateArgv(request.argv);
    const program = programName(request.argv[0]);
    const allowed = request.settings.allowedCommands;
    if (!allowed.has(program)) {
      throw new GovernanceError(
        'EvidenceCommandNotAllowed',
        `"${program}" is not an allowed evidence command. Allowed: ${[...allowed].join(', ')}.`,
        { program, allowedCommands: [...allowed] },
      );
    }
    const result = await this.processes.run({
      argv: request.argv,
      cwd: request.projectRoot,
      env: childEnv(request.serverEnv, request.settings),
      timeoutMs: request.settings.timeoutMs,
      maxOutputBytes: MAX_OUTPUT_BYTES,
    });
    return toOutcome(request.argv, result);
  }
}

function toOutcome(argv: readonly string[], result: ProcessRunResult): EvidenceRunOutcome {
  const { text, redactions } = excerptOf(result);
  switch (result.kind) {
    case 'exited': {
      const command = argv.join(' ');
      return {
        kind: 'exited',
        argv,
        command,
        exitCode: result.exitCode,
        outputSha256: sha256(result.output),
        outputExcerpt: text,
        truncated: result.truncated,
        redactions,
        durationMs: result.durationMs,
        redClassification: classifyRedEvidence(command, text),
      };
    }
    case 'timed-out':
      return { kind: 'timed-out', outputExcerpt: text, truncated: result.truncated, redactions, durationMs: result.durationMs };
    case 'spawn-failed':
      return { kind: 'spawn-failed', reason: result.reason, outputExcerpt: text, durationMs: result.durationMs };
    default: {
      const unreachable: never = result;
      throw new Error(`Unknown process result ${String(unreachable)}`);
    }
  }
}
