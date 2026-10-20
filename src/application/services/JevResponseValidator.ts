export const MAX_JEV_RESPONSE_BYTES = 262_144;
const MAX_META_FIELDS = 10;
const MAX_META_STRING = 200;

export type JevQuestion =
  | { type: 'choice'; instructions: string; criteria: Readonly<Record<string, string>> }
  | { type: 'score'; instructions: string; criteria: readonly string[] }
  | { type: 'noul'; instructions: string };

export type JevQuestionSet = Readonly<Record<string, JevQuestion>>;

export type JevAnswer =
  | { type: 'choice'; choice: string }
  | { type: 'score'; raw: number; index: number }
  | { type: 'noul'; noul: number };

export type JevMeta = Readonly<Record<string, string | number | boolean | null>>;

export type ValidatedJevResponse =
  | { ok: true; answers: Record<string, JevAnswer>; meta: JevMeta }
  | { ok: false };

const INVALID = { ok: false } as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function collectMeta(root: Record<string, unknown>): JevMeta {
  const meta: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(root)) {
    if (Object.keys(meta).length >= MAX_META_FIELDS) break;
    if (key === 'answers') continue;
    if (typeof value === 'string') meta[key] = value.slice(0, MAX_META_STRING);
    else if (typeof value === 'number' && Number.isFinite(value)) meta[key] = value;
    else if (typeof value === 'boolean') meta[key] = value;
    else if (value === null) meta[key] = null;
  }
  return meta;
}

const isUnit = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;

/** Argmax of a valid `probabilities` object (keys are level indexes, values in [0,1]); ties go to the lowest index. */
function argmaxLevel(probabilities: unknown, levels: number): number | undefined {
  if (!isPlainObject(probabilities)) return undefined;
  let best: number | undefined;
  let bestValue = -1;
  for (const [key, value] of Object.entries(probabilities)) {
    const level = /^(0|[1-9]\d*)$/.test(key) ? Number(key) : -1;
    if (level < 0 || level >= levels || !isUnit(value)) return undefined;
    if (value > bestValue || (value === bestValue && level < (best as number))) {
      best = level;
      bestValue = value;
    }
  }
  return best;
}

function validProbabilityLabels(probabilities: unknown, criteria: Readonly<Record<string, string>>): boolean {
  return probabilities === undefined
    || (isPlainObject(probabilities) && Object.entries(probabilities).every(([label, value]) => Object.hasOwn(criteria, label) && isUnit(value)));
}

/**
 * Validates one raw answer object against its question. The answer carries its value under the question type
 * (`score`, `choice`, `noul`); `type`, `confidence`, `legend`, `probabilities` and unknown extras are tolerated.
 * Scores are zero-based: argmax of `probabilities` when valid, else round(score), within 0..levels-1.
 */
function parseAnswer(question: JevQuestion, answer: unknown): JevAnswer | undefined {
  if (!isPlainObject(answer)) return undefined;
  if (answer.type !== undefined && answer.type !== question.type) return undefined;
  const value = Object.hasOwn(answer, question.type) ? answer[question.type] : undefined;

  if (question.type === 'choice') {
    return typeof value === 'string' && Object.hasOwn(question.criteria, value) && validProbabilityLabels(answer.probabilities, question.criteria)
      ? { type: 'choice', choice: value }
      : undefined;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  if (question.type === 'score') return parseScore(answer, value, question.criteria.length);
  return isUnit(value) ? { type: 'noul', noul: value } : undefined;
}

function parseScore(answer: Record<string, unknown>, value: number, levels: number): JevAnswer | undefined {
  if (answer.legend !== undefined && (!isPlainObject(answer.legend) || Object.keys(answer.legend).length !== levels)) return undefined;
  const index = argmaxLevel(answer.probabilities, levels) ?? Math.round(value) + 0;
  return Number.isInteger(index) && index >= 0 && index < levels ? { type: 'score', raw: value, index } : undefined;
}

export function validateJevResponse(body: string, questions: JevQuestionSet): ValidatedJevResponse {
  if (Buffer.byteLength(body, 'utf8') > MAX_JEV_RESPONSE_BYTES) return INVALID;
  let root: unknown;
  try {
    root = JSON.parse(body);
  } catch {
    return INVALID;
  }
  if (!isPlainObject(root) || !isPlainObject(root.answers)) return INVALID;
  const rawAnswers = root.answers;

  const answers: Record<string, JevAnswer> = {};
  for (const [id, question] of Object.entries(questions)) {
    const answer = parseAnswer(question, Object.hasOwn(rawAnswers, id) ? rawAnswers[id] : undefined);
    if (!answer) return INVALID;
    answers[id] = answer;
  }
  return { ok: true, answers, meta: collectMeta(root) };
}
