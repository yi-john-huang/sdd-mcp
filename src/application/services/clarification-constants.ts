/**
 * Constants for Requirements Clarification Service
 * Extracted from inline values for maintainability and clarity
 */

/**
 * Quality scoring weights
 * These weights determine how much each element contributes to the overall quality score (0-100)
 */
export const QUALITY_SCORE_WEIGHTS = {
  /** Business justification weight - Most critical element (30%) */
  HAS_WHY: 30,

  /** Target users weight - Essential for requirements (20%) */
  HAS_WHO: 20,

  /** Feature scope weight - Essential for implementation (20%) */
  HAS_WHAT: 20,

  /** Success criteria weight - Important but can be derived (15%) */
  HAS_SUCCESS: 15,

  /** Penalty per ambiguous term (fast, scalable, etc.) */
  AMBIGUITY_PENALTY: 5,

  /** Maximum total penalty for ambiguous language */
  MAX_AMBIGUITY_PENALTY: 15,

  /** Minimum description length for basic detail bonus */
  LENGTH_BONUS_THRESHOLD_1: 100,

  /** Minimum description length for good detail bonus */
  LENGTH_BONUS_THRESHOLD_2: 300,

  /** Minimum description length for comprehensive detail bonus */
  LENGTH_BONUS_THRESHOLD_3: 500,

  /** Points awarded for each length threshold met */
  LENGTH_BONUS_POINTS: 5,

  /** Minimum acceptable score to proceed without clarification */
  MIN_ACCEPTABLE_SCORE: 70,

  /** Minimum content length to consider steering context substantial */
  MIN_STEERING_CONTENT_LENGTH: 200
} as const;

/**
 * Answer validation constraints
 */
export const ANSWER_VALIDATION = {
  /** Minimum answer length in characters */
  MIN_ANSWER_LENGTH: 10,

  /** Regex pattern for detecting potentially malicious content */
  INVALID_CONTENT_PATTERN: /<script|javascript:|onerror=/i
} as const;

/**
 * Pattern detection regex - compiled once for performance
 */
export const PATTERN_DETECTION = {
  /** Patterns indicating business justification (WHY) */
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
    /\bpurpose\b/i
  ],

  /** Patterns indicating target users (WHO) */
  WHO_PATTERNS: [
    /\buser[s]?\b/i,
    /\bcustomer[s]?\b/i,
    /\btarget\s+(audience|users?|customers?)/i,
    /\bpersona[s]?\b/i,
    /\bstakeholder[s]?\b/i,
    /\b(developer|designer|admin|manager)[s]?\b/i,
    /\bfor\s+(teams?|companies|individuals)/i
  ],

  /** Patterns indicating features/scope (WHAT) */
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
    /\bscope\b/i
  ],

  /** Patterns indicating success criteria */
  SUCCESS_PATTERNS: [
    /\bmetric[s]?\b/i,
    /\bKPI[s]?\b/i,
    /\bmeasure[sd]?\b/i,
    /\bsuccess\s+(criteria|metric)/i,
    /\b\d+%/,
    /\bperformance\s+target/i,
    /\bgoal[s]?\b.*\d+/i
  ],

  /** Patterns for detecting target users in steering docs */
  TARGET_USERS_PATTERN: /target\s+users|user\s+persona/i
} as const;

/**
 * Ambiguous terms that need clarification with suggested improvements
 */
export const AMBIGUOUS_TERMS = [
  {
    pattern: /\bfast\b/gi,
    suggestion: 'Can you specify a target response time? (e.g., "< 200ms API response", "page loads in 2s")'
  },
  {
    pattern: /\bscalable\b/gi,
    suggestion: 'What scale do you need to support? (e.g., "1000 concurrent users", "100k requests/hour")'
  },
  {
    pattern: /\buser[- ]friendly\b/gi,
    suggestion: 'What makes it user-friendly? (e.g., "3-click checkout", "mobile-responsive", "keyboard shortcuts")'
  },
  {
    pattern: /\beasy\s+to\s+use\b/gi,
    suggestion: 'What does easy mean for your users? (e.g., "no training required", "5-minute onboarding", "intuitive navigation")'
  },
  {
    pattern: /\bhigh\s+quality\b/gi,
    suggestion: 'How do you define quality? (e.g., "zero critical bugs in production", "90% test coverage", "< 5% error rate")'
  },
  {
    pattern: /\breliable\b/gi,
    suggestion: 'What reliability level do you need? (e.g., "99.9% uptime", "zero data loss", "automatic failover")'
  },
  {
    pattern: /\bsecure\b/gi,
    suggestion: 'What security requirements apply? (e.g., "SOC 2 compliant", "end-to-end encryption", "OAuth 2.0")'
  },
  {
    pattern: /\bmodern\b/gi,
    suggestion: 'What technologies or approaches are you considering? (e.g., "React + TypeScript", "microservices", "serverless")'
  }
] as const;
