import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FileSystemPort } from '../../../domain/ports';
import { readProjectConfig } from '../../../application/services/ProjectConfig';

type StatResult = Awaited<ReturnType<FileSystemPort['stat']>>;

/** In-memory port that records every method call and rejects anything but reads. */
class RecordingFileSystem implements FileSystemPort {
  readonly calls: string[] = [];
  constructor(private readonly files: Map<string, string>, private readonly directories = new Set<string>()) {}
  async readFile(target: string): Promise<string> {
    this.calls.push('readFile');
    const content = this.files.get(target);
    if (content === undefined) throw new Error('ENOENT');
    return content;
  }
  async exists(target: string): Promise<boolean> {
    this.calls.push('exists');
    return this.files.has(target) || this.directories.has(target);
  }
  async stat(target: string): Promise<StatResult> {
    this.calls.push('stat');
    if (this.directories.has(target)) return { isFile: () => false, isDirectory: () => true };
    const content = this.files.get(target);
    if (content === undefined) throw new Error('ENOENT');
    return { isFile: () => true, isDirectory: () => false, size: Buffer.byteLength(content) };
  }
  async writeFile(): Promise<void> { this.calls.push('writeFile'); throw new Error('write is not allowed'); }
  async mkdir(): Promise<void> { this.calls.push('mkdir'); throw new Error('mkdir is not allowed'); }
  async readdir(): Promise<string[]> { this.calls.push('readdir'); throw new Error('readdir is not allowed'); }
}

const ROOT = path.resolve('/project');
const CONFIG_PATH = path.join(ROOT, '.spec', 'sdd-config.json');

describe('readProjectConfig', () => {
  describe('through a FileSystemPort', () => {
    it('should return the parsed object and use only exists, stat, and readFile', async () => {
      const port = new RecordingFileSystem(new Map([[CONFIG_PATH, '{"jev":{"enabled":true},"evidence":{"mode":"verified"}}']]));
      await expect(readProjectConfig(ROOT, port)).resolves.toEqual({ jev: { enabled: true }, evidence: { mode: 'verified' } });
      expect(new Set(port.calls)).toEqual(new Set(['exists', 'stat', 'readFile']));
    });

    it('should return undefined without reading when the file is missing', async () => {
      const port = new RecordingFileSystem(new Map());
      await expect(readProjectConfig(ROOT, port)).resolves.toBeUndefined();
      expect(port.calls).toEqual(['exists']);
    });

    it('should return undefined when the path is a directory', async () => {
      const port = new RecordingFileSystem(new Map(), new Set([CONFIG_PATH]));
      await expect(readProjectConfig(ROOT, port)).resolves.toBeUndefined();
      expect(port.calls).not.toContain('readFile');
    });

    it('should return undefined without reading when the file is over 16 KB', async () => {
      const port = new RecordingFileSystem(new Map([[CONFIG_PATH, `{"pad":"${'x'.repeat(16 * 1024)}"}`]]));
      await expect(readProjectConfig(ROOT, port)).resolves.toBeUndefined();
      expect(port.calls).not.toContain('readFile');
    });

    it.each([
      ['invalid JSON', '{nope'],
      ['a JSON array', '[1,2]'],
      ['a JSON string', '"x"'],
      ['a JSON number', '42'],
      ['null', 'null'],
    ])('should return undefined for %s', async (_name, content) => {
      const port = new RecordingFileSystem(new Map([[CONFIG_PATH, content]]));
      await expect(readProjectConfig(ROOT, port)).resolves.toBeUndefined();
    });

    it('should return undefined when the port throws', async () => {
      const port = new RecordingFileSystem(new Map([[CONFIG_PATH, '{}']]));
      port.readFile = async () => { throw new Error('EACCES'); };
      await expect(readProjectConfig(ROOT, port)).resolves.toBeUndefined();
    });
  });

  describe('without a port', () => {
    let root: string;
    beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'project-config-')); });
    afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

    it('should read the file from disk and create nothing when it is missing', async () => {
      await expect(readProjectConfig(root)).resolves.toBeUndefined();
      expect(fs.readdirSync(root)).toEqual([]);
      fs.mkdirSync(path.join(root, '.spec'));
      fs.writeFileSync(path.join(root, '.spec', 'sdd-config.json'), '{"evidence":{"timeoutMs":30000}}');
      await expect(readProjectConfig(root)).resolves.toEqual({ evidence: { timeoutMs: 30000 } });
    });
  });
});
