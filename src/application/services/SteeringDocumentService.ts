import { injectable, inject } from 'inversify';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { TYPES } from '../../infrastructure/di/types.js';
import { 
  FileSystemPort, 
  LoggerPort, 
  ValidationPort 
} from '../../domain/ports.js';
import {
  SteeringContext,
  SteeringDocument,
  SteeringDocumentType,
  SteeringMode,
  SteeringPreferences
} from '../../domain/context/ProjectContext.js';

export interface SteeringDocumentConfig {
  name: string;
  type: SteeringDocumentType;
  mode: SteeringMode;
  patterns?: string[];
  priority?: number;
  content?: string;
}

export interface SteeringValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
}

export interface SteeringApplicationResult {
  appliedDocuments: string[];
  skippedDocuments: string[];
  context: string;
  metadata: Record<string, unknown>;
}

@injectable()
export class SteeringDocumentService {
  private readonly defaultSteeringDocuments = [
    'product.md',
    'tech.md', 
    'structure.md',
    'linus-review.md'
  ];

  constructor(
    @inject(TYPES.FileSystemPort) private readonly fileSystem: FileSystemPort,
    @inject(TYPES.LoggerPort) private readonly logger: LoggerPort,
    @inject(TYPES.ValidationPort) private readonly validation: ValidationPort
  ) {}

  async loadSteeringContext(
    projectPath: string, 
    preferences: SteeringPreferences = this.getDefaultPreferences()
  ): Promise<SteeringContext> {
    const correlationId = uuidv4();
    
    this.logger.info('Loading steering context', {
      correlationId,
      projectPath,
      preferences
    });

    const steeringPath = path.join(projectPath, '.kiro', 'steering');
    const documents: SteeringDocument[] = [];

    try {
      if (await this.fileSystem.exists(steeringPath)) {
        const files = await this.fileSystem.readdir(steeringPath);
        
        for (const file of files) {
          if (file.endsWith('.md')) {
            const document = await this.loadSteeringDocument(
              path.join(steeringPath, file), 
              preferences
            );
            if (document) {
              documents.push(document);
            }
          }
        }
      }

      // Sort documents by priority
      documents.sort((a, b) => b.priority - a.priority);

      const activeDocuments = this.determineActiveDocuments(documents, preferences);

      this.logger.info('Steering context loaded', {
        correlationId,
        documentCount: documents.length,
        activeCount: activeDocuments.length
      });

      return {
        documents,
        mode: this.determineOverallMode(documents),
        activeDocuments,
        lastRefresh: new Date(),
        preferences
      };

    } catch (error) {
      this.logger.error('Failed to load steering context', error as Error, {
        correlationId,
        projectPath
      });

      return {
        documents: [],
        mode: SteeringMode.MANUAL,
        activeDocuments: [],
        lastRefresh: new Date(),
        preferences
      };
    }
  }

  private async loadSteeringDocument(
    filePath: string, 
    preferences: SteeringPreferences
  ): Promise<SteeringDocument | null> {
    try {
      const fileName = path.basename(filePath);
      const content = await this.fileSystem.readFile(filePath);
      const stat = await this.fileSystem.stat(filePath);
      
      const type = this.determineDocumentType(fileName, content);
      const mode = this.determineDocumentMode(fileName, content, preferences);
      const patterns = this.extractPatterns(fileName, content, preferences);
      const priority = this.calculatePriority(fileName, type, preferences);
      
      // Validate document
      const validation = await this.validateSteeringDocument(content, type);

      return {
        name: fileName,
        path: filePath,
        type,
        mode,
        content,
        patterns,
        priority,
        lastModified: (stat as any).mtime || new Date(),
        isValid: validation.isValid,
        errors: validation.isValid ? undefined : validation.errors
      };

    } catch (error) {
      this.logger.warn('Failed to load steering document', {
        filePath,
        error: (error as Error).message
      });
      return null;
    }
  }

  private determineDocumentType(fileName: string, content: string): SteeringDocumentType {
    const nameLower = fileName.toLowerCase();
    
    if (nameLower.includes('product')) {
      return SteeringDocumentType.PRODUCT;
    }
    
    if (nameLower.includes('tech') || nameLower.includes('technical')) {
      return SteeringDocumentType.TECHNICAL;
    }
    
    if (nameLower.includes('structure') || nameLower.includes('architecture')) {
      return SteeringDocumentType.STRUCTURE;
    }
    
    if (nameLower.includes('linus') || content.includes('Linus Torvalds')) {
      return SteeringDocumentType.LINUS_REVIEW;
    }
    
    return SteeringDocumentType.CUSTOM;
  }

  private determineDocumentMode(
    fileName: string, 
    content: string, 
    preferences: SteeringPreferences
  ): SteeringMode {
    // Check if specific mode is set in preferences
    if (preferences.priority[fileName]) {
      return preferences.priority[fileName] > 0 ? SteeringMode.ALWAYS : SteeringMode.MANUAL;
    }

    // Check for mode indicators in content
    if (content.includes('Mode: Always') || content.includes('Always included')) {
      return SteeringMode.ALWAYS;
    }
    
    if (content.includes('Mode: Conditional') || content.includes('Pattern:')) {
      return SteeringMode.CONDITIONAL;
    }
    
    if (content.includes('Mode: Manual') || content.includes('Reference with @')) {
      return SteeringMode.MANUAL;
    }

    // Default modes for standard documents
    const standardDocuments = ['product.md', 'tech.md', 'structure.md', 'linus-review.md'];
    if (standardDocuments.includes(fileName.toLowerCase())) {
      return SteeringMode.ALWAYS;
    }

    return SteeringMode.CONDITIONAL;
  }

  private extractPatterns(
    fileName: string, 
    content: string, 
    preferences: SteeringPreferences
  ): string[] {
    const patterns: string[] = [];

    // Extract patterns from content
    const patternMatches = content.match(/Pattern:\s*([^\n]+)/g);
    if (patternMatches) {
      for (const match of patternMatches) {
        const pattern = match.replace('Pattern:', '').trim();
        patterns.push(pattern);
      }
    }

    // Add patterns from preferences
    if (preferences.conditionalPatterns[fileName]) {
      patterns.push(...preferences.conditionalPatterns[fileName]);
    }

    // Default patterns for specific document types
    if (fileName.toLowerCase().includes('test')) {
      patterns.push('*.test.js', '*.spec.js', '*.test.ts', '*.spec.ts');
    }
    
    if (fileName.toLowerCase().includes('api')) {
      patterns.push('*/api/*', '*/routes/*', '*/controllers/*');
    }

    return patterns;
  }

  private calculatePriority(
    fileName: string, 
    type: SteeringDocumentType, 
    preferences: SteeringPreferences
  ): number {
    // Use explicit priority from preferences
    if (preferences.priority[fileName] !== undefined) {
      return preferences.priority[fileName];
    }

    // Default priorities by type
    const typePriorities: Record<SteeringDocumentType, number> = {
      [SteeringDocumentType.PRODUCT]: 100,
      [SteeringDocumentType.TECHNICAL]: 90,
      [SteeringDocumentType.STRUCTURE]: 80,
      [SteeringDocumentType.LINUS_REVIEW]: 70,
      [SteeringDocumentType.CUSTOM]: 50
    };

    return typePriorities[type] || 50;
  }

  private async validateSteeringDocument(
    content: string, 
    type: SteeringDocumentType
  ): Promise<SteeringValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];

    // Basic content validation
    if (content.trim().length < 50) {
      errors.push('Steering document is too short (less than 50 characters)');
    }

    // Type-specific validation
    switch (type) {
      case SteeringDocumentType.PRODUCT:
        if (!content.toLowerCase().includes('product') && !content.toLowerCase().includes('user')) {
          warnings.push('Product steering document should mention product goals or users');
        }
        break;

      case SteeringDocumentType.TECHNICAL:
        if (!content.toLowerCase().includes('technology') && !content.toLowerCase().includes('architecture')) {
          warnings.push('Technical steering document should mention technology choices or architecture');
        }
        break;

      case SteeringDocumentType.LINUS_REVIEW:
        const linusKeywords = ['complexity', 'simple', 'taste', 'special case'];
        const hasLinusContent = linusKeywords.some(keyword => 
          content.toLowerCase().includes(keyword)
        );
        if (!hasLinusContent) {
          warnings.push('Linus review document should include code review principles');
        }
        break;
    }

    // Check for markdown structure
    if (!content.includes('#')) {
      suggestions.push('Consider adding markdown headers for better structure');
    }

    // Check for actionable content
    if (!content.includes('-') && !content.includes('*') && !content.includes('1.')) {
      suggestions.push('Consider adding lists or numbered items for actionable guidance');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      suggestions
    };
  }

  private determineActiveDocuments(
    documents: SteeringDocument[], 
    preferences: SteeringPreferences
  ): string[] {
    const active: string[] = [];

    for (const doc of documents) {
      // Always include ALWAYS mode documents
      if (doc.mode === SteeringMode.ALWAYS && doc.isValid) {
        active.push(doc.name);
        continue;
      }

      // Skip MANUAL mode documents (they need explicit reference)
      if (doc.mode === SteeringMode.MANUAL) {
        continue;
      }

      // Include CONDITIONAL documents if they match patterns
      if (doc.mode === SteeringMode.CONDITIONAL && doc.isValid) {
        // For now, include all conditional documents
        // TODO: Implement pattern matching based on current context
        active.push(doc.name);
      }
    }

    return active;
  }

  private determineOverallMode(documents: SteeringDocument[]): SteeringMode {
    if (documents.length === 0) {
      return SteeringMode.MANUAL;
    }

    const hasAlways = documents.some(doc => doc.mode === SteeringMode.ALWAYS);
    const hasConditional = documents.some(doc => doc.mode === SteeringMode.CONDITIONAL);

    if (hasAlways) {
      return SteeringMode.ALWAYS;
    }
    
    if (hasConditional) {
      return SteeringMode.CONDITIONAL;
    }

    return SteeringMode.MANUAL;
  }

  async applySteeringContext(
    steeringContext: SteeringContext, 
    currentContext: {
      fileName?: string;
      filePath?: string;
      operation?: string;
      language?: string;
    }
  ): Promise<SteeringApplicationResult> {
    const correlationId = uuidv4();
    
    this.logger.debug('Applying steering context', {
      correlationId,
      activeDocuments: steeringContext.activeDocuments.length,
      currentContext
    });

    const appliedDocuments: string[] = [];
    const skippedDocuments: string[] = [];
    let contextText = '';
    const metadata: Record<string, unknown> = {};

    for (const document of steeringContext.documents) {
      let shouldApply = false;

      // Always apply ALWAYS mode documents that are active
      if (document.mode === SteeringMode.ALWAYS && steeringContext.activeDocuments.includes(document.name)) {
        shouldApply = true;
      }

      // Apply CONDITIONAL documents if patterns match
      if (document.mode === SteeringMode.CONDITIONAL && document.patterns.length > 0) {
        shouldApply = this.matchesPatterns(document.patterns, currentContext);
      }

      if (shouldApply && document.isValid) {
        appliedDocuments.push(document.name);
        contextText += `\n\n## ${document.name}\n\n${document.content}`;
        metadata[document.name] = {
          type: document.type,
          priority: document.priority,
          lastModified: document.lastModified
        };
      } else {
        skippedDocuments.push(document.name);
      }
    }

    this.logger.debug('Steering context applied', {
      correlationId,
      appliedCount: appliedDocuments.length,
      skippedCount: skippedDocuments.length
    });

    return {
      appliedDocuments,
      skippedDocuments,
      context: contextText.trim(),
      metadata
    };
  }

  private matchesPatterns(
    patterns: string[], 
    context: {
      fileName?: string;
      filePath?: string;
      operation?: string;
      language?: string;
    }
  ): boolean {
    if (patterns.length === 0) {
      return true; // No patterns means always apply
    }

    for (const pattern of patterns) {
      // Simple pattern matching
      if (context.fileName && this.matchPattern(pattern, context.fileName)) {
        return true;
      }
      
      if (context.filePath && this.matchPattern(pattern, context.filePath)) {
        return true;
      }
      
      if (context.operation && pattern.toLowerCase().includes(context.operation.toLowerCase())) {
        return true;
      }
      
      if (context.language && pattern.toLowerCase().includes(context.language.toLowerCase())) {
        return true;
      }
    }

    return false;
  }

  private matchPattern(pattern: string, text: string): boolean {
    // Convert glob pattern to regex (simplified)
    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    
    try {
      const regex = new RegExp(`^${regexPattern}$`, 'i');
      return regex.test(text);
    } catch {
      // Fallback to simple includes
      return text.toLowerCase().includes(pattern.toLowerCase());
    }
  }

  async refreshSteeringContext(
    projectPath: string, 
    currentContext: SteeringContext
  ): Promise<SteeringContext> {
    const correlationId = uuidv4();
    
    this.logger.info('Refreshing steering context', {
      correlationId,
      projectPath,
      currentDocumentCount: currentContext.documents.length
    });

    // Check if any documents have been modified
    let hasChanges = false;
    const updatedDocuments: SteeringDocument[] = [];

    for (const doc of currentContext.documents) {
      try {
        const stat = await this.fileSystem.stat(doc.path);
        const lastModified = (stat as any).mtime || new Date();
        
        if (lastModified.getTime() > doc.lastModified.getTime()) {
          hasChanges = true;
          const updatedDoc = await this.loadSteeringDocument(doc.path, currentContext.preferences);
          if (updatedDoc) {
            updatedDocuments.push(updatedDoc);
          }
        } else {
          updatedDocuments.push(doc);
        }
      } catch (error) {
        this.logger.warn('Document no longer accessible', { path: doc.path });
        hasChanges = true;
        // Skip this document (it was deleted or moved)
      }
    }

    // Check for new documents
    const steeringPath = path.join(projectPath, '.kiro', 'steering');
    if (await this.fileSystem.exists(steeringPath)) {
      const files = await this.fileSystem.readdir(steeringPath);
      const existingPaths = new Set(currentContext.documents.map(d => d.path));

      for (const file of files) {
        if (file.endsWith('.md')) {
          const filePath = path.join(steeringPath, file);
          if (!existingPaths.has(filePath)) {
            hasChanges = true;
            const newDoc = await this.loadSteeringDocument(filePath, currentContext.preferences);
            if (newDoc) {
              updatedDocuments.push(newDoc);
            }
          }
        }
      }
    }

    if (!hasChanges) {
      this.logger.debug('No changes detected in steering context', { correlationId });
      return {
        ...currentContext,
        lastRefresh: new Date()
      };
    }

    // Sort and determine active documents
    updatedDocuments.sort((a, b) => b.priority - a.priority);
    const activeDocuments = this.determineActiveDocuments(updatedDocuments, currentContext.preferences);

    this.logger.info('Steering context refreshed', {
      correlationId,
      documentCount: updatedDocuments.length,
      activeCount: activeDocuments.length,
      hasChanges
    });

    return {
      documents: updatedDocuments,
      mode: this.determineOverallMode(updatedDocuments),
      activeDocuments,
      lastRefresh: new Date(),
      preferences: currentContext.preferences
    };
  }

  async createSteeringDocument(
    projectPath: string, 
    config: SteeringDocumentConfig
  ): Promise<SteeringDocument> {
    const correlationId = uuidv4();
    
    this.logger.info('Creating steering document', {
      correlationId,
      projectPath,
      name: config.name,
      type: config.type
    });

    const steeringPath = path.join(projectPath, '.kiro', 'steering');
    
    // Ensure steering directory exists
    if (!(await this.fileSystem.exists(steeringPath))) {
      await this.fileSystem.mkdir(steeringPath);
    }

    const filePath = path.join(steeringPath, config.name);
    const content = config.content || this.generateDefaultContent(config.type, config.name);

    await this.fileSystem.writeFile(filePath, content);

    const document: SteeringDocument = {
      name: config.name,
      path: filePath,
      type: config.type,
      mode: config.mode || SteeringMode.CONDITIONAL,
      content,
      patterns: config.patterns || [],
      priority: config.priority || 50,
      lastModified: new Date(),
      isValid: true
    };

    this.logger.info('Steering document created', {
      correlationId,
      name: config.name,
      path: filePath
    });

    return document;
  }

  private generateDefaultContent(type: SteeringDocumentType, name: string): string {
    const timestamp = new Date().toISOString();

    switch (type) {
      case SteeringDocumentType.PRODUCT:
        return `# Product Steering Document

## Project Overview
Define the product vision, target users, and business objectives.

## Target Users
- Primary user persona
- Secondary user persona

## Success Metrics
- Key performance indicators
- Success criteria

## Constraints
- Business constraints
- Technical constraints

Generated on: ${timestamp}
`;

      case SteeringDocumentType.TECHNICAL:
        return `# Technical Steering Document

## Technology Stack
Define the approved technologies, frameworks, and tools.

## Architecture Principles
- Principle 1
- Principle 2

## Quality Standards
- Code quality requirements
- Testing requirements
- Performance requirements

## Security Guidelines
- Security best practices
- Compliance requirements

Generated on: ${timestamp}
`;

      case SteeringDocumentType.STRUCTURE:
        return `# Structure Steering Document

## Directory Structure
Define the project organization and file naming conventions.

## Code Organization
- Module structure
- File naming conventions
- Import/export patterns

## Documentation Standards
- README requirements
- Code documentation
- API documentation

Generated on: ${timestamp}
`;

      default:
        return `# ${name}

## Purpose
Define the purpose and scope of this steering document.

## Guidelines
- Guideline 1
- Guideline 2

## Usage
Describe when and how this steering document should be applied.

Generated on: ${timestamp}
`;
    }
  }

  private getDefaultPreferences(): SteeringPreferences {
    return {
      autoRefresh: true,
      conditionalPatterns: {},
      excludePatterns: ['node_modules/**', 'dist/**', 'build/**'],
      priority: {
        'product.md': 100,
        'tech.md': 90,
        'structure.md': 80,
        'linus-review.md': 70
      }
    };
  }

  async getSteeringStats(steeringContext: SteeringContext): Promise<{
    totalDocuments: number;
    activeDocuments: number;
    documentsByType: Record<SteeringDocumentType, number>;
    documentsByMode: Record<SteeringMode, number>;
    validDocuments: number;
    lastRefresh: Date;
  }> {
    const documentsByType: Record<SteeringDocumentType, number> = {} as any;
    const documentsByMode: Record<SteeringMode, number> = {} as any;
    let validDocuments = 0;

    for (const doc of steeringContext.documents) {
      documentsByType[doc.type] = (documentsByType[doc.type] || 0) + 1;
      documentsByMode[doc.mode] = (documentsByMode[doc.mode] || 0) + 1;
      if (doc.isValid) validDocuments++;
    }

    return {
      totalDocuments: steeringContext.documents.length,
      activeDocuments: steeringContext.activeDocuments.length,
      documentsByType,
      documentsByMode,
      validDocuments,
      lastRefresh: steeringContext.lastRefresh
    };
  }
}