# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.9] - 2025-09-10

### Fixed
- **MCP Protocol Compatibility**: Created dedicated `mcp-server.js` binary for guaranteed MCP protocol compatibility
- **Build Errors**: Fixed 100+ TypeScript compilation errors preventing package builds
- **ES Module Issues**: Fixed "require is not defined in ES module scope" error when running via npx
- **Dependency Injection**: Resolved "No matching bindings found" errors in DI container
- **Type System**: Fixed type imports vs value imports for enums and interfaces
- **Console Output**: Properly silenced console output in MCP mode to prevent JSON-RPC interference

### Added
- **Dual-Mode Server**: Main server supports both standalone and MCP modes automatically
- **Simplified MCP Server**: Dedicated lightweight MCP implementation for better reliability
- **Enhanced Documentation**: Updated README with Claude Code integration instructions
- **Troubleshooting Guide**: Added common issues and solutions section

### Changed
- **Binary Configuration**: `sdd-mcp-server` command now uses dedicated MCP binary
- **Package Structure**: Added `mcp-server.js` to published files
- **Error Handling**: Improved error reporting and logging in both modes
- **Version Detection**: Enhanced MCP mode detection logic for various execution environments

## [1.1.7] - 2025-09-10

### Fixed
- **TypeScript Compilation**: Fixed type import/export issues
- **Dependency Injection**: Removed problematic optional constructor parameters
- **ES Module Support**: Fixed module resolution and execution

## [1.1.6] - 2025-09-10

### Fixed
- **Build System**: Resolved TypeScript compilation errors
- **Module Imports**: Fixed ES module import statements

## [1.1.2] - 2025-09-10

### Fixed
- **Initial Build Issues**: Resolved basic TypeScript compilation errors

## [1.1.0] - 2025-09-10

### Added
- **Initial MCP Server**: Basic Model Context Protocol server implementation
- **SDD Workflow**: 5-phase spec-driven development workflow
- **Plugin System**: Extensible architecture for custom workflows
- **Quality Analysis**: Linus-style code review system
- **Multi-language Support**: 10 languages with cultural adaptation
- **Template Engine**: Handlebars-based file generation

### Features
- **MCP Tools**: sdd-init, sdd-status, sdd-requirements, sdd-design, sdd-tasks, etc.
- **Project Management**: .kiro directory structure for SDD projects
- **Context Persistence**: Project memory and state management
- **Docker Support**: Secure distroless container images
- **Security Hardening**: Non-root user, read-only filesystem, dropped capabilities