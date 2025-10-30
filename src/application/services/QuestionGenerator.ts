import { injectable } from "inversify";
import {
  ClarificationQuestion,
  ClarificationAnalysis,
  SteeringContext,
} from "../../domain/types.js";
import { CLARIFICATION_QUESTIONS } from "./clarification-questions.js";

@injectable()
export class QuestionGenerator {
  /**
   * Generate clarification questions based on analysis and steering context
   */
  generateQuestions(
    analysis: ClarificationAnalysis,
    context: SteeringContext
  ): ClarificationQuestion[] {
    return Object.values(CLARIFICATION_QUESTIONS)
      .filter((template) => template.condition(analysis, context))
      .map((template) => ({
        id: template.id,
        category: template.category,
        question: template.question,
        why: template.rationale,
        examples: template.examples,
        required: template.required,
      }));
  }
}
