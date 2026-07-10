import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PreservingWriter, validateChildName } from '../../../cli/utils/preserving-writer';

describe('PreservingWriter', () => {
  let root: string;
  let writer: PreservingWriter;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-writer-'));
    writer = new PreservingWriter();
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

  it('rejects unsafe generated child names', () => {
    expect(() => validateChildName('../escape')).toThrow();
    expect(() => validateChildName('nested/file')).toThrow();
    expect(() => validateChildName('safe-name')).not.toThrow();
  });
});
