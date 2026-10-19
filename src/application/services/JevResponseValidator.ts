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

export type JevScoreBase = 'zero' | 'one-inferred' | 'none';
export type JevMeta = Readonly<Record<string, string | number | boolean | null>>;

export type ValidatedJevResponse =
  | { ok: true; answers: Record<string, JevAnswer>; scoreBase: JevScoreBase; meta: JevMeta }
  | { ok: false };

export type NormalizedScores =
  | { ok: true; base: JevScoreBase; scores: Record<string, { raw: number; index: number }> }
  | { ok: false };

const INVALID = { ok: false } as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Single place that decides the score base. The API contract does not document it, so:
 * a score equal to its level count proves 1-based; otherwise scores are 0-based.
 * Mixed or out-of-range values are invalid.
 */
export function normalizeScores(
  rawScores: Readonly<Record<string, number>>,
  levelCounts: Readonly<Record<string, number>>,
): NormalizedScores {
  const ids = Object.keys(rawScores);
  if (ids.length === 0) return { ok: true, base: 'none', scores: {} };
  const oneBased = ids.some((id) => rawScores[id] === levelCounts[id]);
  const scores: Record<string, { raw: number; index: number }> = {};
  for (const id of ids) {
    const raw = rawScores[id];
    const levels = levelCounts[id];
    const low = oneBased ? 1 : 0;
    const high = oneBased ? levels : levels - 1;
    if (!Number.isInteger(raw) || raw < low || raw > high) return INVALID;
    scores[id] = { raw, index: oneBased ? raw - 1 : raw };
  }
  return { ok: true, base: oneBased ? 'one-inferred' : 'zero', scores };
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

/** Validates one raw answer value against its question; score index is filled in later. */
function parseAnswer(question: JevQuestion, value: unknown): JevAnswer | undefined {
  if (question.type === 'choice') {
    return typeof value === 'string' && Object.hasOwn(question.criteria, value)
      ? { type: 'choice', choice: value }
      : undefined;
  }
  if (typeof value !== 'number') return undefined;
  if (question.type === 'score') {
    return Number.isInteger(value) ? { type: 'score', raw: value, index: value } : undefined;
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
  const rawScores: Record<string, number> = {};
  const levelCounts: Record<string, number> = {};
  for (const [id, question] of Object.entries(questions)) {
    const entry = soleKey(Object.hasOwn(rawAnswers, id) ? rawAnswers[id] : undefined);
    if (!entry || entry[0] !== question.type) return INVALID;
    const answer = parseAnswer(question, entry[1]);
    if (!answer) return INVALID;
    if (answer.type === 'score' && question.type === 'score') {
      rawScores[id] = answer.raw;
      levelCounts[id] = question.criteria.length;
    } else {
      answers[id] = answer;
    }
  }

  const normalized = normalizeScores(rawScores, levelCounts);
  if (!normalized.ok) return INVALID;
  for (const [id, score] of Object.entries(normalized.scores)) {
    answers[id] = { type: 'score', raw: score.raw, index: score.index };
  }
  return { ok: true, answers, scoreBase: normalized.base, meta: collectMeta(root) };
}
