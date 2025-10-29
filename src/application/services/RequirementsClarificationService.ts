import { injectable, inject } from "inversify";
import { TYPES } from "../../infrastructure/di/types.js";
import { FileSystemPort, LoggerPort } from "../../domain/ports.js";
import {
  ClarificationQuestion,
  ClarificationAnalysis,
  EnrichedProjectDescription,
  ClarificationResult,
  QuestionCategory,
  AmbiguousTerm,
} from "../../domain/types.js";
import {
  QUALITY_SCORE_WEIGHTS,
  ANSWER_VALIDATION,
  PATTERN_DETECTION,
  AMBIGUOUS_TERMS,
} from "./clarification-constants.js";

export interface ClarificationAnswers {
  [questionId: string]: string;
}

export interface AnswerValidationResult {
  valid: boolean;
  missingRequired: string[];
  tooShort: Array<{
    question: string;
    minLength: number;
    currentLength: number;
  }>;
  containsInvalidContent: string[];
}

@injectable()
export class RequirementsClarificationService {
  constructor(
    @inject(TYPES.FileSystemPort) private readonly fileSystem: FileSystemPort,
    @inject(TYPES.LoggerPort) private readonly logger: LoggerPort,
  ) {}

  /**
   * Analyzes a project description to determine if clarification is needed
   */
  async analyzeDescription(
    description: string,
    projectPath?: string,
  ): Promise<ClarificationResult> {
    const correlationId = uuidv4();

    this.logger.info("Analyzing project description for clarification needs", {
      correlationId,
      descriptionLength: description.length,
    });

    // Load existing steering docs for context
    const steeringContext = await this.loadSteeringContext(projectPath);

    // Perform analysis
    const analysis = this.performAnalysis(description, steeringContext);

    this.logger.debug("Description analysis completed", {
      correlationId,
      qualityScore: analysis.qualityScore,
      needsClarification: analysis.needsClarification,
    });

    if (!analysis.needsClarification) {
      return {
        needsClarification: false,
        analysis,
      };
    }

    // Generate clarification questions
    const questions = this.generateQuestions(analysis, steeringContext);

    return {
      needsClarification: true,
      questions,
      analysis,
    };
  }

  /**
   * Validates and processes clarification answers
   */
  validateAnswers(
    questions: ClarificationQuestion[],
    answers: ClarificationAnswers,
  ): { valid: boolean; missingRequired: string[] } {
    const missingRequired: string[] = [];

    for (const question of questions) {
      if (question.required && !answers[question.id]) {
        missingRequired.push(question.question);
      }
    }

    return {
      valid: missingRequired.length === 0,
      missingRequired,
    };
  }

  /**
   * Synthesizes an enriched project description from original + answers
   */
  synthesizeDescription(
    originalDescription: string,
    questions: ClarificationQuestion[],
    answers: ClarificationAnswers,
  ): EnrichedProjectDescription {
    const correlationId = uuidv4();

    this.logger.info("Synthesizing enriched project description", {
      correlationId,
      questionCount: questions.length,
    });

    // Extract answers by category
    const why = this.extractAnswersByCategory(
      questions,
      answers,
      QuestionCategory.WHY,
    );
    const who = this.extractAnswersByCategory(
      questions,
      answers,
      QuestionCategory.WHO,
    );
    const what = this.extractAnswersByCategory(
      questions,
      answers,
      QuestionCategory.WHAT,
    );
    const how = this.extractAnswersByCategory(
      questions,
      answers,
      QuestionCategory.HOW,
    );
    const successCriteria = this.extractAnswersByCategory(
      questions,
      answers,
      QuestionCategory.SUCCESS,
    );

    // Build enriched description
    const enriched = this.buildEnrichedDescription({
      original: originalDescription,
      why,
      who,
      what,
      how,
      successCriteria,
    });

    return {
      original: originalDescription,
      why,
      who,
      what,
      how: how || undefined,
      successCriteria,
      enriched,
    };
  }

  /**
   * Performs the core analysis of the description
   */
  private performAnalysis(
    description: string,
    steeringContext: SteeringContext,
  ): ClarificationAnalysis {
    const missingElements: string[] = [];
    const ambiguousTerms: AmbiguousTerm[] = [];

    // Check for WHY (business justification, problem statement)
    const hasWhy = this.detectWhy(description);
    if (!hasWhy && !steeringContext.hasProductContext) {
      missingElements.push("Business justification or problem statement (WHY)");
    }

    // Check for WHO (target users)
    const hasWho = this.detectWho(description);
    if (!hasWho && !steeringContext.hasTargetUsers) {
      missingElements.push("Target users or personas (WHO)");
    }

    // Check for WHAT (core features, scope)
    const hasWhat = this.detectWhat(description);
    if (!hasWhat) {
      missingElements.push("Core features or scope definition (WHAT)");
    }

    // Check for success criteria
    const hasSuccessCriteria = this.detectSuccessCriteria(description);
    if (!hasSuccessCriteria) {
      missingElements.push("Success criteria or metrics");
    }

    // Detect ambiguous terms
    ambiguousTerms.push(...this.detectAmbiguousTerms(description));

    // Calculate quality score (0-100)
    const qualityScore = this.calculateQualityScore({
      hasWhy,
      hasWho,
      hasWhat,
      hasSuccessCriteria,
      ambiguousTermCount: ambiguousTerms.length,
      descriptionLength: description.length,
    });

    // Need clarification if score < 70 or missing critical elements
    const needsClarification = qualityScore < 70 || missingElements.length > 0;

    return {
      qualityScore,
      missingElements,
      ambiguousTerms,
      needsClarification,
      hasWhy,
      hasWho,
      hasWhat,
      hasSuccessCriteria,
    };
  }

  /**
   * Generates targeted clarification questions based on analysis
   */
  private generateQuestions(
    analysis: ClarificationAnalysis,
    steeringContext: SteeringContext,
  ): ClarificationQuestion[] {
    const questions: ClarificationQuestion[] = [];

    // WHY questions - always high priority
    if (!analysis.hasWhy && !steeringContext.hasProductContext) {
      questions.push({
        id: uuidv4(),
        category: QuestionCategory.WHY,
        question:
          "What business problem does this project solve? Why is it needed?",
        why: "Understanding the business justification ensures we build the right solution",
        examples: [
          "Our customer support team spends 5 hours/day on repetitive inquiries",
          "Users are abandoning checkout because the process takes too long",
          "Developers waste time searching for undocumented APIs",
        ],
        required: true,
      });

      questions.push({
        id: uuidv4(),
        category: QuestionCategory.WHY,
        question:
          "What value does this project provide to users or the business?",
        why: "Clarifying value proposition helps prioritize features and measure success",
        examples: [
          "Reduce support ticket volume by 40%",
          "Increase conversion rate by improving checkout speed",
          "Save developers 2 hours/week with better documentation",
        ],
        required: true,
      });
    }

    // WHO questions
    if (!analysis.hasWho && !steeringContext.hasTargetUsers) {
      questions.push({
        id: uuidv4(),
        category: QuestionCategory.WHO,
        question: "Who are the primary users of this project?",
        why: "Knowing the target users shapes UX, features, and technical decisions",
        examples: [
          "Customer support agents using ticketing systems",
          "E-commerce shoppers on mobile devices",
          "Backend developers integrating APIs",
        ],
        required: true,
      });
    }

    // WHAT questions
    if (!analysis.hasWhat) {
      questions.push({
        id: uuidv4(),
        category: QuestionCategory.WHAT,
        question: "What are the 3-5 core features for the MVP?",
        why: "Defining MVP scope prevents scope creep and ensures focused delivery",
        examples: [
          "Auto-response system, ticket categorization, analytics dashboard",
          "Product search, cart management, payment integration",
          "API explorer, code examples, interactive documentation",
        ],
        required: true,
      });

      questions.push({
        id: uuidv4(),
        category: QuestionCategory.WHAT,
        question: "What is explicitly OUT OF SCOPE for this project?",
        why: "Boundary definition prevents feature creep and manages expectations",
        examples: [
          "Admin panel (future phase)",
          "Mobile app (web only for MVP)",
          "Multi-language support (English only initially)",
        ],
        required: false,
      });
    }

    // SUCCESS questions
    if (!analysis.hasSuccessCriteria) {
      questions.push({
        id: uuidv4(),
        category: QuestionCategory.SUCCESS,
        question: "How will you measure if this project is successful?",
        why: "Quantifiable metrics enable objective evaluation and iteration",
        examples: [
          "Support ticket volume reduced by 30% within 3 months",
          "Page load time under 2 seconds, conversion rate > 3%",
          "API documentation rated 4.5/5 stars by developers",
        ],
        required: true,
      });
    }

    // HOW questions (technical approach) - only if no tech steering
    if (!steeringContext.hasTechContext) {
      questions.push({
        id: uuidv4(),
        category: QuestionCategory.HOW,
        question:
          "Are there any technical constraints or preferences? (language, platform, existing systems)",
        why: "Technical constraints shape architecture and technology choices",
        examples: [
          "Must integrate with existing Salesforce CRM",
          "TypeScript + React preferred, hosted on AWS",
          "Python-based, needs to run on-premise",
        ],
        required: false,
      });
    }

    // Ambiguity clarification
    for (const ambiguous of analysis.ambiguousTerms.slice(0, 3)) {
      questions.push({
        id: uuidv4(),
        category: QuestionCategory.WHAT,
        question: `You mentioned "${ambiguous.term}". ${ambiguous.suggestion}`,
        why: "Removing ambiguity ensures shared understanding",
        examples: ambiguous.context ? [ambiguous.context] : undefined,
        required: false,
      });
    }

    return questions;
  }

  /**
   * Load steering documents for context
   */
  private async loadSteeringContext(
    projectPath?: string,
  ): Promise<SteeringContext> {
    if (!projectPath) {
      return {
        hasProductContext: false,
        hasTargetUsers: false,
        hasTechContext: false,
      };
    }

    const context: SteeringContext = {
      hasProductContext: false,
      hasTargetUsers: false,
      hasTechContext: false,
    };

    try {
      // Check product.md
      const productPath = `${projectPath}/.kiro/steering/product.md`;
      if (await this.fileSystem.exists(productPath)) {
        const productContent = await this.fileSystem.readFile(productPath);
        context.hasProductContext = productContent.length > 200; // Has substantial content
        context.hasTargetUsers = /target\s+users|user\s+persona/i.test(
          productContent,
        );
      }

      // Check tech.md
      const techPath = `${projectPath}/.kiro/steering/tech.md`;
      if (await this.fileSystem.exists(techPath)) {
        const techContent = await this.fileSystem.readFile(techPath);
        context.hasTechContext = techContent.length > 200;
      }
    } catch (error) {
      this.logger.warn("Failed to load steering context", {
        error: (error as Error).message,
      });
    }

    return context;
  }

  /**
   * Detects if description contains WHY (business justification)
   */
  private detectWhy(description: string): boolean {
    const whyPatterns = [
      /\bproblem\b/i,
      /\bsolve[sd]?\b/i,
      /\bchallenge\b/i,
      /\bpain\s+point/i,
      /\bissue\b/i,
      /\bwhy\b/i,
      /\bbecause\b/i,
      /\benables?\b/i,
      /\bvalue\s+proposition/i,
      /\bbenefit/i,
      /\bjustification/i,
      /\bgoal\b/i,
      /\bobjective\b/i,
      /\bpurpose\b/i,
    ];

    return whyPatterns.some((pattern) => pattern.test(description));
  }

  /**
   * Detects if description contains WHO (target users)
   */
  private detectWho(description: string): boolean {
    const whoPatterns = [
      /\buser[s]?\b/i,
      /\bcustomer[s]?\b/i,
      /\btarget\s+(audience|users?|customers?)/i,
      /\bpersona[s]?\b/i,
      /\bstakeholder[s]?\b/i,
      /\b(developer|designer|admin|manager)[s]?\b/i,
      /\bfor\s+(teams?|companies|individuals)/i,
    ];

    return whoPatterns.some((pattern) => pattern.test(description));
  }

  /**
   * Detects if description contains WHAT (features, scope)
   */
  private detectWhat(description: string): boolean {
    const whatPatterns = [
      /\bfeature[s]?\b/i,
      /\bfunctionality\b/i,
      /\bcapabilit(y|ies)/i,
      /\bprovides?\b/i,
      /\binclude[s]?\b/i,
      /\bsupport[s]?\b/i,
      /\ballow[s]?\b/i,
      /\benable[s]?\b/i,
      /\bMVP\b/i,
      /\bscope\b/i,
    ];

    return whatPatterns.some((pattern) => pattern.test(description));
  }

  /**
   * Detects if description contains success criteria
   */
  private detectSuccessCriteria(description: string): boolean {
    const successPatterns = [
      /\bmetric[s]?\b/i,
      /\bKPI[s]?\b/i,
      /\bmeasure[sd]?\b/i,
      /\bsuccess\s+(criteria|metric)/i,
      /\b\d+%/,
      /\bperformance\s+target/i,
      /\bgoal[s]?\b.*\d+/i,
    ];

    return successPatterns.some((pattern) => pattern.test(description));
  }

  /**
   * Detects ambiguous terms that need clarification
   */
  private detectAmbiguousTerms(description: string): AmbiguousTerm[] {
    const ambiguousTerms: AmbiguousTerm[] = [];

    const ambiguityMap = [
      {
        pattern: /\bfast\b/gi,
        suggestion:
          'Can you specify a target response time? (e.g., "< 200ms API response", "page loads in 2s")',
      },
      {
        pattern: /\bscalable\b/gi,
        suggestion:
          'What scale do you need to support? (e.g., "1000 concurrent users", "100k requests/hour")',
      },
      {
        pattern: /\buser[- ]friendly\b/gi,
        suggestion:
          'What makes it user-friendly? (e.g., "3-click checkout", "mobile-responsive", "keyboard shortcuts")',
      },
      {
        pattern: /\beasy\s+to\s+use\b/gi,
        suggestion:
          'What does easy mean for your users? (e.g., "no training required", "5-minute onboarding", "intuitive navigation")',
      },
      {
        pattern: /\bhigh\s+quality\b/gi,
        suggestion:
          'How do you define quality? (e.g., "zero critical bugs in production", "90% test coverage", "< 5% error rate")',
      },
      {
        pattern: /\breliable\b/gi,
        suggestion:
          'What reliability level do you need? (e.g., "99.9% uptime", "zero data loss", "automatic failover")',
      },
      {
        pattern: /\bsecure\b/gi,
        suggestion:
          'What security requirements apply? (e.g., "SOC 2 compliant", "end-to-end encryption", "OAuth 2.0")',
      },
      {
        pattern: /\bmodern\b/gi,
        suggestion:
          'What technologies or approaches are you considering? (e.g., "React + TypeScript", "microservices", "serverless")',
      },
    ];

    for (const { pattern, suggestion } of ambiguityMap) {
      const matches = description.match(pattern);
      if (matches) {
        for (const match of matches) {
          const context = this.extractContext(description, match);
          ambiguousTerms.push({
            term: match,
            context,
            suggestion,
          });
        }
      }
    }

    return ambiguousTerms;
  }

  /**
   * Extracts surrounding context for an ambiguous term
   */
  private extractContext(text: string, term: string): string {
    const index = text.toLowerCase().indexOf(term.toLowerCase());
    if (index === -1) return "";

    const start = Math.max(0, index - 30);
    const end = Math.min(text.length, index + term.length + 30);

    return "..." + text.slice(start, end).trim() + "...";
  }

  /**
   * Calculates quality score based on completeness and clarity
   */
  private calculateQualityScore(metrics: {
    hasWhy: boolean;
    hasWho: boolean;
    hasWhat: boolean;
    hasSuccessCriteria: boolean;
    ambiguousTermCount: number;
    descriptionLength: number;
  }): number {
    let score = 0;

    // WHY is most important (30 points)
    if (metrics.hasWhy) score += 30;

    // WHO is critical (20 points)
    if (metrics.hasWho) score += 20;

    // WHAT is essential (20 points)
    if (metrics.hasWhat) score += 20;

    // Success criteria (15 points)
    if (metrics.hasSuccessCriteria) score += 15;

    // Penalize ambiguous terms (up to -15 points)
    const ambiguityPenalty = Math.min(15, metrics.ambiguousTermCount * 5);
    score -= ambiguityPenalty;

    // Length bonus (up to 15 points) - adequate detail
    if (metrics.descriptionLength > 100) score += 5;
    if (metrics.descriptionLength > 300) score += 5;
    if (metrics.descriptionLength > 500) score += 5;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Extracts answers for a specific category
   */
  private extractAnswersByCategory(
    questions: ClarificationQuestion[],
    answers: ClarificationAnswers,
    category: QuestionCategory,
  ): string {
    const categoryQuestions = questions.filter((q) => q.category === category);
    const categoryAnswers = categoryQuestions
      .map((q) => answers[q.id])
      .filter((a) => a && a.trim().length > 0);

    return categoryAnswers.join(" ");
  }

  /**
   * Builds the enriched description from all components
   */
  private buildEnrichedDescription(components: {
    original: string;
    why: string;
    who: string;
    what: string;
    how: string;
    successCriteria: string;
  }): string {
    const parts: string[] = [];

    // Start with original if it has content
    if (components.original && components.original.trim().length > 0) {
      parts.push(`## Original Description\n${components.original}`);
    }

    // Add WHY
    if (components.why) {
      parts.push(`## Business Justification (Why)\n${components.why}`);
    }

    // Add WHO
    if (components.who) {
      parts.push(`## Target Users (Who)\n${components.who}`);
    }

    // Add WHAT
    if (components.what) {
      parts.push(`## Core Features (What)\n${components.what}`);
    }

    // Add HOW (optional)
    if (components.how) {
      parts.push(`## Technical Approach (How)\n${components.how}`);
    }

    // Add success criteria
    if (components.successCriteria) {
      parts.push(`## Success Criteria\n${components.successCriteria}`);
    }

    return parts.join("\n\n");
  }
}

interface SteeringContext {
  hasProductContext: boolean;
  hasTargetUsers: boolean;
  hasTechContext: boolean;
}
