import { QuestionGenerator } from "../../application/services/QuestionGenerator";
import {
  ClarificationAnalysis,
  SteeringContext,
  QuestionCategory,
} from "../../domain/types";

describe("QuestionGenerator", () => {
  let generator: QuestionGenerator;

  beforeEach(() => {
    generator = new QuestionGenerator();
  });

  describe("generateQuestions", () => {
    it("should load questions from CLARIFICATION_QUESTIONS", () => {
      const analysis: ClarificationAnalysis = {
        qualityScore: 0,
        whyScore: 0,
        whoScore: 0,
        whatScore: 0,
        successScore: 0,
        hasWhy: false,
        hasWho: false,
        hasWhat: false,
        hasSuccessCriteria: false,
        missingElements: [],
        ambiguousTerms: [],
        needsClarification: true,
      };

      const context: SteeringContext = {
        hasProductContext: false,
        hasTargetUsers: false,
        hasTechContext: false,
      };

      const questions = generator.generateQuestions(analysis, context);

      expect(questions).toBeDefined();
      expect(Array.isArray(questions)).toBe(true);
      expect(questions.length).toBeGreaterThan(0);
    });

    it("should filter questions by analysis results", () => {
      const analysisWithWhy: ClarificationAnalysis = {
        qualityScore: 50,
        whyScore: 80,
        whoScore: 0,
        whatScore: 0,
        successScore: 0,
        hasWhy: true, // WHY present
        hasWho: false,
        hasWhat: false,
        hasSuccessCriteria: false,
        missingElements: [],
        ambiguousTerms: [],
        needsClarification: true,
      };

      const context: SteeringContext = {
        hasProductContext: false,
        hasTargetUsers: false,
        hasTechContext: false,
      };

      const questions = generator.generateQuestions(analysisWithWhy, context);

      // Should NOT include WHY questions since hasWhy is true
      const whyQuestions = questions.filter(
        (q) => q.category === QuestionCategory.WHY
      );
      expect(whyQuestions.length).toBe(0);
    });

    it("should filter questions by steering context", () => {
      const analysis: ClarificationAnalysis = {
        qualityScore: 0,
        whyScore: 0,
        whoScore: 0,
        whatScore: 0,
        successScore: 0,
        hasWhy: false,
        hasWho: false,
        hasWhat: false,
        hasSuccessCriteria: false,
        missingElements: [],
        ambiguousTerms: [],
        needsClarification: true,
      };

      const contextWithProduct: SteeringContext = {
        hasProductContext: true, // Product context exists
        hasTargetUsers: false,
        hasTechContext: false,
      };

      const questions = generator.generateQuestions(
        analysis,
        contextWithProduct
      );

      // Should NOT include WHY questions since product context exists
      const whyQuestions = questions.filter(
        (q) => q.category === QuestionCategory.WHY
      );
      expect(whyQuestions.length).toBe(0);
    });

    it("should include WHY questions when hasWhy=false and no product context", () => {
      const analysis: ClarificationAnalysis = {
        qualityScore: 0,
        whyScore: 0,
        whoScore: 0,
        whatScore: 0,
        successScore: 0,
        hasWhy: false,
        hasWho: true,
        hasWhat: true,
        hasSuccessCriteria: true,
        missingElements: [],
        ambiguousTerms: [],
        needsClarification: true,
      };

      const context: SteeringContext = {
        hasProductContext: false,
        hasTargetUsers: false,
        hasTechContext: false,
      };

      const questions = generator.generateQuestions(analysis, context);

      const whyQuestions = questions.filter(
        (q) => q.category === QuestionCategory.WHY
      );
      expect(whyQuestions.length).toBeGreaterThan(0);
    });

    it("should exclude WHO questions when hasTargetUsers=true", () => {
      const analysis: ClarificationAnalysis = {
        qualityScore: 0,
        whyScore: 0,
        whoScore: 0,
        whatScore: 0,
        successScore: 0,
        hasWhy: false,
        hasWho: false,
        hasWhat: false,
        hasSuccessCriteria: false,
        missingElements: [],
        ambiguousTerms: [],
        needsClarification: true,
      };

      const contextWithUsers: SteeringContext = {
        hasProductContext: false,
        hasTargetUsers: true, // Target users documented
        hasTechContext: false,
      };

      const questions = generator.generateQuestions(analysis, contextWithUsers);

      const whoQuestions = questions.filter(
        (q) => q.category === QuestionCategory.WHO
      );
      expect(whoQuestions.length).toBe(0);
    });

    it("should use stable semantic IDs from templates", () => {
      const analysis: ClarificationAnalysis = {
        qualityScore: 0,
        whyScore: 0,
        whoScore: 0,
        whatScore: 0,
        successScore: 0,
        hasWhy: false,
        hasWho: false,
        hasWhat: false,
        hasSuccessCriteria: false,
        missingElements: [],
        ambiguousTerms: [],
        needsClarification: true,
      };

      const context: SteeringContext = {
        hasProductContext: false,
        hasTargetUsers: false,
        hasTechContext: false,
      };

      const questions = generator.generateQuestions(analysis, context);

      // All IDs should be stable semantic identifiers, not UUIDs
      questions.forEach((q) => {
        expect(q.id).toBeDefined();
        expect(q.id.length).toBeGreaterThan(0);
        // Should not look like a UUID (no dashes in middle of long random string)
        expect(q.id).not.toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        );
      });
    });

    it("should preserve question metadata (examples, rationale)", () => {
      const analysis: ClarificationAnalysis = {
        qualityScore: 0,
        whyScore: 0,
        whoScore: 0,
        whatScore: 0,
        successScore: 0,
        hasWhy: false,
        hasWho: false,
        hasWhat: false,
        hasSuccessCriteria: false,
        missingElements: [],
        ambiguousTerms: [],
        needsClarification: true,
      };

      const context: SteeringContext = {
        hasProductContext: false,
        hasTargetUsers: false,
        hasTechContext: false,
      };

      const questions = generator.generateQuestions(analysis, context);

      questions.forEach((q) => {
        expect(q.question).toBeDefined();
        expect(q.question.length).toBeGreaterThan(0);
        expect(q.why).toBeDefined();
        expect(q.why.length).toBeGreaterThan(0);
        expect(q.category).toBeDefined();
        expect(typeof q.required).toBe("boolean");
        // Examples may be undefined for some questions
        if (q.examples) {
          expect(Array.isArray(q.examples)).toBe(true);
        }
      });
    });

    it("should handle empty analysis gracefully", () => {
      const analysis: ClarificationAnalysis = {
        qualityScore: 100,
        whyScore: 100,
        whoScore: 100,
        whatScore: 100,
        successScore: 100,
        hasWhy: true,
        hasWho: true,
        hasWhat: true,
        hasSuccessCriteria: true,
        missingElements: [],
        ambiguousTerms: [],
        needsClarification: false,
      };

      const contextComplete: SteeringContext = {
        hasProductContext: true,
        hasTargetUsers: true,
        hasTechContext: true,
      };

      const questions = generator.generateQuestions(analysis, contextComplete);

      // Should return empty array or minimal questions since everything is present
      expect(questions).toBeDefined();
      expect(Array.isArray(questions)).toBe(true);
      expect(questions.length).toBe(0);
    });
  });
});
