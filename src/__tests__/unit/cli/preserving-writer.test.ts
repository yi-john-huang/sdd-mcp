import * as fs from 'fs';
import * as crypto from 'crypto';
import * as os from 'os';
import * as path from 'path';
import { PreservingWriter, validateChildName } from '../../../cli/utils/preserving-writer';

describe('PreservingWriter', () => {
  let root: string;
  let writer: PreservingWriter;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-writer-'));
    writer = new PreservingWriter(root);
  });

  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('creates missing files and preserves existing files', async () => {
    const file = path.join(root, 'nested', 'file.txt');
    await expect(writer.writeIfAbsent(file, 'first')).resolves.toBe('installed');
    await expect(writer.writeIfAbsent(file, 'second')).resolves.toBe('skipped');
    expect(fs.readFileSync(file, 'utf8')).toBe('first');
  });

  it('copies a tree without replacing existing resources', async () => {
    const source = path.join(root, 'source');
    const destination = path.join(root, 'destination');
    fs.mkdirSync(source);
    fs.mkdirSync(destination);
    fs.writeFileSync(path.join(source, 'a.txt'), 'new-a');
    fs.writeFileSync(path.join(source, 'b.txt'), 'new-b');
    fs.writeFileSync(path.join(destination, 'a.txt'), 'user-a');

    const result = await writer.copyTreePreserving(source, destination);
    expect(fs.readFileSync(path.join(destination, 'a.txt'), 'utf8')).toBe('user-a');
    expect(fs.readFileSync(path.join(destination, 'b.txt'), 'utf8')).toBe('new-b');
    expect(result.skipped).toContain('a.txt');
    expect(result.installed).toContain('b.txt');
  });
  it('rejects symlinked destination roots', async () => {
    const source = path.join(root, 'source');
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-writer-outside-'));
    const destination = path.join(root, 'linked');
    fs.mkdirSync(source);
    fs.writeFileSync(path.join(source, 'new.txt'), 'new content');
    fs.symlinkSync(outside, destination, 'dir');

    try {
      await expect(writer.copyTreePreserving(source, destination)).rejects.toThrow('symlink');
      expect(fs.readdirSync(outside)).toEqual([]);
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });
  it('rejects a symlinked installer state directory before locking', async () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-writer-state-'));
    fs.symlinkSync(outside, path.join(root, '.sdd-mcp'), 'dir');
    try {
      await expect(writer.withInstallLock(async () => undefined))
        .rejects.toThrow('traverses symlink');
      expect(fs.readdirSync(outside)).toEqual([]);
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it('rejects destinations outside the project root', async () => {
    const outside = path.join(root, '..', 'outside.txt');

    await expect(writer.writeIfAbsent(outside, 'blocked')).rejects.toThrow('outside project root');
    expect(fs.existsSync(outside)).toBe(false);
  });

  it('rejects unsafe generated child names', () => {
    expect(() => validateChildName('../escape')).toThrow();
    expect(() => validateChildName('nested/file')).toThrow();
    expect(() => validateChildName('safe-name')).not.toThrow();
  });

  it('adopts identical legacy output but reports modified unmanaged output', async () => {
    const adopted = path.join(root, '.agents/skills/a/SKILL.md');
    const custom = path.join(root, '.agents/skills/b/SKILL.md');
    fs.mkdirSync(path.dirname(adopted), { recursive: true });
    fs.mkdirSync(path.dirname(custom), { recursive: true });
    fs.writeFileSync(adopted, 'same');
    fs.writeFileSync(custom, 'user');
    writer.beginTarget('codex', 'lean', ['skills']);

    await expect(writer.writeManaged('codex', 'skills', 'a', adopted, 'same'))
      .resolves.toEqual({ outcome: 'skipped' });
    await expect(writer.writeManaged('codex', 'skills', 'b', custom, 'generated'))
      .resolves.toMatchObject({ outcome: 'skipped', conflict: { reason: 'legacy-unmanaged' } });
    await writer.finalizeTarget('codex');
    expect(fs.readFileSync(custom, 'utf8')).toBe('user');
    const manifest = JSON.parse(fs.readFileSync(path.join(root, '.sdd-mcp/install-manifest.json'), 'utf8'));
    expect(manifest.targets.codex.files['.agents/skills/a/SKILL.md']).toBeDefined();
    expect(manifest.targets.codex.files['.agents/skills/b/SKILL.md']).toBeUndefined();
  });

  it('updates unchanged managed output and preserves modified managed output', async () => {
    const file = path.join(root, '.omp/AGENTS.md');
    writer.beginTarget('omp', 'lean', ['skills']);
    await writer.writeManaged('omp', 'root', 'AGENTS.md', file, 'v1');
    await writer.finalizeTarget('omp');

    const upgrade = new PreservingWriter(root);
    upgrade.beginTarget('omp', 'full', ['skills']);
    await expect(upgrade.writeManaged('omp', 'root', 'AGENTS.md', file, 'v2'))
      .resolves.toEqual({ outcome: 'installed' });
    await upgrade.finalizeTarget('omp');
    fs.writeFileSync(file, 'user');

    const conflict = new PreservingWriter(root);
    conflict.beginTarget('omp', 'full', ['skills']);
    await expect(conflict.writeManaged('omp', 'root', 'AGENTS.md', file, 'v3'))
      .resolves.toMatchObject({ conflict: { reason: 'modified' } });
    expect(fs.readFileSync(file, 'utf8')).toBe('user');
    await conflict.finalizeTarget('omp');
    const manifest = JSON.parse(fs.readFileSync(path.join(root, '.sdd-mcp/install-manifest.json'), 'utf8'));
    expect(manifest.targets.omp.files['.omp/AGENTS.md'].sha256)
      .toBe(crypto.createHash('sha256').update('v2').digest('hex'));
  });

  it('removes unchanged obsolete output and preserves modified obsolete output', async () => {
    const old = path.join(root, '.claude/rules/old.md');
    const changed = path.join(root, '.claude/rules/changed.md');
    writer.beginTarget('claude-code', 'full', ['rules']);
    await writer.writeManaged('claude-code', 'rules', 'old', old, 'old');
    await writer.writeManaged('claude-code', 'rules', 'changed', changed, 'old');
    await writer.finalizeTarget('claude-code');
    fs.writeFileSync(changed, 'user');

    const upgrade = new PreservingWriter(root);
    upgrade.beginTarget('claude-code', 'full', ['rules']);
    const conflicts = await upgrade.finalizeTarget('claude-code');
    expect(fs.existsSync(old)).toBe(false);
    expect(fs.readFileSync(changed, 'utf8')).toBe('user');
    expect(conflicts).toEqual([expect.objectContaining({ reason: 'obsolete-modified' })]);
  });

  it('refreshes selected output with backups and removes legacy tombstones', async () => {
    const file = path.join(root, '.claude/skills/a/SKILL.md');
    const tombstone = path.join(root, '.claude/rules/sdd-workflow.md');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.mkdirSync(path.dirname(tombstone), { recursive: true });
    fs.writeFileSync(file, 'user');
    fs.writeFileSync(tombstone, 'legacy');
    writer.beginTarget('claude-code', 'full', ['skills', 'rules'], true);
    await writer.writeManaged('claude-code', 'skills', 'a', file, 'generated');
    await writer.finalizeTarget('claude-code');

    expect(fs.readFileSync(file, 'utf8')).toBe('generated');
    expect(fs.existsSync(tombstone)).toBe(false);
    const backupRoot = path.join(root, '.sdd-mcp/backups');
    expect(fs.readdirSync(backupRoot)).toHaveLength(1);
  });

  it('retains ownership for components omitted by a narrower rerun', async () => {
    const skill = path.join(root, '.omp/skills/a/SKILL.md');
    const context = path.join(root, '.omp/contexts/a.md');
    writer.beginTarget('omp', 'full', ['skills', 'contexts']);
    await writer.writeManaged('omp', 'skills', 'a', skill, 'skill');
    await writer.writeManaged('omp', 'contexts', 'a', context, 'context');
    await writer.finalizeTarget('omp');

    const lean = new PreservingWriter(root);
    lean.beginTarget('omp', 'lean', ['skills']);
    await lean.writeManaged('omp', 'skills', 'a', skill, 'skill');
    await lean.finalizeTarget('omp');

    const manifest = JSON.parse(fs.readFileSync(path.join(root, '.sdd-mcp/install-manifest.json'), 'utf8'));
    expect(manifest.targets.omp.files['.omp/contexts/a.md']).toBeDefined();
    expect(fs.readFileSync(context, 'utf8')).toBe('context');
  });

  it('merges concurrent target ownership records without replacement', async () => {
    const codex = new PreservingWriter(root);
    const omp = new PreservingWriter(root);
    codex.beginTarget('codex', 'lean', ['skills']);
    omp.beginTarget('omp', 'lean', ['skills']);
    await codex.writeManaged('codex', 'skills', 'a', path.join(root, '.agents/a'), 'a');
    await omp.writeManaged('omp', 'skills', 'b', path.join(root, '.omp/b'), 'b');
    await Promise.all([codex.finalizeTarget('codex'), omp.finalizeTarget('omp')]);

    const manifest = JSON.parse(fs.readFileSync(path.join(root, '.sdd-mcp/install-manifest.json'), 'utf8'));
    expect(Object.keys(manifest.targets).sort()).toEqual(['codex', 'omp']);
  });
  it.each([
    ['unknown target', {
      schemaVersion: 2,
      targets: { editor: { profile: 'lean', packageVersion: '5.0.0', rendererVersion: 5, files: {}, registrations: [] } },
      shared: {},
    }],
    ['invalid ownership hash', {
      schemaVersion: 2,
      targets: { omp: { profile: 'lean', packageVersion: '5.0.0', rendererVersion: 5, files: { '.omp/a': { sha256: 'bad', component: 'skills' } }, registrations: [] } },
      shared: {},
    }],
    ['escaping ownership path', {
      schemaVersion: 2,
      targets: { omp: { profile: 'lean', packageVersion: '5.0.0', rendererVersion: 5, files: { '../outside': { sha256: 'a'.repeat(64), component: 'skills' } }, registrations: [] } },
      shared: {},
    }],
    ['unknown schema field', {
      schemaVersion: 2,
      targets: {},
      shared: {},
      futureOwnership: true,
    }],
  ])('rejects a manifest with %s before writing guidance', async (_label, manifest) => {
    const stateRoot = path.join(root, '.sdd-mcp');
    const generated = path.join(root, '.omp/skills/example/SKILL.md');
    fs.mkdirSync(stateRoot, { recursive: true });
    fs.writeFileSync(path.join(stateRoot, 'install-manifest.json'), JSON.stringify(manifest));
    writer.beginTarget('omp', 'lean', ['skills']);

    await expect(writer.writeManaged('omp', 'skills', 'example/SKILL.md', generated, 'generated'))
      .rejects.toThrow();
    expect(fs.existsSync(generated)).toBe(false);
  });

  it('upgrades a v1 manifest without losing existing file ownership', async () => {
    const managed = path.join(root, '.omp/skills/example/SKILL.md');
    const content = 'managed\n';
    fs.mkdirSync(path.dirname(managed), { recursive: true });
    fs.writeFileSync(managed, content);
    const digest = crypto.createHash('sha256').update(content).digest('hex');
    const stateRoot = path.join(root, '.sdd-mcp');
    fs.mkdirSync(stateRoot, { recursive: true });
    fs.writeFileSync(path.join(stateRoot, 'install-manifest.json'), JSON.stringify({
      schemaVersion: 1,
      targets: {
        omp: {
          profile: 'lean',
          packageVersion: '4.0.0',
          rendererVersion: 4,
          files: { '.omp/skills/example/SKILL.md': { sha256: digest, component: 'skills' } },
        },
      },
      shared: {},
    }));
    writer.beginTarget('omp', 'lean', ['skills']);
    await writer.writeManaged('omp', 'skills', 'example/SKILL.md', managed, content);

    await writer.finalizeTarget('omp');

    const manifest = JSON.parse(fs.readFileSync(path.join(stateRoot, 'install-manifest.json'), 'utf8'));
    expect(manifest.schemaVersion).toBe(2);
    expect(manifest.targets.omp.files['.omp/skills/example/SKILL.md']).toEqual({
      sha256: digest,
      component: 'skills',
    });
    expect(manifest.targets.omp.registrations).toHaveLength(1);
  });

  it('rolls back generated files when runtime registration fails', async () => {
    const generated = path.join(root, '.omp/skills/example/SKILL.md');
    const runtimeConfig = path.join(root, '.omp/mcp.json');
    fs.mkdirSync(path.dirname(runtimeConfig), { recursive: true });
    fs.writeFileSync(runtimeConfig, '{ invalid json');
    writer.beginTarget('omp', 'lean', ['skills']);
    await writer.writeManaged('omp', 'skills', 'example/SKILL.md', generated, 'generated');

    await expect(writer.finalizeTarget('omp')).rejects.toThrow();
    expect(fs.existsSync(generated)).toBe(false);
    expect(fs.readFileSync(runtimeConfig, 'utf8')).toBe('{ invalid json');
    expect(fs.existsSync(path.join(root, '.sdd-mcp/install-manifest.json'))).toBe(false);
  });

  it('refuses manifest ownership when a managed file changes before commit', async () => {
    const generated = path.join(root, '.omp/skills/example/SKILL.md');
    const runtimeConfig = path.join(root, '.omp/mcp.json');
    const manifestPath = path.join(root, '.sdd-mcp/install-manifest.json');
    writer.beginTarget('omp', 'lean', ['skills']);
    await writer.writeManaged('omp', 'skills', 'example/SKILL.md', generated, 'generated');
    let edited = false;
    const assertHeld = async (): Promise<void> => {
      if (!edited && fs.existsSync(runtimeConfig)) {
        edited = true;
        fs.writeFileSync(generated, 'editor change');
      }
    };

    await expect(writer.finalizeTargetLocked('omp', assertHeld)).rejects.toThrow();
    expect(fs.readFileSync(generated, 'utf8')).toBe('editor change');
    expect(fs.existsSync(runtimeConfig)).toBe(false);
    expect(fs.existsSync(manifestPath)).toBe(false);
  });

  it('preserves an editor change to runtime config before manifest commit', async () => {
    const generated = path.join(root, '.omp/skills/example/SKILL.md');
    const runtimeConfig = path.join(root, '.omp/mcp.json');
    const manifestPath = path.join(root, '.sdd-mcp/install-manifest.json');
    writer.beginTarget('omp', 'lean', ['skills']);
    await writer.writeManaged('omp', 'skills', 'example/SKILL.md', generated, 'generated');
    let edited = false;
    const editorBytes = '{"editor":true}\n';
    const assertHeld = async (): Promise<void> => {
      if (!edited && fs.existsSync(runtimeConfig)) {
        edited = true;
        fs.writeFileSync(runtimeConfig, editorBytes);
      }
    };

    await expect(writer.finalizeTargetLocked('omp', assertHeld)).rejects.toThrow();
    expect(fs.readFileSync(runtimeConfig, 'utf8')).toBe(editorBytes);
    expect(fs.existsSync(manifestPath)).toBe(false);
    expect(fs.existsSync(generated)).toBe(false);
  });

  it('rolls back unchanged partials when manifest remains at prior bytes', async () => {
    const generated = path.join(root, '.omp/skills/example/SKILL.md');
    const runtimeConfig = path.join(root, '.omp/mcp.json');
    const manifestPath = path.join(root, '.sdd-mcp/install-manifest.json');
    writer.beginTarget('omp', 'lean', ['skills']);
    await writer.writeManaged('omp', 'skills', 'example/SKILL.md', generated, 'generated');
    let runtimeAssertions = 0;
    let injected = false;
    const assertHeld = async (): Promise<void> => {
      if (fs.existsSync(runtimeConfig)) runtimeAssertions += 1;
      if (!injected && runtimeAssertions === 2) {
        injected = true;
        throw new Error('injected pre-manifest failure');
      }
    };

    await expect(writer.finalizeTargetLocked('omp', assertHeld))
      .rejects.toThrow('injected pre-manifest failure');
    expect(fs.existsSync(manifestPath)).toBe(false);
    expect(fs.existsSync(runtimeConfig)).toBe(false);
    expect(fs.existsSync(generated)).toBe(false);
  });

  it('keeps committed bytes and reports a warning when manifest reaches next bytes', async () => {
    const generated = path.join(root, '.omp/skills/example/SKILL.md');
    const runtimeConfig = path.join(root, '.omp/mcp.json');
    const manifestPath = path.join(root, '.sdd-mcp/install-manifest.json');
    writer.beginTarget('omp', 'lean', ['skills']);
    await writer.writeManaged('omp', 'skills', 'example/SKILL.md', generated, 'generated');
    let injected = false;
    const assertHeld = async (): Promise<void> => {
      if (!injected && fs.existsSync(manifestPath)) {
        injected = true;
        throw new Error('injected post-manifest failure');
      }
    };

    await expect(writer.finalizeTargetLocked('omp', assertHeld)).resolves.toEqual([]);
    expect(writer.takeRuntimeResult('omp').warnings).toEqual([
      expect.stringContaining('injected post-manifest failure'),
    ]);
    expect(fs.existsSync(manifestPath)).toBe(true);
    expect(fs.existsSync(runtimeConfig)).toBe(true);
    expect(fs.existsSync(generated)).toBe(true);
  });

  it('preserves installer partials when manifest bytes become unknown', async () => {
    const generated = path.join(root, '.omp/skills/example/SKILL.md');
    const runtimeConfig = path.join(root, '.omp/mcp.json');
    const manifestPath = path.join(root, '.sdd-mcp/install-manifest.json');
    writer.beginTarget('omp', 'lean', ['skills']);
    await writer.writeManaged('omp', 'skills', 'example/SKILL.md', generated, 'generated');
    let injected = false;
    const assertHeld = async (): Promise<void> => {
      if (!injected && fs.existsSync(runtimeConfig)) {
        injected = true;
        fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
        fs.writeFileSync(manifestPath, 'external manifest edit\n');
      }
    };

    await expect(writer.finalizeTargetLocked('omp', assertHeld))
      .rejects.toThrow('manifest changed to unknown bytes');
    expect(fs.readFileSync(manifestPath, 'utf8')).toBe('external manifest edit\n');
    expect(fs.existsSync(runtimeConfig)).toBe(true);
    expect(fs.existsSync(generated)).toBe(true);
  });

  it('reports a release failure as a warning after manifest commit', async () => {
    const generated = path.join(root, '.omp/skills/example/SKILL.md');
    writer.beginTarget('omp', 'lean', ['skills']);
    const report = await writer.withInstallLock(async () => {
      await writer.writeManaged('omp', 'skills', 'example/SKILL.md', generated, 'generated');
      await writer.finalizeTarget('omp');
      fs.writeFileSync(path.join(root, '.sdd-mcp/install.lock'), JSON.stringify({
        token: 'replacement',
        pid: process.pid,
        hostname: os.hostname(),
      }));
      return { warnings: [] as string[] };
    });

    expect(report.warnings).toEqual([
      expect.stringContaining('Installation committed, but install lock release reported an error'),
    ]);
    expect(fs.existsSync(generated)).toBe(true);
    expect(fs.existsSync(path.join(root, '.sdd-mcp/install-manifest.json'))).toBe(true);
  });

  it('recovers a dead owner lock before installing again', async () => {
    const stateRoot = path.join(root, '.sdd-mcp');
    const lockPath = path.join(stateRoot, 'install.lock');
    fs.mkdirSync(stateRoot, { recursive: true });
    fs.writeFileSync(lockPath, JSON.stringify({ token: 'dead-owner', pid: 2_147_483_647, hostname: os.hostname() }));
    writer.beginTarget('omp', 'lean', ['skills']);

    await expect(writer.finalizeTarget('omp')).resolves.toEqual([]);
    expect(fs.existsSync(lockPath)).toBe(false);
    expect(fs.existsSync(path.join(stateRoot, 'install-manifest.json'))).toBe(true);
  });
});
