// Plugin steering document registry for custom steering integration

import { injectable, inject } from 'inversify';
import type { LoggerPort, FileSystemPort } from '../../domain/ports.js';
import type {
  SteeringDocumentDeclaration,
  SteeringDocumentType,
  SteeringMode,
  SteeringVariable,
  PluginInstance
} from '../../domain/plugins/index.js';
import { TYPES } from '../di/types.js';

export interface SteeringDocument {
  readonly id: string;
  readonly pluginId: string;
  readonly name: string;
  readonly type: SteeringDocumentType;
  readonly mode: SteeringMode;
  readonly priority: number;
  readonly patterns: string[];
  readonly template: string;
  readonly variables: SteeringVariable[];
  readonly content?: string;
  readonly registeredAt: Date;
  readonly lastUpdated: Date;
}

export interface SteeringContext {
  readonly currentFile?: string;
  readonly projectPath: string;
  readonly workingDirectory: string;
  readonly variables: Record<string, unknown>;
  readonly metadata: Record<string, unknown>;
}

export interface SteeringResult {
  readonly applicable: boolean;
  readonly content?: string;
  readonly variables?: Record<string, unknown>;
  readonly priority: number;
  readonly conflictsWith?: string[];
}

interface SteeringDocumentInternal extends SteeringDocument {
  readonly accessCount: number;
  readonly lastAccessed?: Date;
  readonly errorCount: number;
  readonly lastError?: Error;
}

@injectable()
export class PluginSteeringRegistry {
  private readonly steeringDocuments = new Map<string, SteeringDocumentInternal>();
  private readonly pluginDocuments = new Map<string, string[]>(); // pluginId -> documentIds
  private readonly templateCache = new Map<string, (context: SteeringContext) => string>();
  private readonly maxCacheSize = 100;

  constructor(
    @inject(TYPES.LoggerPort) private readonly logger: LoggerPort,
    @inject(TYPES.FileSystemPort) private readonly fileSystem: FileSystemPort
  ) {}

  async registerSteeringDocument(
    pluginId: string, 
    declaration: SteeringDocumentDeclaration
  ): Promise<void> {
    const documentId = `${pluginId}:${declaration.name}`;
    
    // Check for existing registration
    if (this.steeringDocuments.has(documentId)) {
      this.logger.warn('Steering document already registered, replacing', {
        documentId,
        pluginId,
        name: declaration.name
      });
    }

    // Validate declaration
    await this.validateSteeringDeclaration(declaration);

    // Load template content if available
    let content: string | undefined;
    try {
      content = await this.loadSteeringTemplate(pluginId, declaration);
    } catch (error) {
      this.logger.warn('Failed to load steering template content', {
        documentId,
        error: error instanceof Error ? error.message : String(error)
      });
    }

    const document: SteeringDocumentInternal = {
      id: documentId,
      pluginId,
      name: declaration.name,
      type: declaration.type,
      mode: declaration.mode,
      priority: declaration.priority,
      patterns: [...declaration.patterns],
      template: declaration.template,
      variables: [...declaration.variables],
      content,
      registeredAt: new Date(),
      lastUpdated: new Date(),
      accessCount: 0,
      errorCount: 0
    };

    this.steeringDocuments.set(documentId, document);
    
    // Track by plugin
    if (!this.pluginDocuments.has(pluginId)) {
      this.pluginDocuments.set(pluginId, []);
    }
    const pluginDocs = this.pluginDocuments.get(pluginId)!;
    if (!pluginDocs.includes(documentId)) {
      pluginDocs.push(documentId);
    }

    // Compile template for caching
    await this.compileTemplate(documentId, declaration.template);

    this.logger.info('Steering document registered successfully', {
      documentId,
      pluginId,
      type: declaration.type,
      mode: declaration.mode,
      priority: declaration.priority,
      patternsCount: declaration.patterns.length
    });
  }

  async unregisterSteeringDocument(pluginId: string, documentName: string): Promise<void> {
    const documentId = `${pluginId}:${documentName}`;
    
    if (!this.steeringDocuments.has(documentId)) {
      this.logger.warn('Steering document not found for unregistration', {
        documentId,
        pluginId,
        documentName
      });
      return;
    }

    // Remove from main registry
    this.steeringDocuments.delete(documentId);
    
    // Remove from plugin tracking
    const pluginDocs = this.pluginDocuments.get(pluginId);
    if (pluginDocs) {
      const index = pluginDocs.indexOf(documentId);
      if (index >= 0) {
        pluginDocs.splice(index, 1);
      }
      if (pluginDocs.length === 0) {
        this.pluginDocuments.delete(pluginId);
      }
    }

    // Remove from template cache
    this.templateCache.delete(documentId);

    this.logger.info('Steering document unregistered successfully', {
      documentId,
      pluginId,
      documentName
    });
  }

  async getApplicableSteeringDocuments(
    context: SteeringContext
  ): Promise<SteeringResult[]> {
    const results: SteeringResult[] = [];
    const currentFile = context.currentFile || '';

    for (const document of this.steeringDocuments.values()) {
      try {
        // Check if document is applicable based on mode and patterns
        const applicable = await this.isDocumentApplicable(document, context);
        
        if (applicable) {
          // Generate content if template is available
          let content: string | undefined;
          const templateFn = this.templateCache.get(document.id);
          
          if (templateFn) {
            try {
              content = templateFn(context);
            } catch (error) {
              this.logger.error('Failed to render steering template', {
                documentId: document.id,
                error: error instanceof Error ? error.message : String(error)
              });
              this.updateDocumentError(document.id, error instanceof Error ? error : new Error(String(error)));
              continue;
            }
          } else if (document.content) {
            content = document.content;
          }

          // Update access metrics
          this.updateDocumentAccess(document.id);

          results.push({
            applicable: true,
            content,
            variables: this.resolveVariables(document.variables, context),
            priority: document.priority,
            conflictsWith: await this.findConflictingDocuments(document, results)
          });
        }
      } catch (error) {
        this.logger.error('Error evaluating steering document applicability', {
          documentId: document.id,
          error: error instanceof Error ? error.message : String(error)
        });
        this.updateDocumentError(document.id, error instanceof Error ? error : new Error(String(error)));
      }
    }

    // Sort by priority (higher priority first)
    results.sort((a, b) => b.priority - a.priority);

    this.logger.debug('Found applicable steering documents', {
      currentFile,
      applicableCount: results.length,
      totalDocuments: this.steeringDocuments.size
    });

    return results;
  }

  async getSteeringDocumentsByMode(mode: SteeringMode): Promise<SteeringDocument[]> {
    const documents: SteeringDocument[] = [];
    
    for (const document of this.steeringDocuments.values()) {
      if (document.mode === mode) {
        documents.push({ ...document });
      }
    }

    // Sort by priority
    documents.sort((a, b) => b.priority - a.priority);
    
    return documents;
  }

  async getSteeringDocumentsByPlugin(pluginId: string): Promise<SteeringDocument[]> {
    const documentIds = this.pluginDocuments.get(pluginId) || [];
    const documents: SteeringDocument[] = [];
    
    for (const documentId of documentIds) {
      const document = this.steeringDocuments.get(documentId);
      if (document) {
        documents.push({ ...document });
      }
    }

    // Sort by priority
    documents.sort((a, b) => b.priority - a.priority);
    
    return documents;
  }

  async clearSteeringDocuments(pluginId?: string): Promise<void> {
    if (pluginId) {
      // Clear documents for specific plugin
      const documentIds = this.pluginDocuments.get(pluginId) || [];
      
      for (const documentId of documentIds) {
        this.steeringDocuments.delete(documentId);
        this.templateCache.delete(documentId);
      }
      
      this.pluginDocuments.delete(pluginId);
      
      this.logger.info('Plugin steering documents cleared', {
        pluginId,
        documentsCleared: documentIds.length
      });
    } else {
      // Clear all steering documents
      const totalDocuments = this.steeringDocuments.size;
      this.steeringDocuments.clear();
      this.pluginDocuments.clear();
      this.templateCache.clear();
      
      this.logger.info('All steering documents cleared', {
        documentsCleared: totalDocuments
      });
    }
  }

  async getSteeringStatistics(): Promise<{
    totalDocuments: number;
    documentsByMode: Record<SteeringMode, number>;
    documentsByType: Record<SteeringDocumentType, number>;
    documentsByPlugin: Record<string, number>;
    cacheHitRate: number;
  }> {
    const documentsByMode: Record<SteeringMode, number> = {
      [SteeringMode.ALWAYS]: 0,
      [SteeringMode.CONDITIONAL]: 0,
      [SteeringMode.MANUAL]: 0
    };

    const documentsByType: Record<SteeringDocumentType, number> = {
      [SteeringDocumentType.PRODUCT]: 0,
      [SteeringDocumentType.TECHNICAL]: 0,
      [SteeringDocumentType.STRUCTURE]: 0,
      [SteeringDocumentType.QUALITY]: 0,
      [SteeringDocumentType.PROCESS]: 0,
      [SteeringDocumentType.CUSTOM]: 0
    };

    const documentsByPlugin: Record<string, number> = {};

    for (const document of this.steeringDocuments.values()) {
      documentsByMode[document.mode]++;
      documentsByType[document.type]++;
      documentsByPlugin[document.pluginId] = (documentsByPlugin[document.pluginId] || 0) + 1;
    }

    const cacheHitRate = this.templateCache.size > 0 
      ? this.templateCache.size / this.steeringDocuments.size 
      : 0;

    return {
      totalDocuments: this.steeringDocuments.size,
      documentsByMode,
      documentsByType,
      documentsByPlugin,
      cacheHitRate
    };
  }

  // Private helper methods
  private async validateSteeringDeclaration(declaration: SteeringDocumentDeclaration): Promise<void> {
    if (!declaration.name || declaration.name.trim().length === 0) {
      throw new Error('Steering document name is required');
    }

    if (declaration.priority < 0 || declaration.priority > 1000) {
      throw new Error('Steering document priority must be between 0 and 1000');
    }

    if (declaration.mode === SteeringMode.CONDITIONAL && declaration.patterns.length === 0) {
      throw new Error('Conditional steering documents must specify at least one pattern');
    }

    // Validate pattern syntax
    for (const pattern of declaration.patterns) {
      try {
        new RegExp(pattern);
      } catch (error) {
        throw new Error(`Invalid pattern '${pattern}': ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  private async loadSteeringTemplate(
    pluginId: string, 
    declaration: SteeringDocumentDeclaration
  ): Promise<string | undefined> {
    if (!declaration.template || declaration.template.trim().length === 0) {
      return undefined;
    }

    try {
      // Check if template is a file path or inline content
      if (declaration.template.startsWith('./') || declaration.template.startsWith('../')) {
        // Resolve relative to plugin directory
        const pluginPath = await this.getPluginPath(pluginId);
        if (pluginPath) {
          const templatePath = this.fileSystem.join(pluginPath, declaration.template);
          if (await this.fileSystem.exists(templatePath)) {
            return await this.fileSystem.readFile(templatePath, 'utf8');
          }
        }
      }
      
      // Treat as inline template content
      return declaration.template;
    } catch (error) {
      this.logger.error('Failed to load steering template', {
        pluginId,
        template: declaration.template,
        error: error instanceof Error ? error.message : String(error)
      });
      return undefined;
    }
  }

  private async compileTemplate(documentId: string, template: string): Promise<void> {
    try {
      // Simple Handlebars-style template compilation
      const compiledTemplate = (context: SteeringContext): string => {
        let result = template;
        
        // Replace variables: {{variableName}}
        const variableRegex = /\{\{([^}]+)\}\}/g;
        result = result.replace(variableRegex, (match, variableName) => {
          const trimmedName = variableName.trim();
          const value = context.variables[trimmedName] || context.metadata[trimmedName];
          return value !== undefined ? String(value) : match;
        });

        // Replace context properties: {{@context.property}}
        const contextRegex = /\{\{@context\.([^}]+)\}\}/g;
        result = result.replace(contextRegex, (match, property) => {
          const value = (context as any)[property];
          return value !== undefined ? String(value) : match;
        });

        return result;
      };

      this.templateCache.set(documentId, compiledTemplate);
      
      // Manage cache size
      if (this.templateCache.size > this.maxCacheSize) {
        const firstKey = this.templateCache.keys().next().value;
        if (firstKey) {
          this.templateCache.delete(firstKey);
        }
      }
    } catch (error) {
      this.logger.error('Failed to compile steering template', {
        documentId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private async isDocumentApplicable(
    document: SteeringDocumentInternal, 
    context: SteeringContext
  ): Promise<boolean> {
    switch (document.mode) {
      case SteeringMode.ALWAYS:
        return true;
        
      case SteeringMode.CONDITIONAL:
        return this.matchesPatterns(document.patterns, context);
        
      case SteeringMode.MANUAL:
        // Manual documents are not automatically applicable
        return false;
        
      default:
        return false;
    }
  }

  private matchesPatterns(patterns: string[], context: SteeringContext): boolean {
    const currentFile = context.currentFile || '';
    
    return patterns.some(pattern => {
      try {
        const regex = new RegExp(pattern);
        return regex.test(currentFile);
      } catch (error) {
        this.logger.error('Invalid pattern in steering document', {
          pattern,
          error: error instanceof Error ? error.message : String(error)
        });
        return false;
      }
    });
  }

  private resolveVariables(
    variables: SteeringVariable[], 
    context: SteeringContext
  ): Record<string, unknown> {
    const resolved: Record<string, unknown> = {};
    
    for (const variable of variables) {
      let value = context.variables[variable.name];
      
      if (value === undefined) {
        value = variable.defaultValue;
      }
      
      if (value === undefined && variable.required) {
        this.logger.warn('Required steering variable not provided', {
          variableName: variable.name,
          variableType: variable.type
        });
      }
      
      resolved[variable.name] = value;
    }
    
    return resolved;
  }

  private async findConflictingDocuments(
    document: SteeringDocumentInternal, 
    existingResults: SteeringResult[]
  ): Promise<string[]> {
    const conflicts: string[] = [];
    
    // Check for conflicts with same type and similar priority
    for (const result of existingResults) {
      const otherDocument = this.findDocumentByContent(result.content || '');
      if (otherDocument && 
          otherDocument.type === document.type && 
          Math.abs(otherDocument.priority - document.priority) <= 10) {
        conflicts.push(otherDocument.id);
      }
    }
    
    return conflicts;
  }

  private findDocumentByContent(content: string): SteeringDocumentInternal | undefined {
    for (const document of this.steeringDocuments.values()) {
      if (document.content === content) {
        return document;
      }
    }
    return undefined;
  }

  private updateDocumentAccess(documentId: string): void {
    const document = this.steeringDocuments.get(documentId);
    if (document) {
      const updated: SteeringDocumentInternal = {
        ...document,
        accessCount: document.accessCount + 1,
        lastAccessed: new Date()
      };
      this.steeringDocuments.set(documentId, updated);
    }
  }

  private updateDocumentError(documentId: string, error: Error): void {
    const document = this.steeringDocuments.get(documentId);
    if (document) {
      const updated: SteeringDocumentInternal = {
        ...document,
        errorCount: document.errorCount + 1,
        lastError: error
      };
      this.steeringDocuments.set(documentId, updated);
    }
  }

  private async getPluginPath(pluginId: string): Promise<string | undefined> {
    // This would need to be integrated with the PluginManager
    // For now, return undefined to indicate path resolution not available
    return undefined;
  }
}