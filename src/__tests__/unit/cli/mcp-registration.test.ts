import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { parse as parseJsonc } from 'jsonc-parser';
import { parse as parseToml } from 'smol-toml';
import { getTargetPolicy } from '../../../cli/install-target';
import { registerRuntimeLocked } from '../../../cli/tool-support/mcp-registration';

describe('MCP runtime registration', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-runtime-'));
  });

  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

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
      type: 'stdio', command: 'npx', args: ['-y', 'sdd-mcp-server@5.0.0'],
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
      .rejects.toThrow('Conflicting unmanaged runtime server');
    expect(fs.readFileSync(config, 'utf8')).toBe(prior);
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
      args: ['-y', 'sdd-mcp-server@5.0.0'],
      required: true,
      default_tools_approval_mode: 'auto',
      startup_timeout_sec: 30,
    });
    expect(result.registration.managedRegionSha256).toMatch(/^[a-f0-9]{64}$/);
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
    await expect(registerRuntimeLocked(root, 'codex', getTargetPolicy('codex').defaultPaths)).rejects.toThrow('Unmanaged sdd-mcp');
    expect(fs.readFileSync(config, 'utf8')).toBe(unmanaged);
  });
});
