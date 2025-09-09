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

// Infrastructure adapters
import { InMemoryProjectRepository } from '../repositories/InMemoryProjectRepository.js';
import { NodeFileSystemAdapter } from '../adapters/NodeFileSystemAdapter.js';
import { HandlebarsTemplateEngine } from '../adapters/HandlebarsTemplateEngine.js';
import { JsonConfigurationAdapter } from '../adapters/JsonConfigurationAdapter.js';
import { ConsoleLoggerAdapter } from '../adapters/ConsoleLoggerAdapter.js';
import { AjvValidationAdapter } from '../adapters/AjvValidationAdapter.js';
import { LinusQualityAnalyzer } from '../adapters/LinusQualityAnalyzer.js';
import { FileBasedTaskTracker } from '../adapters/FileBasedTaskTracker.js';

// MCP components
import { MCPServer } from '../mcp/MCPServer.js';
import { MCPErrorHandler } from '../mcp/ErrorHandler.js';

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

  // Bind MCP components
  container.bind<MCPServer>(TYPES.MCPServer).to(MCPServer);
  container.bind<MCPErrorHandler>(TYPES.MCPErrorHandler).to(MCPErrorHandler);

  return container;
}