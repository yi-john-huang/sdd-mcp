import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { renderCodexHooksConfig } from '../../../cli/tool-support/codex';

const runner = path.resolve(process.cwd(), 'templates/codex-hook-runner.js');

describe('Codex hook support', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-codex-hook-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('renders deterministic hook configuration without interpolating shell syntax', () => {
    const first = renderCodexHooksConfig('.codex/hooks');
    const second = renderCodexHooksConfig('.codex/hooks');
    const parsed = JSON.parse(first);

    expect(first).toBe(second);
    expect(parsed.hooks.SessionStart[0].hooks[0].command).toBe(
      "node '.codex/hooks/sdd-hook-runner.js' session-start",
    );
    expect(parsed.hooks.Stop[0].hooks[0].command).toBe(
      "node '.codex/hooks/sdd-hook-runner.js' stop",
    );
  });

  it('emits concise workflow context at session start', () => {
    const specDir = path.join(root, '.spec/specs/example');
    fs.mkdirSync(specDir, { recursive: true });
    fs.writeFileSync(path.join(specDir, 'spec.json'), JSON.stringify({
      feature_name: 'example',
      phase: 'design-approved',
    }));

    const result = run('session-start');
    const output = JSON.parse(result.stdout);

    expect(result.status).toBe(0);
    expect(output.continue).toBe(true);
    expect(output.hookSpecificOutput.additionalContext).toContain('example: design-approved');
    expect(output.hookSpecificOutput.additionalContext.length).toBeLessThan(1000);
  });

  it('returns safe output when session state is absent', () => {
    const result = run('session-start');
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ continue: true });
  });

  it('reports uncommitted changes read-only at stop', () => {
    spawnSync('git', ['init', '-q'], { cwd: root });
    fs.writeFileSync(path.join(root, 'untracked.txt'), 'content');

    const result = run('stop');
    const output = JSON.parse(result.stdout);

    expect(result.status).toBe(0);
    expect(output.continue).toBe(true);
    expect(output.systemMessage).toContain('uncommitted change');
    expect(fs.readFileSync(path.join(root, 'untracked.txt'), 'utf8')).toBe('content');
  });

  it('does not fail outside Git or on malformed stdin', () => {
    const result = spawnSync(process.execPath, [runner, 'stop'], {
      cwd: root,
      input: '{not-json',
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ continue: true });
  });

  function run(event: string) {
    return spawnSync(process.execPath, [runner, event], {
      cwd: root,
      input: '{}',
      encoding: 'utf8',
    });
  }
});
