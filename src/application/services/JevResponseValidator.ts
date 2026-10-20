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

function soleKey(answer: unknown): [string, unknown] | undefined {
  if (!isPlainObject(answer)) return undefined;
  const entries = Object.entries(answer);
  return entries.length === 1 ? entries[0] : undefined;
}

/** Validates one raw answer value against its question. Scores are zero-based: an integer 0..levels-1. */
function parseAnswer(question: JevQuestion, value: unknown): JevAnswer | undefined {
  if (question.type === 'choice') {
    return typeof value === 'string' && Object.hasOwn(question.criteria, value)
      ? { type: 'choice', choice: value }
      : undefined;
  }
  if (typeof value !== 'number') return undefined;
  if (question.type === 'score') {
    return Number.isInteger(value) && value >= 0 && value < question.criteria.length
      ? { type: 'score', raw: value, index: value }
      : undefined;
  }
  return Number.isFinite(value) && value >= 0 && value <= 1 ? { type: 'noul', noul: value } : undefined;
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
    const entry = soleKey(Object.hasOwn(rawAnswers, id) ? rawAnswers[id] : undefined);
    if (!entry || entry[0] !== question.type) return INVALID;
    const answer = parseAnswer(question, entry[1]);
    if (!answer) return INVALID;
    answers[id] = answer;
  }
  return { ok: true, answers, meta: collectMeta(root) };
}
