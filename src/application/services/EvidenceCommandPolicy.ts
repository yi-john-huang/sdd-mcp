import { GovernanceError } from './WorkflowErrors.js';

/**
 * A backstop against one-line evaluation bypasses of the evidence allowlist: `node -e`, `python -c`, `npx -c`.
 * The allowlist and the project verify command remain the primary control; this is not a sandbox.
 */

const WINDOWS_SUFFIX = /\.(cmd|exe|bat)$/i;
const PATH_SEPARATORS = /[/\\]/;
const NODE_EVAL_FLAGS: ReadonlySet<string> = new Set(['-e', '-p', '-pe', '-ep', '--eval', '--print']);
const NODE_EVAL_PREFIXES = ['--eval=', '--print='] as const;
/** Options that load a module by URL; a `data:` URL carries inline code. */
const NODE_LOADER_OPTIONS: ReadonlySet<string> = new Set(['--import', '--loader', '--experimental-loader']);
const PYTHON_VALUE_OPTIONS = new Set(['W', 'X']);
const PYTHON_LONG_VALUE_OPTIONS: ReadonlySet<string> = new Set(['--check-hash-based-pycs']);
/** Package-manager options that take a separate value, so the value is never read as the subcommand. */
const PACKAGE_MANAGER_VALUE_OPTIONS: ReadonlySet<string> = new Set([
  '-p', '--package', '-w', '--workspace', '--cache', '--loglevel', '--prefix', '--registry', '--userconfig',
  '--globalconfig', '--node-options', '--script-shell', '--shell', '-C', '--dir', '--filter', '--cwd',
]);
/** Short options that take a value when they end a cluster such as `-yp`. */
const SHORT_VALUE_OPTIONS = new Set(['p', 'w', 'C']);
const SHELL_FLAGS: ReadonlySet<string> = new Set(['-c', '--call', '--shell-mode']);
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
      return nodeEvalFlag(args);
    case 'bun':
      return bunEvalFlag(args, platform);
    case 'python':
    case 'python3':
      return pythonEvalFlag(args);
    case 'npx':
      return execEvalFlag(args, platform);
    case 'npm':
    case 'pnpm':
    case 'yarn':
      return packageManagerEvalFlag(args, platform);
    default:
      return undefined;
  }
}

/** Node's value-taking options make "stop at the first positional" unreliable, so every argument before `--` is checked. */
function nodeEvalFlag(args: readonly string[]): string | undefined {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--') return undefined;
    if (NODE_EVAL_FLAGS.has(arg) || NODE_EVAL_PREFIXES.some((prefix) => arg.startsWith(prefix))) return arg;
    if (NODE_LOADER_OPTIONS.has(arg) && args[index + 1]?.startsWith('data:')) return arg;
    const [name, value] = splitOption(arg);
    if (NODE_LOADER_OPTIONS.has(name) && value?.startsWith('data:')) return arg;
  }
  return undefined;
}

/** Bun takes Node's flags plus `eval` and `exec` subcommands, and `bun x` behaves like npx. */
function bunEvalFlag(args: readonly string[], platform: NodeJS.Platform): string | undefined {
  const flag = nodeEvalFlag(args);
  if (flag !== undefined) return flag;
  const { subcommand, rest } = splitSubcommand(args);
  if (subcommand === 'eval' || subcommand === 'exec') return subcommand;
  return subcommand === 'x' ? execEvalFlag(rest, platform) : undefined;
}

/** Python options end at the first positional or `-m`; a single-dash cluster such as `-Bc` still runs `-c`. */
function pythonEvalFlag(args: readonly string[]): string | undefined {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--' || !arg.startsWith('-') || arg === '-') return undefined;
    if (arg.startsWith('--')) {
      if (PYTHON_LONG_VALUE_OPTIONS.has(arg)) index += 1;
      continue;
    }
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

/** `npm`, `pnpm`, and `yarn`: global options come first; `exec`, `x`, and `dlx` run a tool, and a nested interpreter is checked by its own rule. */
function packageManagerEvalFlag(args: readonly string[], platform: NodeJS.Platform): string | undefined {
  const { subcommand, rest, flag } = splitSubcommand(args);
  if (flag !== undefined) return flag;
  if (subcommand === undefined) return undefined;
  if (subcommand === 'exec' || subcommand === 'x' || subcommand === 'dlx') return execEvalFlag(rest, platform);
  return nestedEvalFlag([subcommand, ...rest], platform);
}

/** npx-style options end at the first positional; a shell flag, alone or in a cluster such as `-yc`, runs inline code. */
function execEvalFlag(args: readonly string[], platform: NodeJS.Platform): string | undefined {
  const { subcommand, rest, flag } = splitSubcommand(args);
  if (flag !== undefined) return flag;
  return subcommand === undefined ? undefined : nestedEvalFlag([subcommand, ...rest], platform);
}

/**
 * Skips options up to the first positional, which it returns with the arguments after it.
 * `--` ends the options. A shell flag met on the way is returned as `flag`.
 */
function splitSubcommand(args: readonly string[]): { subcommand?: string; rest: readonly string[]; flag?: string } {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--') return { subcommand: args[index + 1], rest: args.slice(index + 2) };
    if (!arg.startsWith('-') || arg === '-') return { subcommand: arg, rest: args.slice(index + 1) };
    const [name] = splitOption(arg);
    if (SHELL_FLAGS.has(name)) return { rest: [], flag: arg };
    if (arg.startsWith('--')) {
      if (PACKAGE_MANAGER_VALUE_OPTIONS.has(arg)) index += 1;
      continue;
    }
    if (arg.length > 2 && arg.slice(1).includes('c')) return { rest: [], flag: arg };
    if (PACKAGE_MANAGER_VALUE_OPTIONS.has(arg) || (arg.length > 2 && SHORT_VALUE_OPTIONS.has(arg[arg.length - 1]))) index += 1;
  }
  return { rest: [] };
}

function splitOption(arg: string): [string, string | undefined] {
  const equals = arg.indexOf('=');
  return equals < 0 ? [arg, undefined] : [arg.slice(0, equals), arg.slice(equals + 1)];
}

function nestedEvalFlag(argv: readonly string[], platform: NodeJS.Platform): string | undefined {
  if (argv.length === 0) return undefined;
  return NESTED_PROGRAMS.has(programName(argv[0], platform)) ? inlineEvalFlag(argv, platform) : undefined;
}
