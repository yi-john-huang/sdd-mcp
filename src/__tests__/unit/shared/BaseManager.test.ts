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
class FileManager extends BaseManager<ComponentDescriptor> {
  constructor(componentPath: string) {
    super({
      componentPath,
      structureType: 'file',
      fileExtension: '.md',
    });
  }

  protected parseMetadata(content: string, filePath: string): ComponentDescriptor {
    const metadata = this.parseYamlFrontmatter(content);
    return {
      name: typeof metadata.name === 'string' ? metadata.name : path.basename(filePath, '.md'),
      description: this.getContentBody(content),
      path: filePath,
    };
  }

  parseFrontmatter(content: string) {
    return this.parseYamlFrontmatter(content);
  }

  body(content: string): string {
    return this.getContentBody(content);
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
  it('discovers directory and file components while skipping malformed entries', async () => {
    const directorySource = path.join(root, 'directories');
    fs.mkdirSync(path.join(directorySource, 'valid'), { recursive: true });
    fs.mkdirSync(path.join(directorySource, 'missing'), { recursive: true });
    fs.writeFileSync(path.join(directorySource, 'valid', 'SKILL.md'), 'valid skill');
    fs.writeFileSync(path.join(directorySource, 'ignored.txt'), 'ignored');

    const directories = await new DirectoryManager(directorySource).listComponents();
    expect(directories).toHaveLength(1);
    expect(directories[0].name).toBe('valid');
    await expect(new DirectoryManager(directorySource).getComponentContent('valid')).resolves.toBe('valid skill');
    await expect(new DirectoryManager(directorySource).getComponentPath('valid')).resolves.toBe(path.join(directorySource, 'valid'));
    await expect(new DirectoryManager(directorySource).getComponentContent('missing')).rejects.toThrow('not found');
    await expect(new DirectoryManager(directorySource).getComponentPath('absent')).rejects.toThrow('not found');

    const fileSource = path.join(root, 'files');
    fs.mkdirSync(fileSource);
    fs.writeFileSync(path.join(fileSource, 'alpha.md'), "---\nname: 'Alpha'\nenabled: true\ncount: 2\ndisabled: false\n---\nAlpha body");
    fs.writeFileSync(path.join(fileSource, 'ignored.txt'), 'ignored');
    const files = await new FileManager(fileSource).listComponents();
    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({ name: 'Alpha', description: 'Alpha body' });
    await expect(new FileManager(fileSource).getComponentContent('alpha')).resolves.toContain('Alpha body');
    await expect(new FileManager(fileSource).getComponentPath('alpha')).resolves.toBe(path.join(fileSource, 'alpha.md'));
    await expect(new FileManager(path.join(root, 'absent')).listComponents()).resolves.toEqual([]);
  });

  it('parses bounded frontmatter values and preserves plain bodies', () => {
    const manager = new FileManager(root);
    expect(manager.parseFrontmatter('plain body')).toEqual({});
    expect(manager.parseFrontmatter("---\nname: 'Checkout'\nenabled: true\ndisabled: false\ncount: 3\nempty:\n---\nBody")).toEqual({
      name: 'Checkout',
      enabled: true,
      disabled: false,
      count: 3,
      empty: '',
    });
    expect(manager.body('---\nname: Checkout\n---\nBody')).toBe('Body');
    expect(manager.body(' plain body ')).toBe('plain body');
  });

  it('installs file and nested directory components without overwriting users', async () => {
    const fileSource = path.join(root, 'file-source');
    const fileTarget = path.join(root, 'file-target');
    fs.mkdirSync(fileSource);
    fs.writeFileSync(path.join(fileSource, 'first.md'), 'first');
    fs.writeFileSync(path.join(fileSource, 'second.md'), 'second');
    fs.mkdirSync(fileTarget);
    fs.writeFileSync(path.join(fileTarget, 'second.md'), 'user second');
    const fileResult = await new FileManager(fileSource).installComponents(fileTarget);
    expect(fileResult.installed).toEqual(['first']);
    expect(fileResult.skipped).toEqual(['second']);

    const directorySource = path.join(root, 'directory-source');
    const directoryTarget = path.join(root, 'directory-target');
    fs.mkdirSync(path.join(directorySource, 'component', 'nested'), { recursive: true });
    fs.writeFileSync(path.join(directorySource, 'component', 'SKILL.md'), 'source');
    fs.writeFileSync(path.join(directorySource, 'component', 'nested', 'REFERENCE.md'), 'reference');
    fs.mkdirSync(path.join(directoryTarget, 'component'), { recursive: true });
    fs.writeFileSync(path.join(directoryTarget, 'component', 'SKILL.md'), 'user');
    const directoryResult = await new DirectoryManager(directorySource).installComponents(directoryTarget);
    expect(directoryResult.installed).toEqual(['component']);
    expect(fs.readFileSync(path.join(directoryTarget, 'component', 'SKILL.md'), 'utf8')).toBe('user');
    expect(fs.readFileSync(path.join(directoryTarget, 'component', 'nested', 'REFERENCE.md'), 'utf8')).toBe('reference');
  });
});
