import { injectable } from "inversify";
import {
  ClarificationQuestion,
  ClarificationAnswers,
  EnrichedProjectDescription,
  QuestionCategory,
  DescriptionComponents,
} from "../../domain/types.js";

@injectable()
export class DescriptionEnricher {
  /**
   * Synthesize enriched project description from original + clarification answers
   */
  synthesize(
    originalDescription: string,
    questions: ClarificationQuestion[],
    answers: ClarificationAnswers
  ): EnrichedProjectDescription {
    const why = this.extractAnswersByCategory(
      questions,
      answers,
      QuestionCategory.WHY
    );
    const who = this.extractAnswersByCategory(
      questions,
      answers,
      QuestionCategory.WHO
    );
    const what = this.extractAnswersByCategory(
      questions,
      answers,
      QuestionCategory.WHAT
    );
    const how = this.extractAnswersByCategory(
      questions,
      answers,
      QuestionCategory.HOW
    );
    const successCriteria = this.extractAnswersByCategory(
      questions,
      answers,
      QuestionCategory.SUCCESS
    );

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
      how,
      successCriteria,
      enriched,
    };
  }

  /**
   * Extract all answers for a specific question category
   */
  private extractAnswersByCategory(
    questions: ClarificationQuestion[],
    answers: ClarificationAnswers,
    category: QuestionCategory
  ): string {
    const categoryQuestions = questions.filter((q) => q.category === category);
    const categoryAnswers = categoryQuestions
      .map((q) => answers[q.id])
      .filter((a) => a && a.trim().length > 0);

    return categoryAnswers.join(" ");
  }

  /**
   * Build enriched description with 5W1H structure
   */
  private buildEnrichedDescription(
    components: DescriptionComponents
  ): string {
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

    return parts.join("\n\n");
  }
}
