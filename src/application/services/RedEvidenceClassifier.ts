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
  // Python: import and collection failures.
  { name: 'python-import', regex: /ModuleNotFoundError|ImportError|IndentationError/ },
  { name: 'pytest-collection', regex: /ERROR collecting|errors? during collection/ },
  // Go: build and module failures.
  { name: 'go-build', regex: /\bundefined: \w|\[build failed\]|\[setup failed\]/ },
  { name: 'go-module', regex: /cannot find package|no required module provides package/ },
  // Rust: compiler errors.
  { name: 'rust-compile', regex: /error\[E\d{4}\]|could not compile/ },
  // JVM: compilation and class loading.
  { name: 'jvm-compile', regex: /cannot find symbol|COMPILATION ERROR|Compilation failed/ },
  { name: 'jvm-class-loading', regex: /ClassNotFoundException|NoClassDefFoundError/ },
  // .NET: compiler and build failures.
  { name: 'dotnet-build', regex: /error CS\d{4}|error MSB\d{4}|Build FAILED/ },
];

const ASSERTION_PATTERNS: readonly NamedPattern[] = [
  { name: 'assertion-error', regex: /AssertionError/ },
  { name: 'expected-received', regex: /Expected:[\s\S]*Received:/ },
  { name: 'expect-call', regex: /\bexpect\(/ },
  { name: 'assert-fail', regex: /\bassert(?:ion)?\b.*fail/i },
  { name: 'pytest-assert', regex: /^E\s+assert |FAILED \S+::/m },
  { name: 'go-test-fail', regex: /--- FAIL:[\s\S]*_test\.go:\d+:/ },
  { name: 'rust-panic', regex: /assertion .*failed|panicked at .*assert/ },
  { name: 'jvm-assertion', regex: /AssertionFailedError|expected:\s?<.*> but was:\s?<.*>|ComparisonFailure/ },
  { name: 'dotnet-assertion', regex: /Assert\.\w+\(\) Failure|Expected: .*\n\s*(?:But was|Actual): / },
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
