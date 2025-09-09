import { injectable, inject } from 'inversify';
import { v4 as uuidv4 } from 'uuid';
import { TYPES } from '../../infrastructure/di/types.js';
import { 
  FileSystemPort, 
  LoggerPort, 
  ConfigurationPort 
} from '../../domain/ports.js';
import {
  ProjectContext,
  ProjectContextMetadata,
  SessionContext,
  SessionPreferences,
  ContextChangeEntry,
  ContextCache,
  CacheEntry,
  ChangeHistoryEntry,
  ContextChangeType,
  ContextImpact,
  ChangeType,
  ChangeImpact,
  CodeComplexity
} from '../../domain/context/ProjectContext.js';
import { CodebaseAnalysisService, AnalysisOptions } from './CodebaseAnalysisService.js';
import { SteeringDocumentService } from './SteeringDocumentService.js';

export interface ContextLoadOptions {
  forceRefresh?: boolean;
  includeFullAnalysis?: boolean;
  sessionId?: string;
  preferences?: SessionPreferences;
}

export interface ContextPersistenceOptions {
  includeAnalysis?: boolean;
  includeCache?: boolean;
  maxHistoryEntries?: number;
}

export interface ContextChangeDetection {
  hasChanges: boolean;
  changedFiles: string[];
  changeTypes: ContextChangeType[];
  impactLevel: ContextImpact;
  recommendations: string[];
}

@injectable()
export class ProjectContextService {
  private readonly contextCache = new Map<string, ProjectContext>();
  private readonly sessionContexts = new Map<string, SessionContext>();

  constructor(
    @inject(TYPES.FileSystemPort) private readonly fileSystem: FileSystemPort,
    @inject(TYPES.CodebaseAnalysisService) private readonly codebaseAnalysis: CodebaseAnalysisService,
    @inject(TYPES.SteeringDocumentService) private readonly steeringService: SteeringDocumentService,
    @inject(TYPES.LoggerPort) private readonly logger: LoggerPort,
    @inject(TYPES.ConfigurationPort) private readonly config: ConfigurationPort
  ) {}

  async loadProjectContext(
    projectId: string, 
    projectPath: string, 
    options: ContextLoadOptions = {}
  ): Promise<ProjectContext> {
    const correlationId = uuidv4();
    
    this.logger.info('Loading project context', {
      correlationId,
      projectId,
      projectPath,
      options
    });

    try {
      // Check cache first unless force refresh is requested
      if (!options.forceRefresh) {
        const cached = this.contextCache.get(projectId);
        if (cached && this.isCacheValid(cached)) {
          this.logger.debug('Using cached project context', { correlationId, projectId });
          return cached;
        }
      }

      // Load or create session context
      const sessionContext = this.getOrCreateSessionContext(
        options.sessionId || uuidv4(),
        projectPath,
        options.preferences
      );

      // Load project metadata
      const metadata = await this.loadProjectMetadata(projectPath);

      // Analyze codebase
      const analysisOptions: AnalysisOptions = {
        includeNodeModules: false,
        includeBuildOutputs: false,
        maxDepth: 10
      };
      
      const codebase = options.includeFullAnalysis !== false 
        ? await this.codebaseAnalysis.analyzeCodebase(projectPath, analysisOptions)
        : await this.createMinimalCodebaseAnalysis(projectPath);

      // Load steering context
      const steering = await this.steeringService.loadSteeringContext(
        projectPath,
        sessionContext.preferences.language ? {
          autoRefresh: true,
          conditionalPatterns: {},
          excludePatterns: [],
          priority: {}
        } : undefined
      );

      // Create project context
      const context: ProjectContext = {
        projectId,
        basePath: projectPath,
        metadata,
        codebase,
        steering,
        session: sessionContext,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Cache the context
      this.contextCache.set(projectId, context);

      // Persist context if needed
      if (sessionContext.preferences.autoSave) {
        await this.persistProjectContext(context);
      }

      this.logger.info('Project context loaded successfully', {
        correlationId,
        projectId,
        filesAnalyzed: codebase.structure.totalFiles,
        steeringDocuments: steering.documents.length,
        cacheSize: this.contextCache.size
      });

      return context;

    } catch (error) {
      this.logger.error('Failed to load project context', error as Error, {
        correlationId,
        projectId,
        projectPath
      });

      // Return minimal context on failure
      return this.createMinimalProjectContext(projectId, projectPath, options.sessionId);
    }
  }

  async updateProjectContext(
    projectId: string, 
    changes: Partial<ProjectContextMetadata>,
    triggeredBy: string
  ): Promise<ProjectContext> {
    const correlationId = uuidv4();
    
    this.logger.info('Updating project context', {
      correlationId,
      projectId,
      changes: Object.keys(changes),
      triggeredBy
    });

    const context = this.contextCache.get(projectId);
    if (!context) {
      throw new Error(`Project context not found: ${projectId}`);
    }

    // Create change history entry
    const changeEntry: ChangeHistoryEntry = {
      id: uuidv4(),
      timestamp: new Date(),
      type: this.determineChangeType(changes),
      files: [], // TODO: Determine affected files
      impact: this.assessChangeImpact(changes),
      triggeredBy
    };

    // Update metadata
    const updatedMetadata: ProjectContextMetadata = {
      ...context.metadata,
      ...changes,
      changeHistory: [...context.metadata.changeHistory, changeEntry]
    };

    // Create updated context
    const updatedContext: ProjectContext = {
      ...context,
      metadata: updatedMetadata,
      updatedAt: new Date()
    };

    // Update cache
    this.contextCache.set(projectId, updatedContext);

    // Record context change
    this.recordContextChange(
      context.session.sessionId,
      ContextChangeType.ANALYSIS_REFRESHED,
      'Project context metadata updated',
      { changes, triggeredBy },
      this.assessChangeImpact(changes)
    );

    this.logger.info('Project context updated successfully', {
      correlationId,
      projectId,
      impactLevel: changeEntry.impact
    });

    return updatedContext;
  }

  async refreshProjectContext(
    projectId: string, 
    triggeredBy: string,
    options: { 
      refreshCodebase?: boolean; 
      refreshSteering?: boolean; 
      detectChanges?: boolean 
    } = {}
  ): Promise<{
    context: ProjectContext;
    changeDetection?: ContextChangeDetection;
  }> {
    const correlationId = uuidv4();
    
    this.logger.info('Refreshing project context', {
      correlationId,
      projectId,
      options,
      triggeredBy
    });

    const currentContext = this.contextCache.get(projectId);
    if (!currentContext) {
      throw new Error(`Project context not found: ${projectId}`);
    }

    let changeDetection: ContextChangeDetection | undefined;
    let hasChanges = false;

    // Detect changes if requested
    if (options.detectChanges) {
      changeDetection = await this.detectContextChanges(currentContext);
      hasChanges = changeDetection.hasChanges;
    }

    let updatedContext = currentContext;

    // Refresh codebase analysis if needed
    if (options.refreshCodebase || hasChanges) {
      const newCodebase = await this.codebaseAnalysis.analyzeCodebase(
        currentContext.basePath,
        { includeNodeModules: false, includeBuildOutputs: false }
      );
      
      updatedContext = {
        ...updatedContext,
        codebase: newCodebase,
        updatedAt: new Date()
      };
      
      this.recordContextChange(
        currentContext.session.sessionId,
        ContextChangeType.ANALYSIS_REFRESHED,
        'Codebase analysis refreshed',
        { fileCount: newCodebase.structure.totalFiles },
        ContextImpact.MEDIUM
      );
    }

    // Refresh steering context if needed
    if (options.refreshSteering || hasChanges) {
      const newSteering = await this.steeringService.refreshSteeringContext(
        currentContext.basePath,
        currentContext.steering
      );
      
      if (newSteering.lastRefresh.getTime() > currentContext.steering.lastRefresh.getTime()) {
        updatedContext = {
          ...updatedContext,
          steering: newSteering,
          updatedAt: new Date()
        };
        
        this.recordContextChange(
          currentContext.session.sessionId,
          ContextChangeType.STEERING_UPDATED,
          'Steering documents refreshed',
          { documentCount: newSteering.documents.length },
          ContextImpact.LOW
        );
      }
    }

    // Update cache
    this.contextCache.set(projectId, updatedContext);

    this.logger.info('Project context refreshed', {
      correlationId,
      projectId,
      hasChanges,
      refreshedCodebase: options.refreshCodebase,
      refreshedSteering: options.refreshSteering
    });

    return {
      context: updatedContext,
      changeDetection
    };
  }

  private async detectContextChanges(context: ProjectContext): Promise<ContextChangeDetection> {
    const changedFiles: string[] = [];
    const changeTypes: ContextChangeType[] = [];
    let impactLevel = ContextImpact.LOW;
    const recommendations: string[] = [];

    try {
      // Check for file changes in project directory
      const currentFiles = new Set<string>();
      
      // Simple file change detection (in production, would use file watching or git)
      for (const file of context.codebase.structure.files) {
        try {
          const filePath = `${context.basePath}/${file.path}`;
          const stat = await this.fileSystem.stat(filePath);
          const currentModified = (stat as any).mtime || new Date();
          
          if (currentModified.getTime() > file.lastModified.getTime()) {
            changedFiles.push(file.path);
            
            if (file.type === 'source') {
              changeTypes.push(ContextChangeType.FILE_MODIFIED);
              impactLevel = ContextImpact.MEDIUM;
            } else if (file.name === 'package.json') {
              changeTypes.push(ContextChangeType.DEPENDENCY_ADDED);
              impactLevel = ContextImpact.HIGH;
            }
          }
          
          currentFiles.add(file.path);
        } catch (error) {
          // File was deleted
          changedFiles.push(file.path);
          changeTypes.push(ContextChangeType.FILE_DELETED);
          impactLevel = ContextImpact.MEDIUM;
        }
      }

      // Generate recommendations
      if (changedFiles.length > 0) {
        recommendations.push('Consider refreshing codebase analysis');
        
        if (changedFiles.some(f => f.includes('package.json'))) {
          recommendations.push('Dependencies may have changed - refresh dependency analysis');
        }
        
        if (changedFiles.some(f => f.includes('.kiro/steering'))) {
          recommendations.push('Steering documents changed - refresh steering context');
        }
      }

    } catch (error) {
      this.logger.warn('Failed to detect context changes', {
        projectId: context.projectId,
        error: (error as Error).message
      });
    }

    return {
      hasChanges: changedFiles.length > 0,
      changedFiles,
      changeTypes: [...new Set(changeTypes)],
      impactLevel,
      recommendations
    };
  }

  async persistProjectContext(
    context: ProjectContext, 
    options: ContextPersistenceOptions = {}
  ): Promise<void> {
    const correlationId = uuidv4();
    
    this.logger.debug('Persisting project context', {
      correlationId,
      projectId: context.projectId,
      options
    });

    try {
      const contextDir = `${context.basePath}/.kiro/context`;
      if (!(await this.fileSystem.exists(contextDir))) {
        await this.fileSystem.mkdir(contextDir);
      }

      const contextFile = `${contextDir}/${context.projectId}.json`;
      
      // Create serializable context (exclude large objects if requested)
      const persistableContext = {
        projectId: context.projectId,
        basePath: context.basePath,
        metadata: options.maxHistoryEntries 
          ? {
              ...context.metadata,
              changeHistory: context.metadata.changeHistory.slice(-options.maxHistoryEntries)
            }
          : context.metadata,
        codebase: options.includeAnalysis !== false ? context.codebase : undefined,
        steering: {
          ...context.steering,
          documents: context.steering.documents.map(doc => ({
            ...doc,
            content: doc.content.length > 10000 ? doc.content.substring(0, 10000) + '...' : doc.content
          }))
        },
        session: {
          ...context.session,
          cache: options.includeCache ? context.session.cache : undefined
        },
        createdAt: context.createdAt,
        updatedAt: context.updatedAt
      };

      await this.fileSystem.writeFile(contextFile, JSON.stringify(persistableContext, null, 2));

      this.logger.debug('Project context persisted successfully', {
        correlationId,
        projectId: context.projectId,
        filePath: contextFile
      });

    } catch (error) {
      this.logger.error('Failed to persist project context', error as Error, {
        correlationId,
        projectId: context.projectId
      });
    }
  }

  async loadPersistedContext(projectId: string, projectPath: string): Promise<ProjectContext | null> {
    try {
      const contextFile = `${projectPath}/.kiro/context/${projectId}.json`;
      
      if (await this.fileSystem.exists(contextFile)) {
        const content = await this.fileSystem.readFile(contextFile);
        const persistedData = JSON.parse(content);
        
        // Reconstruct full context (this is a simplified version)
        return persistedData as ProjectContext;
      }
    } catch (error) {
      this.logger.debug('Failed to load persisted context', {
        projectId,
        error: (error as Error).message
      });
    }
    
    return null;
  }

  private getOrCreateSessionContext(
    sessionId: string, 
    workingDirectory: string,
    preferences?: SessionPreferences
  ): SessionContext {
    let sessionContext = this.sessionContexts.get(sessionId);
    
    if (!sessionContext) {
      sessionContext = {
        sessionId,
        workingDirectory,
        preferences: preferences || this.getDefaultSessionPreferences(),
        history: [],
        cache: {
          analyses: {},
          dependencies: {},
          steering: {},
          maxAge: 60, // 60 minutes
          size: 0
        }
      };
      
      this.sessionContexts.set(sessionId, sessionContext);
    }
    
    return sessionContext;
  }

  private getDefaultSessionPreferences(): SessionPreferences {
    return {
      language: 'en',
      verbosity: 'standard',
      autoSave: true,
      contextWindow: 30 // 30 minutes
    };
  }

  private recordContextChange(
    sessionId: string,
    type: ContextChangeType,
    description: string,
    data: Record<string, unknown>,
    impact: ContextImpact
  ): void {
    const sessionContext = this.sessionContexts.get(sessionId);
    if (sessionContext) {
      const changeEntry: ContextChangeEntry = {
        timestamp: new Date(),
        type,
        description,
        data,
        impact
      };
      
      sessionContext.history.push(changeEntry);
      
      // Keep only recent entries
      const maxEntries = 100;
      if (sessionContext.history.length > maxEntries) {
        sessionContext.history = sessionContext.history.slice(-maxEntries);
      }
    }
  }

  private async loadProjectMetadata(projectPath: string): Promise<ProjectContextMetadata> {
    // Try to load from spec.json first
    const specJsonPath = `${projectPath}/.kiro/specs`;
    let name = 'Unknown Project';
    let description: string | undefined;
    
    try {
      if (await this.fileSystem.exists(specJsonPath)) {
        const specs = await this.fileSystem.readdir(specJsonPath);
        if (specs.length > 0) {
          const specFile = `${specJsonPath}/${specs[0]}/spec.json`;
          if (await this.fileSystem.exists(specFile)) {
            const specContent = await this.fileSystem.readFile(specFile);
            const spec = JSON.parse(specContent);
            name = spec.feature_name || name;
          }
        }
      }
    } catch (error) {
      this.logger.debug('Failed to load project metadata from spec.json', { projectPath });
    }

    return {
      name,
      description,
      technology: {
        primary: [],
        frameworks: [],
        tools: [],
        runtime: []
      },
      architecture: {
        name: 'unknown' as any,
        confidence: 0,
        evidence: [],
        violations: []
      },
      complexity: CodeComplexity.MODERATE,
      changeHistory: []
    };
  }

  private async createMinimalCodebaseAnalysis(projectPath: string) {
    // Return a minimal analysis without full traversal
    return {
      structure: {
        root: projectPath,
        directories: [],
        files: [],
        totalFiles: 0,
        totalDirectories: 0,
        gitIgnored: []
      },
      dependencies: {
        external: [],
        internal: [],
        devDependencies: [],
        peerDependencies: [],
        graph: { nodes: [], edges: [], cycles: [], orphans: [] }
      },
      patterns: [],
      metrics: {
        linesOfCode: 0,
        complexity: {
          cyclomatic: 0,
          cognitive: 0,
          halstead: { vocabulary: 0, length: 0, difficulty: 0, effort: 0, timeToCode: 0, bugsDelivered: 0 },
          nesting: { average: 0, maximum: 0, violationsOver3: 0 }
        },
        maintainability: { index: 0, duplication: 0, cohesion: 0, coupling: 0, debtRatio: 0 },
        qualityScore: 0
      },
      hotspots: [],
      lastAnalyzed: new Date()
    };
  }

  private createMinimalProjectContext(
    projectId: string, 
    projectPath: string, 
    sessionId?: string
  ): ProjectContext {
    const sessionContext = this.getOrCreateSessionContext(
      sessionId || uuidv4(),
      projectPath
    );

    return {
      projectId,
      basePath: projectPath,
      metadata: {
        name: 'Unknown Project',
        technology: { primary: [], frameworks: [], tools: [], runtime: [] },
        architecture: { name: 'unknown' as any, confidence: 0, evidence: [], violations: [] },
        complexity: CodeComplexity.MODERATE,
        changeHistory: []
      },
      codebase: {
        structure: { root: projectPath, directories: [], files: [], totalFiles: 0, totalDirectories: 0, gitIgnored: [] },
        dependencies: { external: [], internal: [], devDependencies: [], peerDependencies: [], graph: { nodes: [], edges: [], cycles: [], orphans: [] } },
        patterns: [],
        metrics: { linesOfCode: 0, complexity: { cyclomatic: 0, cognitive: 0, halstead: { vocabulary: 0, length: 0, difficulty: 0, effort: 0, timeToCode: 0, bugsDelivered: 0 }, nesting: { average: 0, maximum: 0, violationsOver3: 0 } }, maintainability: { index: 0, duplication: 0, cohesion: 0, coupling: 0, debtRatio: 0 }, qualityScore: 0 },
        hotspots: [],
        lastAnalyzed: new Date()
      },
      steering: { documents: [], mode: 'manual' as any, activeDocuments: [], lastRefresh: new Date(), preferences: { autoRefresh: true, conditionalPatterns: {}, excludePatterns: [], priority: {} } },
      session: sessionContext,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  private isCacheValid(context: ProjectContext): boolean {
    const maxAge = 15 * 60 * 1000; // 15 minutes
    return Date.now() - context.updatedAt.getTime() < maxAge;
  }

  private determineChangeType(changes: Partial<ProjectContextMetadata>): ChangeType {
    if (changes.technology) return ChangeType.DEPENDENCY_CHANGE;
    if (changes.architecture) return ChangeType.STRUCTURE_CHANGE;
    return ChangeType.CODE_CHANGE;
  }

  private assessChangeImpact(changes: Partial<ProjectContextMetadata>): ChangeImpact {
    if (changes.architecture || changes.technology) return ChangeImpact.MAJOR;
    if (changes.complexity) return ChangeImpact.MODERATE;
    return ChangeImpact.MINOR;
  }

  async getContextStats(): Promise<{
    cachedContexts: number;
    activeSessions: number;
    totalMemoryUsage: string;
    oldestContext: Date | null;
  }> {
    const oldestContext = Array.from(this.contextCache.values())
      .reduce((oldest, context) => {
        return !oldest || context.createdAt < oldest ? context.createdAt : oldest;
      }, null as Date | null);

    return {
      cachedContexts: this.contextCache.size,
      activeSessions: this.sessionContexts.size,
      totalMemoryUsage: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
      oldestContext
    };
  }
}