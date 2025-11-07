import { AnswerValidator } from "../../application/services/AnswerValidator";
import {
  ClarificationQuestion,
  ClarificationAnswers,
  QuestionCategory,
} from "../../domain/types";

describe("AnswerValidator", () => {
  let validator: AnswerValidator;

  beforeEach(() => {
    validator = new AnswerValidator();
  });

  describe("validate", () => {
    it("should pass validation for complete valid answers", () => {
      const questions: ClarificationQuestion[] = [
        {
          id: "q1",
          category: QuestionCategory.WHY,
          question: "Why is this needed?",
          why: "Important",
          required: true,
        },
        {
          id: "q2",
          category: QuestionCategory.WHO,
          question: "Who are the users?",
          why: "Important",
          required: true,
        },
      ];

      const answers: ClarificationAnswers = {
        q1: "To solve the customer support problem that costs us time",
        q2: "Enterprise users and developers",
      };

      const result = validator.validate(questions, answers);

      expect(result.valid).toBe(true);
      expect(result.missingRequired).toHaveLength(0);
      expect(result.tooShort).toHaveLength(0);
      expect(result.containsInvalidContent).toHaveLength(0);
    });

    it("should detect missing required answers", () => {
      const questions: ClarificationQuestion[] = [
        {
          id: "q1",
          category: QuestionCategory.WHY,
          question: "Why is this needed?",
          why: "Important",
          required: true,
        },
        {
          id: "q2",
          category: QuestionCategory.WHO,
          question: "Who are the users?",
          why: "Important",
          required: true,
        },
      ];

      const answers: ClarificationAnswers = {
        q1: "To solve problem X",
        // q2 is missing
      };

      const result = validator.validate(questions, answers);

      expect(result.valid).toBe(false);
      expect(result.missingRequired).toHaveLength(1);
      expect(result.missingRequired[0]).toBe("Who are the users?");
      expect(result.tooShort).toHaveLength(0);
      expect(result.containsInvalidContent).toHaveLength(0);
    });

    it("should detect too-short answers (< 10 chars)", () => {
      const questions: ClarificationQuestion[] = [
        {
          id: "q1",
          category: QuestionCategory.WHY,
          question: "Why is this needed?",
          why: "Important",
          required: true,
        },
      ];

      const answers: ClarificationAnswers = {
        q1: "Short", // Only 5 characters
      };

      const result = validator.validate(questions, answers);

      expect(result.valid).toBe(false);
      expect(result.missingRequired).toHaveLength(0);
      expect(result.tooShort).toHaveLength(1);
      expect(result.tooShort[0].question).toBe("Why is this needed?");
      expect(result.tooShort[0].minLength).toBe(10);
      expect(result.tooShort[0].currentLength).toBe(5);
      expect(result.containsInvalidContent).toHaveLength(0);
    });

    it("should detect XSS patterns in answers", () => {
      const questions: ClarificationQuestion[] = [
        {
          id: "q1",
          category: QuestionCategory.WHY,
          question: "Why is this needed?",
          why: "Important",
          required: true,
        },
      ];

      const answers: ClarificationAnswers = {
        q1: "To solve problem <script>alert('xss')</script>",
      };

      const result = validator.validate(questions, answers);

      expect(result.valid).toBe(false);
      expect(result.missingRequired).toHaveLength(0);
      expect(result.tooShort).toHaveLength(0);
      expect(result.containsInvalidContent).toHaveLength(1);
      expect(result.containsInvalidContent[0]).toBe("Why is this needed?");
    });

    it("should detect javascript: protocol in answers", () => {
      const questions: ClarificationQuestion[] = [
        {
          id: "q1",
          category: QuestionCategory.WHY,
          question: "Why is this needed?",
          why: "Important",
          required: true,
        },
      ];

      const answers: ClarificationAnswers = {
        q1: "Check this link javascript:void(0) for details",
      };

      const result = validator.validate(questions, answers);

      expect(result.valid).toBe(false);
      expect(result.containsInvalidContent).toHaveLength(1);
    });

    it("should detect onerror= in answers", () => {
      const questions: ClarificationQuestion[] = [
        {
          id: "q1",
          category: QuestionCategory.WHY,
          question: "Why is this needed?",
          why: "Important",
          required: true,
        },
      ];

      const answers: ClarificationAnswers = {
        q1: "Image with onerror=alert('xss') handler",
      };

      const result = validator.validate(questions, answers);

      expect(result.valid).toBe(false);
      expect(result.containsInvalidContent).toHaveLength(1);
    });

    it("should report specific validation failures", () => {
      const questions: ClarificationQuestion[] = [
        {
          id: "q1",
          category: QuestionCategory.WHY,
          question: "Why is this needed?",
          why: "Important",
          required: true,
        },
        {
          id: "q2",
          category: QuestionCategory.WHO,
          question: "Who are the users?",
          why: "Important",
          required: true,
        },
        {
          id: "q3",
          category: QuestionCategory.WHAT,
          question: "What features?",
          why: "Important",
          required: false,
        },
      ];

      const answers: ClarificationAnswers = {
        q1: "Short", // Too short
        // q2 missing (required)
        q3: "Test <script>", // Invalid content
      };

      const result = validator.validate(questions, answers);

      expect(result.valid).toBe(false);
      expect(result.missingRequired).toHaveLength(1); // q2 is missing
      expect(result.tooShort).toHaveLength(1); // q1 is too short
      expect(result.containsInvalidContent).toHaveLength(1); // q3 has script tag
    });

    it("should handle empty answers object", () => {
      const questions: ClarificationQuestion[] = [
        {
          id: "q1",
          category: QuestionCategory.WHY,
          question: "Why is this needed?",
          why: "Important",
          required: true,
        },
      ];

      const answers: ClarificationAnswers = {};

      const result = validator.validate(questions, answers);

      expect(result.valid).toBe(false);
      expect(result.missingRequired).toHaveLength(1);
    });

    it("should validate multiple issues simultaneously", () => {
      const questions: ClarificationQuestion[] = [
        {
          id: "q1",
          category: QuestionCategory.WHY,
          question: "Question 1",
          why: "Important",
          required: true,
        },
        {
          id: "q2",
          category: QuestionCategory.WHO,
          question: "Question 2",
          why: "Important",
          required: true,
        },
        {
          id: "q3",
          category: QuestionCategory.WHAT,
          question: "Question 3",
          why: "Important",
          required: true,
        },
      ];

      const answers: ClarificationAnswers = {
        // q1 missing
        q2: "Short", // Too short
        q3: "Valid answer with <script>alert('xss')</script>", // Invalid content
      };

      const result = validator.validate(questions, answers);

      expect(result.valid).toBe(false);
      expect(result.missingRequired).toHaveLength(1);
      expect(result.tooShort).toHaveLength(1);
      expect(result.containsInvalidContent).toHaveLength(1);
    });

    it("should trim whitespace when checking answers", () => {
      const questions: ClarificationQuestion[] = [
        {
          id: "q1",
          category: QuestionCategory.WHY,
          question: "Why is this needed?",
          why: "Important",
          required: true,
        },
      ];

      const answers: ClarificationAnswers = {
        q1: "   Valid answer with whitespace   ",
      };

      const result = validator.validate(questions, answers);

      expect(result.valid).toBe(true);
    });

    it("should treat whitespace-only answers as missing", () => {
      const questions: ClarificationQuestion[] = [
        {
          id: "q1",
          category: QuestionCategory.WHY,
          question: "Why is this needed?",
          why: "Important",
          required: true,
        },
      ];

      const answers: ClarificationAnswers = {
        q1: "     ", // Only whitespace
      };

      const result = validator.validate(questions, answers);

      expect(result.valid).toBe(false);
      expect(result.missingRequired).toHaveLength(1);
    });
  });
});
