import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BaseManager, type ComponentDescriptor } from '../../../shared/BaseManager';

class DirectoryManager extends BaseManager<ComponentDescriptor> {
  constructor(componentPath: string) {
    super({
      componentPath,
      structureType: 'directory',
      mainFileName: 'SKILL.md',
    });
  }

  protected parseMetadata(content: string, filePath: string): ComponentDescriptor {
    return {
      name: path.basename(path.dirname(filePath)),
      description: content,
      path: filePath,
    };
  }
}

describe('BaseManager preserve-first directory installation', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-base-manager-'));
  });

  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('reports an existing directory component as skipped when every file is preserved', async () => {
    const source = path.join(root, 'source');
    const target = path.join(root, 'target');
    const sourceFile = path.join(source, 'component', 'SKILL.md');
    const targetFile = path.join(target, 'component', 'SKILL.md');
    fs.mkdirSync(path.dirname(sourceFile), { recursive: true });
    fs.mkdirSync(path.dirname(targetFile), { recursive: true });
    fs.writeFileSync(sourceFile, 'source content');
    fs.writeFileSync(targetFile, 'user content');

    const result = await new DirectoryManager(source).installComponents(target);

    expect(result.installed).toEqual([]);
    expect(result.skipped).toEqual(['component']);
    expect(result.failed).toEqual([]);
    expect(fs.readFileSync(targetFile, 'utf8')).toBe('user content');
  });
});
