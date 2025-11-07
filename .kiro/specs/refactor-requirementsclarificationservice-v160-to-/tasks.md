# Task Breakdown: RequirementsClarificationService Refactoring v1.6.0

**Feature**: refactor-requirementsclarificationservice-v160-to-  
**Version**: 1.6.0  
**Methodology**: Test-Driven Development (TDD)  
**Generated**: 2025-10-30

---

## Phase 1: Test Setup 🔴 RED - Write Failing Tests First

### Task 1.1: Create DescriptionAnalyzer Test Suite
**Status**: ⏳ Pending  
**Priority**: High  
**Estimated Time**: 2 hours

**Objective**: Write failing tests for DescriptionAnalyzer before implementation

**Test Cases**:
```typescript
// src/__tests__/unit/DescriptionAnalyzer.test.ts

describe('DescriptionAnalyzer', () => {
  describe('analyze', () => {
    it('should calculate semantic scores for complete description');
    it('should detect WHY with scored approach');
    it('should detect WHO with scored approach');
    it('should detect WHAT with scored approach');
    it('should detect success criteria with scored approach');
    it('should identify ambiguous terms');
    it('should calculate overall quality score');
    it('should determine if clarification needed');
    it('should consider steering context in analysis');
    it('should handle empty descriptions gracefully');
    it('should handle very long descriptions efficiently');
  });
  
  describe('scoreSemanticPresence', () => {
    it('should return 0 for no matches');
    it('should return high score for dense keyword presence');
    it('should handle word variations (enables, enabling, enable)');
    it('should calculate density as percentage');
  });
});
```

**Acceptance Criteria**:
- [ ] All test cases defined with clear descriptions
- [ ] Test file created and imports DescriptionAnalyzer (compilation fails - expected)
- [ ] Mock data prepared for various description types
- [ ] Tests run and FAIL (RED phase)

---

### Task 1.2: Create QuestionGenerator Test Suite
**Status**: ⏳ Pending  
**Priority**: High  
**Estimated Time**: 1.5 hours

**Objective**: Write failing tests for QuestionGenerator

**Test Cases**:
```typescript
// src/__tests__/unit/QuestionGenerator.test.ts

describe('QuestionGenerator', () => {
  describe('generateQuestions', () => {
    it('should load questions from CLARIFICATION_QUESTIONS');
    it('should filter questions by analysis results');
    it('should filter questions by steering context');
    it('should include WHY questions when hasWhy=false');
    it('should exclude WHY questions when hasProductContext=true');
    it('should use stable semantic IDs from templates');
    it('should preserve question metadata (examples, rationale)');
    it('should handle empty analysis gracefully');
  });
});
```

**Acceptance Criteria**:
- [ ] All test cases defined
- [ ] Tests import QuestionGenerator and clarification-questions (fails - expected)
- [ ] Mock analysis and context objects prepared
- [ ] Tests run and FAIL (RED phase)

---

### Task 1.3: Create AnswerValidator Test Suite
**Status**: ⏳ Pending  
**Priority**: High  
**Estimated Time**: 1 hour

**Objective**: Write failing tests for AnswerValidator

**Test Cases**:
```typescript
// src/__tests__/unit/AnswerValidator.test.ts

describe('AnswerValidator', () => {
  describe('validate', () => {
    it('should pass validation for complete valid answers');
    it('should detect missing required answers');
    it('should detect too-short answers (< 10 chars)');
    it('should detect XSS patterns in answers');
    it('should report specific validation failures');
    it('should handle empty answers object');
    it('should validate multiple issues simultaneously');
  });
});
```

**Acceptance Criteria**:
- [ ] All test cases defined
- [ ] Tests import AnswerValidator (fails - expected)
- [ ] Security test cases include XSS patterns
- [ ] Tests run and FAIL (RED phase)

---

### Task 1.4: Create DescriptionEnricher Test Suite
**Status**: ⏳ Pending  
**Priority**: Medium  
**Estimated Time**: 1 hour

**Objective**: Write failing tests for DescriptionEnricher

**Test Cases**:
```typescript
// src/__tests__/unit/DescriptionEnricher.test.ts

describe('DescriptionEnricher', () => {
  describe('synthesize', () => {
    it('should extract answers by category');
    it('should build 5W1H structured description');
    it('should handle missing category answers gracefully');
    it('should include original description in output');
    it('should format enriched text with proper sections');
    it('should handle empty answers object');
  });
});
```

**Acceptance Criteria**:
- [ ] All test cases defined
- [ ] Tests import DescriptionEnricher (fails - expected)
- [ ] Test data covers various answer combinations
- [ ] Tests run and FAIL (RED phase)

---

### Task 1.5: Create SteeringContextLoader Test Suite
**Status**: ⏳ Pending  
**Priority**: Medium  
**Estimated Time**: 1.5 hours

**Objective**: Write failing tests for SteeringContextLoader

**Test Cases**:
```typescript
// src/__tests__/unit/SteeringContextLoader.test.ts

describe('SteeringContextLoader', () => {
  describe('loadContext', () => {
    it('should return default context when projectPath is null');
    it('should load product.md and detect hasProductContext');
    it('should load tech.md and detect hasTechContext');
    it('should detect target users pattern in product.md');
    it('should handle missing files gracefully');
    it('should handle file read errors without throwing');
    it('should return defaults on complete failure');
    it('should check content length threshold');
  });
});
```

**Acceptance Criteria**:
- [ ] All test cases defined
- [ ] FileSystemPort mocked properly
- [ ] Error scenarios covered
- [ ] Tests run and FAIL (RED phase)

---

### Task 1.6: Update RequirementsClarificationService Test Suite
**Status**: ⏳ Pending  
**Priority**: High  
**Estimated Time**: 1.5 hours

**Objective**: Update existing tests for refactored orchestrator

**Test Cases** (additions):
```typescript
// src/__tests__/unit/RequirementsClarificationService.test.ts

describe('RequirementsClarificationService (Refactored)', () => {
  describe('analyzeDescription', () => {
    it('should delegate to SteeringContextLoader');
    it('should delegate to DescriptionAnalyzer');
    it('should delegate to QuestionGenerator');
    it('should orchestrate full workflow');
    it('should maintain backward compatibility with v1.5.1');
  });
  
  describe('validateAnswers', () => {
    it('should delegate to AnswerValidator');
  });
  
  describe('synthesizeDescription', () => {
    it('should delegate to DescriptionEnricher');
  });
});
```

**Acceptance Criteria**:
- [ ] Existing tests still pass (or fail appropriately in RED phase)
- [ ] New delegation tests added
- [ ] All sub-services mocked
- [ ] Backward compatibility verified

---

## Phase 2: Implementation 🟢 GREEN - Make Tests Pass

### Task 2.1: Implement DescriptionAnalyzer
**Status**: ⏳ Pending  
**Priority**: High  
**Estimated Time**: 3 hours

**Steps**:
1. Create `src/application/services/DescriptionAnalyzer.ts`
2. Implement scored semantic detection algorithm
3. Implement `scoreSemanticPresence()` method
4. Implement `detectAmbiguousTerms()` method
5. Implement `calculateQualityScore()` method
6. Implement `analyze()` orchestration method
7. Run tests until all GREEN

**Implementation**:
```typescript
@injectable()
export class DescriptionAnalyzer {
  analyze(description: string, context: SteeringContext): ClarificationAnalysis {
    // Calculate semantic scores (0-100 each)
    const whyScore = this.scoreSemanticPresence(description, PATTERN_DETECTION.WHY_PATTERNS);
    const whoScore = this.scoreSemanticPresence(description, PATTERN_DETECTION.WHO_PATTERNS);
    const whatScore = this.scoreSemanticPresence(description, PATTERN_DETECTION.WHAT_PATTERNS);
    const successScore = this.scoreSemanticPresence(description, PATTERN_DETECTION.SUCCESS_PATTERNS);
    
    // Derive boolean presence (threshold: 30)
    const hasWhy = whyScore > 30;
    const hasWho = whoScore > 30;
    const hasWhat = whatScore > 30;
    const hasSuccessCriteria = successScore > 30;
    
    // Detect ambiguous terms
    const ambiguousTerms = this.detectAmbiguousTerms(description);
    
    // Calculate overall quality score
    const qualityScore = this.calculateQualityScore({
      hasWhy, hasWho, hasWhat, hasSuccessCriteria,
      ambiguousTermCount: ambiguousTerms.length,
      descriptionLength: description.length
    });
    
    // Determine missing elements
    const missingElements = this.identifyMissingElements(
      { hasWhy, hasWho, hasWhat, hasSuccessCriteria },
      context
    );
    
    const needsClarification = qualityScore < QUALITY_SCORE_WEIGHTS.MIN_ACCEPTABLE_SCORE || missingElements.length > 0;
    
    return {
      qualityScore,
      whyScore,
      whoScore,
      whatScore,
      successScore,
      hasWhy,
      hasWho,
      hasWhat,
      hasSuccessCriteria,
      missingElements,
      ambiguousTerms,
      needsClarification
    };
  }
  
  private scoreSemanticPresence(description: string, patterns: readonly RegExp[]): number {
    const words = description.toLowerCase().split(/\s+/);
    const matchedWords = words.filter(word => 
      patterns.some(pattern => pattern.test(word))
    );
    
    if (matchedWords.length === 0) return 0;
    
    const coverage = 50; // Base score for any presence
    const density = (matchedWords.length / words.length) * 100;
    
    return Math.min(100, coverage + density);
  }
  
  // ... other private methods
}
```

**Acceptance Criteria**:
- [ ] All DescriptionAnalyzer tests pass (GREEN)
- [ ] Scored detection reduces false positives
- [ ] TypeScript compiles without errors
- [ ] No `any` types used

---

### Task 2.2: Create Question Templates Configuration
**Status**: ⏳ Pending  
**Priority**: High  
**Estimated Time**: 2 hours

**Steps**:
1. Create `src/application/services/clarification-questions.ts`
2. Define `QuestionTemplate` interface (if not in types.ts)
3. Extract all hardcoded questions from v1.5.1
4. Convert to configuration objects with conditions
5. Export `CLARIFICATION_QUESTIONS` constant

**Implementation**:
```typescript
// src/application/services/clarification-questions.ts

import { QuestionCategory, ClarificationAnalysis, SteeringContext } from '../../domain/types.js';

export interface QuestionTemplate {
  readonly id: string;
  readonly category: QuestionCategory;
  readonly question: string;
  readonly rationale: string;
  readonly examples: string[];
  readonly required: boolean;
  readonly condition: (analysis: ClarificationAnalysis, context: SteeringContext) => boolean;
}

export const CLARIFICATION_QUESTIONS: Record<string, QuestionTemplate> = {
  why_problem: {
    id: 'why_problem',
    category: QuestionCategory.WHY,
    question: 'What business problem does this project solve? Why is it needed?',
    rationale: 'Understanding the business justification ensures we build the right solution',
    examples: [
      'Our customer support team spends 5 hours/day on repetitive inquiries',
      'Users are abandoning checkout because the process takes too long',
      'Developers waste time searching for undocumented APIs'
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
      'Increase conversion rate by improving checkout speed',
      'Save developers 2 hours/week with better documentation'
    ],
    required: true,
    condition: (analysis, context) => !analysis.hasWhy && !context.hasProductContext
  },
  
  who_users: {
    id: 'who_users',
    category: QuestionCategory.WHO,
    question: 'Who are the primary users of this project?',
    rationale: 'Knowing the target users shapes UX, features, and technical decisions',
    examples: [
      'Customer support agents using ticketing systems',
      'E-commerce shoppers on mobile devices',
      'Backend developers integrating APIs'
    ],
    required: true,
    condition: (analysis, context) => !analysis.hasWho && !context.hasTargetUsers
  },
  
  what_mvp_features: {
    id: 'what_mvp_features',
    category: QuestionCategory.WHAT,
    question: 'What are the 3-5 core features for the MVP?',
    rationale: 'Defining MVP scope prevents scope creep and ensures focused delivery',
    examples: [
      'Auto-response system, ticket categorization, analytics dashboard',
      'Product search, cart management, payment integration',
      'API explorer, code examples, interactive documentation'
    ],
    required: true,
    condition: (analysis, _context) => !analysis.hasWhat
  },
  
  what_out_of_scope: {
    id: 'what_out_of_scope',
    category: QuestionCategory.WHAT,
    question: 'What is explicitly OUT OF SCOPE for this project?',
    rationale: 'Boundary definition prevents feature creep and manages expectations',
    examples: [
      'Admin panel (future phase)',
      'Mobile app (web only for MVP)',
      'Multi-language support (English only initially)'
    ],
    required: false,
    condition: (analysis, _context) => !analysis.hasWhat
  },
  
  success_metrics: {
    id: 'success_metrics',
    category: QuestionCategory.SUCCESS,
    question: 'How will you measure if this project is successful?',
    rationale: 'Quantifiable metrics enable objective evaluation and iteration',
    examples: [
      'Support ticket volume reduced by 30% within 3 months',
      'Page load time under 2 seconds, conversion rate > 3%',
      'API documentation rated 4.5/5 stars by developers'
    ],
    required: true,
    condition: (analysis, _context) => !analysis.hasSuccessCriteria
  },
  
  how_tech_constraints: {
    id: 'how_tech_constraints',
    category: QuestionCategory.HOW,
    question: 'Are there any technical constraints or preferences? (language, platform, existing systems)',
    rationale: 'Technical constraints shape architecture and technology choices',
    examples: [
      'Must integrate with existing Salesforce CRM',
      'TypeScript + React preferred, hosted on AWS',
      'Python-based, needs to run on-premise'
    ],
    required: false,
    condition: (_analysis, context) => !context.hasTechContext
  }
};
```

**Acceptance Criteria**:
- [ ] All v1.5.1 questions extracted
- [ ] Each question has stable semantic ID
- [ ] Conditions properly express when to show question
- [ ] TypeScript types all correct
- [ ] No hardcoded questions remain in service

---

### Task 2.3: Implement QuestionGenerator
**Status**: ⏳ Pending  
**Priority**: High  
**Estimated Time**: 2 hours

**Steps**:
1. Create `src/application/services/QuestionGenerator.ts`
2. Implement question filtering logic
3. Implement condition evaluation
4. Map templates to ClarificationQuestion objects
5. Run tests until GREEN

**Implementation**:
```typescript
@injectable()
export class QuestionGenerator {
  generateQuestions(
    analysis: ClarificationAnalysis,
    context: SteeringContext
  ): ClarificationQuestion[] {
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
}
```

**Acceptance Criteria**:
- [ ] All QuestionGenerator tests pass (GREEN)
- [ ] Questions filtered correctly by analysis
- [ ] Questions filtered correctly by context
- [ ] Stable IDs used (no UUIDs)

---

### Task 2.4: Implement AnswerValidator
**Status**: ⏳ Pending  
**Priority**: High  
**Estimated Time**: 1.5 hours

**Steps**:
1. Create `src/application/services/AnswerValidator.ts`
2. Implement required field validation
3. Implement length validation
4. Implement security pattern validation
5. Run tests until GREEN

**Implementation**:
```typescript
@injectable()
export class AnswerValidator {
  validate(
    questions: ClarificationQuestion[],
    answers: ClarificationAnswers
  ): AnswerValidationResult {
    const missingRequired: string[] = [];
    const tooShort: Array<{ question: string; minLength: number; currentLength: number }> = [];
    const containsInvalidContent: string[] = [];
    
    for (const question of questions) {
      const answer = answers[question.id]?.trim() || '';
      
      if (question.required && !answer) {
        missingRequired.push(question.question);
        continue;
      }
      
      if (answer && answer.length < ANSWER_VALIDATION.MIN_ANSWER_LENGTH) {
        tooShort.push({
          question: question.question,
          minLength: ANSWER_VALIDATION.MIN_ANSWER_LENGTH,
          currentLength: answer.length
        });
      }
      
      if (answer && ANSWER_VALIDATION.INVALID_CONTENT_PATTERN.test(answer)) {
        containsInvalidContent.push(question.question);
      }
    }
    
    const valid = missingRequired.length === 0 && tooShort.length === 0 && containsInvalidContent.length === 0;
    
    return { valid, missingRequired, tooShort, containsInvalidContent };
  }
}
```

**Acceptance Criteria**:
- [ ] All AnswerValidator tests pass (GREEN)
- [ ] Security validation works
- [ ] Detailed error reporting

---

### Task 2.5: Implement DescriptionEnricher
**Status**: ⏳ Pending  
**Priority**: Medium  
**Estimated Time**: 2 hours

**Steps**:
1. Create `src/application/services/DescriptionEnricher.ts`
2. Implement category extraction logic
3. Implement 5W1H formatting
4. Handle missing answers gracefully
5. Run tests until GREEN

**Implementation**:
```typescript
@injectable()
export class DescriptionEnricher {
  synthesize(
    originalDescription: string,
    questions: ClarificationQuestion[],
    answers: ClarificationAnswers
  ): EnrichedProjectDescription {
    const why = this.extractAnswersByCategory(questions, answers, QuestionCategory.WHY);
    const who = this.extractAnswersByCategory(questions, answers, QuestionCategory.WHO);
    const what = this.extractAnswersByCategory(questions, answers, QuestionCategory.WHAT);
    const how = this.extractAnswersByCategory(questions, answers, QuestionCategory.HOW);
    const successCriteria = this.extractAnswersByCategory(questions, answers, QuestionCategory.SUCCESS);
    
    const enriched = this.buildEnrichedDescription({
      original: originalDescription,
      why,
      who,
      what,
      how,
      successCriteria
    });
    
    return {
      original: originalDescription,
      why,
      who,
      what,
      how,
      successCriteria,
      enriched
    };
  }
  
  private extractAnswersByCategory(
    questions: ClarificationQuestion[],
    answers: ClarificationAnswers,
    category: QuestionCategory
  ): string {
    const categoryQuestions = questions.filter(q => q.category === category);
    const categoryAnswers = categoryQuestions
      .map(q => answers[q.id])
      .filter(a => a && a.trim().length > 0);
    
    return categoryAnswers.join(' ');
  }
  
  private buildEnrichedDescription(components: DescriptionComponents): string {
    const parts: string[] = [];
    
    if (components.original) {
      parts.push(`## Original Description\n${components.original}`);
    }
    
    if (components.why) {
      parts.push(`## Business Justification (Why)\n${components.why}`);
    }
    
    if (components.who) {
      parts.push(`## Target Users (Who)\n${components.who}`);
    }
    
    if (components.what) {
      parts.push(`## Core Features (What)\n${components.what}`);
    }
    
    if (components.how) {
      parts.push(`## Technical Approach (How)\n${components.how}`);
    }
    
    if (components.successCriteria) {
      parts.push(`## Success Criteria\n${components.successCriteria}`);
    }
    
    return parts.join('\n\n');
  }
}
```

**Acceptance Criteria**:
- [ ] All DescriptionEnricher tests pass (GREEN)
- [ ] 5W1H format correct
- [ ] Handles missing answers

---

### Task 2.6: Implement SteeringContextLoader
**Status**: ⏳ Pending  
**Priority**: Medium  
**Estimated Time**: 2 hours

**Steps**:
1. Create `src/application/services/SteeringContextLoader.ts`
2. Implement file loading with error handling
3. Implement content length checks
4. Implement pattern detection
5. Run tests until GREEN

**Implementation**:
```typescript
@injectable()
export class SteeringContextLoader {
  constructor(
    @inject(TYPES.FileSystemPort) private readonly fileSystem: FileSystemPort,
    @inject(TYPES.LoggerPort) private readonly logger: LoggerPort
  ) {}
  
  async loadContext(projectPath?: string): Promise<SteeringContext> {
    const defaultContext: SteeringContext = {
      hasProductContext: false,
      hasTargetUsers: false,
      hasTechContext: false
    };
    
    if (!projectPath) return defaultContext;
    
    try {
      const context = { ...defaultContext };
      
      // Load product.md
      try {
        const productPath = `${projectPath}/.kiro/steering/product.md`;
        if (await this.fileSystem.exists(productPath)) {
          const content = await this.fileSystem.readFile(productPath);
          context.hasProductContext = content.length > QUALITY_SCORE_WEIGHTS.MIN_STEERING_CONTENT_LENGTH;
          context.hasTargetUsers = PATTERN_DETECTION.TARGET_USERS_PATTERN.test(content);
        }
      } catch (err) {
        this.logger.debug('Failed to load product.md', { error: (err as Error).message });
      }
      
      // Load tech.md
      try {
        const techPath = `${projectPath}/.kiro/steering/tech.md`;
        if (await this.fileSystem.exists(techPath)) {
          const content = await this.fileSystem.readFile(techPath);
          context.hasTechContext = content.length > QUALITY_SCORE_WEIGHTS.MIN_STEERING_CONTENT_LENGTH;
        }
      } catch (err) {
        this.logger.debug('Failed to load tech.md', { error: (err as Error).message });
      }
      
      return context;
    } catch (err) {
      this.logger.warn('Failed to load steering context, using defaults', {
        error: (err as Error).message,
        projectPath
      });
      return defaultContext;
    }
  }
}
```

**Acceptance Criteria**:
- [ ] All SteeringContextLoader tests pass (GREEN)
- [ ] Error handling robust
- [ ] Always returns valid context

---

### Task 2.7: Refactor RequirementsClarificationService
**Status**: ⏳ Pending  
**Priority**: High  
**Estimated Time**: 2 hours

**Steps**:
1. Update RequirementsClarificationService to use new services
2. Replace inline implementations with delegations
3. Keep public API identical (backward compatible)
4. Run tests until all GREEN

**Implementation**:
```typescript
@injectable()
export class RequirementsClarificationService {
  constructor(
    @inject(TYPES.DescriptionAnalyzer) private readonly analyzer: DescriptionAnalyzer,
    @inject(TYPES.QuestionGenerator) private readonly questionGenerator: QuestionGenerator,
    @inject(TYPES.AnswerValidator) private readonly answerValidator: AnswerValidator,
    @inject(TYPES.DescriptionEnricher) private readonly enricher: DescriptionEnricher,
    @inject(TYPES.SteeringContextLoader) private readonly contextLoader: SteeringContextLoader,
    @inject(TYPES.LoggerPort) private readonly logger: LoggerPort
  ) {}
  
  async analyzeDescription(
    description: string,
    projectPath?: string
  ): Promise<ClarificationResult> {
    const correlationId = uuidv4();
    
    this.logger.info('Analyzing project description', {
      correlationId,
      descriptionLength: description.length
    });
    
    // 1. Load steering context
    const steeringContext = await this.contextLoader.loadContext(projectPath);
    
    // 2. Analyze description
    const analysis = this.analyzer.analyze(description, steeringContext);
    
    this.logger.debug('Description analysis completed', {
      correlationId,
      qualityScore: analysis.qualityScore,
      needsClarification: analysis.needsClarification
    });
    
    // 3. If no clarification needed, return
    if (!analysis.needsClarification) {
      return { needsClarification: false, analysis };
    }
    
    // 4. Generate questions
    const questions = this.questionGenerator.generateQuestions(analysis, steeringContext);
    
    return { needsClarification: true, questions, analysis };
  }
  
  validateAnswers(
    questions: ClarificationQuestion[],
    answers: ClarificationAnswers
  ): AnswerValidationResult {
    return this.answerValidator.validate(questions, answers);
  }
  
  synthesizeDescription(
    originalDescription: string,
    questions: ClarificationQuestion[],
    answers: ClarificationAnswers
  ): EnrichedProjectDescription {
    const correlationId = uuidv4();
    
    this.logger.info('Synthesizing enriched project description', {
      correlationId,
      questionCount: questions.length
    });
    
    return this.enricher.synthesize(originalDescription, questions, answers);
  }
}
```

**Acceptance Criteria**:
- [ ] All existing tests pass (GREEN)
- [ ] Public API unchanged
- [ ] Delegates to all sub-services
- [ ] No inline business logic remains

---

### Task 2.8: Update Domain Types
**Status**: ⏳ Pending  
**Priority**: Medium  
**Estimated Time**: 1 hour

**Steps**:
1. Add new interfaces to `src/domain/types.ts`
2. Update ClarificationAnalysis with score fields
3. Export all new types

**Changes**:
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

export interface DescriptionComponents {
  readonly original: string;
  readonly why: string;
  readonly who: string;
  readonly what: string;
  readonly how: string;
  readonly successCriteria: string;
}

// Update existing ClarificationAnalysis
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

**Acceptance Criteria**:
- [ ] All types compile
- [ ] No breaking changes to existing types
- [ ] New types properly exported

---

### Task 2.9: Update DI Container
**Status**: ⏳ Pending  
**Priority**: High  
**Estimated Time**: 1 hour

**Steps**:
1. Update `src/infrastructure/di/types.ts` with new symbols
2. Update `src/infrastructure/di/container.ts` with bindings
3. Ensure proper dependency ordering

**Changes**:
```typescript
// src/infrastructure/di/types.ts
export const TYPES = {
  // ... existing
  DescriptionAnalyzer: Symbol.for('DescriptionAnalyzer'),
  QuestionGenerator: Symbol.for('QuestionGenerator'),
  AnswerValidator: Symbol.for('AnswerValidator'),
  DescriptionEnricher: Symbol.for('DescriptionEnricher'),
  SteeringContextLoader: Symbol.for('SteeringContextLoader'),
} as const;

// src/infrastructure/di/container.ts
container.bind<DescriptionAnalyzer>(TYPES.DescriptionAnalyzer).to(DescriptionAnalyzer);
container.bind<QuestionGenerator>(TYPES.QuestionGenerator).to(QuestionGenerator);
container.bind<AnswerValidator>(TYPES.AnswerValidator).to(AnswerValidator);
container.bind<DescriptionEnricher>(TYPES.DescriptionEnricher).to(DescriptionEnricher);
container.bind<SteeringContextLoader>(TYPES.SteeringContextLoader).to(SteeringContextLoader);
```

**Acceptance Criteria**:
- [ ] All services registered
- [ ] Container resolves all dependencies
- [ ] No circular dependencies

---

## Phase 3: Refactoring 🔵 REFACTOR - Improve Code Quality

### Task 3.1: Remove Duplicate Code
**Status**: ⏳ Pending  
**Priority**: High  
**Estimated Time**: 2 hours

**Steps**:
1. Review `mcp-server.js` for duplicate logic
2. Consider importing TypeScript services if feasible
3. Document any remaining duplicates with justification
4. Ensure both entry points tested

**Acceptance Criteria**:
- [ ] Code duplication minimized
- [ ] Both TypeScript and mcp-server.js work
- [ ] Documentation updated

---

### Task 3.2: Code Review and Cleanup
**Status**: ⏳ Pending  
**Priority**: Medium  
**Estimated Time**: 2 hours

**Steps**:
1. Review all new code for SOLID principles
2. Check for code smells
3. Ensure consistent naming
4. Add JSDoc comments
5. Run linter and fix issues

**Acceptance Criteria**:
- [ ] No linter errors
- [ ] All classes follow SRP
- [ ] Code is well-documented
- [ ] Naming is consistent

---

## Phase 4: Integration & Documentation

### Task 4.1: Integration Testing
**Status**: ⏳ Pending  
**Priority**: High  
**Estimated Time**: 2 hours

**Steps**:
1. Test full workflow end-to-end
2. Test with real steering documents
3. Test MCP tool integration (sdd-init)
4. Test adapter integration
5. Verify backward compatibility

**Test Scenarios**:
- Complete description → No clarification
- Vague description → Clarification with questions
- With steering context → Filtered questions
- Answer validation → Security checks work
- Description synthesis → Proper 5W1H format

**Acceptance Criteria**:
- [ ] All integration tests pass
- [ ] No regressions from v1.5.1
- [ ] Performance same or better

---

### Task 4.2: Performance Testing
**Status**: ⏳ Pending  
**Priority**: Medium  
**Estimated Time**: 1 hour

**Steps**:
1. Benchmark analysis time
2. Compare to v1.5.1 baseline
3. Check memory usage
4. Optimize if needed

**Acceptance Criteria**:
- [ ] No performance regression
- [ ] Memory usage stable
- [ ] Benchmarks documented

---

### Task 4.3: Update Documentation
**Status**: ⏳ Pending  
**Priority**: Medium  
**Estimated Time**: 2 hours

**Steps**:
1. Update CHANGELOG.md with v1.6.0 entry
2. Update README if needed
3. Document new architecture
4. Update code comments
5. Create migration guide if needed

**Acceptance Criteria**:
- [ ] CHANGELOG complete
- [ ] Architecture documented
- [ ] All changes explained

---

### Task 4.4: Final Testing and Release
**Status**: ⏳ Pending  
**Priority**: High  
**Estimated Time**: 2 hours

**Steps**:
1. Run full test suite (unit + integration)
2. Run build
3. Update version to 1.6.0
4. Commit changes
5. Create git tag
6. Push to GitHub
7. Publish to npm

**Acceptance Criteria**:
- [ ] All tests pass (unit + integration)
- [ ] Build successful
- [ ] Version updated
- [ ] Published to npm
- [ ] GitHub release created

---

## Summary

**Total Tasks**: 23  
**Estimated Total Time**: 38 hours (~5 days)

**Critical Path**:
1. Write all tests (Tasks 1.1-1.6) - 8.5 hours
2. Implement all services (Tasks 2.1-2.7) - 14.5 hours
3. Integration and testing (Tasks 4.1-4.4) - 7 hours

**Parallel Work Opportunities**:
- Tests can be written in parallel
- Services can be implemented in parallel after tests written
- Documentation can be done alongside implementation

**Risk Mitigation**:
- TDD approach ensures quality
- Backward compatibility maintained
- Comprehensive testing at each phase
- Gradual rollout possible with feature flags if needed
