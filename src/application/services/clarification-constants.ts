/**
 * Constants for Requirements Clarification Service
 * Extracted from inline magic numbers to improve maintainability
 */

export const QUALITY_SCORE_WEIGHTS = {
  HAS_WHY: 30, // Business justification - Most critical
  HAS_WHO: 20, // Target users - Essential
  HAS_WHAT: 20, // Feature scope - Essential
  HAS_SUCCESS: 15, // Success criteria - Important
  AMBIGUITY_PENALTY: 5,
  MAX_AMBIGUITY_PENALTY: 15,
  LENGTH_BONUS_THRESHOLD_1: 100,
  LENGTH_BONUS_THRESHOLD_2: 300,
  LENGTH_BONUS_THRESHOLD_3: 500,
  LENGTH_BONUS_POINTS: 5,
  MIN_ACCEPTABLE_SCORE: 70,
  MIN_STEERING_CONTENT_LENGTH: 200,
} as const;

export const ANSWER_VALIDATION = {
  MIN_ANSWER_LENGTH: 10,
  INVALID_CONTENT_PATTERN: /<script|javascript:|onerror=/i,
} as const;

export const PATTERN_DETECTION = {
  WHY_PATTERNS: [
    /\bproblem\b/i,
    /\bsolve[sd]?\b/i,
    /\bchallenge\b/i,
    /\bpain\s+point/i,
    /\bissue\b/i,
    /\bwhy\b/i,
    /\bbecause\b/i,
    /\benables?\b/i,
    /\bvalue\s+proposition/i,
    /\bbenefit/i,
    /\bjustification/i,
    /\bgoal\b/i,
    /\bobjective\b/i,
    /\bpurpose\b/i,
  ],
  WHO_PATTERNS: [
    /\buser[s]?\b/i,
    /\bcustomer[s]?\b/i,
    /\btarget\s+(audience|users?|customers?)/i,
    /\bpersona[s]?\b/i,
    /\bstakeholder[s]?\b/i,
    /\b(developer|designer|admin|manager)[s]?\b/i,
    /\bfor\s+(teams?|companies|individuals)/i,
  ],
  WHAT_PATTERNS: [
    /\bfeature[s]?\b/i,
    /\bfunctionality\b/i,
    /\bcapabilit(y|ies)/i,
    /\bprovides?\b/i,
    /\binclude[s]?\b/i,
    /\bsupport[s]?\b/i,
    /\ballow[s]?\b/i,
    /\benable[s]?\b/i,
    /\bMVP\b/i,
    /\bscope\b/i,
  ],
  SUCCESS_PATTERNS: [
    /\bmetric[s]?\b/i,
    /\bKPI[s]?\b/i,
    /\bmeasure[sd]?\b/i,
    /\bsuccess\s+(criteria|metric)/i,
    /\b\d+%/,
    /\bperformance\s+target/i,
    /\bgoal[s]?\b.*\d+/i,
  ],
  TARGET_USERS_PATTERN: /target\s+users|user\s+persona/i,
} as const;

export const AMBIGUOUS_TERMS = [
  {
    pattern: /\bfast\b/gi,
    suggestion:
      'Can you specify a target response time? (e.g., "< 200ms API response", "page loads in 2s")',
  },
  {
    pattern: /\bscalable\b/gi,
    suggestion:
      'What scale do you need to support? (e.g., "1000 concurrent users", "100k requests/hour")',
  },
  {
    pattern: /\buser[- ]friendly\b/gi,
    suggestion:
      'What makes it user-friendly? (e.g., "3-click checkout", "mobile-responsive", "keyboard shortcuts")',
  },
  {
    pattern: /\beasy\s+to\s+use\b/gi,
    suggestion:
      'What does easy mean for your users? (e.g., "no training required", "5-minute onboarding", "intuitive navigation")',
  },
  {
    pattern: /\bhigh\s+quality\b/gi,
    suggestion:
      'How do you define quality? (e.g., "zero critical bugs in production", "90% test coverage", "< 5% error rate")',
  },
  {
    pattern: /\breliable\b/gi,
    suggestion:
      'What reliability level do you need? (e.g., "99.9% uptime", "zero data loss", "automatic failover")',
  },
  {
    pattern: /\bsecure\b/gi,
    suggestion:
      'What security requirements apply? (e.g., "SOC 2 compliant", "end-to-end encryption", "OAuth 2.0")',
  },
  {
    pattern: /\bmodern\b/gi,
    suggestion:
      'What technologies or approaches are you considering? (e.g., "React + TypeScript", "microservices", "serverless")',
  },
] as const;
