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

/** Windows environment names are case-insensitive; a copied env object keeps whatever case the host used. */
function envValue(env: Env, name: string): string | undefined {
  const key = Object.keys(env).find((candidate) => candidate.toUpperCase() === name);
  return key === undefined ? undefined : env[key];
}

function resolveProgram(program: string, env: Env, isFile: (file: string) => boolean): string | undefined {
  const extensions = (envValue(env, 'PATHEXT') ?? DEFAULT_PATHEXT).split(';').filter(Boolean);
  const hasExtension = extensions.some((extension) => program.toLowerCase().endsWith(extension.toLowerCase()));
  const bases = /[\\/]/.test(program)
    ? [program]
    : (envValue(env, 'PATH') ?? '').split(';').filter(Boolean).map((directory) => path.win32.join(directory, program));
  for (const base of bases) {
    for (const candidate of hasExtension ? [base] : extensions.map((extension) => base + extension.toLowerCase())) {
      if (isFile(candidate)) return candidate;
    }
  }
  return undefined;
}

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
 * How to start argv on Windows without a general shell. An executable runs directly; a `.cmd` or `.bat`
 * file (npm, npx, yarn, pnpm) cannot be spawned without cmd.exe, so it runs through cmd.exe with every
 * argument quoted and escaped. An unresolvable program is passed through so spawn reports it as not found.
 */
export function windowsSpawnPlan(argv: readonly string[], env: Env, isFile: (file: string) => boolean): SpawnPlan {
  const [program, ...rest] = argv;
  const resolved = resolveProgram(program, env, isFile);
  if (resolved === undefined) return { file: program, args: rest, windowsVerbatimArguments: false };
  if (!BATCH_FILE.test(resolved)) return { file: resolved, args: rest, windowsVerbatimArguments: false };
  const doubleEscape = NODE_MODULES_SHIM.test(resolved);
  const line = [escapeArgument(resolved, false), ...rest.map((argument) => escapeArgument(argument, doubleEscape))].join(' ');
  return { file: envValue(env, 'COMSPEC') ?? 'cmd.exe', args: ['/d', '/s', '/c', `"${line}"`], windowsVerbatimArguments: true };
}
