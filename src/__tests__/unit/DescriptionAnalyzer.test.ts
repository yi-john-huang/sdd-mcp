import { DescriptionAnalyzer } from "../../application/services/DescriptionAnalyzer";
import { SteeringContext, ClarificationAnalysis } from "../../domain/types";

describe("DescriptionAnalyzer", () => {
  let analyzer: DescriptionAnalyzer;

  beforeEach(() => {
    analyzer = new DescriptionAnalyzer();
  });

  describe("analyze", () => {
    it("should calculate semantic scores for complete description", () => {
      const description = `
        Build payment API to solve merchant pain of slow checkout.
        Target e-commerce users processing online transactions.
        Features include payment gateway integration, fraud detection, and real-time reporting.
        Must handle 1000 requests/second with 99.9% uptime.
      `;

      const context: SteeringContext = {
        hasProductContext: false,
        hasTargetUsers: false,
        hasTechContext: false,
      };

      const result = analyzer.analyze(description, context);

      expect(result.whyScore).toBeGreaterThan(30);
      expect(result.whoScore).toBeGreaterThan(30);
      expect(result.whatScore).toBeGreaterThan(30);
      expect(result.successScore).toBeGreaterThan(30);
      expect(result.qualityScore).toBeGreaterThan(70);
      expect(result.needsClarification).toBe(false);
    });

    it("should detect WHY with scored approach", () => {
      const descriptionWithWhy =
        "Build API to solve customer pain of slow checkout because users abandon carts";
      const descriptionWithoutWhy =
        "Build API with payment features and cart management";

      const context: SteeringContext = {
        hasProductContext: false,
        hasTargetUsers: false,
        hasTechContext: false,
      };

      const resultWith = analyzer.analyze(descriptionWithWhy, context);
      const resultWithout = analyzer.analyze(descriptionWithoutWhy, context);

      expect(resultWith.whyScore).toBeGreaterThan(resultWithout.whyScore);
      expect(resultWith.hasWhy).toBe(true);
      expect(resultWithout.hasWhy).toBe(false);
    });

    it("should detect WHO with scored approach", () => {
      const descriptionWithWho =
        "Build platform for developers and users to integrate APIs for customers";
      const descriptionWithoutWho =
        "Build platform with API integration features";

      const context: SteeringContext = {
        hasProductContext: false,
        hasTargetUsers: false,
        hasTechContext: false,
      };

      const resultWith = analyzer.analyze(descriptionWithWho, context);
      const resultWithout = analyzer.analyze(descriptionWithoutWho, context);

      expect(resultWith.whoScore).toBeGreaterThan(resultWithout.whoScore);
      expect(resultWith.hasWho).toBe(true);
      expect(resultWithout.hasWho).toBe(false);
    });

    it("should detect WHAT with scored approach", () => {
      const descriptionWithWhat =
        "Features include payment processing, fraud detection, reporting, and analytics capabilities";
      const descriptionWithoutWhat = "System for handling transactions";

      const context: SteeringContext = {
        hasProductContext: false,
        hasTargetUsers: false,
        hasTechContext: false,
      };

      const resultWith = analyzer.analyze(descriptionWithWhat, context);
      const resultWithout = analyzer.analyze(descriptionWithoutWhat, context);

      expect(resultWith.whatScore).toBeGreaterThan(resultWithout.whatScore);
      expect(resultWith.hasWhat).toBe(true);
      expect(resultWithout.hasWhat).toBe(false);
    });

    it("should detect success criteria with scored approach", () => {
      const descriptionWithSuccess =
        "Must handle 1000 req/sec, achieve 99.9% uptime, measure response time under 200ms";
      const descriptionWithoutSuccess = "Build fast reliable system";

      const context: SteeringContext = {
        hasProductContext: false,
        hasTargetUsers: false,
        hasTechContext: false,
      };

      const resultWith = analyzer.analyze(descriptionWithSuccess, context);
      const resultWithout = analyzer.analyze(
        descriptionWithoutSuccess,
        context,
      );

      expect(resultWith.successScore).toBeGreaterThan(
        resultWithout.successScore,
      );
      expect(resultWith.hasSuccessCriteria).toBe(true);
      expect(resultWithout.hasSuccessCriteria).toBe(false);
    });

    it("should identify ambiguous terms", () => {
      const description = "Build fast scalable user-friendly system";

      const context: SteeringContext = {
        hasProductContext: false,
        hasTargetUsers: false,
        hasTechContext: false,
      };

      const result = analyzer.analyze(description, context);

      expect(result.ambiguousTerms.length).toBeGreaterThan(0);
      const terms = result.ambiguousTerms.map((t) => t.term);
      expect(terms).toContain("fast");
      expect(terms).toContain("scalable");
      expect(terms).toContain("user-friendly");
    });

    it("should calculate overall quality score", () => {
      const completeDescription = `
        Build payment API to solve merchant problem of slow checkout.
        Target e-commerce users and developers.
        Features include payment gateway, fraud detection, reporting.
        Must handle 1000 req/sec with 99.9% uptime.
      `;

      const vagueDescription = "Build fast scalable system";

      const context: SteeringContext = {
        hasProductContext: false,
        hasTargetUsers: false,
        hasTechContext: false,
      };

      const completeResult = analyzer.analyze(completeDescription, context);
      const vagueResult = analyzer.analyze(vagueDescription, context);

      expect(completeResult.qualityScore).toBeGreaterThan(
        vagueResult.qualityScore,
      );
      expect(completeResult.qualityScore).toBeGreaterThan(70);
      expect(vagueResult.qualityScore).toBeLessThan(70);
    });

    it("should determine if clarification needed", () => {
      const completeDescription = `
        Build payment API to solve merchant problem of slow checkout.
        Target e-commerce users and developers.
        Features include payment gateway integration, fraud detection, and reporting.
        Success metric: handle 1000 req/sec with 99.9% uptime.
      `;

      const vagueDescription = "Build system";

      const context: SteeringContext = {
        hasProductContext: false,
        hasTargetUsers: false,
        hasTechContext: false,
      };

      const completeResult = analyzer.analyze(completeDescription, context);
      const vagueResult = analyzer.analyze(vagueDescription, context);

      expect(completeResult.needsClarification).toBe(false);
      expect(vagueResult.needsClarification).toBe(true);
    });

    it("should consider steering context in analysis", () => {
      const description = "Build payment API with features";

      const withoutContext: SteeringContext = {
        hasProductContext: false,
        hasTargetUsers: false,
        hasTechContext: false,
      };

      const withContext: SteeringContext = {
        hasProductContext: true,
        hasTargetUsers: true,
        hasTechContext: true,
      };

      const resultWithout = analyzer.analyze(description, withoutContext);
      const resultWith = analyzer.analyze(description, withContext);

      // With context, fewer missing elements expected
      expect(resultWith.missingElements.length).toBeLessThanOrEqual(
        resultWithout.missingElements.length,
      );
    });

    it("should handle empty descriptions gracefully", () => {
      const description = "";

      const context: SteeringContext = {
        hasProductContext: false,
        hasTargetUsers: false,
        hasTechContext: false,
      };

      const result = analyzer.analyze(description, context);

      expect(result).toBeDefined();
      expect(result.qualityScore).toBe(0);
      expect(result.needsClarification).toBe(true);
      expect(result.hasWhy).toBe(false);
      expect(result.hasWho).toBe(false);
      expect(result.hasWhat).toBe(false);
      expect(result.hasSuccessCriteria).toBe(false);
    });

    it("should handle very long descriptions efficiently", () => {
      const longDescription = `
        Build payment API to solve merchant problem of slow checkout.
        ${" Target users ".repeat(100)}
        ${" Features include ".repeat(100)}
        ${" Measure success ".repeat(100)}
      `;

      const context: SteeringContext = {
        hasProductContext: false,
        hasTargetUsers: false,
        hasTechContext: false,
      };

      const startTime = Date.now();
      const result = analyzer.analyze(longDescription, context);
      const endTime = Date.now();

      expect(result).toBeDefined();
      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
    });
  });

  describe("scoreSemanticPresence", () => {
    it("should return 0 for no matches", () => {
      // Access private method for testing (TypeScript won't complain at runtime)
      const score = (analyzer as any).scoreSemanticPresence(
        "random text without keywords",
        [/\bproblem\b/i, /\bsolve\b/i],
      );

      expect(score).toBe(0);
    });

    it("should return high score for dense keyword presence", () => {
      const score = (analyzer as any).scoreSemanticPresence(
        "problem solve challenge issue",
        [/\bproblem\b/i, /\bsolve\b/i, /\bchallenge\b/i, /\bissue\b/i],
      );

      expect(score).toBeGreaterThan(50);
    });

    it("should handle word variations", () => {
      const patterns = [/\benable[s]?\b/i, /\benabling\b/i, /\benabled\b/i];

      const score1 = (analyzer as any).scoreSemanticPresence(
        "system enables users",
        patterns,
      );
      const score2 = (analyzer as any).scoreSemanticPresence(
        "enabling users to",
        patterns,
      );
      const score3 = (analyzer as any).scoreSemanticPresence(
        "enabled by system",
        patterns,
      );

      expect(score1).toBeGreaterThan(0);
      expect(score2).toBeGreaterThan(0);
      expect(score3).toBeGreaterThan(0);
    });

    it("should calculate density as percentage", () => {
      // 2 matches out of 4 words = 50% density + 50 base = 100 score (capped)
      const score = (analyzer as any).scoreSemanticPresence(
        "problem solve test words",
        [/\bproblem\b/i, /\bsolve\b/i],
      );

      expect(score).toBeGreaterThan(50);
      expect(score).toBeLessThanOrEqual(100);
    });
  });
});
