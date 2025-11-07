# Requirements Document

## Introduction
bugfix-core-docs-generation - Fix the sdd-steering tool to generate accurate codebase-specific documents regardless of how the MCP server is started.

**Project**: sdd-mcp-server  
**Description**: MCP server for spec-driven development workflows across AI-agent CLIs and IDEs

**Bug Context**: When running via `npx -y sdd-mcp-server@latest`, the `sdd-steering` tool generates generic template documents instead of analyzing the actual codebase due to import path resolution failures.

Generated on: 2025-11-04T15:57:30.430Z

## Problem Statement

### Current Behavior (Broken)
- WHEN user runs `npx -y sdd-mcp-server@latest` and calls `sdd-steering`
- THEN documentGenerator import fails with hardcoded path `'./utils/documentGenerator.js'`
- AND fallback to generic templates produces non-specific documents
- RESULTING IN loss of codebase analysis functionality

### Root Cause
- Multiple entry points (mcp-server.js, dist/index.js) use different import strategies
- Hardcoded import paths in src/index.ts don't account for different execution contexts
- Published package structure differs from compiled structure

### Expected Behavior (Fixed)
- WHEN user runs MCP server via ANY method (npx, node, npm, tsx)
- THEN documentGenerator and specGenerator SHALL load successfully
- AND generate accurate, codebase-specific steering documents
- WITH comprehensive project analysis (language, framework, architecture detection)

## Functional Requirements

### FR-1: Unified Module Loading System
**Objective:** Create a robust module loader that works across all execution contexts

#### Acceptance Criteria
1. WHEN moduleLoader is invoked THEN it SHALL try multiple import paths in sequence
2. IF first path fails THEN it SHALL attempt fallback paths without throwing
3. WHEN valid module is found THEN it SHALL return the imported module
4. IF all paths fail THEN it SHALL throw descriptive error with attempted paths
5. WHERE debug logging is enabled THE system SHALL log which path succeeded

#### Implementation Details
- Create `src/utils/moduleLoader.ts` with:
  - `loadDocumentGenerator()` function
  - `loadSpecGenerator()` function
  - Path attempts: `./utils/*.js`, `../utils/*.js`, `./*.js`, `../*.js`
  - TypeScript-safe error handling

### FR-2: Update Entry Point Import Strategy
**Objective:** Replace hardcoded imports with dynamic module loader

#### Acceptance Criteria
1. WHEN handleSteeringSimplified is called THEN it SHALL use loadDocumentGenerator()
2. WHEN handleRequirementsSimplified is called THEN it SHALL use loadSpecGenerator()
3. WHEN handleDesignSimplified is called THEN it SHALL use loadSpecGenerator()
4. WHEN handleTasksSimplified is called THEN it SHALL use loadSpecGenerator()
5. IF module load fails THEN it SHALL catch error and show helpful fallback message

#### Implementation Details
- Update `src/index.ts` at lines:
  - ~395 (handleSteeringSimplified)
  - ~925 (handleRequirementsSimplified)
  - ~995 (handleDesignSimplified)
  - ~1065 (handleTasksSimplified)
- Replace: `await import('./utils/documentGenerator.js')`
- With: `await loadDocumentGenerator()`

### FR-3: Execution Context Compatibility
**Objective:** Ensure tool works across all execution methods

#### Acceptance Criteria
1. WHEN run via `npx -y sdd-mcp-server@latest` THEN sdd-steering SHALL generate analyzed docs
2. WHEN run via `node dist/index.js` THEN sdd-steering SHALL generate analyzed docs
3. WHEN run via `npm run dev` THEN sdd-steering SHALL generate analyzed docs
4. WHEN run via `npm start` THEN sdd-steering SHALL generate analyzed docs
5. WHERE execution method differs THE behavior SHALL be consistent

### FR-4: Document Generation Quality
**Objective:** Generate accurate, codebase-specific steering documents

#### Acceptance Criteria
1. WHEN project is analyzed THEN it SHALL detect language (TypeScript, Java, Python, Go, Ruby, PHP, Rust, C#, Scala)
2. WHEN project is analyzed THEN it SHALL detect framework (Express, Spring Boot, Django, FastAPI, Rails, Laravel, etc.)
3. WHEN project is analyzed THEN it SHALL detect build tool (Maven, Gradle, npm, pip, cargo, etc.)
4. WHEN project is analyzed THEN it SHALL detect test framework (JUnit, pytest, Jest, Mocha, etc.)
5. WHEN project is analyzed THEN it SHALL detect architecture patterns (DDD, MVC, Microservices, etc.)
6. WHEN documents are generated THEN product.md SHALL contain actual project features
7. WHEN documents are generated THEN tech.md SHALL contain actual tech stack
8. WHEN documents are generated THEN structure.md SHALL contain actual directory structure

## Non-Functional Requirements

### NFR-1: Performance
- Module loading fallback SHALL complete within 100ms per attempt
- Document generation SHALL complete within 5 seconds for typical projects
- Memory usage SHALL remain within reasonable bounds (< 100MB overhead)

### NFR-2: Reliability
- System SHALL handle module load failures gracefully with fallback to templates
- System SHALL provide clear error messages indicating which paths were tried
- System SHALL maintain data integrity during document generation
- System SHALL not crash if optional dependencies are missing

### NFR-3: Maintainability
- Module loader code SHALL be reusable across different entry points
- Import paths SHALL be documented with comments explaining each attempt
- Debug logging SHALL provide visibility into path resolution
- Code SHALL follow established TypeScript conventions

### NFR-4: Backward Compatibility
- Existing steering documents SHALL remain valid
- Existing MCP tool interfaces SHALL not change
- Published package structure SHALL support both dist/utils and root-level files
- Build output SHALL maintain current structure

## Success Criteria

### Primary Success Metrics
1. ✅ `sdd-steering` generates analyzed documents when run via npx (95%+ accuracy)
2. ✅ All 4 execution methods produce identical output
3. ✅ Module load failures caught and handled gracefully
4. ✅ Generated documents reflect actual codebase analysis
5. ✅ Build completes without errors, outputs correct structure

### Quality Metrics
1. Test coverage for moduleLoader ≥ 90%
2. Zero TypeScript compilation errors
3. All existing tests continue to pass
4. Linus-style code review passes (simplicity, no special cases)

## Out of Scope

- Changing MCP tool interfaces or adding new tools
- Refactoring documentGenerator or specGenerator logic
- Adding new language/framework detection capabilities
- Changing build configuration or package structure significantly
- Modifying mcp-server.js (already has good fallback logic)

## Dependencies and Constraints

### Technical Dependencies
- TypeScript compiler must output to dist/utils/
- ES Module import system (import.meta.url support)
- Node.js ≥ 18.0.0 for ES module features

### Constraints
- Must maintain backward compatibility with existing configs
- Must work with both local development and npm registry installation
- Must not break existing slash commands or workflows
