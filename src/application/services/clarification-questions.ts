/**
 * Clarification Question Templates Configuration
 * Externalized from service logic for maintainability
 */

import {
  QuestionCategory,
  ClarificationAnalysis,
  SteeringContext,
} from "../../domain/types.js";

export interface QuestionTemplate {
  readonly id: string;
  readonly category: QuestionCategory;
  readonly question: string;
  readonly rationale: string;
  readonly examples: string[];
  readonly required: boolean;
  readonly condition: (
    analysis: ClarificationAnalysis,
    context: SteeringContext
  ) => boolean;
}

export const CLARIFICATION_QUESTIONS: Record<string, QuestionTemplate> = {
  why_problem: {
    id: "why_problem",
    category: QuestionCategory.WHY,
    question: "What business problem does this project solve? Why is it needed?",
    rationale:
      "Understanding the business justification ensures we build the right solution",
    examples: [
      "Our customer support team spends 5 hours/day on repetitive inquiries",
      "Users are abandoning checkout because the process takes too long",
      "Developers waste time searching for undocumented APIs",
    ],
    required: true,
    condition: (analysis, context) =>
      !analysis.hasWhy && !context.hasProductContext,
  },

  why_value: {
    id: "why_value",
    category: QuestionCategory.WHY,
    question: "What value does this project provide to users or the business?",
    rationale:
      "Clarifying value proposition helps prioritize features and measure success",
    examples: [
      "Reduce support ticket volume by 40%",
      "Increase conversion rate by improving checkout speed",
      "Save developers 2 hours/week with better documentation",
    ],
    required: true,
    condition: (analysis, context) =>
      !analysis.hasWhy && !context.hasProductContext,
  },

  who_users: {
    id: "who_users",
    category: QuestionCategory.WHO,
    question: "Who are the primary users of this project?",
    rationale:
      "Knowing the target users shapes UX, features, and technical decisions",
    examples: [
      "Customer support agents using ticketing systems",
      "E-commerce shoppers on mobile devices",
      "Backend developers integrating APIs",
    ],
    required: true,
    condition: (analysis, context) =>
      !analysis.hasWho && !context.hasTargetUsers,
  },

  what_mvp_features: {
    id: "what_mvp_features",
    category: QuestionCategory.WHAT,
    question: "What are the 3-5 core features for the MVP?",
    rationale:
      "Defining MVP scope prevents scope creep and ensures focused delivery",
    examples: [
      "Auto-response system, ticket categorization, analytics dashboard",
      "Product search, cart management, payment integration",
      "API explorer, code examples, interactive documentation",
    ],
    required: true,
    condition: (analysis, _context) => !analysis.hasWhat,
  },

  what_out_of_scope: {
    id: "what_out_of_scope",
    category: QuestionCategory.WHAT,
    question: "What is explicitly OUT OF SCOPE for this project?",
    rationale:
      "Boundary definition prevents feature creep and manages expectations",
    examples: [
      "Admin panel (future phase)",
      "Mobile app (web only for MVP)",
      "Multi-language support (English only initially)",
    ],
    required: false,
    condition: (analysis, _context) => !analysis.hasWhat,
  },

  success_metrics: {
    id: "success_metrics",
    category: QuestionCategory.SUCCESS,
    question: "How will you measure if this project is successful?",
    rationale:
      "Quantifiable metrics enable objective evaluation and iteration",
    examples: [
      "Support ticket volume reduced by 30% within 3 months",
      "Page load time under 2 seconds, conversion rate > 3%",
      "API documentation rated 4.5/5 stars by developers",
    ],
    required: true,
    condition: (analysis, _context) => !analysis.hasSuccessCriteria,
  },

  how_tech_constraints: {
    id: "how_tech_constraints",
    category: QuestionCategory.HOW,
    question:
      "Are there any technical constraints or preferences? (language, platform, existing systems)",
    rationale:
      "Technical constraints shape architecture and technology choices",
    examples: [
      "Must integrate with existing Salesforce CRM",
      "TypeScript + React preferred, hosted on AWS",
      "Python-based, needs to run on-premise",
    ],
    required: false,
    condition: (_analysis, context) => !context.hasTechContext,
  },
};
