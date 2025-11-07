import { injectable } from "inversify";
import {
  ClarificationAnalysis,
  SteeringContext,
  AmbiguousTerm,
} from "../../domain/types.js";
import {
  QUALITY_SCORE_WEIGHTS,
  PATTERN_DETECTION,
  AMBIGUOUS_TERMS,
} from "./clarification-constants.js";

@injectable()
export class DescriptionAnalyzer {
  /**
   * Analyzes a project description for completeness using scored semantic detection
   */
  analyze(
    description: string,
    context: SteeringContext,
  ): ClarificationAnalysis {
    // Handle empty descriptions
    if (!description || description.trim().length === 0) {
      return {
        qualityScore: 0,
        whyScore: 0,
        whoScore: 0,
        whatScore: 0,
        successScore: 0,
        hasWhy: false,
        hasWho: false,
        hasWhat: false,
        hasSuccessCriteria: false,
        missingElements: ["WHY", "WHO", "WHAT", "Success Criteria"],
        ambiguousTerms: [],
        needsClarification: true,
      };
    }

    // Calculate semantic scores (0-100 each)
    const whyScore = this.scoreSemanticPresence(
      description,
      PATTERN_DETECTION.WHY_PATTERNS,
    );
    const whoScore = this.scoreSemanticPresence(
      description,
      PATTERN_DETECTION.WHO_PATTERNS,
    );
    const whatScore = this.scoreSemanticPresence(
      description,
      PATTERN_DETECTION.WHAT_PATTERNS,
    );
    const successScore = this.scoreSemanticPresence(
      description,
      PATTERN_DETECTION.SUCCESS_PATTERNS,
    );

    // Derive boolean presence (threshold: 30%)
    const hasWhy = whyScore > 30;
    const hasWho = whoScore > 30;
    const hasWhat = whatScore > 30;
    const hasSuccessCriteria = successScore > 30;

    // Detect ambiguous terms
    const ambiguousTerms = this.detectAmbiguousTerms(description);

    // Calculate overall quality score
    const qualityScore = this.calculateQualityScore({
      hasWhy,
      hasWho,
      hasWhat,
      hasSuccessCriteria,
      ambiguousTermCount: ambiguousTerms.length,
      descriptionLength: description.length,
    });

    // Determine missing elements considering steering context
    const missingElements = this.identifyMissingElements(
      { hasWhy, hasWho, hasWhat, hasSuccessCriteria },
      context,
    );

    // Need clarification if score below threshold or missing critical elements
    const needsClarification =
      qualityScore < QUALITY_SCORE_WEIGHTS.MIN_ACCEPTABLE_SCORE ||
      missingElements.length > 0;

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
      needsClarification,
    };
  }

  /**
   * Score semantic presence using keyword density approach
   * Returns 0-100 based on presence and density of matching patterns
   */
  private scoreSemanticPresence(
    description: string,
    patterns: readonly RegExp[],
  ): number {
    const words = description
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 0);

    if (words.length === 0) return 0;

    const matchedWords = words.filter((word) =>
      patterns.some((pattern) => pattern.test(word)),
    );

    if (matchedWords.length === 0) return 0;

    // Base score for any presence
    const coverage = 50;

    // Density score based on percentage of matched words
    const density = (matchedWords.length / words.length) * 100;

    // Total score capped at 100
    return Math.min(100, coverage + density);
  }

  /**
   * Detect ambiguous terms in the description
   */
  private detectAmbiguousTerms(description: string): AmbiguousTerm[] {
    const ambiguousTerms: AmbiguousTerm[] = [];

    for (const { pattern, suggestion } of AMBIGUOUS_TERMS) {
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
   * Calculate overall quality score based on presence of elements
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

    // WHY is most important
    if (metrics.hasWhy) score += QUALITY_SCORE_WEIGHTS.HAS_WHY;

    // WHO is critical
    if (metrics.hasWho) score += QUALITY_SCORE_WEIGHTS.HAS_WHO;

    // WHAT is essential
    if (metrics.hasWhat) score += QUALITY_SCORE_WEIGHTS.HAS_WHAT;

    // Success criteria
    if (metrics.hasSuccessCriteria) score += QUALITY_SCORE_WEIGHTS.HAS_SUCCESS;

    // Penalize ambiguous terms
    const ambiguityPenalty = Math.min(
      QUALITY_SCORE_WEIGHTS.MAX_AMBIGUITY_PENALTY,
      metrics.ambiguousTermCount * QUALITY_SCORE_WEIGHTS.AMBIGUITY_PENALTY,
    );
    score -= ambiguityPenalty;

    // Length bonus - adequate detail
    if (
      metrics.descriptionLength > QUALITY_SCORE_WEIGHTS.LENGTH_BONUS_THRESHOLD_1
    )
      score += QUALITY_SCORE_WEIGHTS.LENGTH_BONUS_POINTS;
    if (
      metrics.descriptionLength > QUALITY_SCORE_WEIGHTS.LENGTH_BONUS_THRESHOLD_2
    )
      score += QUALITY_SCORE_WEIGHTS.LENGTH_BONUS_POINTS;
    if (
      metrics.descriptionLength > QUALITY_SCORE_WEIGHTS.LENGTH_BONUS_THRESHOLD_3
    )
      score += QUALITY_SCORE_WEIGHTS.LENGTH_BONUS_POINTS;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Identify which elements are missing considering steering context
   */
  private identifyMissingElements(
    presence: {
      hasWhy: boolean;
      hasWho: boolean;
      hasWhat: boolean;
      hasSuccessCriteria: boolean;
    },
    context: SteeringContext,
  ): string[] {
    const missing: string[] = [];

    // WHY is required unless product context exists
    if (!presence.hasWhy && !context.hasProductContext) {
      missing.push("Business justification (WHY)");
    }

    // WHO is required unless target users documented
    if (!presence.hasWho && !context.hasTargetUsers) {
      missing.push("Target users (WHO)");
    }

    // WHAT is always required
    if (!presence.hasWhat) {
      missing.push("Core features (WHAT)");
    }

    // Success criteria always required
    if (!presence.hasSuccessCriteria) {
      missing.push("Success criteria");
    }

    return missing;
  }

  /**
   * Extract context around a matched term for better clarity
   */
  private extractContext(description: string, term: string): string {
    const index = description.toLowerCase().indexOf(term.toLowerCase());
    if (index === -1) return "";

    const start = Math.max(0, index - 30);
    const end = Math.min(description.length, index + term.length + 30);
    const context = description.substring(start, end);

    return (
      (start > 0 ? "..." : "") +
      context +
      (end < description.length ? "..." : "")
    );
  }
}
