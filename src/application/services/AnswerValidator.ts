import { injectable } from "inversify";
import {
  ClarificationQuestion,
  ClarificationAnswers,
  AnswerValidationResult,
} from "../../domain/types.js";
import { ANSWER_VALIDATION } from "./clarification-constants.js";

@injectable()
export class AnswerValidator {
  /**
   * Validate user-provided clarification answers
   */
  validate(
    questions: ClarificationQuestion[],
    answers: ClarificationAnswers
  ): AnswerValidationResult {
    const missingRequired: string[] = [];
    const tooShort: Array<{
      question: string;
      minLength: number;
      currentLength: number;
    }> = [];
    const containsInvalidContent: string[] = [];

    for (const question of questions) {
      const answer = answers[question.id]?.trim() || "";

      // Check for missing required answers
      if (question.required && !answer) {
        missingRequired.push(question.question);
        continue;
      }

      // Check for too-short answers
      if (answer && answer.length < ANSWER_VALIDATION.MIN_ANSWER_LENGTH) {
        tooShort.push({
          question: question.question,
          minLength: ANSWER_VALIDATION.MIN_ANSWER_LENGTH,
          currentLength: answer.length,
        });
      }

      // Check for potentially malicious content
      if (answer && ANSWER_VALIDATION.INVALID_CONTENT_PATTERN.test(answer)) {
        containsInvalidContent.push(question.question);
      }
    }

    const valid =
      missingRequired.length === 0 &&
      tooShort.length === 0 &&
      containsInvalidContent.length === 0;

    return {
      valid,
      missingRequired,
      tooShort,
      containsInvalidContent,
    };
  }
}
