import { windowsSpawnPlan } from '../../../infrastructure/adapters/windowsSpawnPlan';

const files = (...paths: string[]) => {
  const known = new Set(paths.map((file) => file.toLowerCase()));
  return (file: string): boolean => known.has(file.toLowerCase());
};
const env = { Path: 'C:\\Program Files\\nodejs;C:\\Windows\\System32', PATHEXT: '.COM;.EXE;.BAT;.CMD', ComSpec: 'C:\\Windows\\System32\\cmd.exe' };

/** True when every cmd metacharacter in the line is escaped by a caret. */
const allMetaEscaped = (line: string): boolean => !/(^|[^^])[&|<>%!]/.test(line.replace(/\^\^/g, ''));

describe('windowsSpawnPlan', () => {
  it('should run an .exe found on PATH directly, without a shell', () => {
    const plan = windowsSpawnPlan(['node', '-e', 'x'], env, files('C:\\Program Files\\nodejs\\node.exe'));
    expect(plan).toEqual({ file: 'C:\\Program Files\\nodejs\\node.exe', args: ['-e', 'x'], windowsVerbatimArguments: false });
  });

  it('should run a .cmd shim found on PATH through cmd.exe with quoted, escaped arguments', () => {
    const plan = windowsSpawnPlan(['npm', 'test'], env, files('C:\\Program Files\\nodejs\\npm.cmd'));
    expect(plan).toEqual({
      file: 'C:\\Windows\\System32\\cmd.exe',
      args: ['/d', '/s', '/c', '"^"C:\\Program^ Files\\nodejs\\npm.cmd^" ^"test^""'],
      windowsVerbatimArguments: true,
    });
  });

  it('should search PATH directories in order and extensions in PATHEXT order within each', () => {
    const plan = windowsSpawnPlan(['npm'], env, files('C:\\Windows\\System32\\npm.exe', 'C:\\Program Files\\nodejs\\npm.cmd'));
    expect(plan.args.at(-1)).toContain('nodejs\\npm.cmd');
  });

  it.each([
    ['a&calc'], ['x|more'], ['%PATH%'], ['!VAR!'], ['<in'], ['>out'], ['"quoted"'], ['trail\\'],
  ])('should escape the cmd metacharacters in %s so cmd.exe cannot act on them', (argument) => {
    const plan = windowsSpawnPlan(['npm', 'test', '--', argument], env, files('C:\\Program Files\\nodejs\\npm.cmd'));
    expect(allMetaEscaped(plan.args[3].slice(1, -1))).toBe(true);
  });

  it('should double-escape arguments for a node_modules .bin shim, which re-parses them', () => {
    const plan = windowsSpawnPlan(['node_modules\\.bin\\jest.cmd', 'a&b'], env, files('node_modules\\.bin\\jest.cmd'));
    expect(plan.args[3]).toContain('^^^&');
  });

  it('should accept an explicit .cmd path', () => {
    const plan = windowsSpawnPlan(['C:\\tools\\npm.cmd', 'ci'], env, files('C:\\tools\\npm.cmd'));
    expect(plan.file).toBe('C:\\Windows\\System32\\cmd.exe');
    expect(plan.args[3]).toContain('C:\\tools\\npm.cmd');
  });

  it('should leave an unresolvable program unchanged so spawn reports it as not found', () => {
    expect(windowsSpawnPlan(['missing', 'x'], env, files())).toEqual({ file: 'missing', args: ['x'], windowsVerbatimArguments: false });
  });

  it('should read PATH, PATHEXT, and ComSpec case-insensitively and default them when absent', () => {
    const plan = windowsSpawnPlan(['npm'], { PATH: 'C:\\n' }, files('C:\\n\\npm.cmd'));
    expect(plan.file).toBe('cmd.exe');
    expect(plan.args[3]).toContain('C:\\n\\npm.cmd');
  });
});
