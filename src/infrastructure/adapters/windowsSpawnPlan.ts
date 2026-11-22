import path from 'node:path';

export interface SpawnPlan {
  readonly file: string;
  readonly args: readonly string[];
  readonly windowsVerbatimArguments: boolean;
}

type Env = Readonly<Record<string, string | undefined>>;

const DEFAULT_PATHEXT = '.COM;.EXE;.BAT;.CMD';
const BATCH_FILE = /\.(cmd|bat)$/i;
const NODE_MODULES_SHIM = /node_modules[\\/]\.bin[\\/][^\\/]+\.cmd$/i;
const CMD_META = /([()\][%!^"`<>&|;, *?])/g;
const LINE_BREAK = /[\r\n]/;
const PATH_SEPARATOR = /[\\/]/;

/** Windows environment names are case-insensitive; a copied env object keeps whatever case the host used. */
function envValue(env: Env, name: string): string | undefined {
  const key = Object.keys(env).find((candidate) => candidate.toUpperCase() === name);
  return key === undefined ? undefined : env[key];
}

/** PATH entries may be wrapped in double quotes, as Windows allows. */
const pathDirectories = (env: Env): string[] =>
  (envValue(env, 'PATH') ?? '').split(';').map((entry) => entry.trim().replace(/^"(.*)"$/, '$1')).filter(Boolean);

/** A program with a directory resolves against the run's cwd; a bare name searches PATH. */
function resolveProgram(program: string, env: Env, cwd: string, isFile: (file: string) => boolean): string | undefined {
  const extensions = (envValue(env, 'PATHEXT') ?? DEFAULT_PATHEXT).split(';').filter(Boolean);
  const hasExtension = extensions.some((extension) => program.toLowerCase().endsWith(extension.toLowerCase()));
  const bases = PATH_SEPARATOR.test(program)
    ? [path.win32.resolve(cwd, program)]
    : pathDirectories(env).map((directory) => path.win32.join(directory, program));
  for (const base of bases) {
    for (const candidate of hasExtension ? [base] : extensions.map((extension) => base + extension.toLowerCase())) {
      if (isFile(candidate)) return candidate;
    }
  }
  return undefined;
}

/** The command token for cmd.exe, as cross-spawn (MIT) writes it: normalized, caret-escaped, never quoted. */
const escapeCommand = (command: string): string => path.win32.normalize(command).replace(CMD_META, '^$1');

/**
 * Quotes one argument for `cmd.exe /d /s /c` and escapes every cmd metacharacter with a caret,
 * following cross-spawn (MIT). A node_modules `.bin` shim re-parses its arguments, so it needs a second pass.
 */
function escapeArgument(argument: string, doubleEscape: boolean): string {
  let escaped = argument.replace(/(?=(\\+?)?)\1"/g, '$1$1\\"').replace(/(?=(\\+?)?)\1$/, '$1$1');
  escaped = `"${escaped}"`.replace(CMD_META, '^$1');
  return doubleEscape ? escaped.replace(CMD_META, '^$1') : escaped;
}

/**
 * How to start argv on Windows without a general shell. An executable runs directly by its resolved path.
 * A `.cmd` or `.bat` file (npm, npx, yarn, pnpm) cannot be spawned without cmd.exe, so it runs through
 * cmd.exe under its original name with every argument quoted and escaped. An unresolvable program is
 * passed through so spawn reports it as not found.
 */
export function windowsSpawnPlan(argv: readonly string[], env: Env, cwd: string, isFile: (file: string) => boolean): SpawnPlan {
  if (argv.some((element) => LINE_BREAK.test(element))) throw new Error('A Windows command argument must not contain a line break');
  const [program, ...rest] = argv;
  const resolved = resolveProgram(program, env, cwd, isFile);
  if (resolved === undefined) return { file: program, args: rest, windowsVerbatimArguments: false };
  if (!BATCH_FILE.test(resolved)) return { file: resolved, args: rest, windowsVerbatimArguments: false };
  const doubleEscape = NODE_MODULES_SHIM.test(resolved);
  const line = [escapeCommand(program), ...rest.map((argument) => escapeArgument(argument, doubleEscape))].join(' ');
  return { file: envValue(env, 'COMSPEC') ?? 'cmd.exe', args: ['/d', '/s', '/c', `"${line}"`], windowsVerbatimArguments: true };
}
