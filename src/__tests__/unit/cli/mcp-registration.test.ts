import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { parse as parseJsonc } from 'jsonc-parser';
import { parse as parseToml } from 'smol-toml';
import { getTargetPolicy } from '../../../cli/install-target';
import { registerRuntimeLocked, RuntimeRegistrationConflictError } from '../../../cli/tool-support/mcp-registration';

const packageVersion = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8')).version;

describe('MCP runtime registration', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-runtime-'));
  });

  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('leaves absent and malformed Claude permissions untouched when disabled', async () => {
    const paths = getTargetPolicy('claude-code').defaultPaths;
    const settings = path.join(root, paths.runtimePermissionConfig!);
    const options = { configureClaudePermissions: false };
    const first = await registerRuntimeLocked(root, 'claude-code', paths, undefined, undefined, options);
    expect(fs.existsSync(settings)).toBe(false);
    expect(first.registration.permissionPath).toBeUndefined();
    await first.verify();
    fs.mkdirSync(path.dirname(settings), { recursive: true });
    fs.writeFileSync(settings, '{ user settings are not parseable');
    const second = await registerRuntimeLocked(root, 'claude-code', paths, first.registration, undefined, options);
    await second.verify();
    expect(fs.readFileSync(settings, 'utf8')).toBe('{ user settings are not parseable');
    expect(parseJsonc(fs.readFileSync(path.join(root, paths.runtimeConfig), 'utf8')).mcpServers['sdd-mcp'].command).toBe('npx');
  });

  it('merges Claude JSONC server and permission allow without changing user policy', async () => {
    fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(root, '.mcp.json'), '{\n  // user server\n  "mcpServers": { "other": { "command": "other" } }\n}\n');
    fs.writeFileSync(path.join(root, '.claude/settings.json'), JSON.stringify({
      permissions: { allow: ['Bash(npm test)'], ask: ['Read'], deny: ['Bash(rm *)'] },
    }, null, 2));

    const result = await registerRuntimeLocked(root, 'claude-code', getTargetPolicy('claude-code').defaultPaths);
    const runtime = parseJsonc(fs.readFileSync(path.join(root, '.mcp.json'), 'utf8'));
    const settings = parseJsonc(fs.readFileSync(path.join(root, '.claude/settings.json'), 'utf8'));

    expect(runtime.mcpServers.other.command).toBe('other');
    expect(runtime.mcpServers['sdd-mcp']).toEqual({
      type: 'stdio', command: 'npx', args: ['-y', `sdd-mcp-server@${packageVersion}`],
    });
    expect(settings.permissions).toEqual({
      allow: ['Bash(npm test)', 'mcp__sdd-mcp__*'], ask: ['Read'], deny: ['Bash(rm *)'],
    });
    expect(result.registration.permissionPath).toBe('.claude/settings.json');
  });

  it('registers OMP and refuses a conflicting same-name server without writing', async () => {
    const config = path.join(root, '.omp/mcp.json');
    fs.mkdirSync(path.dirname(config), { recursive: true });
    const prior = '{\n  "mcpServers": { "sdd-mcp": { "command": "custom" } }\n}\n';
    fs.writeFileSync(config, prior);

    await expect(registerRuntimeLocked(root, 'omp', getTargetPolicy('omp').defaultPaths))
      .rejects.toMatchObject({ configPath: config, reason: 'unmanaged-entry' });
    expect(fs.readFileSync(config, 'utf8')).toBe(prior);
  });

  it('preserves an invalid JSONC server container byte-for-byte', async () => {
    const config = path.join(root, '.omp/mcp.json');
    fs.mkdirSync(path.dirname(config), { recursive: true });
    const prior = '{\n  "mcpServers": "custom"\n}\n';
    fs.writeFileSync(config, prior);

    await expect(registerRuntimeLocked(root, 'omp', getTargetPolicy('omp').defaultPaths))
      .rejects.toThrow('mcpServers must be an object');
    expect(fs.readFileSync(config, 'utf8')).toBe(prior);
  });

  it('preserves ambiguous duplicate governed JSONC keys byte-for-byte', async () => {
    const ompConfig = path.join(root, '.omp/mcp.json');
    fs.mkdirSync(path.dirname(ompConfig), { recursive: true });
    const duplicateServers = '{"mcpServers": {}, "mcpServers": {}}\n';
    fs.writeFileSync(ompConfig, duplicateServers);
    await expect(registerRuntimeLocked(root, 'omp', getTargetPolicy('omp').defaultPaths))
      .rejects.toThrow('Duplicate JSONC property root.mcpServers');
    expect(fs.readFileSync(ompConfig, 'utf8')).toBe(duplicateServers);

    const claudeConfig = path.join(root, '.mcp.json');
    const settings = path.join(root, '.claude/settings.json');
    fs.mkdirSync(path.dirname(settings), { recursive: true });
    const duplicatePermissions = '{"permissions": {}, "permissions": {}}\n';
    fs.writeFileSync(claudeConfig, '{}\n');
    fs.writeFileSync(settings, duplicatePermissions);
    await expect(registerRuntimeLocked(root, 'claude-code', getTargetPolicy('claude-code').defaultPaths))
      .rejects.toThrow('Duplicate JSONC property root.permissions');
    expect(fs.readFileSync(claudeConfig, 'utf8')).toBe('{}\n');
    expect(fs.readFileSync(settings, 'utf8')).toBe(duplicatePermissions);
  });

  it('appends one owned Codex block and preserves unrelated TOML bytes', async () => {
    const config = path.join(root, '.codex/config.toml');
    fs.mkdirSync(path.dirname(config), { recursive: true });
    const prior = '# user comment\nmodel = "gpt"\n';
    fs.writeFileSync(config, prior);

    const result = await registerRuntimeLocked(root, 'codex', getTargetPolicy('codex').defaultPaths);
    const next = fs.readFileSync(config, 'utf8');
    const parsed = parseToml(next) as { mcp_servers: Record<string, unknown> };
    expect(next.startsWith(prior)).toBe(true);
    expect(next.match(/^# >>> sdd-mcp managed runtime$/gm)).toHaveLength(1);
    expect(parsed.mcp_servers['sdd-mcp']).toEqual({
      command: 'npx',
      args: ['-y', `sdd-mcp-server@${packageVersion}`],
      required: true,
      default_tools_approval_mode: 'auto',
      startup_timeout_sec: 30,
    });
    expect(result.registration.managedRegionSha256).toMatch(/^[a-f0-9]{64}$/);
    const adopted = await registerRuntimeLocked(root, 'codex', getTargetPolicy('codex').defaultPaths);
    expect(adopted.skipped).toContain('.codex/config.toml');
  });

  it('preserves malformed and unmarked Codex configs byte-for-byte', async () => {
    const config = path.join(root, '.codex/config.toml');
    fs.mkdirSync(path.dirname(config), { recursive: true });
    const malformed = '[broken\n';
    fs.writeFileSync(config, malformed);
    await expect(registerRuntimeLocked(root, 'codex', getTargetPolicy('codex').defaultPaths)).rejects.toThrow('Malformed TOML');
    expect(fs.readFileSync(config, 'utf8')).toBe(malformed);

    const unmanaged = '[mcp_servers."sdd-mcp"]\ncommand = "custom"\n';
    fs.writeFileSync(config, unmanaged);
    await expect(registerRuntimeLocked(root, 'codex', getTargetPolicy('codex').defaultPaths))
      .rejects.toMatchObject({ configPath: config, reason: 'unmanaged-entry' });
    expect(fs.readFileSync(config, 'utf8')).toBe(unmanaged);
  });
  it('does not adopt a complete but unowned Codex marker region with different bytes', async () => {
    const config = path.join(root, '.codex/config.toml');
    fs.mkdirSync(path.dirname(config), { recursive: true });
    const unowned = [
      '# >>> sdd-mcp managed runtime',
      '[mcp_servers."sdd-mcp"]',
      'command = "custom"',
      '# <<< sdd-mcp managed runtime',
      '',
    ].join('\n');
    fs.writeFileSync(config, unowned);

    await expect(registerRuntimeLocked(root, 'codex', getTargetPolicy('codex').defaultPaths))
      .rejects.toMatchObject({ configPath: config, reason: 'unowned-region' });
    expect(fs.readFileSync(config, 'utf8')).toBe(unowned);
  });

  it.each(['omp', 'codex'] as const)('classifies modified owned %s entries without writing', async target => {
    const paths = getTargetPolicy(target).defaultPaths;
    const config = path.join(root, paths.runtimeConfig);
    const initial = await registerRuntimeLocked(root, target, paths);
    const edited = fs.readFileSync(config, 'utf8').replace('npx', 'custom');
    fs.writeFileSync(config, edited);
    await expect(registerRuntimeLocked(root, target, paths, initial.registration))
      .rejects.toMatchObject({ configPath: config, reason: 'modified-entry' });
    expect(fs.readFileSync(config, 'utf8')).toBe(edited);
  });

  it('keeps malformed configuration failures distinct from ownership conflicts', async () => {
    const paths = getTargetPolicy('omp').defaultPaths;
    const config = path.join(root, paths.runtimeConfig);
    fs.mkdirSync(path.dirname(config), { recursive: true });
    fs.writeFileSync(config, '{');
    const error = await registerRuntimeLocked(root, 'omp', paths).catch(error => error);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(RuntimeRegistrationConflictError);
    expect(fs.readFileSync(config, 'utf8')).toBe('{');
  });

  it.each(['omp', 'codex'] as const)('exposes a typed refusal for unmanaged and modified %s entries', async target => {
    const paths = getTargetPolicy(target).defaultPaths;
    const config = path.join(root, paths.runtimeConfig);
    const installed = await registerRuntimeLocked(root, target, paths);
    const owned = fs.readFileSync(config, 'utf8');
    const edited = owned.replace('npx', 'custom');
    fs.writeFileSync(config, edited);
    await expect(registerRuntimeLocked(root, target, paths, installed.registration))
      .rejects.toBeInstanceOf(RuntimeRegistrationConflictError);
    await expect(registerRuntimeLocked(root, target, paths))
      .rejects.toBeInstanceOf(RuntimeRegistrationConflictError);
    expect(fs.readFileSync(config, 'utf8')).toBe(edited);
    if (target === 'codex') {
      const unmarked = owned.split('\n').filter(line => !line.startsWith('#')).join('\n');
      fs.writeFileSync(config, unmarked);
      const error = await registerRuntimeLocked(root, target, paths).catch(error => error);
      expect(error).toBeInstanceOf(RuntimeRegistrationConflictError);
      expect(error.reason).toBe('unmanaged-entry');
      expect(fs.readFileSync(config, 'utf8')).toBe(unmarked);
    }
  });

  it.each([
    ['omp', '{"mcpServers":{},"mcpServers":{}}'],
    ['codex', '[broken'],
    ['codex', '# >>> sdd-mcp managed runtime\n'],
    ['codex', '# >>> sdd-mcp managed runtime\n# <<< sdd-mcp managed runtime\n# >>> sdd-mcp managed runtime\n# <<< sdd-mcp managed runtime\n'],
  ] as const)('keeps structural %s failures out of the conflict taxonomy', async (target, prior) => {
    const paths = getTargetPolicy(target).defaultPaths;
    const config = path.join(root, paths.runtimeConfig);
    fs.mkdirSync(path.dirname(config), { recursive: true });
    fs.writeFileSync(config, prior);
    const error = await registerRuntimeLocked(root, target, paths).catch(error => error);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(RuntimeRegistrationConflictError);
    expect(fs.readFileSync(config, 'utf8')).toBe(prior);
  });

  it('distinguishes I/O and concurrent commit failures from ownership refusals', async () => {
    const paths = getTargetPolicy('omp').defaultPaths;
    const config = path.join(root, paths.runtimeConfig);
    fs.mkdirSync(config, { recursive: true });
    const ioError = await registerRuntimeLocked(root, 'omp', paths).catch(error => error);
    expect(ioError).toMatchObject({ code: 'EISDIR' });
    expect(ioError).not.toBeInstanceOf(RuntimeRegistrationConflictError);
    fs.rmdirSync(config);
    const editorBytes = '{"editor":true}';
    const registration = await registerRuntimeLocked(root, 'omp', paths);
    fs.writeFileSync(config, editorBytes);
    const error = await registration.verify().catch(error => error);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(RuntimeRegistrationConflictError);
    expect(fs.readFileSync(config, 'utf8')).toBe(editorBytes);
  });

});
