export type RedClassification = 'setup' | 'assertion' | 'ambiguous';

export interface RedClassificationResult {
  classification: RedClassification;
  matchedPattern?: string;
}

interface NamedPattern {
  name: string;
  regex: RegExp;
}

const SETUP_PATTERNS: readonly NamedPattern[] = [
  { name: 'module-not-found', regex: /Cannot find module|Module not found|ERR_MODULE_NOT_FOUND/ },
  { name: 'syntax-error', regex: /SyntaxError/ },
  { name: 'typescript', regex: /\bTS\d{4}\b/ },
  { name: 'enoent', regex: /\bENOENT\b/ },
  { name: 'reference-error', regex: /ReferenceError|\bis not defined\b/ },
  { name: 'command-not-found', regex: /command not found/ },
];

const ASSERTION_PATTERNS: readonly NamedPattern[] = [
  { name: 'assertion-error', regex: /AssertionError/ },
  { name: 'expected-received', regex: /Expected:[\s\S]*Received:/ },
  { name: 'expect-call', regex: /\bexpect\(/ },
];

function firstMatch(patterns: readonly NamedPattern[], text: string): string | undefined {
  return patterns.find(({ regex }) => regex.test(text))?.name;
}

/**
 * Pure, free classification of RED evidence. Setup wins when both kinds match,
 * because a broken setup cannot prove missing behavior.
 */
export function classifyRedEvidence(command: string, summary: string): RedClassificationResult {
  const text = `${command}\n${summary}`;
  const setup = firstMatch(SETUP_PATTERNS, text);
  if (setup) return { classification: 'setup', matchedPattern: setup };
  const assertion = firstMatch(ASSERTION_PATTERNS, text);
  if (assertion) return { classification: 'assertion', matchedPattern: assertion };
  return { classification: 'ambiguous' };
}
