import { injectable, inject } from "inversify";
import { v4 as uuidv4 } from "uuid";
import { TYPES } from "../../infrastructure/di/types.js";
import { LoggerPort } from "../../domain/ports.js";
import {
  ClarificationQuestion,
  ClarificationAnalysis,
  EnrichedProjectDescription,
  ClarificationResult,
  ClarificationAnswers,
  AnswerValidationResult,
} from "../../domain/types.js";
import { SteeringContextLoader } from "./SteeringContextLoader.js";
import { DescriptionAnalyzer } from "./DescriptionAnalyzer.js";
import { QuestionGenerator } from "./QuestionGenerator.js";
import { AnswerValidator } from "./AnswerValidator.js";
import { DescriptionEnricher } from "./DescriptionEnricher.js";

/**
 * Orchestrator service for requirements clarification workflow
 *
 * Delegates to specialized services:
 * - SteeringContextLoader: Loads steering documents
 * - DescriptionAnalyzer: Analyzes description quality
 * - QuestionGenerator: Generates clarification questions
 * - AnswerValidator: Validates user answers
 * - DescriptionEnricher: Synthesizes enriched descriptions
 */
@injectable()
export class RequirementsClarificationService {
  constructor(
    @inject(TYPES.LoggerPort) private readonly logger: LoggerPort,
    @inject(TYPES.SteeringContextLoader)
    private readonly steeringLoader: SteeringContextLoader,
    @inject(TYPES.DescriptionAnalyzer)
    private readonly analyzer: DescriptionAnalyzer,
    @inject(TYPES.QuestionGenerator)
    private readonly questionGenerator: QuestionGenerator,
    @inject(TYPES.AnswerValidator)
    private readonly answerValidator: AnswerValidator,
    @inject(TYPES.DescriptionEnricher)
    private readonly enricher: DescriptionEnricher,
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
    const steeringContext = await this.steeringLoader.loadContext(projectPath);

    // Perform analysis using DescriptionAnalyzer
    const analysis = this.analyzer.analyze(description, steeringContext);

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

    // Generate clarification questions using QuestionGenerator
    const questions = this.questionGenerator.generateQuestions(
      analysis,
      steeringContext,
    );

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
  ): AnswerValidationResult {
    return this.answerValidator.validate(questions, answers);
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

    return this.enricher.synthesize(originalDescription, questions, answers);
  }
}
