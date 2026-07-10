import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { updateGeneratedIgnores } from '../../../cli/utils/gitignore-manager';

describe('updateGeneratedIgnores', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-ignore-'));
  });

  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('creates a managed block for a missing file', async () => {
    const result = await updateGeneratedIgnores(root, ['.agents/', '.codex/']);
    expect(result.status).toBe('created');
    expect(fs.readFileSync(path.join(root, '.gitignore'), 'utf8')).toContain('.codex/');
  });

  it('preserves user content and is idempotent', async () => {
    const file = path.join(root, '.gitignore');
    fs.writeFileSync(file, '# user\nnode_modules/\n');
    await updateGeneratedIgnores(root, ['.claude/']);
    const first = fs.readFileSync(file, 'utf8');
    const secondResult = await updateGeneratedIgnores(root, ['.claude/']);
    expect(fs.readFileSync(file, 'utf8')).toBe(first);
    expect(secondResult.status).toBe('unchanged');
    expect(first.startsWith('# user\nnode_modules/\n')).toBe(true);
  });

  it('does not duplicate equivalent existing patterns', async () => {
    const file = path.join(root, '.gitignore');
    fs.writeFileSync(file, '/.codex\n');
    await updateGeneratedIgnores(root, ['.codex/']);
    const matches = fs.readFileSync(file, 'utf8').match(/\.codex/g) ?? [];
    expect(matches).toHaveLength(1);
  });

  it('preserves CRLF newlines', async () => {
    const file = path.join(root, '.gitignore');
    fs.writeFileSync(file, 'node_modules/\r\n');
    await updateGeneratedIgnores(root, ['.claude/']);
    const content = fs.readFileSync(file, 'utf8');
    expect(content).toContain('\r\n# BEGIN');
    expect(content.replace(/\r\n/g, '')).not.toContain('\n');
  });
});
