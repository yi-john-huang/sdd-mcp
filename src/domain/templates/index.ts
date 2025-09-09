// Template engine interfaces and types

export interface TemplateData {
  readonly [key: string]: unknown;
}

export interface TemplateContext {
  readonly project: {
    readonly name: string;
    readonly description?: string;
    readonly id: string;
    readonly basePath: string;
  };
  readonly timestamp: Date;
  readonly user: {
    readonly name?: string;
    readonly email?: string;
  };
  readonly metadata: Record<string, unknown>;
}

export interface TemplateRendererPort {
  compile(template: string, name?: string): Promise<CompiledTemplate>;
  render(templateName: string, data: TemplateData, context: TemplateContext): Promise<string>;
  renderString(template: string, data: TemplateData, context: TemplateContext): Promise<string>;
  registerHelper(name: string, helper: (...args: unknown[]) => unknown): void;
  registerPartial(name: string, template: string): Promise<void>;
  clearCache(): void;
}

export interface CompiledTemplate {
  readonly name: string;
  readonly template: string;
  readonly compiledAt: Date;
  render(data: TemplateData, context: TemplateContext): string;
}

export interface Template {
  readonly id: string;
  readonly name: string;
  readonly category: TemplateCategory;
  readonly description: string;
  readonly template: string;
  readonly variables: TemplateVariable[];
  readonly version: string;
  readonly author?: string;
  readonly tags: string[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface TemplateVariable {
  readonly name: string;
  readonly type: TemplateVariableType;
  readonly description: string;
  readonly required: boolean;
  readonly defaultValue?: unknown;
  readonly validation?: TemplateValidation;
}

export interface TemplateValidation {
  readonly pattern?: string;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly enum?: unknown[];
}

export enum TemplateCategory {
  SPECIFICATION = 'specification',
  REQUIREMENTS = 'requirements',
  DESIGN = 'design',
  TASKS = 'tasks',
  STEERING = 'steering',
  CONFIG = 'config',
  DOCUMENTATION = 'documentation',
  CODE = 'code'
}

export enum TemplateVariableType {
  STRING = 'string',
  NUMBER = 'number',
  BOOLEAN = 'boolean',
  ARRAY = 'array',
  OBJECT = 'object',
  DATE = 'date'
}

export interface TemplateManagerPort {
  getTemplate(id: string): Promise<Template | null>;
  getTemplatesByCategory(category: TemplateCategory): Promise<Template[]>;
  searchTemplates(query: string, tags?: string[]): Promise<Template[]>;
  createTemplate(template: Omit<Template, 'id' | 'createdAt' | 'updatedAt'>): Promise<Template>;
  updateTemplate(id: string, updates: Partial<Template>): Promise<Template>;
  deleteTemplate(id: string): Promise<void>;
  validateTemplate(template: string, variables: TemplateVariable[]): Promise<TemplateValidationResult>;
  getAllTemplates(): Promise<Template[]>;
}

export interface TemplateValidationResult {
  readonly isValid: boolean;
  readonly errors: TemplateValidationError[];
  readonly warnings: TemplateValidationWarning[];
}

export interface TemplateValidationError {
  readonly message: string;
  readonly line?: number;
  readonly column?: number;
  readonly variable?: string;
}

export interface TemplateValidationWarning {
  readonly message: string;
  readonly line?: number;
  readonly column?: number;
  readonly suggestion?: string;
}

export interface FileGeneratorPort {
  generateFile(
    filePath: string,
    template: string,
    data: TemplateData,
    context: TemplateContext,
    options?: FileGenerationOptions
  ): Promise<FileGenerationResult>;
  
  generateDirectory(
    dirPath: string,
    structure: DirectoryStructure,
    context: TemplateContext,
    options?: FileGenerationOptions
  ): Promise<DirectoryGenerationResult>;
  
  validatePath(path: string): Promise<PathValidationResult>;
  backupFile(filePath: string): Promise<string>;
  restoreBackup(backupPath: string, originalPath: string): Promise<void>;
  cleanupBackups(olderThan: Date): Promise<string[]>;
}

export interface FileGenerationOptions {
  readonly backup: boolean;
  readonly overwrite: boolean;
  readonly createDirectories: boolean;
  readonly permissions?: string;
  readonly atomic: boolean;
}

export interface FileGenerationResult {
  readonly filePath: string;
  readonly success: boolean;
  readonly backupPath?: string;
  readonly bytesWritten: number;
  readonly error?: string;
  readonly warnings: string[];
}

export interface DirectoryStructure {
  readonly files: DirectoryFile[];
  readonly subdirectories: Record<string, DirectoryStructure>;
}

export interface DirectoryFile {
  readonly name: string;
  readonly template: string;
  readonly data: TemplateData;
}

export interface DirectoryGenerationResult {
  readonly dirPath: string;
  readonly success: boolean;
  readonly filesGenerated: FileGenerationResult[];
  readonly directoriesCreated: string[];
  readonly errors: string[];
  readonly warnings: string[];
}

export interface PathValidationResult {
  readonly isValid: boolean;
  readonly exists: boolean;
  readonly isFile: boolean;
  readonly isDirectory: boolean;
  readonly permissions: PathPermissions;
  readonly errors: string[];
}

export interface PathPermissions {
  readonly read: boolean;
  readonly write: boolean;
  readonly execute: boolean;
}