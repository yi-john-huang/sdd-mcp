// Dependency injection container using Inversify

import 'reflect-metadata';
import { Container } from 'inversify';
import { TYPES } from './types.js';

// Domain ports
import type { 
  ProjectRepository,
  FileSystemPort,
  TemplateEngine,
  ConfigurationPort,
  LoggerPort,
  ValidationPort,
  QualityAnalyzer,
  TaskTracker
} from '../../domain/ports.js';

// Template ports
import type {
  TemplateRendererPort,
  TemplateManagerPort,
  FileGeneratorPort
} from '../../domain/templates/index.js';

// Quality ports
import type {
  CodeQualityAnalyzerPort
} from '../../domain/quality/index.js';

// I18n ports
import type {
  I18nService,
  I18nManagerPort,
  PlatformAdapter as IPlatformAdapter
} from '../../domain/i18n/index.js';

// Infrastructure adapters
import { InMemoryProjectRepository } from '../repositories/InMemoryProjectRepository.js';
import { NodeFileSystemAdapter } from '../adapters/NodeFileSystemAdapter.js';
import { HandlebarsTemplateEngine } from '../adapters/HandlebarsTemplateEngine.js';
import { JsonConfigurationAdapter } from '../adapters/JsonConfigurationAdapter.js';
import { ConsoleLoggerAdapter } from '../adapters/ConsoleLoggerAdapter.js';
import { AjvValidationAdapter } from '../adapters/AjvValidationAdapter.js';
import { LinusQualityAnalyzer } from '../adapters/LinusQualityAnalyzer.js';
import { FileBasedTaskTracker } from '../adapters/FileBasedTaskTracker.js';

// Template infrastructure
import { HandlebarsRenderer } from '../templates/HandlebarsRenderer.js';
import { TemplateManager } from '../templates/TemplateManager.js';
import { FileGenerator } from '../templates/FileGenerator.js';

// Quality infrastructure
import { LinusCodeReviewer } from '../quality/LinusCodeReviewer.js';

// I18n infrastructure
import { I18nextService } from '../i18n/I18nextService.js';
import { PlatformAdapter } from '../platform/PlatformAdapter.js';
import { LocalizationService } from '../../application/services/LocalizationService.js';

// MCP components
import { MCPServer } from '../mcp/MCPServer.js';
import { MCPErrorHandler } from '../mcp/ErrorHandler.js';
import { CapabilityNegotiator } from '../mcp/CapabilityNegotiator.js';
import { SessionManager } from '../mcp/SessionManager.js';
import { ResourceManager } from '../mcp/ResourceManager.js';
import { PromptManager } from '../mcp/PromptManager.js';
import { ToolRegistry } from '../mcp/ToolRegistry.js';

// Application services
import { ProjectService } from '../../application/services/ProjectService.js';
import { WorkflowService } from '../../application/services/WorkflowService.js';
import { TemplateService } from '../../application/services/TemplateService.js';
import { QualityService } from '../../application/services/QualityService.js';
import { WorkflowEngineService } from '../../application/services/WorkflowEngineService.js';
import { ProjectInitializationService } from '../../application/services/ProjectInitializationService.js';
import { WorkflowValidationService } from '../../application/services/WorkflowValidationService.js';
import { CodebaseAnalysisService } from '../../application/services/CodebaseAnalysisService.js';
import { SteeringDocumentService } from '../../application/services/SteeringDocumentService.js';
import { ProjectContextService } from '../../application/services/ProjectContextService.js';
import { SDDToolAdapter } from '../../adapters/cli/SDDToolAdapter.js';

export function createContainer(): Container {
  const container = new Container();

  // Bind domain ports to infrastructure adapters
  container.bind<ProjectRepository>(TYPES.ProjectRepository).to(InMemoryProjectRepository);
  container.bind<FileSystemPort>(TYPES.FileSystemPort).to(NodeFileSystemAdapter);
  container.bind<TemplateEngine>(TYPES.TemplateEngine).to(HandlebarsTemplateEngine);
  container.bind<ConfigurationPort>(TYPES.ConfigurationPort).to(JsonConfigurationAdapter);
  container.bind<LoggerPort>(TYPES.LoggerPort).to(ConsoleLoggerAdapter);
  container.bind<ValidationPort>(TYPES.ValidationPort).to(AjvValidationAdapter);
  container.bind<QualityAnalyzer>(TYPES.QualityAnalyzer).to(LinusQualityAnalyzer);
  container.bind<TaskTracker>(TYPES.TaskTracker).to(FileBasedTaskTracker);
  
  // Bind template ports
  container.bind<TemplateRendererPort>(TYPES.TemplateRendererPort).to(HandlebarsRenderer);
  container.bind<TemplateManagerPort>(TYPES.TemplateManagerPort).to(TemplateManager);
  container.bind<FileGeneratorPort>(TYPES.FileGeneratorPort).to(FileGenerator);
  
  // Bind quality ports
  container.bind<CodeQualityAnalyzerPort>(TYPES.CodeQualityAnalyzerPort).to(LinusCodeReviewer);
  
  // Bind i18n ports
  container.bind<I18nService>(TYPES.I18nService).to(I18nextService);
  container.bind<IPlatformAdapter>(TYPES.PlatformAdapter).to(PlatformAdapter);
  container.bind<I18nManagerPort>(TYPES.I18nManagerPort).to(LocalizationService);

  // Bind MCP components
  container.bind<MCPServer>(TYPES.MCPServer).to(MCPServer);
  container.bind<MCPErrorHandler>(TYPES.MCPErrorHandler).to(MCPErrorHandler);
  container.bind<CapabilityNegotiator>(TYPES.CapabilityNegotiator).to(CapabilityNegotiator);
  container.bind<SessionManager>(TYPES.SessionManager).to(SessionManager);
  container.bind<ResourceManager>(TYPES.ResourceManager).to(ResourceManager);
  container.bind<PromptManager>(TYPES.PromptManager).to(PromptManager);
  container.bind<ToolRegistry>(TYPES.ToolRegistry).to(ToolRegistry);

  // Bind application services
  container.bind<ProjectService>(TYPES.ProjectService).to(ProjectService);
  container.bind<WorkflowService>(TYPES.WorkflowService).to(WorkflowService);
  container.bind<TemplateService>(TYPES.TemplateService).to(TemplateService);
  container.bind<QualityService>(TYPES.QualityService).to(QualityService);
  container.bind<WorkflowEngineService>(TYPES.WorkflowEngineService).to(WorkflowEngineService);
  container.bind<ProjectInitializationService>(TYPES.ProjectInitializationService).to(ProjectInitializationService);
  container.bind<WorkflowValidationService>(TYPES.WorkflowValidationService).to(WorkflowValidationService);
  container.bind<CodebaseAnalysisService>(TYPES.CodebaseAnalysisService).to(CodebaseAnalysisService);
  container.bind<SteeringDocumentService>(TYPES.SteeringDocumentService).to(SteeringDocumentService);
  container.bind<ProjectContextService>(TYPES.ProjectContextService).to(ProjectContextService);

  // Bind adapters
  container.bind<SDDToolAdapter>(TYPES.SDDToolAdapter).to(SDDToolAdapter);

  return container;
}