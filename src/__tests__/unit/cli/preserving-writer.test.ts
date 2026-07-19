import * as fs from 'fs';
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
  it('recovers an abandoned manifest lock before installing again', async () => {
    const stateRoot = path.join(root, '.sdd-mcp');
    const lockPath = path.join(stateRoot, 'install-manifest.lock');
    fs.mkdirSync(stateRoot, { recursive: true });
    fs.writeFileSync(lockPath, 'abandoned');
    const old = new Date(Date.now() - 60_000);
    fs.utimesSync(lockPath, old, old);
    writer.beginTarget('omp', 'lean', ['skills']);

    await expect(writer.finalizeTarget('omp')).resolves.toEqual([]);
    expect(fs.existsSync(lockPath)).toBe(false);
    expect(fs.existsSync(path.join(stateRoot, 'install-manifest.json'))).toBe(true);
  });
});
