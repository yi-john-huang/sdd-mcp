# Requirements Document: RequirementsClarificationService Refactoring v1.6.0

## Introduction

**Project**: sdd-mcp-server  
**Feature**: Refactor RequirementsClarificationService to address architectural issues identified in v1.5.0 code review  
**Version**: 1.6.0  
**Generated**: 2025-10-30

## Business Justification (WHY)

The v1.5.0 implementation successfully blocks vague requirements but suffers from architectural issues that will cause maintenance problems as the feature evolves:

1. **God Class Anti-Pattern**: Single service handles 7 different responsibilities, making testing and changes difficult
2. **Code Duplication**: Three separate implementations (service, adapter, mcp-server.js) contain duplicate logic
3. **Brittle Pattern Matching**: Regex-based semantic detection produces false positives/negatives
4. **Hardcoded Business Logic**: Question templates and scoring weights mixed with code

**Business Impact**: Without refactoring, adding new question types, customizing for domains, or improving detection accuracy will require changes across multiple files with high risk of bugs.

## Target Users (WHO)

- **Internal**: Developers maintaining/extending the clarification feature
- **External**: Users of the SDD MCP server who will benefit from improved question accuracy

## Success Criteria

1. **Reduced Complexity**: Each service class has ≤3 responsibilities (SRP compliance)
2. **Eliminated Duplication**: Single implementation used by all three entry points
3. **Improved Accuracy**: Scoring-based semantic detection reduces false positives/negatives by 50%
4. **Configuration Externalization**: Questions defined in configuration file/module, not hardcoded
5. **Test Coverage**: All new classes have 90%+ test coverage
6. **Zero Regressions**: All existing tests pass with no behavioral changes to users

## Functional Requirements

### FR-1: Split God Class into Focused Services

**Objective**: Decompose RequirementsClarificationService into single-responsibility classes

#### Acceptance Criteria

1. **DescriptionAnalyzer** - Pure analysis, no I/O
   - WHEN analyzing description THEN it SHALL detect presence of WHY/WHO/WHAT/Success elements
   - WHEN calculating quality score THEN it SHALL use configurable weights from constants
   - WHEN detecting ambiguous terms THEN it SHALL return structured list
   - IF no steering context provided THEN it SHALL analyze without external dependencies

2. **QuestionGenerator** - Pure transformation
   - WHEN generating questions THEN it SHALL use externalized question templates
   - WHEN filtering questions THEN it SHALL consider analysis results and steering context
   - WHEN creating question objects THEN it SHALL use stable semantic IDs
   - IF question condition not met THEN it SHALL exclude that question

3. **AnswerValidator** - Pure validation
   - WHEN validating answers THEN it SHALL check required, length, and content safety
   - WHEN answer too short THEN it SHALL report minimum length and actual length
   - WHEN answer contains invalid content THEN it SHALL report specific security issue
   - IF all validations pass THEN it SHALL return valid=true

4. **DescriptionEnricher** - Pure transformation
   - WHEN synthesizing description THEN it SHALL combine original + answers into 5W1H structure
   - WHEN building enriched text THEN it SHALL include all answered sections
   - WHEN answers missing THEN it SHALL gracefully handle with original content
   - IF no answers provided THEN it SHALL return original as enriched

5. **SteeringContextLoader** - Pure I/O
   - WHEN loading context THEN it SHALL read product.md and tech.md separately
   - WHEN file read fails THEN it SHALL log error and continue with defaults
   - WHEN content too short THEN it SHALL mark context as unavailable
   - IF projectPath null THEN it SHALL return default empty context

6. **RequirementsClarificationService** - Orchestrator only
   - WHEN analyzeDescription called THEN it SHALL coordinate: load context → analyze → generate questions
   - WHEN validateAnswers called THEN it SHALL delegate to AnswerValidator
   - WHEN synthesizeDescription called THEN it SHALL delegate to DescriptionEnricher
   - IF any component fails THEN it SHALL propagate error with context

### FR-2: Replace Brittle Pattern Matching

**Objective**: Move from boolean regex matching to scored semantic detection

#### Acceptance Criteria

1. WHEN analyzing description THEN it SHALL calculate presence score (0-100) for each element
2. WHEN scoring WHY THEN it SHALL count keyword matches and calculate density
3. WHEN encountering variations THEN it SHALL detect multiple forms (e.g., "enables", "enabling", "enable")
4. IF score above threshold (e.g., 30%) THEN element considered present
5. WHEN comparing to v1.5.0 THEN false positives SHALL decrease by ≥50%

### FR-3: Externalize Question Templates

**Objective**: Move hardcoded questions to configuration module

#### Acceptance Criteria

1. WHEN defining questions THEN they SHALL be in separate TypeScript module or JSON file
2. WHEN question has condition THEN it SHALL be expressed as predicate function
3. WHEN adding new question THEN no changes to service code SHALL be required
4. IF question ID used THEN it SHALL be stable semantic key, not UUID
5. WHEN loading questions THEN it SHALL support conditional inclusion based on analysis/context

### FR-4: Consolidate Duplicate Implementations

**Objective**: Eliminate duplication between service, adapter, and mcp-server.js

#### Acceptance Criteria

1. WHEN mcp-server.js needs clarification THEN it SHALL use TypeScript service via adapter
2. WHEN any entry point requests analysis THEN same code path SHALL execute
3. WHEN logic changes THEN only one place SHALL need updating
4. IF TypeScript not available THEN mcp-server.js SHALL still function (fallback)
5. WHEN comparing implementations THEN pattern matching logic SHALL be identical

## Non-Functional Requirements

### NFR-1: Backward Compatibility

- External API SHALL remain unchanged (same method signatures)
- Existing tests SHALL pass without modification
- Users SHALL see no behavioral differences in happy path
- Breaking changes SHALL be avoided in v1.6.0

### NFR-2: Performance

- Analysis SHALL complete within same time as v1.5.0 (no regression)
- Pre-compiled patterns SHALL improve regex performance
- Memory usage SHALL not increase significantly

### NFR-3: Maintainability

- Each class SHALL have single clear responsibility
- Code duplication SHALL be eliminated
- Configuration SHALL be separated from logic
- New question types SHALL be addable without service changes

### NFR-4: Testability

- Pure functions SHALL be easily unit testable
- I/O operations SHALL be isolated in dedicated class
- Each service SHALL be testable in isolation
- Mock complexity SHALL be reduced vs v1.5.0

### NFR-5: Type Safety

- All types SHALL be properly defined in domain layer
- No `any` types SHALL be introduced
- All interfaces SHALL be readonly where appropriate
- TypeScript strict mode SHALL pass

## Out of Scope (v1.6.0)

The following are explicitly NOT part of v1.6.0:

1. **UI Changes**: No changes to question text or examples
2. **New Features**: No new question categories or analysis types
3. **Internationalization**: Questions remain English-only
4. **Machine Learning**: No AI/ML-based semantic analysis
5. **API Changes**: No breaking changes to public interfaces
6. **Database Storage**: Questions remain in code/config, not persisted
7. **Multi-pass Analysis**: Still two-pass workflow (analyze, then validate)

## Technical Constraints

1. Must maintain DDD architecture with proper layer separation
2. Must use Inversify for dependency injection
3. Must maintain Jest test coverage ≥80%
4. Must compile with TypeScript strict mode
5. Must work in both simplified (mcp-server.js) and full TypeScript modes
6. Must not require database or external services
7. Must maintain synchronous MCP tool protocol

## Dependencies

- Existing v1.5.1 codebase
- No new npm dependencies required
- Refactoring only, no external integrations

## Migration Path

1. Implement new services alongside old service
2. Update RequirementsClarificationService to delegate to new services
3. Run full test suite to ensure no regressions
4. Remove old inline implementations
5. Update documentation

## Acceptance Testing

Test scenarios that must pass:

1. **Complete Description**: "Build payment API. Solves merchant pain of slow checkout. Target e-commerce users. Must handle 1000 req/sec." → No clarification needed
2. **Vague Description**: "Build fast scalable system" → Requires clarification with specific questions
3. **Partial Description**: "Build API for developers" → Detects missing WHY and Success criteria
4. **With Steering Context**: If product.md exists with target users → Skip WHO questions
5. **Answer Validation**: Too-short answer → Validation fails with specific error
6. **Malicious Content**: Answer with `<script>` tag → Validation fails with security error

## Risk Assessment

- **High Risk**: Changing semantic detection algorithm may alter behavior
- **Medium Risk**: Refactoring may introduce subtle bugs
- **Low Risk**: Adding new services is relatively safe with good tests
- **Mitigation**: Extensive testing, gradual rollout, maintain v1.5.1 as fallback

## Timeline Estimate

- Design: 2 hours
- Implementation: 12-16 hours
- Testing: 4-6 hours
- Documentation: 2 hours
- **Total**: 20-26 hours (2.5-3 sprint weeks)
