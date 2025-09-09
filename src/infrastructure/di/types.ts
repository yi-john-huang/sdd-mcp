// Dependency injection type identifiers

export const TYPES = {
  // Domain ports
  ProjectRepository: Symbol.for('ProjectRepository'),
  FileSystemPort: Symbol.for('FileSystemPort'),
  TemplateEngine: Symbol.for('TemplateEngine'),
  ConfigurationPort: Symbol.for('ConfigurationPort'),
  LoggerPort: Symbol.for('LoggerPort'),
  ValidationPort: Symbol.for('ValidationPort'),
  QualityAnalyzer: Symbol.for('QualityAnalyzer'),
  TaskTracker: Symbol.for('TaskTracker'),
  TemplateRendererPort: Symbol.for('TemplateRendererPort'),
  TemplateManagerPort: Symbol.for('TemplateManagerPort'),
  FileGeneratorPort: Symbol.for('FileGeneratorPort'),
  CodeQualityAnalyzerPort: Symbol.for('CodeQualityAnalyzerPort'),

  // Application services
  ProjectService: Symbol.for('ProjectService'),
  WorkflowService: Symbol.for('WorkflowService'),
  TemplateService: Symbol.for('TemplateService'),
  QualityService: Symbol.for('QualityService'),
  WorkflowEngineService: Symbol.for('WorkflowEngineService'),
  ProjectInitializationService: Symbol.for('ProjectInitializationService'),
  WorkflowValidationService: Symbol.for('WorkflowValidationService'),
  CodebaseAnalysisService: Symbol.for('CodebaseAnalysisService'),
  SteeringDocumentService: Symbol.for('SteeringDocumentService'),
  ProjectContextService: Symbol.for('ProjectContextService'),

  // MCP components
  MCPServer: Symbol.for('MCPServer'),
  MCPErrorHandler: Symbol.for('MCPErrorHandler'),
  CapabilityNegotiator: Symbol.for('CapabilityNegotiator'),
  SessionManager: Symbol.for('SessionManager'),
  ResourceManager: Symbol.for('ResourceManager'),
  PromptManager: Symbol.for('PromptManager'),
  ToolRegistry: Symbol.for('ToolRegistry'),
  SDDToolAdapter: Symbol.for('SDDToolAdapter')
} as const;