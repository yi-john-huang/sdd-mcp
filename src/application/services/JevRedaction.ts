export interface RedactionResult {
  text: string;
  count: number;
}

const REDACTED = '[REDACTED]';

interface SecretPattern {
  regex: RegExp;
  /** Replacement; assignments keep the name and operator. */
  replace: string | ((match: string, ...groups: string[]) => string);
}

// Every pattern is linear-time: bounded classes, no nested quantifiers over overlapping classes.
const SECRET_PATTERNS: readonly SecretPattern[] = [
  { regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, replace: REDACTED },
  // An unterminated key block still hides everything after the header.
  { regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*$/g, replace: REDACTED },
  { regex: /\bAKIA[0-9A-Z]{16}\b/g, replace: REDACTED },
  { regex: /\b(?:ghp|gho|ghs|ghu|ghr)_[A-Za-z0-9]{20,}\b/g, replace: REDACTED },
  { regex: /\bgithub_pat_[A-Za-z0-9_]{20,}/g, replace: REDACTED },
  { regex: /\bxox[abprs]-[A-Za-z0-9-]{10,}/g, replace: REDACTED },
  { regex: /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g, replace: REDACTED },
  { regex: /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/g, replace: `Bearer ${REDACTED}` },
  {
    regex: /((?:"[\w.-]{0,40}(?:api[_-]?key|apikey|secret|token|passw(?:or)?d)[\w.-]{0,40}"|'[\w.-]{0,40}(?:api[_-]?key|apikey|secret|token|passw(?:or)?d)[\w.-]{0,40}'|\b[\w.-]{0,40}(?:api[_-]?key|apikey|secret|token|passw(?:or)?d)[\w.-]{0,40})\s{0,3}[:=]\s{0,3})(?!\[REDACTED\])("[^"\n]{0,500}"|'[^'\n]{0,500}'|[^\s,;"']{1,500})/gi,
    replace: (_match, prefix) => `${prefix}${REDACTED}`,
  },
];

export function redactSecrets(value: string): RedactionResult {
  let text = value;
  let count = 0;
  for (const { regex, replace } of SECRET_PATTERNS) {
    regex.lastIndex = 0;
    text = text.replace(regex, (...args: unknown[]) => {
      count += 1;
      const match = args[0] as string;
      if (typeof replace === 'string') return replace;
      return replace(match, ...(args.slice(1, -2) as string[]));
    });
  }
  return { text, count };
}

/** Redact secrets in the full string, then bound it. A secret that straddles the limit is not sent in part. */
export function redactThenClip(value: string | undefined, limit: number): RedactionResult {
  const result = redactSecrets(value ?? '');
  return { text: result.text.slice(0, limit), count: result.count };
}

/** Redacts every string leaf of a JSON-like value without mutating the input. */
export function redactState<T>(state: T): { state: T; count: number } {
  let count = 0;
  const walk = (node: unknown): unknown => {
    if (typeof node === 'string') {
      const result = redactSecrets(node);
      count += result.count;
      return result.text;
    }
    if (Array.isArray(node)) return node.map(walk);
    if (node !== null && typeof node === 'object') {
      return Object.fromEntries(Object.entries(node as Record<string, unknown>).map(([key, child]) => [key, walk(child)]));
    }
    return node;
  };
  return { state: walk(state) as T, count };
}
