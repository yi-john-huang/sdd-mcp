import { promises as fs } from 'fs';
import { injectable } from 'inversify';
import { FileSystemPort } from '../../domain/ports.js';
import { atomicWriteFile } from '../../utils/atomicWrite.js';

@injectable()
export class NodeFileSystemAdapter implements FileSystemPort {
  async readFile(path: string): Promise<string> {
    return await fs.readFile(path, 'utf-8');
  }

  async writeFile(path: string, content: string): Promise<void> {
    await fs.writeFile(path, content, 'utf-8');
  }
  async writeFileAtomic(path: string, content: string): Promise<void> {
    await atomicWriteFile(path, content);
  }

  async exists(path: string): Promise<boolean> {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }

  async mkdir(path: string): Promise<void> {
    await fs.mkdir(path, { recursive: true });
  }

  async readdir(path: string): Promise<string[]> {
    return await fs.readdir(path);
  }

  async stat(path: string): Promise<{ isFile(): boolean; isDirectory(): boolean }> {
    return await fs.stat(path);
  }

  async realpath(path: string): Promise<string> {
    return await fs.realpath(path);
  }

  async unlink(path: string): Promise<void> {
    await fs.unlink(path);
  }
}