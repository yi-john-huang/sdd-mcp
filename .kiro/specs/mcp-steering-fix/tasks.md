# Implementation Plan

- [x] 1. Fix immediate import path issues
- [x] 1.1 Correct documentGenerator import path in simplified MCP mode
  - Fix src/index.ts line 354: Change '../documentGenerator.js' to './utils/documentGenerator.js'
  - Verify TypeScript compilation maintains correct relative paths
  - Test import resolution and function accessibility
  - _Requirements: 1.1, 1.2, 1.3_

- [x] 1.2 Add proper error handling for import failures
  - Implement clear error messages for missing modules
  - Add fallback to basic templates when documentGenerator unavailable
  - Log attempted import paths for debugging
  - _Requirements: 3.1, 3.2, 3.4_

- [x] 2. Create self-contained tool implementations
- [x] 2.1 Implement core SDD workflow tools (Phase 1: Essential)
  - Create sdd-steering tool that replicates /kiro:steering exactly
  - Create sdd-init tool that matches /kiro:spec-init behavior
  - Create sdd-status tool for workflow progress checking
  - Embed all documentGenerator functionality internally
  - _Requirements: 4.1, 4.2, 4.3_

- [x] 2.2 Implement remaining workflow tools (Phase 2: Complete Suite)
  - Create sdd-requirements tool (replicates /kiro:spec-requirements)
  - Create sdd-design tool (replicates /kiro:spec-design)
  - Create sdd-tasks tool (replicates /kiro:spec-tasks)
  - Create sdd-implement tool (replicates /kiro:spec-impl)
  - _Requirements: 4.1, 4.4, 4.5_

- [x] 2.3 Implement validation and custom tools (Phase 3: Advanced Features)
  - Create sdd-validate-design tool (replicates /kiro:validate-design)
  - Create sdd-validate-gap tool (replicates /kiro:validate-gap)
  - Create sdd-steering-custom tool (replicates /kiro:steering-custom)
  - Ensure all 10 tools provide identical functionality to custom commands
  - _Requirements: 4.1, 4.4, 4.5_

- [ ] 3. Embed complete workflow engine
- [ ] 3.1 Create internal workflow state management
  - Implement .kiro/specs/ directory management
  - Create spec.json tracking and phase validation
  - Build workflow state machine (init → requirements → design → tasks → implementation)
  - Add phase gate validation and approval tracking
  - _Requirements: 4.5, 5.1, 5.2_

- [ ] 3.2 Embed project analysis capabilities
  - Move analyzeProject function into utils/projectAnalyzer.ts
  - Embed generateProductDocument, generateTechDocument, generateStructureDocument
  - Ensure dynamic project analysis matches custom command quality
  - Test with various project types (TypeScript, MCP SDK, etc.)
  - _Requirements: 2.1, 2.2, 2.3_

- [ ] 4. Implement universal agent compatibility
- [ ] 4.1 Enhance NPX entry point and MCP protocol handling
  - Improve MCP mode detection for universal agent compatibility
  - Implement standard MCP SDK patterns that work across agents
  - Add graceful handling of MCP protocol variations
  - Ensure immediate startup without configuration
  - _Requirements: 6.1, 6.2, 6.4, 6.5_

- [ ] 4.2 Fix and enhance AGENTS.md generation
  - Fix AGENTS.md creation logic in sdd-init tool
  - Implement CLAUDE.md to AGENTS.md transformation
  - Replace agent-specific references (Claude Code → AI Agent, /claude → /agent)
  - Ensure AGENTS.md provides universal SDD workflow guidance
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [ ] 5. Package for universal distribution
- [ ] 5.1 Configure NPM package for seamless installation
  - Update package.json with proper bin configuration for npx
  - Include all compiled artifacts and dependencies
  - Ensure cross-platform file path handling
  - Test npx installation process
  - _Requirements: 6.2, 6.3_

- [ ] 5.2 Optimize for production and compatibility
  - Minimize package size while maintaining functionality
  - Ensure fast startup time (< 2 seconds via npx)
  - Test with multiple MCP-compatible agents (Claude, Cursor, ChatGPT)
  - Validate universal compatibility and error handling
  - _Requirements: 6.1, 6.4, 6.5_

- [ ] 6. Comprehensive testing and validation
- [ ] 6.1 Test functional parity with custom commands
  - Compare output of each sdd-* tool with corresponding custom command
  - Verify identical behavior for all 10 workflow tools
  - Test complete SDD workflow from init to implementation
  - Validate .kiro directory structure and file generation
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [ ] 6.2 Test universal agent compatibility
  - Test MCP server with Claude Code
  - Test with Cursor MCP integration
  - Test with generic MCP clients
  - Verify consistent behavior across different agent platforms
  - _Requirements: 6.1, 6.4, 6.5_

- [ ] 7. Final integration and deployment
- [ ] 7.1 Integrate all components into cohesive package
  - Ensure all 10 tools work together as complete workflow
  - Validate workflow state transitions and phase gates
  - Test error handling and fallback scenarios
  - Verify AGENTS.md generation works correctly
  - _Requirements: All requirements integration_

- [ ] 7.2 Prepare for npm registry publication
  - Finalize package.json metadata and version
  - Create comprehensive README with npx usage instructions
  - Test final package via `npm pack` and local installation
  - Validate @latest tag functionality for npx
  - _Requirements: 6.2, 6.3, final deployment readiness_