// File generation and directory management implementation

import { injectable, inject } from 'inversify';
import { promises as fs, Stats } from 'fs';
import path from 'path';
import { randomBytes } from 'crypto';
import type { 
  FileGeneratorPort,
  FileGenerationOptions,
  FileGenerationResult,
  DirectoryStructure,
  DirectoryGenerationResult,
  PathValidationResult,
  PathPermissions,
  TemplateData,
  TemplateContext,
  TemplateRendererPort
} from '../../domain/templates/index.js';
import type { LoggerPort } from '../../domain/ports.js';
import { TYPES } from '../di/types.js';

const DEFAULT_FILE_OPTIONS: FileGenerationOptions = {
  backup: true,
  overwrite: false,
  createDirectories: true,
  atomic: true
};

@injectable()
export class FileGenerator implements FileGeneratorPort {
  private readonly backupDirectory: string;

  constructor(
    @inject(TYPES.LoggerPort) private readonly logger: LoggerPort,
    @inject(TYPES.TemplateRendererPort) private readonly renderer: TemplateRendererPort
  ) {
    this.backupDirectory = path.resolve('./.backups');
  }

  async generateFile(
    filePath: string,
    template: string,
    data: TemplateData,
    context: TemplateContext,
    options: FileGenerationOptions = DEFAULT_FILE_OPTIONS
  ): Promise<FileGenerationResult> {
    const resolvedPath = path.resolve(filePath);
    const finalOptions = { ...DEFAULT_FILE_OPTIONS, ...options };

    try {
      // Validate the target path
      const pathValidation = await this.validatePath(resolvedPath);
      if (!pathValidation.isValid) {
        return {
          filePath: resolvedPath,
          success: false,
          bytesWritten: 0,
          error: `Invalid path: ${pathValidation.errors.join(', ')}`,
          warnings: []
        };
      }

      // Check if file exists and handle accordingly
      if (pathValidation.exists && pathValidation.isFile && !finalOptions.overwrite) {
        return {
          filePath: resolvedPath,
          success: false,
          bytesWritten: 0,
          error: 'File exists and overwrite is disabled',
          warnings: []
        };
      }

      // Create backup if requested and file exists
      let backupPath: string | undefined;
      if (finalOptions.backup && pathValidation.exists && pathValidation.isFile) {
        backupPath = await this.backupFile(resolvedPath);
      }

      // Create parent directories if needed
      if (finalOptions.createDirectories) {
        const parentDir = path.dirname(resolvedPath);
        await fs.mkdir(parentDir, { recursive: true });
      }

      // Render the template
      const renderedContent = await this.renderer.renderString(template, data, context);

      // Write file atomically or directly
      const bytesWritten = await this.writeFile(resolvedPath, renderedContent, finalOptions.atomic);

      // Set permissions if specified
      if (finalOptions.permissions) {
        await fs.chmod(resolvedPath, finalOptions.permissions);
      }

      this.logger.info('File generated successfully', {
        filePath: resolvedPath,
        bytesWritten,
        backup: !!backupPath
      });

      return {
        filePath: resolvedPath,
        success: true,
        backupPath,
        bytesWritten,
        warnings: []
      };

    } catch (error) {
      this.logger.error('File generation failed', error instanceof Error ? error : new Error(String(error)), {
        filePath: resolvedPath
      });

      return {
        filePath: resolvedPath,
        success: false,
        bytesWritten: 0,
        error: error instanceof Error ? error.message : String(error),
        warnings: []
      };
    }
  }

  async generateDirectory(
    dirPath: string,
    structure: DirectoryStructure,
    context: TemplateContext,
    options: FileGenerationOptions = DEFAULT_FILE_OPTIONS
  ): Promise<DirectoryGenerationResult> {
    const resolvedDirPath = path.resolve(dirPath);
    const filesGenerated: FileGenerationResult[] = [];
    const directoriesCreated: string[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Validate the target directory path
      const pathValidation = await this.validatePath(resolvedDirPath);
      
      // Create the root directory if it doesn't exist
      if (!pathValidation.exists) {
        await fs.mkdir(resolvedDirPath, { recursive: true });
        directoriesCreated.push(resolvedDirPath);
      }

      // Generate files in the current directory
      for (const file of structure.files) {
        const filePath = path.join(resolvedDirPath, file.name);
        
        try {
          const result = await this.generateFile(
            filePath,
            file.template,
            file.data,
            context,
            options
          );
          
          filesGenerated.push(result);
          
          if (!result.success) {
            errors.push(`Failed to generate ${file.name}: ${result.error}`);
          }
          
          if (result.warnings.length > 0) {
            warnings.push(...result.warnings.map(w => `${file.name}: ${w}`));
          }
        } catch (error) {
          const errorMessage = `Error generating file ${file.name}: ${error instanceof Error ? error.message : String(error)}`;
          errors.push(errorMessage);
          
          filesGenerated.push({
            filePath,
            success: false,
            bytesWritten: 0,
            error: errorMessage,
            warnings: []
          });
        }
      }

      // Recursively generate subdirectories
      for (const [subdirName, subdirStructure] of Object.entries(structure.subdirectories)) {
        const subdirPath = path.join(resolvedDirPath, subdirName);
        
        try {
          const result = await this.generateDirectory(subdirPath, subdirStructure, context, options);
          
          filesGenerated.push(...result.filesGenerated);
          directoriesCreated.push(...result.directoriesCreated);
          
          if (result.errors.length > 0) {
            errors.push(...result.errors.map(e => `${subdirName}/${e}`));
          }
          
          if (result.warnings.length > 0) {
            warnings.push(...result.warnings.map(w => `${subdirName}/${w}`));
          }
        } catch (error) {
          errors.push(`Failed to generate subdirectory ${subdirName}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      const success = errors.length === 0;
      
      this.logger.info('Directory generation completed', {
        dirPath: resolvedDirPath,
        success,
        filesGenerated: filesGenerated.length,
        directoriesCreated: directoriesCreated.length,
        errors: errors.length
      });

      return {
        dirPath: resolvedDirPath,
        success,
        filesGenerated,
        directoriesCreated,
        errors,
        warnings
      };

    } catch (error) {
      const errorMessage = `Directory generation failed: ${error instanceof Error ? error.message : String(error)}`;
      this.logger.error('Directory generation failed', new Error(errorMessage), {
        dirPath: resolvedDirPath
      });

      return {
        dirPath: resolvedDirPath,
        success: false,
        filesGenerated,
        directoriesCreated,
        errors: [errorMessage],
        warnings
      };
    }
  }

  async validatePath(targetPath: string): Promise<PathValidationResult> {
    const errors: string[] = [];

    try {
      // Check if path contains invalid characters
      if (/[<>:"|?*]/.test(targetPath)) {
        errors.push('Path contains invalid characters');
      }

      // Check if path is absolute or relative
      if (!path.isAbsolute(targetPath)) {
        // This is actually fine, we'll resolve it
      }

      const resolvedPath = path.resolve(targetPath);

      // Check if path exists and get stats
      let stats: Stats | null = null;
      let exists = false;

      try {
        stats = await fs.stat(resolvedPath);
        exists = true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          errors.push(`Unable to access path: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      // Check permissions if file/directory exists
      let read = false;
      let write = false;
      let execute = false;

      if (exists && stats) {
        try {
          await fs.access(resolvedPath, fs.constants.R_OK);
          read = true;
        } catch {
          // No read permission
        }

        try {
          await fs.access(resolvedPath, fs.constants.W_OK);
          write = true;
        } catch {
          // No write permission
        }

        try {
          await fs.access(resolvedPath, fs.constants.X_OK);
          execute = true;
        } catch {
          // No execute permission
        }
      } else {
        // Check parent directory permissions
        const parentDir = path.dirname(resolvedPath);
        try {
          await fs.access(parentDir, fs.constants.W_OK);
          write = true;
        } catch {
          errors.push('Parent directory is not writable');
        }
      }

      return {
        isValid: errors.length === 0,
        exists,
        isFile: exists && stats?.isFile() || false,
        isDirectory: exists && stats?.isDirectory() || false,
        permissions: { read, write, execute },
        errors
      };

    } catch (error) {
      errors.push(`Path validation failed: ${error instanceof Error ? error.message : String(error)}`);
      
      return {
        isValid: false,
        exists: false,
        isFile: false,
        isDirectory: false,
        permissions: { read: false, write: false, execute: false },
        errors
      };
    }
  }

  async backupFile(filePath: string): Promise<string> {
    const resolvedPath = path.resolve(filePath);
    const fileName = path.basename(resolvedPath);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const randomSuffix = randomBytes(4).toString('hex');
    const backupName = `${fileName}.${timestamp}.${randomSuffix}.backup`;
    const backupPath = path.join(this.backupDirectory, backupName);

    try {
      await fs.mkdir(this.backupDirectory, { recursive: true });
      await fs.copyFile(resolvedPath, backupPath);
      
      this.logger.debug('File backup created', {
        original: resolvedPath,
        backup: backupPath
      });

      return backupPath;
    } catch (error) {
      this.logger.error('File backup failed', error instanceof Error ? error : new Error(String(error)), {
        filePath: resolvedPath,
        backupPath
      });
      throw new Error(`Backup failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async restoreBackup(backupPath: string, originalPath: string): Promise<void> {
    try {
      await fs.copyFile(backupPath, originalPath);
      
      this.logger.info('File restored from backup', {
        backup: backupPath,
        restored: originalPath
      });
    } catch (error) {
      this.logger.error('File restore failed', error instanceof Error ? error : new Error(String(error)), {
        backupPath,
        originalPath
      });
      throw new Error(`Restore failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async cleanupBackups(olderThan: Date): Promise<string[]> {
    const deletedBackups: string[] = [];

    try {
      await fs.mkdir(this.backupDirectory, { recursive: true });
      const backupFiles = await fs.readdir(this.backupDirectory);

      for (const fileName of backupFiles) {
        if (!fileName.endsWith('.backup')) continue;

        const filePath = path.join(this.backupDirectory, fileName);
        const stats = await fs.stat(filePath);

        if (stats.mtime < olderThan) {
          await fs.unlink(filePath);
          deletedBackups.push(filePath);
        }
      }

      this.logger.info('Backup cleanup completed', {
        deleted: deletedBackups.length,
        olderThan: olderThan.toISOString()
      });

      return deletedBackups;
    } catch (error) {
      this.logger.error('Backup cleanup failed', error instanceof Error ? error : new Error(String(error)));
      throw new Error(`Backup cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async writeFile(filePath: string, content: string, atomic: boolean): Promise<number> {
    if (atomic) {
      // Write to temporary file first, then rename
      const tempPath = `${filePath}.tmp.${randomBytes(8).toString('hex')}`;
      
      try {
        await fs.writeFile(tempPath, content, 'utf-8');
        await fs.rename(tempPath, filePath);
        
        const stats = await fs.stat(filePath);
        return stats.size;
      } catch (error) {
        // Clean up temp file if it exists
        try {
          await fs.unlink(tempPath);
        } catch {
          // Ignore cleanup errors
        }
        throw error;
      }
    } else {
      // Write directly
      await fs.writeFile(filePath, content, 'utf-8');
      const stats = await fs.stat(filePath);
      return stats.size;
    }
  }
}