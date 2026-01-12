import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Mock console.log to capture output
let consoleOutput: string[] = [];
const originalLog = console.log;

beforeEach(() => {
  consoleOutput = [];
  console.log = (...args: any[]) => {
    consoleOutput.push(args.join(' '));
  };
});

afterEach(() => {
  console.log = originalLog;
});

// Import after mocking
import { main } from '../../../cli/migrate-kiro';

describe('migrate-kiro CLI', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'migrate-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('when .kiro does not exist', () => {
    it('should report nothing to migrate', async () => {
      process.argv = ['node', 'migrate-kiro', '--path', tempDir];
      await main();

      expect(consoleOutput.join('\n')).toContain('No .kiro directory found');
    });
  });

  describe('when .kiro exists', () => {
    beforeEach(async () => {
      // Create .kiro structure
      await mkdir(path.join(tempDir, '.kiro', 'steering'), { recursive: true });
      await mkdir(path.join(tempDir, '.kiro', 'specs'), { recursive: true });
      await writeFile(path.join(tempDir, '.kiro', 'steering', 'product.md'), '# Product');
      await writeFile(path.join(tempDir, '.kiro', 'specs', 'spec.json'), '{}');
    });

    it('should migrate files to .spec', async () => {
      process.argv = ['node', 'migrate-kiro', '--path', tempDir];
      await main();

      // .spec should exist with files
      expect(existsSync(path.join(tempDir, '.spec', 'steering', 'product.md'))).toBe(true);
      expect(existsSync(path.join(tempDir, '.spec', 'specs', 'spec.json'))).toBe(true);

      // .kiro should be removed
      expect(existsSync(path.join(tempDir, '.kiro'))).toBe(false);

      // Content should be preserved
      const content = await readFile(path.join(tempDir, '.spec', 'steering', 'product.md'), 'utf8');
      expect(content).toBe('# Product');
    });

    it('should show dry-run without making changes', async () => {
      process.argv = ['node', 'migrate-kiro', '--path', tempDir, '--dry-run'];
      await main();

      // .kiro should still exist
      expect(existsSync(path.join(tempDir, '.kiro'))).toBe(true);

      // .spec should NOT exist
      expect(existsSync(path.join(tempDir, '.spec'))).toBe(false);

      expect(consoleOutput.join('\n')).toContain('Would migrate');
    });

    it('should refuse if .spec already exists without --force', async () => {
      await mkdir(path.join(tempDir, '.spec'), { recursive: true });

      process.argv = ['node', 'migrate-kiro', '--path', tempDir];
      await main();

      expect(consoleOutput.join('\n')).toContain('already exists');
      expect(consoleOutput.join('\n')).toContain('--force');
    });

    it('should overwrite with --force', async () => {
      await mkdir(path.join(tempDir, '.spec'), { recursive: true });

      process.argv = ['node', 'migrate-kiro', '--path', tempDir, '--force'];
      await main();

      expect(existsSync(path.join(tempDir, '.spec', 'steering', 'product.md'))).toBe(true);
      expect(existsSync(path.join(tempDir, '.kiro'))).toBe(false);
    });
  });

  describe('--help flag', () => {
    it('should show help text', async () => {
      process.argv = ['node', 'migrate-kiro', '--help'];
      await main();

      const output = consoleOutput.join('\n');
      expect(output).toContain('SDD Directory Migration Tool');
      expect(output).toContain('--dry-run');
      expect(output).toContain('--force');
    });
  });
});
