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

  // Application services
  ProjectService: Symbol.for('ProjectService'),
  WorkflowService: Symbol.for('WorkflowService'),
  TemplateService: Symbol.for('TemplateService'),
  QualityService: Symbol.for('QualityService'),

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