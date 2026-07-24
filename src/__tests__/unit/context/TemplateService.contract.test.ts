import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { TemplateService } from '../../../application/services/TemplateService';
import type { LoggerPort } from '../../../domain/ports';
import type { Project } from '../../../domain/types';
import { NodeFileSystemAdapter } from '../../../infrastructure/adapters/NodeFileSystemAdapter';

const logger: LoggerPort = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

function project(projectPath: string, name: string): Project {
  return {
    id: name,
    name,
    path: projectPath,
    phase: 'requirements' as never,
    metadata: {
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      language: 'en',
      approvals: {
        requirements: { generated: false, approved: false },
        design: { generated: false, approved: false },
        tasks: { generated: false, approved: false },
      },
    },
  } as unknown as Project;
}

describe('TemplateService generation contracts', () => {
  let root: string;
  const templateEngine = {
    render: jest.fn(async (template: string) => template),
    registerHelper: jest.fn(),
  };
  const renderer = {
    registerHelper: jest.fn(),
    registerPartial: jest.fn(),
    clearCache: jest.fn(),
    renderString: jest.fn(),
  };
  const templateManager = {
    getTemplate: jest.fn(),
    getTemplatesByCategory: jest.fn(),
    searchTemplates: jest.fn(),
    getAllTemplates: jest.fn(),
  };
  const fileGenerator = {
    generateFile: jest.fn(),
    generateDirectory: jest.fn(),
    validatePath: jest.fn(),
    backupFile: jest.fn(),
    restoreBackup: jest.fn(),
    cleanupBackups: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    root = await mkdtemp(path.join(tmpdir(), 'template-service-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  function service(): TemplateService {
    return new TemplateService(
      templateEngine as never,
      new NodeFileSystemAdapter(),
      logger,
      renderer as never,
      templateManager as never,
      fileGenerator as never,
    );
  }

  it('derives requirements, design, and tasks from a fully configured project', async () => {
    for (const directory of ['src', 'tests', 'docs']) {
      await mkdir(path.join(root, directory));
    }
    await writeFile(path.join(root, 'package.json'), JSON.stringify({
      name: 'payments',
      description: 'a reliable checkout API',
      keywords: ['payments', 'checkout'],
      type: 'module',
      main: 'dist/index.js',
      engines: { node: '>=22' },
      scripts: {
        test: 'jest',
        build: 'tsc',
        lint: 'eslint src',
        typecheck: 'tsc --noEmit',
        start: 'node dist/index.js',
      },
      dependencies: {
        express: '^5',
        react: '^19',
        vue: '^3',
        mongoose: '^9',
        mongodb: '^7',
        sequelize: '^7',
        typeorm: '^1',
        graphql: '^17',
        inversify: '^7',
      },
      devDependencies: { typescript: '^6', jest: '^30' },
    }));
    const sut = service();
    const configured = project(root, 'payments');

    const requirements = await sut.generateRequirementsTemplate(configured);
    const design = await sut.generateDesignTemplate(configured);
    const tasks = await sut.generateTasksTemplate(configured);

    expect(requirements).toContain('Deliver a reliable checkout API');
    expect(requirements).toContain('RESTful API endpoints');
    expect(design).toContain('MongoDB Document Models');
    expect(design).toContain('Dependency Injection');
    expect(tasks).toContain('Develop API Endpoints');
    expect(tasks).toContain('Build and Package');
  });

  it('uses bounded defaults for an empty project and supports the template facade', async () => {
    const sut = service();
    const empty = project(root, 'empty');

    expect(await sut.generateRequirementsTemplate(empty)).toContain('Deliver core application functionality');
    expect(await sut.generateDesignTemplate(empty)).toContain('Application architecture to be defined');
    expect(await sut.generateTasksTemplate(empty)).toContain('Deployment Configuration');
    expect(await sut.generateSpecJson(empty)).toContain('"feature_name"');

    const template = { id: 'sample', template: 'Hello {{name}}' };
    templateManager.getTemplate.mockResolvedValue(template);
    templateManager.getTemplatesByCategory.mockResolvedValue([template]);
    templateManager.searchTemplates.mockResolvedValue([template]);
    templateManager.getAllTemplates.mockResolvedValue([template]);
    renderer.renderString.mockResolvedValue('Hello Ada');
    fileGenerator.validatePath.mockResolvedValue({ isValid: true });
    fileGenerator.backupFile.mockResolvedValue('/tmp/file.backup');
    fileGenerator.cleanupBackups.mockResolvedValue(['/tmp/old.backup']);

    await expect(sut.renderTemplate('sample', { name: 'Ada' }, {} as never)).resolves.toBe('Hello Ada');
    await expect(sut.getTemplate('sample')).resolves.toBe(template);
    await expect(sut.getTemplatesByCategory('steering' as never)).resolves.toEqual([template]);
    await expect(sut.searchTemplates('sample', ['tag'])).resolves.toEqual([template]);
    await expect(sut.getAllTemplates()).resolves.toEqual([template]);
    await expect(sut.validateTemplateFile('/tmp/file')).resolves.toBe(true);
    await expect(sut.backupFile('/tmp/file')).resolves.toBe('/tmp/file.backup');
    await sut.restoreBackup('/tmp/file.backup', '/tmp/file');
    await expect(sut.cleanupOldBackups(5)).resolves.toEqual(['/tmp/old.backup']);
    sut.registerTemplateHelper('upper', String);
    await sut.registerTemplatePartial('header', '# Header');
    sut.clearTemplateCache();
  });

  it('rejects missing templates and reports validation failures', async () => {
    const sut = service();
    templateManager.getTemplate.mockResolvedValue(null);
    fileGenerator.validatePath.mockRejectedValue(new Error('invalid path'));

    await expect(sut.renderTemplate('missing', {}, {} as never)).rejects.toThrow("Template 'missing' not found");
    await expect(sut.validateTemplateFile('/invalid')).resolves.toBe(false);
  });
});
