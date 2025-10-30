// Dependency injection type identifiers

export const TYPES = {
  // Domain ports
  ProjectRepository: Symbol.for("ProjectRepository"),
  FileSystemPort: Symbol.for("FileSystemPort"),
  TemplateEngine: Symbol.for("TemplateEngine"),
  ConfigurationPort: Symbol.for("ConfigurationPort"),
  LoggerPort: Symbol.for("LoggerPort"),
  ValidationPort: Symbol.for("ValidationPort"),
  QualityAnalyzer: Symbol.for("QualityAnalyzer"),
  TaskTracker: Symbol.for("TaskTracker"),
  TemplateRendererPort: Symbol.for("TemplateRendererPort"),
  TemplateManagerPort: Symbol.for("TemplateManagerPort"),
  FileGeneratorPort: Symbol.for("FileGeneratorPort"),
  CodeQualityAnalyzerPort: Symbol.for("CodeQualityAnalyzerPort"),
  I18nService: Symbol.for("I18nService"),
  I18nManagerPort: Symbol.for("I18nManagerPort"),
  PlatformAdapter: Symbol.for("PlatformAdapter"),

  // Application services
  ProjectService: Symbol.for("ProjectService"),
  WorkflowService: Symbol.for("WorkflowService"),
  TemplateService: Symbol.for("TemplateService"),
  QualityService: Symbol.for("QualityService"),
  QualityGateService: Symbol.for("QualityGateService"),
  WorkflowEngineService: Symbol.for("WorkflowEngineService"),
  ProjectInitializationService: Symbol.for("ProjectInitializationService"),
  WorkflowValidationService: Symbol.for("WorkflowValidationService"),
  CodebaseAnalysisService: Symbol.for("CodebaseAnalysisService"),
  SteeringDocumentService: Symbol.for("SteeringDocumentService"),
  ProjectContextService: Symbol.for("ProjectContextService"),
  RequirementsClarificationService: Symbol.for(
    "RequirementsClarificationService",
  ),
  SteeringContextLoader: Symbol.for("SteeringContextLoader"),
  DescriptionAnalyzer: Symbol.for("DescriptionAnalyzer"),
  QuestionGenerator: Symbol.for("QuestionGenerator"),
  AnswerValidator: Symbol.for("AnswerValidator"),
  DescriptionEnricher: Symbol.for("DescriptionEnricher"),

  // MCP components
  MCPServer: Symbol.for("MCPServer"),
  MCPErrorHandler: Symbol.for("MCPErrorHandler"),
  CapabilityNegotiator: Symbol.for("CapabilityNegotiator"),
  SessionManager: Symbol.for("SessionManager"),
  ResourceManager: Symbol.for("ResourceManager"),
  PromptManager: Symbol.for("PromptManager"),
  ToolRegistry: Symbol.for("ToolRegistry"),
  SDDToolAdapter: Symbol.for("SDDToolAdapter"),

  // Plugin system components
  PluginManager: Symbol.for("PluginManager"),
  HookSystem: Symbol.for("HookSystem"),
  PluginToolRegistry: Symbol.for("PluginToolRegistry"),
  PluginSteeringRegistry: Symbol.for("PluginSteeringRegistry"),
} as const;
