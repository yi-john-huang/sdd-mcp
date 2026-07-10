import * as fs from 'fs';
import * as path from 'path';
import type { InstallResult } from '../../shared/BaseManager.js';

export type WriteOutcome = 'installed' | 'skipped';

export function validateChildName(name: string): void {
  if (!name || name === '.' || name === '..' || name.includes('/') || name.includes('\\')) {
    throw new Error(`Unsafe generated child name: ${name}`);
  }
}

export class PreservingWriter {
  async writeIfAbsent(filePath: string, content: string): Promise<WriteOutcome> {
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    try {
      await fs.promises.writeFile(filePath, content, { encoding: 'utf8', flag: 'wx' });
      return 'installed';
    } catch (error) {
      if (isAlreadyExists(error)) return 'skipped';
      throw error;
    }
  }

  async copyIfAbsent(source: string, destination: string): Promise<WriteOutcome> {
    await fs.promises.mkdir(path.dirname(destination), { recursive: true });
    try {
      await fs.promises.copyFile(source, destination, fs.constants.COPYFILE_EXCL);
      return 'installed';
    } catch (error) {
      if (isAlreadyExists(error)) return 'skipped';
      throw error;
    }
  }

  async copyTreePreserving(source: string, destination: string): Promise<InstallResult> {
    const result: InstallResult = { installed: [], skipped: [], failed: [] };
    await this.copyTree(source, destination, '', result);
    return result;
  }

  private async copyTree(
    source: string,
    destination: string,
    relative: string,
    result: InstallResult,
  ): Promise<void> {
    await fs.promises.mkdir(destination, { recursive: true });
    const entries = await fs.promises.readdir(source, { withFileTypes: true });
    for (const entry of entries) {
      validateChildName(entry.name);
      const sourcePath = path.join(source, entry.name);
      const destinationPath = path.join(destination, entry.name);
      const resultName = relative ? path.join(relative, entry.name) : entry.name;
      if (entry.isDirectory()) {
        await this.copyTree(sourcePath, destinationPath, resultName, result);
        continue;
      }
      try {
        const outcome = await this.copyIfAbsent(sourcePath, destinationPath);
        (outcome === 'installed' ? result.installed : result.skipped ??= []).push(resultName);
      } catch (error) {
        result.failed.push({
          name: resultName,
          path: destinationPath,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
}

function isAlreadyExists(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST';
}
