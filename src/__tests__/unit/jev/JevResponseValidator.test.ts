import {
  MAX_JEV_RESPONSE_BYTES,
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
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result).sort()).toEqual(['answers', 'meta', 'ok']);
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

  it('reads a zero-based severity answer as asked, without shifting it', () => {
    const severity: JevQuestionSet = { 'F1.severity': { type: 'score', instructions: 'i', criteria: ['info', 'low', 'medium', 'high', 'critical'] } };
    const result = validateJevResponse(body({ 'F1.severity': { score: 3 } }), severity);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.answers['F1.severity']).toEqual({ type: 'score', raw: 3, index: 3 });
  });

  it.each([[0], [3]])('accepts the boundary score %i of a four-level question', (score) => {
    const result = validateJevResponse(body({ ...valid, 'FR-1.testability': { score } }), QUESTIONS);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.answers['FR-1.testability']).toEqual({ type: 'score', raw: score, index: score });
  });

  it.each([[4], [5], [-1], [1.5]])('rejects the score %s of a four-level question', (score) => {
    expect(validateJevResponse(body({ ...valid, 'FR-1.testability': { score } }), QUESTIONS)).toEqual({ ok: false });
  });

  it('rejects a response whose every score equals its level count', () => {
    const questions: JevQuestionSet = {
      a: { type: 'score', instructions: 'i', criteria: ['x', 'y', 'z', 'w'] },
      b: { type: 'score', instructions: 'i', criteria: ['x', 'y', 'z', 'w'] },
    };
    expect(validateJevResponse(body({ a: { score: 4 }, b: { score: 4 } }), questions)).toEqual({ ok: false });
  });

  it('accepts a response with no score questions', () => {
    const questions: JevQuestionSet = { c: { type: 'choice', instructions: 'i', criteria: { yes: 'y' } } };
    expect(validateJevResponse(body({ c: { choice: 'yes' } }), questions).ok).toBe(true);
  });
});
