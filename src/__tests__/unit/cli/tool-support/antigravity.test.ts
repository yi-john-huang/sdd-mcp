import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createAntigravitySymlinks } from '../../../../cli/tool-support/antigravity';

describe('createAntigravitySymlinks', () => {
  let tmpDir: string;
  let consoleSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-antigravity-test-'));
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    // Create the canonical .claude/ directories that symlinks will point to
    fs.mkdirSync(path.join(tmpDir, '.claude', 'skills'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.claude', 'rules'), { recursive: true });
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should create .agent/ directory', async () => {
    await createAntigravitySymlinks(tmpDir);

    expect(fs.existsSync(path.join(tmpDir, '.agent'))).toBe(true);
  });

  it('should create workflows symlink pointing to .claude/skills', async () => {
    await createAntigravitySymlinks(tmpDir);

    const linkPath = path.join(tmpDir, '.agent', 'workflows');
    expect(fs.lstatSync(linkPath).isSymbolicLink()).toBe(true);

    const target = fs.readlinkSync(linkPath);
    expect(target).toBe(path.join('..', '.claude', 'skills'));
  });

  it('should create rules symlink pointing to .claude/rules', async () => {
    await createAntigravitySymlinks(tmpDir);

    const linkPath = path.join(tmpDir, '.agent', 'rules');
    expect(fs.lstatSync(linkPath).isSymbolicLink()).toBe(true);

    const target = fs.readlinkSync(linkPath);
    expect(target).toBe(path.join('..', '.claude', 'rules'));
  });

  it('should resolve symlinks to actual directories', async () => {
    // Add a file to .claude/skills to verify symlink works
    fs.writeFileSync(path.join(tmpDir, '.claude', 'skills', 'test.md'), 'test');

    await createAntigravitySymlinks(tmpDir);

    const files = fs.readdirSync(path.join(tmpDir, '.agent', 'workflows'));
    expect(files).toContain('test.md');
  });

  it('should skip existing correct symlinks', async () => {
    // Run twice
    await createAntigravitySymlinks(tmpDir);
    await createAntigravitySymlinks(tmpDir);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('already exists'));
  });

  it('should skip existing regular directories', async () => {
    // Create a real directory where the symlink would go
    fs.mkdirSync(path.join(tmpDir, '.agent', 'workflows'), { recursive: true });

    await createAntigravitySymlinks(tmpDir);

    // Should warn and not replace the directory
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('regular directory'));
    expect(fs.lstatSync(path.join(tmpDir, '.agent', 'workflows')).isSymbolicLink()).toBe(false);
  });

  it('should warn when replacing a symlink pointing elsewhere', async () => {
    // Create .agent/ with a symlink pointing to a different target
    fs.mkdirSync(path.join(tmpDir, '.agent'), { recursive: true });
    fs.symlinkSync('/some/other/path', path.join(tmpDir, '.agent', 'workflows'), 'dir');

    await createAntigravitySymlinks(tmpDir);

    // Should have warned about the replacement
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('replacing with'));
    // Should have replaced with the correct symlink
    const target = fs.readlinkSync(path.join(tmpDir, '.agent', 'workflows'));
    expect(target).toBe(path.join('..', '.claude', 'skills'));
  });

  it('should handle .agent/ directory already existing', async () => {
    fs.mkdirSync(path.join(tmpDir, '.agent'), { recursive: true });

    await createAntigravitySymlinks(tmpDir);

    // Should still create symlinks inside it
    expect(fs.lstatSync(path.join(tmpDir, '.agent', 'workflows')).isSymbolicLink()).toBe(true);
  });
});
