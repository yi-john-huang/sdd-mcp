# Technical Design Document: RequirementsClarificationService Refactoring v1.6.0

## Project: sdd-mcp-server

**Architecture:** Domain-Driven Design (DDD)  
**Language:** TypeScript  
**Version:** 1.6.0  
**Generated:** 2025-10-30

---

## Architecture Overview

### Current State (v1.5.1)

```
RequirementsClarificationService (God Class - 7 responsibilities)
├── analyzeDescription() - orchestration + analysis + I/O
├── validateAnswers() - validation
├── synthesizeDescription() - transformation
├── performAnalysis() - business logic
├── generateQuestions() - presentation logic
├── loadSteeringContext() - infrastructure I/O
├── detectWhy/Who/What() - pattern matching
├── calculateQualityScore() - analytics
└── extractContext() - text processing
```

**Issues:**
- Single class handles analysis, I/O, generation, validation, transformation
- Code duplicated in mcp-server.js
- Brittle regex-based semantic detection
- Hardcoded question templates

### Target State (v1.6.0)

```
Application Layer:
├── RequirementsClarificationService (Orchestrator only)
│   ├── analyzeDescription()
│   ├── validateAnswers()
│   └── synthesizeDescription()
│
├── DescriptionAnalyzer (Pure analysis)
│   ├── analyze()
│   ├── calculateQualityScore()
│   └── detectSemanticElements()
│
├── QuestionGenerator (Pure transformation)
│   ├── generateQuestions()
│   └── filterQuestionsByContext()
│
├── AnswerValidator (Pure validation)
│   └── validate()
│
├── DescriptionEnricher (Pure transformation)
│   ├── synthesize()
│   ├── extractAnswersByCategory()
│   └── buildEnrichedDescription()
│
└── SteeringContextLoader (Pure I/O)
    └── loadContext()

Domain Layer:
├── types.ts (existing types + new interfaces)
└── clarification-questions.ts (question templates)

Constants:
└── clarification-constants.ts (existing scoring/patterns)
```

---

## Component Design

### 1. DescriptionAnalyzer

**Responsibility**: Pure analysis of project descriptions using scoring-based semantic detection

**Interface**:
```typescript
interface DescriptionAnalyzer {
  analyze(
    description: string,
    steeringContext: SteeringContext
  ): ClarificationAnalysis;
}
```

**Methods**:
```typescript
class DescriptionAnalyzer {
  // Public API
  analyze(description: string, context: SteeringContext): ClarificationAnalysis
  
  // Private helpers
  private scoreSemanticPresence(description: string, patterns: RegExp[]): number
  private detectAmbiguousTerms(description: string): AmbiguousTerm[]
  private calculateQualityScore(metrics: QualityMetrics): number
  private identifyMissingElements(scores: SemanticScores, context: SteeringContext): string[]
}
```

**Algorithm** (Improved Semantic Detection):
```typescript
// OLD (v1.5.1): Boolean detection
private detectWhy(description: string): boolean {
  return WHY_PATTERNS.some(p => p.test(description)); // True if ANY match
}

// NEW (v1.6.0): Scored detection
private scoreSemanticPresence(description: string, patterns: RegExp[]): number {
  const words = description.toLowerCase().split(/\s+/);
  const matchedWords = words.filter(word => 
    patterns.some(pattern => pattern.test(word))
  );
  
  // Return percentage: 0-100
  const density = (matchedWords.length / words.length) * 100;
  const coverage = matchedWords.length > 0 ? 50 : 0; // Base score for presence
  
  return Math.min(100, coverage + density);
}

// Threshold: If score > 30, element is considered "present"
```

**Input**: 
- `description`: User-provided project description
- `steeringContext`: Context from steering documents (optional)

**Output**:
```typescript
interface ClarificationAnalysis {
  qualityScore: number;              // 0-100
  whyScore: number;                  // NEW: 0-100 (was boolean)
  whoScore: number;                  // NEW: 0-100 (was boolean)
  whatScore: number;                 // NEW: 0-100 (was boolean)
  successScore: number;              // NEW: 0-100 (was boolean)
  hasWhy: boolean;                   // Derived: whyScore > 30
  hasWho: boolean;                   // Derived: whoScore > 30
  hasWhat: boolean;                  // Derived: whatScore > 30
  hasSuccessCriteria: boolean;       // Derived: successScore > 30
  missingElements: string[];
  ambiguousTerms: AmbiguousTerm[];
  needsClarification: boolean;
}
```

**Dependencies**: None (pure function)

---

### 2. QuestionGenerator

**Responsibility**: Generate clarification questions based on analysis and context

**Interface**:
```typescript
interface QuestionGenerator {
  generateQuestions(
    analysis: ClarificationAnalysis,
    steeringContext: SteeringContext
  ): ClarificationQuestion[];
}
```

**Methods**:
```typescript
class QuestionGenerator {
  // Public API
  generateQuestions(
    analysis: ClarificationAnalysis,
    context: SteeringContext
  ): ClarificationQuestion[]
  
  // Private helpers
  private filterQuestionsByCondition(
    questions: QuestionTemplate[],
    analysis: ClarificationAnalysis,
    context: SteeringContext
  ): ClarificationQuestion[]
  
  private createQuestionFromTemplate(
    template: QuestionTemplate
  ): ClarificationQuestion
}
```

**Data Source** (Externalized):
```typescript
// New file: src/application/services/clarification-questions.ts
export interface QuestionTemplate {
  id: string;                        // Stable semantic ID
  category: QuestionCategory;
  question: string;
  rationale: string;
  examples: string[];
  required: boolean;
  condition: QuestionCondition;      // When to show this question
}

export type QuestionCondition = (
  analysis: ClarificationAnalysis,
  context: SteeringContext
) => boolean;

export const CLARIFICATION_QUESTIONS: Record<string, QuestionTemplate> = {
  why_problem: {
    id: 'why_problem',
    category: QuestionCategory.WHY,
    question: 'What business problem does this project solve? Why is it needed?',
    rationale: 'Understanding the business justification ensures we build the right solution',
    examples: [
      'Our customer support team spends 5 hours/day on repetitive inquiries',
      'Users are abandoning checkout because the process takes too long'
    ],
    required: true,
    condition: (analysis, context) => !analysis.hasWhy && !context.hasProductContext
  },
  
  why_value: {
    id: 'why_value',
    category: QuestionCategory.WHY,
    question: 'What value does this project provide to users or the business?',
    rationale: 'Clarifying value proposition helps prioritize features and measure success',
    examples: [
      'Reduce support ticket volume by 40%',
      'Increase conversion rate by improving checkout speed'
    ],
    required: true,
    condition: (analysis, context) => !analysis.hasWhy && !context.hasProductContext
  },
  
  // ... more questions
};
```

**Algorithm**:
```typescript
generateQuestions(analysis: ClarificationAnalysis, context: SteeringContext): ClarificationQuestion[] {
  return Object.values(CLARIFICATION_QUESTIONS)
    .filter(template => template.condition(analysis, context))
    .map(template => ({
      id: template.id,
      category: template.category,
      question: template.question,
      why: template.rationale,
      examples: template.examples,
      required: template.required
    }));
}
```

**Dependencies**: CLARIFICATION_QUESTIONS constant

---

### 3. AnswerValidator

**Responsibility**: Validate user-provided clarification answers

**Interface**:
```typescript
interface AnswerValidator {
  validate(
    questions: ClarificationQuestion[],
    answers: ClarificationAnswers
  ): AnswerValidationResult;
}
```

**Methods**:
```typescript
class AnswerValidator {
  // Public API
  validate(
    questions: ClarificationQuestion[],
    answers: ClarificationAnswers
  ): AnswerValidationResult
  
  // Private helpers (if needed)
  private checkRequiredAnswers(questions: ClarificationQuestion[], answers: ClarificationAnswers): string[]
  private checkAnswerLength(answer: string, minLength: number): boolean
  private checkSecurityPatterns(answer: string): boolean
}
```

**Validation Rules**:
1. Required questions must have answers
2. Answers must be ≥ 10 characters
3. Answers must not contain XSS patterns (`<script`, `javascript:`, `onerror=`)

**Output**:
```typescript
interface AnswerValidationResult {
  valid: boolean;
  missingRequired: string[];
  tooShort: Array<{ question: string; minLength: number; currentLength: number }>;
  containsInvalidContent: string[];
}
```

**Dependencies**: ANSWER_VALIDATION constants

---

### 4. DescriptionEnricher

**Responsibility**: Synthesize enriched project description from original + answers

**Interface**:
```typescript
interface DescriptionEnricher {
  synthesize(
    originalDescription: string,
    questions: ClarificationQuestion[],
    answers: ClarificationAnswers
  ): EnrichedProjectDescription;
}
```

**Methods**:
```typescript
class DescriptionEnricher {
  // Public API
  synthesize(
    original: string,
    questions: ClarificationQuestion[],
    answers: ClarificationAnswers
  ): EnrichedProjectDescription
  
  // Private helpers
  private extractAnswersByCategory(
    questions: ClarificationQuestion[],
    answers: ClarificationAnswers,
    category: QuestionCategory
  ): string
  
  private buildEnrichedDescription(components: DescriptionComponents): string
}
```

**Algorithm**:
```typescript
synthesize(original, questions, answers): EnrichedProjectDescription {
  const why = this.extractAnswersByCategory(questions, answers, QuestionCategory.WHY);
  const who = this.extractAnswersByCategory(questions, answers, QuestionCategory.WHO);
  const what = this.extractAnswersByCategory(questions, answers, QuestionCategory.WHAT);
  const how = this.extractAnswersByCategory(questions, answers, QuestionCategory.HOW);
  const success = this.extractAnswersByCategory(questions, answers, QuestionCategory.SUCCESS);
  
  const enriched = this.buildEnrichedDescription({
    original, why, who, what, how, successCriteria: success
  });
  
  return { original, why, who, what, how, successCriteria: success, enriched };
}
```

**Output** (5W1H Structure):
```
## Original Description
[original text]

## Business Justification (Why)
[why answers]

## Target Users (Who)
[who answers]

## Core Features (What)
[what answers]

## Technical Approach (How)
[how answers]

## Success Criteria
[success answers]
```

**Dependencies**: None (pure function)

---

### 5. SteeringContextLoader

**Responsibility**: Load steering documents from filesystem

**Interface**:
```typescript
interface SteeringContextLoader {
  loadContext(projectPath?: string): Promise<SteeringContext>;
}
```

**Methods**:
```typescript
@injectable()
class SteeringContextLoader {
  constructor(
    @inject(TYPES.FileSystemPort) private fileSystem: FileSystemPort,
    @inject(TYPES.LoggerPort) private logger: LoggerPort
  ) {}
  
  async loadContext(projectPath?: string): Promise<SteeringContext>
  
  private async loadProductContext(projectPath: string): Promise<Partial<SteeringContext>>
  private async loadTechContext(projectPath: string): Promise<Partial<SteeringContext>>
}
```

**Algorithm**:
```typescript
async loadContext(projectPath?: string): Promise<SteeringContext> {
  const defaultContext = { hasProductContext: false, hasTargetUsers: false, hasTechContext: false };
  
  if (!projectPath) return defaultContext;
  
  try {
    const context = { ...defaultContext };
    
    // Load product.md with individual error handling
    try {
      const productPath = `${projectPath}/.kiro/steering/product.md`;
      if (await this.fileSystem.exists(productPath)) {
        const content = await this.fileSystem.readFile(productPath);
        context.hasProductContext = content.length > MIN_STEERING_CONTENT_LENGTH;
        context.hasTargetUsers = TARGET_USERS_PATTERN.test(content);
      }
    } catch (err) {
      this.logger.debug('Failed to load product.md', { error: err });
    }
    
    // Load tech.md with individual error handling
    try {
      const techPath = `${projectPath}/.kiro/steering/tech.md`;
      if (await this.fileSystem.exists(techPath)) {
        const content = await this.fileSystem.readFile(techPath);
        context.hasTechContext = content.length > MIN_STEERING_CONTENT_LENGTH;
      }
    } catch (err) {
      this.logger.debug('Failed to load tech.md', { error: err });
    }
    
    return context;
  } catch (err) {
    this.logger.warn('Failed to load steering context, using defaults', { error: err, projectPath });
    return defaultContext;
  }
}
```

**Dependencies**: FileSystemPort, LoggerPort (injected)

---

### 6. RequirementsClarificationService (Refactored)

**Responsibility**: Orchestrate clarification workflow (delegation only)

**Interface**: (Unchanged - backward compatible)
```typescript
interface RequirementsClarificationService {
  analyzeDescription(description: string, projectPath?: string): Promise<ClarificationResult>;
  validateAnswers(questions: ClarificationQuestion[], answers: ClarificationAnswers): AnswerValidationResult;
  synthesizeDescription(original: string, questions: ClarificationQuestion[], answers: ClarificationAnswers): EnrichedProjectDescription;
}
```

**Implementation**:
```typescript
@injectable()
class RequirementsClarificationService {
  constructor(
    @inject(TYPES.DescriptionAnalyzer) private analyzer: DescriptionAnalyzer,
    @inject(TYPES.QuestionGenerator) private questionGenerator: QuestionGenerator,
    @inject(TYPES.AnswerValidator) private answerValidator: AnswerValidator,
    @inject(TYPES.DescriptionEnricher) private enricher: DescriptionEnricher,
    @inject(TYPES.SteeringContextLoader) private contextLoader: SteeringContextLoader,
    @inject(TYPES.LoggerPort) private logger: LoggerPort
  ) {}
  
  async analyzeDescription(description: string, projectPath?: string): Promise<ClarificationResult> {
    const correlationId = uuidv4();
    
    this.logger.info('Analyzing project description', { correlationId, descriptionLength: description.length });
    
    // 1. Load context
    const steeringContext = await this.contextLoader.loadContext(projectPath);
    
    // 2. Analyze description
    const analysis = this.analyzer.analyze(description, steeringContext);
    
    this.logger.debug('Analysis completed', { correlationId, qualityScore: analysis.qualityScore });
    
    // 3. Check if clarification needed
    if (!analysis.needsClarification) {
      return { needsClarification: false, analysis };
    }
    
    // 4. Generate questions
    const questions = this.questionGenerator.generateQuestions(analysis, steeringContext);
    
    return { needsClarification: true, questions, analysis };
  }
  
  validateAnswers(questions: ClarificationQuestion[], answers: ClarificationAnswers): AnswerValidationResult {
    return this.answerValidator.validate(questions, answers);
  }
  
  synthesizeDescription(
    original: string,
    questions: ClarificationQuestion[],
    answers: ClarificationAnswers
  ): EnrichedProjectDescription {
    const correlationId = uuidv4();
    
    this.logger.info('Synthesizing enriched description', { correlationId, questionCount: questions.length });
    
    return this.enricher.synthesize(original, questions, answers);
  }
}
```

**Dependencies**: All 5 new services (injected)

---

## Data Models

### New Type Definitions

```typescript
// Add to src/domain/types.ts

export interface QuestionTemplate {
  readonly id: string;
  readonly category: QuestionCategory;
  readonly question: string;
  readonly rationale: string;
  readonly examples: string[];
  readonly required: boolean;
  readonly condition: (analysis: ClarificationAnalysis, context: SteeringContext) => boolean;
}

export interface SemanticScores {
  readonly whyScore: number;      // 0-100
  readonly whoScore: number;      // 0-100
  readonly whatScore: number;     // 0-100
  readonly successScore: number;  // 0-100
}

export interface QualityMetrics {
  readonly hasWhy: boolean;
  readonly hasWho: boolean;
  readonly hasWhat: boolean;
  readonly hasSuccessCriteria: boolean;
  readonly ambiguousTermCount: number;
  readonly descriptionLength: number;
}

export interface DescriptionComponents {
  readonly original: string;
  readonly why: string;
  readonly who: string;
  readonly what: string;
  readonly how: string;
  readonly successCriteria: string;
}
```

### Updated Type Definitions

```typescript
// Update existing ClarificationAnalysis in src/domain/types.ts
export interface ClarificationAnalysis {
  readonly qualityScore: number;
  readonly whyScore: number;         // NEW
  readonly whoScore: number;         // NEW
  readonly whatScore: number;        // NEW
  readonly successScore: number;     // NEW
  readonly missingElements: string[];
  readonly ambiguousTerms: AmbiguousTerm[];
  readonly needsClarification: boolean;
  readonly hasWhy: boolean;
  readonly hasWho: boolean;
  readonly hasWhat: boolean;
  readonly hasSuccessCriteria: boolean;
}
```

---

## Dependency Injection Configuration

```typescript
// Update src/infrastructure/di/types.ts
export const TYPES = {
  // ... existing types
  RequirementsClarificationService: Symbol.for('RequirementsClarificationService'), // existing
  DescriptionAnalyzer: Symbol.for('DescriptionAnalyzer'),                           // NEW
  QuestionGenerator: Symbol.for('QuestionGenerator'),                               // NEW
  AnswerValidator: Symbol.for('AnswerValidator'),                                   // NEW
  DescriptionEnricher: Symbol.for('DescriptionEnricher'),                           // NEW
  SteeringContextLoader: Symbol.for('SteeringContextLoader'),                       // NEW
} as const;

// Update src/infrastructure/di/container.ts
export function createContainer(): Container {
  const container = new Container();
  
  // ... existing bindings
  
  // NEW: Register clarification services
  container.bind<DescriptionAnalyzer>(TYPES.DescriptionAnalyzer).to(DescriptionAnalyzer);
  container.bind<QuestionGenerator>(TYPES.QuestionGenerator).to(QuestionGenerator);
  container.bind<AnswerValidator>(TYPES.AnswerValidator).to(AnswerValidator);
  container.bind<DescriptionEnricher>(TYPES.DescriptionEnricher).to(DescriptionEnricher);
  container.bind<SteeringContextLoader>(TYPES.SteeringContextLoader).to(SteeringContextLoader);
  container.bind<RequirementsClarificationService>(TYPES.RequirementsClarificationService).to(RequirementsClarificationService);
  
  return container;
}
```

---

## Migration Strategy

### Phase 1: Implement New Services (Parallel)
1. Create new service classes alongside existing service
2. Implement with full test coverage
3. No changes to existing code yet

### Phase 2: Refactor Orchestrator
1. Update RequirementsClarificationService to delegate to new services
2. Remove old inline implementations
3. Run full test suite

### Phase 3: Consolidate mcp-server.js
1. Import and use TypeScript services via container
2. Remove duplicate logic in mcp-server.js
3. Test both entry points (TypeScript + mcp-server.js)

### Phase 4: Cleanup
1. Remove unused code
2. Update documentation
3. Final testing

---

## Testing Strategy

### Unit Tests (New Services)

1. **DescriptionAnalyzer**
   - Test scoring algorithm with various descriptions
   - Test false positive reduction
   - Test edge cases (empty, very long, special chars)

2. **QuestionGenerator**
   - Test question filtering based on analysis
   - Test context-aware filtering
   - Test question template loading

3. **AnswerValidator**
   - Test required field validation
   - Test length validation
   - Test security pattern detection

4. **DescriptionEnricher**
   - Test 5W1H synthesis
   - Test empty answer handling
   - Test formatting

5. **SteeringContextLoader**
   - Test file loading
   - Test error handling
   - Test default context

6. **RequirementsClarificationService**
   - Test orchestration flow
   - Test delegation to sub-services
   - Test backward compatibility

### Integration Tests

1. End-to-end workflow with real files
2. MCP tool integration (sdd-init)
3. Adapter integration (SDDToolAdapter)

### Regression Tests

1. All existing tests must pass
2. No behavioral changes for users
3. Performance benchmarks (no degradation)

---

## Performance Considerations

1. **Pre-compiled Patterns**: Use const arrays of RegExp, compiled once
2. **Lazy Loading**: Load steering context only when needed
3. **Caching**: Consider caching steering context if performance issues arise
4. **Memory**: Ensure no memory leaks with large descriptions

---

## Security Considerations

1. **Input Validation**: AnswerValidator checks for XSS patterns
2. **File Access**: SteeringContextLoader uses FileSystemPort abstraction
3. **Logging**: No sensitive data in logs (correlation IDs only)

---

## Rollback Plan

If issues arise:
1. Revert to v1.5.1 (git tag)
2. Known stable version with comprehensive tests
3. All changes are backward compatible, so rollback is safe

---

## Success Metrics

1. **Code Quality**: Each service ≤3 methods, single responsibility
2. **Test Coverage**: All new services ≥90% coverage
3. **Duplication**: Zero duplicate pattern matching logic
4. **Accuracy**: 50% reduction in false positives (manual testing)
5. **Performance**: No regression vs v1.5.1 (same or faster)
6. **Maintainability**: Adding new question requires only config change

---

## File Structure

```
src/
├── application/
│   └── services/
│       ├── RequirementsClarificationService.ts (refactored)
│       ├── DescriptionAnalyzer.ts (NEW)
│       ├── QuestionGenerator.ts (NEW)
│       ├── AnswerValidator.ts (NEW)
│       ├── DescriptionEnricher.ts (NEW)
│       ├── SteeringContextLoader.ts (NEW)
│       ├── clarification-questions.ts (NEW)
│       └── clarification-constants.ts (existing)
├── domain/
│   └── types.ts (updated with new interfaces)
├── infrastructure/
│   └── di/
│       ├── types.ts (updated with new symbols)
│       └── container.ts (updated with new bindings)
└── __tests__/
    └── unit/
        ├── DescriptionAnalyzer.test.ts (NEW)
        ├── QuestionGenerator.test.ts (NEW)
        ├── AnswerValidator.test.ts (NEW)
        ├── DescriptionEnricher.test.ts (NEW)
        ├── SteeringContextLoader.test.ts (NEW)
        └── RequirementsClarificationService.test.ts (updated)
```

---

## Timeline Estimate

- **DescriptionAnalyzer**: 4 hours (implementation + tests)
- **QuestionGenerator**: 3 hours (implementation + tests)
- **AnswerValidator**: 2 hours (implementation + tests)
- **DescriptionEnricher**: 2 hours (implementation + tests)
- **SteeringContextLoader**: 2 hours (implementation + tests)
- **Service Refactoring**: 3 hours (orchestrator + DI)
- **Integration Testing**: 2 hours
- **Documentation**: 2 hours

**Total**: 20 hours (2.5 days)
