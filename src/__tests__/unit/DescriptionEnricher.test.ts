import { DescriptionEnricher } from "../../application/services/DescriptionEnricher";
import {
  ClarificationQuestion,
  ClarificationAnswers,
  QuestionCategory,
} from "../../domain/types";

describe("DescriptionEnricher", () => {
  let enricher: DescriptionEnricher;

  beforeEach(() => {
    enricher = new DescriptionEnricher();
  });

  describe("synthesize", () => {
    it("should extract answers by category", () => {
      const original = "Build payment API";

      const questions: ClarificationQuestion[] = [
        {
          id: "why1",
          category: QuestionCategory.WHY,
          question: "Why needed?",
          why: "Important",
          required: true,
        },
        {
          id: "who1",
          category: QuestionCategory.WHO,
          question: "Who uses it?",
          why: "Important",
          required: true,
        },
      ];

      const answers: ClarificationAnswers = {
        why1: "To solve merchant checkout problems",
        who1: "E-commerce businesses",
      };

      const result = enricher.synthesize(original, questions, answers);

      expect(result.why).toContain("solve merchant checkout problems");
      expect(result.who).toContain("E-commerce businesses");
    });

    it("should build 5W1H structured description", () => {
      const original = "Build payment API";

      const questions: ClarificationQuestion[] = [
        {
          id: "why1",
          category: QuestionCategory.WHY,
          question: "Why?",
          why: "Important",
          required: true,
        },
        {
          id: "who1",
          category: QuestionCategory.WHO,
          question: "Who?",
          why: "Important",
          required: true,
        },
        {
          id: "what1",
          category: QuestionCategory.WHAT,
          question: "What?",
          why: "Important",
          required: true,
        },
        {
          id: "how1",
          category: QuestionCategory.HOW,
          question: "How?",
          why: "Important",
          required: false,
        },
        {
          id: "success1",
          category: QuestionCategory.SUCCESS,
          question: "Success?",
          why: "Important",
          required: true,
        },
      ];

      const answers: ClarificationAnswers = {
        why1: "To solve checkout problems",
        who1: "Merchants",
        what1: "Payment gateway integration",
        how1: "Using Stripe API",
        success1: "99.9% uptime",
      };

      const result = enricher.synthesize(original, questions, answers);

      expect(result.enriched).toContain("## Original Description");
      expect(result.enriched).toContain("## Business Justification (Why)");
      expect(result.enriched).toContain("## Target Users (Who)");
      expect(result.enriched).toContain("## Core Features (What)");
      expect(result.enriched).toContain("## Technical Approach (How)");
      expect(result.enriched).toContain("## Success Criteria");
    });

    it("should handle missing category answers gracefully", () => {
      const original = "Build payment API";

      const questions: ClarificationQuestion[] = [
        {
          id: "why1",
          category: QuestionCategory.WHY,
          question: "Why?",
          why: "Important",
          required: true,
        },
        {
          id: "who1",
          category: QuestionCategory.WHO,
          question: "Who?",
          why: "Important",
          required: false,
        },
      ];

      const answers: ClarificationAnswers = {
        why1: "To solve problems",
        // who1 missing
      };

      const result = enricher.synthesize(original, questions, answers);

      expect(result.why).toBeTruthy();
      expect(result.who).toBe(""); // Empty for missing category
      expect(result.enriched).toBeDefined();
    });

    it("should include original description in output", () => {
      const original = "Build payment API for merchants";

      const questions: ClarificationQuestion[] = [];
      const answers: ClarificationAnswers = {};

      const result = enricher.synthesize(original, questions, answers);

      expect(result.original).toBe(original);
      expect(result.enriched).toContain(original);
    });

    it("should format enriched text with proper sections", () => {
      const original = "Build API";

      const questions: ClarificationQuestion[] = [
        {
          id: "why1",
          category: QuestionCategory.WHY,
          question: "Why?",
          why: "Important",
          required: true,
        },
      ];

      const answers: ClarificationAnswers = {
        why1: "To solve problems",
      };

      const result = enricher.synthesize(original, questions, answers);

      // Should have markdown headers
      expect(result.enriched).toMatch(/^## /m);
      // Should have double newlines between sections
      expect(result.enriched).toContain("\n\n");
    });

    it("should handle empty answers object", () => {
      const original = "Build payment API";

      const questions: ClarificationQuestion[] = [
        {
          id: "why1",
          category: QuestionCategory.WHY,
          question: "Why?",
          why: "Important",
          required: true,
        },
      ];

      const answers: ClarificationAnswers = {};

      const result = enricher.synthesize(original, questions, answers);

      expect(result).toBeDefined();
      expect(result.original).toBe(original);
      expect(result.why).toBe("");
      expect(result.enriched).toContain(original);
    });

    it("should combine multiple answers from same category", () => {
      const original = "Build API";

      const questions: ClarificationQuestion[] = [
        {
          id: "why1",
          category: QuestionCategory.WHY,
          question: "Why problem?",
          why: "Important",
          required: true,
        },
        {
          id: "why2",
          category: QuestionCategory.WHY,
          question: "Why value?",
          why: "Important",
          required: true,
        },
      ];

      const answers: ClarificationAnswers = {
        why1: "To solve checkout problems",
        why2: "To increase conversion rate",
      };

      const result = enricher.synthesize(original, questions, answers);

      expect(result.why).toContain("solve checkout problems");
      expect(result.why).toContain("increase conversion rate");
    });

    it("should filter out empty/whitespace answers", () => {
      const original = "Build API";

      const questions: ClarificationQuestion[] = [
        {
          id: "why1",
          category: QuestionCategory.WHY,
          question: "Why?",
          why: "Important",
          required: true,
        },
        {
          id: "why2",
          category: QuestionCategory.WHY,
          question: "Why value?",
          why: "Important",
          required: false,
        },
      ];

      const answers: ClarificationAnswers = {
        why1: "Valid answer",
        why2: "   ", // Whitespace only
      };

      const result = enricher.synthesize(original, questions, answers);

      expect(result.why).toBe("Valid answer");
      expect(result.why).not.toContain("   ");
    });

    it("should return all 5W1H components", () => {
      const original = "Build API";

      const questions: ClarificationQuestion[] = [];
      const answers: ClarificationAnswers = {};

      const result = enricher.synthesize(original, questions, answers);

      expect(result).toHaveProperty("original");
      expect(result).toHaveProperty("why");
      expect(result).toHaveProperty("who");
      expect(result).toHaveProperty("what");
      expect(result).toHaveProperty("how");
      expect(result).toHaveProperty("successCriteria");
      expect(result).toHaveProperty("enriched");
    });

    it("should handle special characters in answers", () => {
      const original = "Build API";

      const questions: ClarificationQuestion[] = [
        {
          id: "why1",
          category: QuestionCategory.WHY,
          question: "Why?",
          why: "Important",
          required: true,
        },
      ];

      const answers: ClarificationAnswers = {
        why1: "To solve & improve > 50% of cases (urgent!)",
      };

      const result = enricher.synthesize(original, questions, answers);

      expect(result.why).toContain("&");
      expect(result.why).toContain(">");
      expect(result.why).toContain("(urgent!)");
    });
  });
});
