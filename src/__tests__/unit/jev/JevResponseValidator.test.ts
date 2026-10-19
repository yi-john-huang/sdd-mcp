import {
  MAX_JEV_RESPONSE_BYTES,
  normalizeScores,
  validateJevResponse,
  type JevQuestionSet,
} from '../../../application/services/JevResponseValidator';

const QUESTIONS: JevQuestionSet = {
  'FR-1.testability': { type: 'score', instructions: 'i', criteria: ['a', 'b', 'c', 'd'] },
  'FR-1.ambiguity': { type: 'choice', instructions: 'i', criteria: { unbounded: 'x', bounded: 'y' } },
  'goal.clarification': { type: 'noul', instructions: 'i' },
};

const body = (answers: unknown, extra: Record<string, unknown> = {}): string => JSON.stringify({ answers, ...extra });
const valid = {
  'FR-1.testability': { score: 2 },
  'FR-1.ambiguity': { choice: 'bounded' },
  'goal.clarification': { noul: 0.25 },
};

describe('validateJevResponse', () => {
  it('accepts a valid response covering every question type', () => {
    const result = validateJevResponse(body(valid), QUESTIONS);
    expect(result).toMatchObject({ ok: true, scoreBase: 'zero' });
    if (!result.ok) return;
    expect(result.answers['FR-1.testability']).toEqual({ type: 'score', raw: 2, index: 2 });
    expect(result.answers['FR-1.ambiguity']).toEqual({ type: 'choice', choice: 'bounded' });
    expect(result.answers['goal.clarification']).toEqual({ type: 'noul', noul: 0.25 });
  });

  it('drops extra answer ids', () => {
    const result = validateJevResponse(body({ ...valid, 'extra.id': { choice: 'x' } }), QUESTIONS);
    expect(result.ok).toBe(true);
    if (result.ok) expect(Object.keys(result.answers)).not.toContain('extra.id');
  });

  it('keeps at most 10 primitive meta fields with strings cut to 200 characters', () => {
    const extra: Record<string, unknown> = { model: 'm'.repeat(300), nested: { a: 1 }, list: [1] };
    for (let i = 0; i < 12; i += 1) extra[`field${i}`] = i;
    const result = validateJevResponse(body(valid, extra), QUESTIONS);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.meta).length).toBeLessThanOrEqual(10);
    expect(result.meta.model).toHaveLength(200);
    expect(result.meta).not.toHaveProperty('nested');
    expect(result.meta).not.toHaveProperty('list');
    expect(result.meta).not.toHaveProperty('answers');
  });

  it.each([
    ['a non-JSON body', 'not json'],
    ['a JSON array', '[]'],
    ['a missing answers object', JSON.stringify({ result: 1 })],
    ['answers as an array', body([])],
    ['a missing question id', body({ 'FR-1.testability': { score: 1 }, 'FR-1.ambiguity': { choice: 'bounded' } })],
    ['a wrong answer key for the type', body({ ...valid, 'FR-1.ambiguity': { score: 1 } })],
    ['an undeclared choice label', body({ ...valid, 'FR-1.ambiguity': { choice: 'other' } })],
    ['a non-integer score', body({ ...valid, 'FR-1.testability': { score: 1.5 } })],
    ['a string score', body({ ...valid, 'FR-1.testability': { score: '1' } })],
    ['a noul below zero', body({ ...valid, 'goal.clarification': { noul: -0.01 } })],
    ['a noul above one', body({ ...valid, 'goal.clarification': { noul: 1.01 } })],
    ['a string noul', body({ ...valid, 'goal.clarification': { noul: '0.5' } })],
    ['an answer with two keys', body({ ...valid, 'FR-1.ambiguity': { choice: 'bounded', score: 1 } })],
    ['a null answer', body({ ...valid, 'FR-1.ambiguity': null })],
    ['an out-of-range score', body({ ...valid, 'FR-1.testability': { score: 7 } })],
    ['a negative score', body({ ...valid, 'FR-1.testability': { score: -1 } })],
  ])('rejects %s', (_name, input) => {
    expect(validateJevResponse(input, QUESTIONS)).toEqual({ ok: false });
  });

  it('rejects NaN and Infinity noul values encoded as null', () => {
    expect(validateJevResponse('{"answers":{"FR-1.testability":{"score":1},"FR-1.ambiguity":{"choice":"bounded"},"goal.clarification":{"noul":null}}}', QUESTIONS)).toEqual({ ok: false });
  });

  it('rejects a body larger than the response cap', () => {
    const padded = body(valid, { pad: 'x'.repeat(MAX_JEV_RESPONSE_BYTES) });
    expect(validateJevResponse(padded, QUESTIONS)).toEqual({ ok: false });
  });

  it('accepts noul boundaries 0 and 1', () => {
    expect(validateJevResponse(body({ ...valid, 'goal.clarification': { noul: 0 } }), QUESTIONS).ok).toBe(true);
    expect(validateJevResponse(body({ ...valid, 'goal.clarification': { noul: 1 } }), QUESTIONS).ok).toBe(true);
  });

  it('infers a 1-based score and stores the raw value', () => {
    const result = validateJevResponse(body({ ...valid, 'FR-1.testability': { score: 4 } }), QUESTIONS);
    expect(result).toMatchObject({ ok: true, scoreBase: 'one-inferred' });
    if (result.ok) expect(result.answers['FR-1.testability']).toEqual({ type: 'score', raw: 4, index: 3 });
  });
});

describe('normalizeScores', () => {
  it('treats scores in 0..n-1 as 0-based', () => {
    expect(normalizeScores({ a: 0, b: 3 }, { a: 4, b: 4 })).toEqual({
      ok: true,
      base: 'zero',
      scores: { a: { raw: 0, index: 0 }, b: { raw: 3, index: 3 } },
    });
  });

  it('treats a score equal to the level count as 1-based', () => {
    expect(normalizeScores({ a: 1, b: 4 }, { a: 4, b: 4 })).toEqual({
      ok: true,
      base: 'one-inferred',
      scores: { a: { raw: 1, index: 0 }, b: { raw: 4, index: 3 } },
    });
  });

  it('rejects a response holding both 0 and the level count', () => {
    expect(normalizeScores({ a: 0, b: 4 }, { a: 4, b: 4 })).toEqual({ ok: false });
  });

  it.each([[{ a: 5 }], [{ a: -1 }], [{ a: 4, b: 9 }]])('rejects out-of-range scores %j', (scores) => {
    expect(normalizeScores(scores, { a: 4, b: 4 })).toEqual({ ok: false });
  });

  it('returns base none and no scores when there are no score questions', () => {
    expect(normalizeScores({}, {})).toEqual({ ok: true, base: 'none', scores: {} });
  });
});
