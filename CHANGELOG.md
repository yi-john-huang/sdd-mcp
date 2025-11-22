# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.8.0] - 2025-11-22

### Changed
- **MCP Tool Standardization**: Standardized all documentation and generated files to use MCP tool calls (e.g., `sdd-init`) instead of legacy slash commands (e.g., `/kiro:spec-init`)
  - Updated `AGENTS.md` generation logic in `staticSteering.ts`, `SDDToolAdapter.ts`, and `index.ts`
  - Updated `README.md` documentation and examples
  - Ensures consistent tool usage across all AI agents (Claude Code, Cursor, etc.)
- **AGENTS.md Generation**: Fixed `sdd-steering` to correctly generate `AGENTS.md` with the new MCP tool call format
  - Now includes correct paths and command references
  - Removes outdated references to `/kiro:` commands

## [1.7.0] - 2025-11-07

### Fixed
- **Module Loading Cross-Context Support**: Enhanced module loader to support both TypeScript and JavaScript execution contexts
  - Module loader now tries both `.ts` and `.js` extensions (also `.mjs`, `.cjs`) for maximum compatibility
  - Works correctly in dev mode (`npm run dev`, `tsx src/index.ts`) and production (`npm start`, `npx`)
  - Fixes issue where TypeScript sources couldn't be loaded when `dist/` didn't exist

### Added
- **Fallback Control**: New `SDD_ALLOW_TEMPLATE_FALLBACK` environment variable for controlling document generation behavior
  - Default: `false` - Commands fail fast with actionable error messages when modules cannot be loaded
  - Set to `true` - Allow fallback to generic templates (useful for development/debugging)
  - Provides clear guidance: "run `npm run build`" or "set SDD_ALLOW_TEMPLATE_FALLBACK=true"
  - Prevents silent generation of generic documents that don't reflect actual codebase
- **Shared Error Handler**: Centralized `handleLoaderFailure()` function for consistent error handling across all document generation commands
  - Used by `handleSteeringSimplified`, `handleRequirementsSimplified`, `handleDesignSimplified`, `handleTasksSimplified`
  - Provides detailed error messages with troubleshooting steps
  - Logs fallback decisions for debugging

### Changed
- **Error Handling Philosophy**: Changed from "silent fallback" to "fail fast with guidance"
  - Previously: Module load failures silently fell back to generic templates
  - Now: Module load failures throw descriptive errors by default (unless SDD_ALLOW_TEMPLATE_FALLBACK=true)
  - Ensures operators are aware when documents don't reflect actual codebase analysis

## [1.6.2] - 2025-11-05

### Fixed
- **Module Loading**: Unified module loading system for cross-context compatibility
  - Fixed `sdd-steering` generating generic templates when run via `npx -y sdd-mcp-server@latest`
  - Created `src/utils/moduleLoader.ts` with fallback path resolution for different execution contexts
  - Updated `handleSteeringSimplified()`, `handleRequirementsSimplified()`, `handleDesignSimplified()`, and `handleTasksSimplified()` to use dynamic module loader
  - Module loader tries multiple paths: `./utils/*.js` (dist), `../utils/*.js` (subdirectory), `./*.js` (root), `../*.js` (alternative root)
  - Now works correctly across all execution methods: npx, node dist/index.js, npm run dev, npm start
  - Debug logging shows which path succeeded for troubleshooting
  - Graceful fallback to template generation with clear error messages when modules cannot be loaded

### Added
- **Testing**: Comprehensive unit tests for moduleLoader (`src/__tests__/unit/utils/moduleLoader.test.ts`)
  - Tests for successful module loading
  - Tests for fallback path resolution
  - Tests for error handling and error message format
  - 100% test coverage for moduleLoader functionality

## [1.6.1] - 2025-10-30

### Changed
- **Documentation**: Updated README.md with v1.6.0 architecture refactoring information
  - Added v1.6.0 announcement highlighting 5 focused services
  - Updated version references from 1.4.5 to 1.6.0 in Quick Start examples
  - Emphasized scored semantic detection and improved maintainability

## [1.6.0] - 2025-10-30

### Changed
- **Architecture Refactoring**: Decomposed `RequirementsClarificationService` from "God Class" into focused, single-responsibility services following Domain-Driven Design principles
  - **SteeringContextLoader**: Pure I/O service for loading steering documents from filesystem
  - **DescriptionAnalyzer**: Pure analysis service using scored semantic detection (0-100 per category)
  - **QuestionGenerator**: Pure transformation service generating questions from analysis + configuration
  - **AnswerValidator**: Pure validation service with security checks
  - **DescriptionEnricher**: Pure synthesis service for 5W1H-structured descriptions
  - **RequirementsClarificationService**: Now acts as thin orchestrator delegating to specialized services
- **Improved Analysis**: Replaced brittle boolean regex matching with scored semantic detection
  - Each 5W1H category now scored 0-100 based on keyword density and coverage
  - Boolean presence derived from scores (threshold: 30%)
  - New score fields in `ClarificationAnalysis`: `whyScore`, `whoScore`, `whatScore`, `successScore`
  - Reduces false positives/negatives from simple pattern matching
- **Externalized Configuration**: Moved all question templates to `clarification-questions.ts`
  - Stable semantic IDs: `why_problem`, `why_value`, `who_users`, `what_mvp_features`, etc.
  - Each template includes: question, rationale, examples, required flag, condition function
  - Enables adding new questions without code changes
  - Better separation of business rules from service logic

### Added
- **New Domain Types**: 
  - `SteeringContext`: Moved to domain types for reusability across services
  - `DescriptionComponents`: Structured 5W1H components for enriched descriptions
- **Comprehensive Test Coverage**: 
  - 15 tests for DescriptionAnalyzer (scored semantic detection)
  - 8 tests for QuestionGenerator (template-based generation)
  - 11 tests for AnswerValidator (validation + security)
  - 10 tests for DescriptionEnricher (5W1H synthesis)
  - 13 tests for SteeringContextLoader (I/O with error handling)
  - 5 tests for RequirementsClarificationService (orchestration)
  - Total: 62 new unit tests, all passing

### Technical Improvements
- **Single Responsibility Principle**: Each service has one clear purpose with focused interface
- **Dependency Injection**: All new services registered in DI container with proper type bindings
- **Error Handling**: SteeringContextLoader differentiates file-level errors (debug) from system errors (warn)
- **Testability**: Pure functions enable fast, isolated unit tests without mocks
- **Maintainability**: Services average ~100 LOC vs previous ~500 LOC monolith
- **Type Safety**: All services fully typed with readonly interfaces for immutability

### Migration Notes
- **Breaking Change**: `RequirementsClarificationService` constructor signature changed
  - Old: `constructor(fileSystem: FileSystemPort, logger: LoggerPort)`
  - New: `constructor(logger, steeringLoader, analyzer, questionGenerator, answerValidator, enricher)`
  - **Impact**: Direct instantiation requires all 6 dependencies
  - **Mitigation**: Use DI container (`container.get(TYPES.RequirementsClarificationService)`) - no code changes needed
- **API Compatibility**: Public methods unchanged - `analyzeDescription()`, `validateAnswers()`, `synthesizeDescription()` work identically
- **Test Updates**: Tests now mock specialized services instead of filesystem - see updated test file for examples

## [1.5.1] - 2025-10-30

### Fixed
- **Enhanced Input Validation**: `validateAnswers` now checks for empty/too-short answers (< 10 chars) and potentially malicious content (XSS patterns)
  - Returns detailed `AnswerValidationResult` with `tooShort` and `containsInvalidContent` arrays
  - Prevents security issues from user-provided clarification answers
- **Improved Error Handling**: `loadSteeringContext` now properly handles failures and always returns valid defaults
  - Individual try-catch blocks for product.md and tech.md loading
  - Better error logging with debug-level messages for individual file failures
  - Guaranteed non-null return value
- **Code Quality Improvements**: Extracted magic numbers and duplicated patterns to constants
  - Created `clarification-constants.ts` with `QUALITY_SCORE_WEIGHTS`, `ANSWER_VALIDATION`, `PATTERN_DETECTION`, `AMBIGUOUS_TERMS`
  - Replaced inline regex patterns with pre-compiled constants for better performance
  - All scoring thresholds now configurable in one place
- **Stable Question IDs**: Replaced UUID-based IDs with semantic identifiers
  - Question IDs: `why_problem`, `why_value`, `who_users`, `what_mvp_features`, `what_out_of_scope`, `success_metrics`, `how_tech_constraints`, `ambiguity_1-3`
  - Predictable IDs improve testability and debugging
- **Jest Module Resolution**: Fixed `moduleNameMapper` pattern to properly resolve `.js` imports to TypeScript source files
  - Pattern now correctly handles all relative imports without catching node_modules

### Changed
- **Type Safety**: Moved `ClarificationAnswers` and `AnswerValidationResult` to domain types for better reusability
- **Test Coverage**: Updated tests to verify new validation fields (`tooShort`, `containsInvalidContent`)
- **Build Configuration**: All 16 tests passing with TypeScript compilation successful

### Technical
- **Maintainability**: Reduced code duplication across service, adapter, and MCP server
- **Security**: Added XSS pattern detection for user-provided answers
- **Performance**: Pre-compiled regex patterns reduce repeated compilation overhead
- **Configuration**: Centralized constants allow easy tuning of quality thresholds

## [1.5.0] - 2025-10-30

### Added
- **Interactive Requirements Clarification**: New `RequirementsClarificationService` that analyzes project descriptions and blocks vague requirements
  - Quality scoring (0-100) with blocking threshold at 70%
  - 5W1H analysis: WHY (30 pts), WHO (20 pts), WHAT (20 pts), Success Criteria (15 pts), plus length and clarity bonuses
  - Ambiguity detection for terms like "fast", "scalable", "user-friendly", "easy", "reliable", "secure", "modern"
  - Context-aware question generation using existing `.kiro/steering/` documents to avoid redundancy
  - Two-pass workflow: analyze → return questions → validate answers → synthesize enriched description
- **Enhanced sdd-init Tool**: Interactive clarification flow with blocking mechanism
  - First pass: Analyzes description quality, returns clarification questions if score < 70%
  - Second pass: Validates answers, synthesizes enriched description with structured 5W1H format
  - Enriched descriptions include: Original, Business Justification (Why), Target Users (Who), Core Features (What), Technical Approach (How), Success Criteria
  - New `clarificationAnswers` parameter for second-pass submission
- **Comprehensive Type System**: New domain types for clarification workflow
  - `ClarificationQuestion`, `QuestionCategory`, `ClarificationAnalysis`, `AmbiguousTerm`, `EnrichedProjectDescription`, `ClarificationResult`
  - Full TypeScript type safety with readonly interfaces
- **13 Unit Tests**: Complete test coverage for RequirementsClarificationService
  - Tests for quality scoring, ambiguity detection, question generation, answer validation, and description synthesis
  - All tests passing with 100% success rate

### Changed
- **sdd-init Behavior**: Now blocks progression on vague requirements (quality score < 70%)
  - Previously accepted any description; now enforces quality standards
  - Focuses on "WHY" (business justification) as highest-weighted criterion
  - Educational feedback with actionable examples and specific question categories
- **DI Container**: Registered `RequirementsClarificationService` in dependency injection system
  - Added `TYPES.RequirementsClarificationService` symbol
  - Integrated into SDDToolAdapter with proper injection

### Fixed
- **Vague Requirements Problem**: Prevents "garbage in, garbage out" by ensuring clear requirements from project start
- **Missing Business Context**: Forces articulation of WHY before proceeding with implementation
- **Ambiguous Language**: Detects and clarifies non-specific terms before they cause scope issues

### Technical
- **Architecture**: Follows Domain-Driven Design with service in application layer
- **Integration**: Works in both simplified (mcp-server.js) and TypeScript (SDDToolAdapter) implementations
- **Context Awareness**: Reads steering documents (product.md, tech.md) to avoid redundant questions
- **Blocking Workflow**: Synchronous MCP tool with multi-pass pattern for interactive clarification

## [1.4.5] - 2025-10-19

### Changed
- **Test Organization**: Reorganized test structure for better maintainability
  - Moved legacy tests to `src/__tests__/legacy/` directory
  - Created new `src/__tests__/unit/` structure for unit tests
  - Updated `jest.config.js` to focus on unit tests only
  - Added `tsconfig.jest.json` for better Jest-TypeScript integration

### Refactored
- **Static Steering Module**: Centralized static steering document creation logic
  - Created `src/application/services/staticSteering.ts` module (DRY principle)
  - Single source of truth for static steering documents (linus-review.md, commit.md, security-check.md, tdd-guideline.md, principles.md)
  - Updated MCP server handlers to use the centralized module
  - Improved code maintainability following SOLID principles

## [1.4.4] - 2025-10-10

### Added
- **Coding Principles Steering Document**: New `.kiro/steering/principles.md` with comprehensive SOLID, DRY, KISS, YAGNI, Separation of Concerns, and Modularity guidance
  - 641 lines of comprehensive principles with code examples
  - Multi-language examples (TypeScript, Python, Java, Go, Ruby, PHP, Rust, C#)
  - Code review checklist for principle enforcement
  - Anti-patterns and common pitfalls to avoid
- **TDD Task Generation**: Rewrote task generation to follow Test-Driven Development workflow
  - Phase 1: Test Setup (🔴 RED - Write Failing Tests First)
  - Phase 2: Implementation (🟢 GREEN - Make Tests Pass)
  - Phase 3: Refactoring (🔵 REFACTOR - Improve Code Quality)
  - Phase 4: Integration & Documentation
  - Framework-specific test tasks (MCP SDK, API endpoints, database operations)

### Changed
- **Task Document Format**: Implementation tasks now follow TDD methodology with clear phase separation
- **Steering Document Count**: Now generates 8 steering documents (added principles.md to the 7 existing)
- **Documentation Updates**: Enhanced README.md, CLAUDE.md, and AGENTS.md with principles and TDD workflow references

### Fixed
- Task generation order now enforces test-first development
- All documentation now consistently references 8 steering documents

## [1.4.3] - 2025-10-10

### Fixed
- **Document Generation**: Simplified mode (MCP) now properly uses comprehensive codebase analysis instead of falling back to templates
  - Enhanced error handling with detailed debug logging
  - Added `analysisUsed` flag to track successful comprehensive analysis
  - Improved user feedback showing "✅ Comprehensive codebase analysis" or "⚠️ Basic template"
- **Multi-Language Detection**: Comprehensive analysis now properly detects TypeScript, JavaScript, Java, Python, Go, Ruby, PHP, Rust, C#, Scala
- **Framework Detection**: Enhanced detection for 20+ frameworks (Spring Boot, Django, FastAPI, Rails, Laravel, Express, React, Vue, Angular, Next.js, etc.)
- **Build Tool & Test Framework Detection**: Better identification of Maven, Gradle, npm, pip, cargo, Jest, pytest, JUnit, Mocha, etc.
- **Architecture Pattern Recognition**: Improved detection of DDD, MVC, Microservices, Clean Architecture patterns

### Changed
- **Error Reporting**: Added comprehensive debug logging throughout document generation process
- **User Feedback**: Clear messaging about which analysis method was used (comprehensive vs fallback)
- **Documentation**: Updated README.md to highlight v1.4.3 comprehensive analysis improvements

## [1.4.2] - 2025-10-02

### Fixed
- `sdd-steering` CLI entry now always creates `.kiro/steering/tdd-guideline.md`, keeping TDD enforcement consistent with the TypeScript build output.

## [1.4.1] - 2025-09-30

### Added
- Always-generate static `security-check.md` (OWASP Top 10 aligned) during `sdd-steering`
  - Present in both MCP paths (simplified + legacy server)
  - Use during code generation and code review to avoid common vulnerabilities

## [1.3.5] - 2025-09-13

## [1.4.0] - 2025-09-27

### Added
- Analysis-backed generation for `sdd-requirements`, `sdd-design`, and `sdd-tasks` in MCP mode
- New generators: `src/utils/specGenerator.ts` and runtime `specGenerator.js`
- Smoke scripts: `scripts/smoke-mcp.js` (startup) and `scripts/mcp-tools-list.js` (tools/list probe)

### Changed
- `mcp-server.js` and MCP simplified handlers now use analysis-first with robust fallbacks
- Published files include `specGenerator.js`

### Fixed
- Steering vs specification doc generation parity in MCP clients; no more template-first behavior

### Added
- Multi-language steering support: Python (Django/FastAPI/Flask), Go (Gin/Echo), Ruby (Rails/Sinatra), PHP (Laravel/Symfony), Rust (Actix/Axum/Rocket), .NET/C#, Scala (SBT)
- Language-aware tech docs: Proper dev commands, environment versions (JDK/Go/Python/Ruby/PHP/Rust/.NET), framework naming
- Architecture sections for non-JS stacks with conventional layering and tooling
- Structure overview adapts to each ecosystem’s key files (pom.xml, pyproject, go.mod, Gemfile, composer.json, Cargo.toml, *.csproj, build.sbt)

### Changed
- Node/TS detection coexists with other ecosystems without bias; module system shown only for JS/TS projects

### Fixed
- TypeScript compile issues in document generator refactor

## [1.3.4] - 2025-09-13

### Changed
- Version resolution: both entrypoints now report version from `package.json`
- MCP simplified tools aligned with kiro behavior: status/approve/quality/implement parity
- Unified doc generation: single dynamic generator to avoid drift

### Added
- Ensure static exceptions only: `.kiro/steering/linus-review.md`, `.kiro/steering/commit.md`, and `AGENTS.md` created when missing

### Fixed
- MCP mode logging detection to prevent stdio interference

## [1.3.0] - 2025-09-11

### Added
- **Static Steering Documents**: Automatic creation of `linus-review.md` with complete Linus Torvalds code review principles
- **Commit Message Guidelines**: Automatic creation of `commit.md` with standardized commit message formatting
- **Universal AGENTS.md**: Cross-platform AI agent configuration file generated from CLAUDE.md template
- **Enhanced sdd-steering**: Now creates static documents (linus-review.md, commit.md) alongside codebase-analyzed content
- **Enhanced sdd-init**: Now generates AGENTS.md for universal AI agent compatibility

### Changed
- **Steering Document Generation**: Both sdd-init and sdd-steering now ensure AGENTS.md exists for cross-platform AI support
- **CLAUDE.md Documentation**: Updated to reflect new steering files (linus-review.md, commit.md) in active steering list
- **Template Adaptation**: AGENTS.md intelligently adapts from existing CLAUDE.md or creates generic template

### Fixed
- **Cross-Platform Compatibility**: AGENTS.md ensures SDD workflows work across different AI agents (Claude Code, Cursor, etc.)
- **Static Content Preservation**: Only creates static documents when missing to preserve existing customizations

## [1.2.0] - 2025-09-11

### Added
- **Empty Project Bootstrap**: SDD tools now work from empty directories without requiring package.json or existing files
- **Kiro Workflow Alignment**: Complete alignment with .claude/commands/kiro/ workflow patterns and phase validation
- **Feature Name Generation**: Automatic feature name extraction from project descriptions
- **Spec Context Management**: .kiro/specs/[feature]/ structure with spec.json phase tracking and approval workflow
- **EARS Requirements Generation**: Dynamic EARS-formatted acceptance criteria generated from project descriptions
- **Phase Validation System**: Enforced workflow progression (init → requirements → design → tasks)

### Changed
- **sdd-init**: Now takes project description instead of name/path, generates feature names automatically
- **sdd-requirements**: Uses feature name parameter, loads spec context, generates from project description
- **sdd-design**: Validates requirements phase, creates technical design with phase enforcement
- **sdd-tasks**: Validates design phase, generates kiro-style numbered implementation tasks
- **Tool Schemas**: Updated SDDToolAdapter schemas for consistency with kiro workflow

### Fixed
- **Package.json Dependency**: Eliminated requirement for existing project files
- **Static Content Generation**: Replaced with dynamic, context-aware content from project descriptions
- **Workflow Enforcement**: Added proper phase validation and spec.json tracking

## [1.1.22] - 2025-09-11

### Added
- **Context-Aware Content Generation**: All SDD tools now analyze real project structure instead of generating static templates
- **Project Analysis Engine**: 20+ helper methods for analyzing package.json, dependencies, and directory structure
- **EARS-Formatted Requirements**: Generate acceptance criteria based on actual npm scripts and project configuration
- **Architecture Detection**: Automatic technology stack identification and pattern recognition from codebase
- **Simplified MCP Tools**: Enhanced versions that work directly without requiring full SDD initialization

### Changed
- **TemplateService**: Enhanced with comprehensive project analysis capabilities for real-time content generation
- **SDDToolAdapter**: Added missing sdd-steering tools with project-specific analysis functionality
- **Requirements Generation**: Now extracts real functional requirements from package.json and project structure
- **Design Generation**: Architecture documentation based on actual dependencies and detected patterns
- **Task Generation**: Implementation breakdown derived from real technology stack and project organization

### Fixed
- **Static Template Content**: Replaced generic placeholders with dynamic project-specific content
- **Tool Integration**: Enhanced MCP tool compatibility for direct usage without complex setup

## [1.1.12] - 2025-09-10

### Fixed
- **Claude Code Health Check**: Fixed MCP server connection failures due to startup timeout issues
- **Startup Performance**: Optimized server startup time from ~500ms to ~60ms for faster health checks
- **Version Consistency**: Updated all version references across codebase to 1.1.12

### Added  
- **Local Development Wrapper**: Added `local-mcp-server.js` for ultra-fast local development
- **Enhanced Documentation**: Updated README with connection troubleshooting and v1.1.12 fixes
- **GitHub Release**: Automated release creation with comprehensive changelog

### Changed
- **MCP Protocol Compliance**: Added proper `InitializedNotificationSchema` handler
- **ES Module Compatibility**: Improved module loading and entry point detection
- **Health Check Optimization**: Reduced npx execution overhead for Claude Code compatibility

## [1.1.11] - 2025-09-10

### Fixed
- **MCP Protocol**: Enhanced MCP protocol compatibility with proper notification handling
- **Version Consistency**: Aligned version reporting across all server implementations

### Added
- **Initialized Notification**: Added proper handling for MCP `initialized` notification

## [1.1.10] - 2025-09-10

### Fixed
- **ES Module Entry Point**: Fixed `import.meta.url` detection for proper ES module execution  
- **Build Output**: Corrected TypeScript compilation output for ES module compatibility
- **ESLint Configuration**: Renamed `.eslintrc.js` to `.eslintrc.cjs` for ES module projects

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
