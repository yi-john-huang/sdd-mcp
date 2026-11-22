import { windowsSpawnPlan } from '../../../infrastructure/adapters/windowsSpawnPlan';

const CWD = 'C:\\proj';
const files = (...paths: string[]) => {
  const known = new Set(paths.map((file) => file.toLowerCase()));
  const seen: string[] = [];
  const isFile = (file: string): boolean => {
    seen.push(file);
    return known.has(file.toLowerCase());
  };
  return Object.assign(isFile, { seen });
};
const env = { Path: 'C:\\Program Files\\nodejs;C:\\Windows\\System32', PATHEXT: '.COM;.EXE;.BAT;.CMD', ComSpec: 'C:\\Windows\\System32\\cmd.exe' };
const plan = (argv: string[], isFile: (file: string) => boolean, environment: Record<string, string> = env) =>
  windowsSpawnPlan(argv, environment, CWD, isFile);

/** True when every cmd metacharacter in the line is escaped by a caret. */
const allMetaEscaped = (line: string): boolean => !/(^|[^^])[&|<>%!]/.test(line.replace(/\^\^/g, ''));

describe('windowsSpawnPlan', () => {
  it('should run an .exe found on PATH directly, without a shell', () => {
    expect(plan(['node', '-e', 'x'], files('C:\\Program Files\\nodejs\\node.exe')))
      .toEqual({ file: 'C:\\Program Files\\nodejs\\node.exe', args: ['-e', 'x'], windowsVerbatimArguments: false });
  });

  it('should run a .cmd shim through cmd.exe by its bare name, like cross-spawn, with quoted arguments', () => {
    expect(plan(['npm', 'test'], files('C:\\Program Files\\nodejs\\npm.cmd'))).toEqual({
      file: 'C:\\Windows\\System32\\cmd.exe',
      args: ['/d', '/s', '/c', '"npm ^"test^""'],
      windowsVerbatimArguments: true,
    });
  });

  it('should never wrap the command itself in quotes; spaces and metacharacters are caret-escaped', () => {
    const line = plan(['C:\\My Tools\\npm.cmd', 'ci'], files('C:\\My Tools\\npm.cmd')).args[3];
    expect(line).toBe('"C:\\My^ Tools\\npm.cmd ^"ci^""');
  });

  it('should normalize forward slashes in a command path', () => {
    const line = plan(['C:/tools/npm.cmd', 'ci'], files('C:\\tools\\npm.cmd')).args[3];
    expect(line.startsWith('"C:\\tools\\npm.cmd ')).toBe(true);
  });

  it('should search PATH directories in order and extensions in PATHEXT order within each', () => {
    const isFile = files('C:\\Windows\\System32\\npm.exe', 'C:\\Program Files\\nodejs\\npm.cmd');
    expect(plan(['npm'], isFile).file).toBe('C:\\Windows\\System32\\cmd.exe');
  });

  it('should accept PATH entries wrapped in quotes', () => {
    const quoted = { ...env, Path: '"C:\\Program Files\\nodejs";C:\\Windows\\System32' };
    expect(plan(['node'], files('C:\\Program Files\\nodejs\\node.exe'), quoted).file).toBe('C:\\Program Files\\nodejs\\node.exe');
  });

  it('should resolve a relative program against the run cwd, not the server cwd', () => {
    const isFile = files('C:\\proj\\node_modules\\.bin\\jest.cmd');
    const result = plan(['node_modules/.bin/jest', 'a&b'], isFile);
    expect(isFile.seen).toContain('C:\\proj\\node_modules\\.bin\\jest.cmd');
    expect(result.file).toBe('C:\\Windows\\System32\\cmd.exe');
    expect(result.args[3].startsWith('"node_modules\\.bin\\jest ')).toBe(true);
    expect(result.args[3]).toContain('^^^&');
  });

  it('should run a relative .exe by its absolute resolved path', () => {
    expect(plan(['bin\\tool.exe', 'x'], files('C:\\proj\\bin\\tool.exe')).file).toBe('C:\\proj\\bin\\tool.exe');
  });

  it.each([
    ['a&calc'], ['x|more'], ['%PATH%'], ['!VAR!'], ['<in'], ['>out'], ['"quoted"'], ['trail\\'],
  ])('should escape the cmd metacharacters in %s so cmd.exe cannot act on them', (argument) => {
    const line = plan(['npm', 'test', '--', argument], files('C:\\Program Files\\nodejs\\npm.cmd')).args[3];
    expect(allMetaEscaped(line.slice(1, -1))).toBe(true);
  });

  it.each([['line\nfeed'], ['carriage\rreturn']])('should refuse %j, which would end the cmd.exe line', (argument) => {
    expect(() => plan(['npm', 'test', argument], files('C:\\Program Files\\nodejs\\npm.cmd'))).toThrow(/line break/);
  });

  it('should leave an unresolvable program unchanged so spawn reports it as not found', () => {
    expect(plan(['missing', 'x'], files())).toEqual({ file: 'missing', args: ['x'], windowsVerbatimArguments: false });
  });

  it('should read PATH, PATHEXT, and ComSpec case-insensitively and default them when absent', () => {
    const result = plan(['npm'], files('C:\\n\\npm.cmd'), { PATH: 'C:\\n' });
    expect(result.file).toBe('cmd.exe');
    expect(result.args[3]).toBe('"npm"');
  });
});
