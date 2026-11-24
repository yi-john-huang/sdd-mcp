import { GovernanceError } from './WorkflowErrors.js';

/**
 * A backstop against one-line evaluation bypasses of the evidence allowlist: `node -e`, `python -c`, `npx -c`.
 * The allowlist and the project verify command remain the primary control; this is not a sandbox.
 */

const WINDOWS_SUFFIX = /\.(cmd|exe|bat)$/i;
const PATH_SEPARATORS = /[/\\]/;
const NODE_EVAL_FLAGS: ReadonlySet<string> = new Set(['-e', '-p', '-pe', '-ep', '--eval', '--print']);
const NODE_EVAL_PREFIXES = ['--eval=', '--print='] as const;
const PYTHON_VALUE_OPTIONS = new Set(['W', 'X']);
const NPX_VALUE_OPTIONS: ReadonlySet<string> = new Set(['-p', '--package']);
const NESTED_PROGRAMS: ReadonlySet<string> = new Set(['node', 'bun', 'python', 'python3']);
/** The only directories a path-qualified program may name, relative to the project root. */
export const RUNNER_DIRECTORIES: readonly string[] = ['node_modules/.bin', '.venv/bin', 'venv/bin', '.venv/Scripts', 'venv/Scripts'];

const invalidProgram = (message: string): GovernanceError => new GovernanceError('InvalidParams', `Evidence command is invalid: ${message}`);

function pathSegments(argv0: string): string[] {
  if (argv0.length === 0 || argv0.includes('\u0000')) throw invalidProgram('the program name is empty or contains NUL');
  const segments = argv0.split(PATH_SEPARATORS);
  if (segments.includes('..')) throw invalidProgram('the program path contains a parent segment');
  if (segments[segments.length - 1].length === 0) throw invalidProgram('the program path ends with a separator');
  return segments;
}

/** The bare program name used for the allowlist: no directory; on Windows only, no .cmd/.exe/.bat suffix and lowercased. */
export function programName(argv0: string, platform: NodeJS.Platform = process.platform): string {
  const segments = pathSegments(argv0);
  const base = segments[segments.length - 1];
  return platform === 'win32' ? base.replace(WINDOWS_SUFFIX, '').toLowerCase() : base;
}

/**
 * The project-relative path of a path-qualified program, or undefined for a bare name found on PATH.
 * Any other directory could hold a look-alike outside the fingerprinted tree, so it is rejected.
 */
export function runnerRelativePath(argv0: string): string | undefined {
  const segments = pathSegments(argv0);
  if (segments.length === 1) return undefined;
  const relative = segments[0] === '.' ? segments.slice(1) : segments;
  const directory = relative.slice(0, -1).join('/');
  if (!RUNNER_DIRECTORIES.includes(directory)) {
    throw invalidProgram(`a program path must be a bare name or sit in ${RUNNER_DIRECTORIES.join(', ')}`);
  }
  return relative.join('/');
}

/** The first argument that evaluates inline code, or undefined when the command runs a file or a tool. */
export function inlineEvalFlag(argv: readonly string[], platform: NodeJS.Platform = process.platform): string | undefined {
  if (argv.length === 0) return undefined;
  const program = programName(argv[0], platform);
  const args = argv.slice(1);
  switch (program) {
    case 'node':
    case 'bun':
      return nodeEvalFlag(args);
    case 'python':
    case 'python3':
      return pythonEvalFlag(args);
    case 'npx':
      return npxEvalFlag(args, platform);
    case 'npm':
      return args[0] === 'exec' || args[0] === 'x' ? npxEvalFlag(args.slice(1), platform) : undefined;
    default:
      return undefined;
  }
}

/** Node's value-taking options make "stop at the first positional" unreliable, so every argument before `--` is checked. */
function nodeEvalFlag(args: readonly string[]): string | undefined {
  for (const arg of args) {
    if (arg === '--') return undefined;
    if (NODE_EVAL_FLAGS.has(arg) || NODE_EVAL_PREFIXES.some((prefix) => arg.startsWith(prefix))) return arg;
  }
  return undefined;
}

/** Python options end at the first positional or `-m`; a single-dash cluster such as `-Bc` still runs `-c`. */
function pythonEvalFlag(args: readonly string[]): string | undefined {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--' || !arg.startsWith('-') || arg === '-') return undefined;
    if (arg.startsWith('--')) continue;
    for (let position = 1; position < arg.length; position += 1) {
      const option = arg[position];
      if (option === 'c') return arg;
      if (option === 'm') return undefined;
      if (PYTHON_VALUE_OPTIONS.has(option)) {
        if (position === arg.length - 1) index += 1;
        break;
      }
    }
  }
  return undefined;
}

/** npx options end at the first positional; a nested interpreter is checked with its own rule. */
function npxEvalFlag(args: readonly string[], platform: NodeJS.Platform): string | undefined {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--') return nestedEvalFlag(args.slice(index + 1), platform);
    if (arg === '-c' || arg === '--call' || arg.startsWith('--call=')) return arg;
    if (NPX_VALUE_OPTIONS.has(arg)) { index += 1; continue; }
    if (!arg.startsWith('-')) return nestedEvalFlag(args.slice(index), platform);
  }
  return undefined;
}

function nestedEvalFlag(argv: readonly string[], platform: NodeJS.Platform): string | undefined {
  if (argv.length === 0) return undefined;
  return NESTED_PROGRAMS.has(programName(argv[0], platform)) ? inlineEvalFlag(argv, platform) : undefined;
}
