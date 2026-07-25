import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  generateDesignDocument,
  generateRequirementsDocument,
  generateTasksDocument,
} from '../../../utils/specGenerator';

describe('specGenerator contracts', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'spec-generator-'));
    await mkdir(path.join(root, 'src'));
    await mkdir(path.join(root, 'tests'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  async function writePackage(packageJson: Record<string, unknown>): Promise<void> {
    await writeFile(path.join(root, 'package.json'), JSON.stringify(packageJson));
  }

  it('generates governed MCP requirements, design, and tasks', async () => {
    await writePackage({
      name: 'governed-mcp',
      description: 'governed MCP workflows',
      type: 'module',
      scripts: { build: 'tsc', test: 'jest', lint: 'eslint src' },
      dependencies: {
        '@modelcontextprotocol/sdk': '^2',
        mongoose: '^9',
      },
      devDependencies: { typescript: '^6', jest: '^30' },
    });

    const requirements = await generateRequirementsDocument(root, 'governed');
    const design = await generateDesignDocument(root, 'governed');
    const tasks = await generateTasksDocument(root, 'governed');

    expect(requirements).toContain('Provide MCP tools for spec-driven development workflows');
    expect(design).toContain('MCP server exposing development tools');
    expect(tasks).toContain('Write tests for MCP tool handlers');
    expect(tasks).toContain('Write tests for data persistence');
    expect(tasks).toContain('TDD, Principles');
  });

  it.each([
    ['express-api', { express: '^5', prisma: '^7' }, 'REST API', 'Expose REST endpoints'],
    ['react-ui', { react: '^19' }, 'Frontend', 'Render interactive UI components'],
    ['plain', {}, 'unknown', 'Deliver feature-aligned functionality'],
  ])('generates bounded %s documents', async (name, dependencies, architectureHint, objective) => {
    await writePackage({
      name,
      dependencies,
      scripts: name === 'plain' ? {} : { start: 'node src/index.js' },
    });
    if (architectureHint === 'REST API') {
      await mkdir(path.join(root, 'controllers'));
      await mkdir(path.join(root, 'models'));
      await mkdir(path.join(root, 'views'));
    }

    const requirements = await generateRequirementsDocument(root, name);
    const design = await generateDesignDocument(root, name);
    const tasks = await generateTasksDocument(root, name);

    expect(requirements).toContain(objective);
    expect(design).toContain('Technical Design Document');
    expect(tasks).toContain('TDD Approach');
  });
});
