import type { ProcessPort, ProcessRunRequest, ProcessRunResult } from '../../../domain/ports';
import { inlineEvalFlag } from '../../../application/services/EvidenceCommandPolicy';
import { EvidenceRunner } from '../../../application/services/EvidenceRunner';
import { resolveEvidenceSettings } from '../../../application/services/EvidenceSettings';

describe('inlineEvalFlag', () => {
  it.each<[string, string[], string, NodeJS.Platform?]>([
    ['node -e', ['node', '-e', 'process.exit(0)'], '-e'],
    ['node -p', ['node', '-p', '1'], '-p'],
    ['node -pe', ['node', '-pe', '1'], '-pe'],
    ['node -ep', ['node', '-ep', '1'], '-ep'],
    ['node --eval', ['node', '--eval', '1'], '--eval'],
    ['node --eval=x', ['node', '--eval=x'], '--eval=x'],
    ['node --print=x', ['node', '--print=x'], '--print=x'],
    ['node with options before -e', ['node', '--no-warnings', '-e', '1'], '-e'],
    ['bun --print', ['bun', '--print', '1'], '--print'],
    ['a directory-qualified Windows node.exe', ['C:\\Program Files\\nodejs\\node.exe', '-e', '1'], '-e', 'win32'],
    ['an uppercase NODE.EXE on win32', ['NODE.EXE', '--eval=1'], '--eval=1', 'win32'],
    ['a POSIX path to node', ['/usr/local/bin/node', '-e', '1'], '-e'],
    ['python -c', ['python', '-c', 'print(1)'], '-c'],
    ['python3 -Bc', ['python3', '-Bc', 'print(1)'], '-Bc'],
    ['python3 -W value then -c', ['python3', '-W', 'ignore', '-c', '1'], '-c'],
    ['python.exe -c on win32', ['python.exe', '-c', '1'], '-c', 'win32'],
    ['npx -c', ['npx', '-c', 'echo hi'], '-c'],
    ['npx --call', ['npx', '--call', 'echo hi'], '--call'],
    ['npx --call=x', ['npx', '--call=echo hi'], '--call=echo hi'],
    ['npx node -e', ['npx', 'node', '-e', '1'], '-e'],
    ['npx -p pkg node -e', ['npx', '-p', 'tsx', 'node', '-e', '1'], '-e'],
    ['npm exec -- python -c', ['npm', 'exec', '--', 'python', '-c', '1'], '-c'],
    ['npm x -c', ['npm', 'x', '-c', 'echo'], '-c'],
    ['npx.cmd node -e on win32', ['npx.cmd', 'node', '-e', '1'], '-e', 'win32'],
    ['node --import data:', ['node', '--import', 'data:text/javascript,process.exit(0)', 'package.json'], '--import'],
    ['node --import=data:', ['node', '--import=data:text/javascript,process.exit(0)', 'package.json'], '--import=data:text/javascript,process.exit(0)'],
    ['node --loader data:', ['node', '--loader', 'data:text/javascript,x', 'a.js'], '--loader'],
    ['node --experimental-loader=data:', ['node', '--experimental-loader=data:text/javascript,x', 'a.js'], '--experimental-loader=data:text/javascript,x'],
    ['bun --import data:', ['bun', '--import', 'data:text/javascript,x', 'a.ts'], '--import'],
    ['bun eval', ['bun', 'eval', 'process.exit(0)'], 'eval'],
    ['bun exec', ['bun', 'exec', 'exit 0'], 'exec'],
    ['bun x node -e', ['bun', 'x', 'node', '-e', '1'], '-e'],
    ['npm --silent exec -- node -e', ['npm', '--silent', 'exec', '--', 'node', '-e', 'process.exit(0)'], '-e'],
    ['npm -s x -c', ['npm', '-s', 'x', '-c', 'exit 0'], '-c'],
    ['npm --loglevel silent exec node -e', ['npm', '--loglevel', 'silent', 'exec', 'node', '-e', '1'], '-e'],
    ['npx --loglevel silent node -e', ['npx', '--loglevel', 'silent', 'node', '-e', 'process.exit(0)'], '-e'],
    ['npx --cache dir node -e', ['npx', '--cache', '/tmp', 'node', '-e', '1'], '-e'],
    ['npx -yc', ['npx', '-yc', 'exit 0'], '-yc'],
    ['python3 --check-hash-based-pycs always -c', ['python3', '--check-hash-based-pycs', 'always', '-c', 'import sys; sys.exit(0)'], '-c'],
    ['pnpm exec node -e', ['pnpm', 'exec', 'node', '-e', '1'], '-e'],
    ['pnpm exec -c', ['pnpm', 'exec', '-c', 'exit 0'], '-c'],
    ['pnpm exec --shell-mode', ['pnpm', 'exec', '--shell-mode', 'exit 0'], '--shell-mode'],
    ['pnpm dlx -c', ['pnpm', 'dlx', '-c', 'exit 0'], '-c'],
    ['pnpm node -e', ['pnpm', 'node', '-e', '1'], '-e'],
    ['yarn exec node -e', ['yarn', 'exec', 'node', '-e', '1'], '-e'],
    ['yarn node -e', ['yarn', 'node', '-e', '1'], '-e'],
    ['yarn --silent node -e', ['yarn', '--silent', 'node', '-e', '1'], '-e'],
  ])('rejects %s', (...[, argv, flag, platform]) => {
    // A rest parameter keeps the callback arity at 0, so Jest never treats `platform` as a done callback.
    expect(inlineEvalFlag(argv, platform)).toBe(flag);
  });

  it.each<[string, string[]]>([
    ['node --test path', ['node', '--test', 'src/order.test.js']],
    ['node script.js -- -e', ['node', 'script.js', '--', '-e']],
    ['python3 -m pytest path', ['python3', '-m', 'pytest', 'tests/test_order.py']],
    ['python3 -m pytest -c config', ['python3', '-m', 'pytest', '-c', 'pytest.ini']],
    ['python3 script', ['python3', 'run_tests.py', '-c']],
    ['npx jest -c jest.config.js', ['npx', 'jest', '-c', 'jest.config.js']],
    ['npx -p pkg jest', ['npx', '-p', 'jest', 'jest']],
    ['npm test', ['npm', 'test']],
    ['npm run test -- -c', ['npm', 'run', 'test', '--', '-c']],
    ['jest -c config', ['jest', '-c', 'jest.config.js']],
    ['go test', ['go', 'test', './...']],
    ['node --import a package', ['node', '--import', 'tsx', 'src/order.test.ts']],
    ['npm --silent test', ['npm', '--silent', 'test']],
    ['npx --loglevel silent jest', ['npx', '--loglevel', 'silent', 'jest']],
    ['python3 --check-hash-based-pycs always -m pytest', ['python3', '--check-hash-based-pycs', 'always', '-m', 'pytest']],
    ['pnpm exec jest', ['pnpm', 'exec', 'jest', '-c', 'jest.config.js']],
    ['pnpm test', ['pnpm', 'test']],
    ['yarn jest -c config', ['yarn', 'jest', '-c', 'jest.config.js']],
    ['bun test', ['bun', 'test']],
  ])('accepts %s', (_name, argv) => {
    expect(inlineEvalFlag(argv)).toBeUndefined();
  });
});

describe('EvidenceRunner inline-eval rejection', () => {
  class CountingPort implements ProcessPort {
    readonly requests: ProcessRunRequest[] = [];
    async run(request: ProcessRunRequest): Promise<ProcessRunResult> {
      this.requests.push(request);
      return { kind: 'exited', exitCode: 0, output: Buffer.from(''), truncated: false, totalOutputBytes: 0, durationMs: 1 };
    }
  }

  it('throws EvidenceCommandInlineEval naming the flag and starts no process', async () => {
    const port = new CountingPort();
    const runner = new EvidenceRunner(port);
    const error = await runner.run({
      argv: ['node', '-e', 'process.exit(0)'],
      projectRoot: '/project',
      settings: resolveEvidenceSettings({}, undefined),
      serverEnv: {},
    }).catch((caught: unknown) => caught);
    expect(error).toMatchObject({ code: 'EvidenceCommandInlineEval', details: { flag: '-e' } });
    expect(port.requests).toHaveLength(0);
  });

  it('checks the allowlist first', async () => {
    const runner = new EvidenceRunner(new CountingPort());
    const error = await runner.run({
      argv: ['sh', '-c', 'exit 0'],
      projectRoot: '/project',
      settings: resolveEvidenceSettings({}, undefined),
      serverEnv: {},
    }).catch((caught: unknown) => caught);
    expect(error).toMatchObject({ code: 'EvidenceCommandNotAllowed' });
  });
});
