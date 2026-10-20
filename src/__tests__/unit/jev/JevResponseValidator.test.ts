import { readFileSync } from 'node:fs';
import path from 'node:path';
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
    ['a string score', body({ ...valid, 'FR-1.testability': { score: '1' } })],
    ['a noul below zero', body({ ...valid, 'goal.clarification': { noul: -0.01 } })],
    ['a noul above one', body({ ...valid, 'goal.clarification': { noul: 1.01 } })],
    ['a string noul', body({ ...valid, 'goal.clarification': { noul: '0.5' } })],
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

  it.each([[4], [5], [-1], [3.6], [-0.6]])('rejects the score %s of a four-level question', (score) => {
    expect(validateJevResponse(body({ ...valid, 'FR-1.testability': { score } }), QUESTIONS)).toEqual({ ok: false });
  });

  it('rejects a response whose every score equals its level count', () => {
    const questions: JevQuestionSet = {
      a: { type: 'score', instructions: 'i', criteria: ['x', 'y', 'z', 'w'] },
      b: { type: 'score', instructions: 'i', criteria: ['x', 'y', 'z', 'w'] },
    };
    expect(validateJevResponse(body({ a: { score: 4 }, b: { score: 4 } }), questions)).toEqual({ ok: false });
  });

  describe('real Jev API response shape (jev-1.13.0)', () => {
    const fixture = (name: string): string => readFileSync(path.join(__dirname, '../../fixtures/jev', name), 'utf8');
    const legend = ['untestable', 'vague bound', 'observable', 'measurable with threshold'];
    const questions = (extra: JevQuestionSet): JevQuestionSet => ({ t: { type: 'score', instructions: 'i', criteria: legend }, ...extra });

    it('parses score, choice and noul answers with type, confidence, legend and probabilities', () => {
      const result = validateJevResponse(fixture('score-choice-noul.json'), questions({
        c: { type: 'choice', instructions: 'i', criteria: { ambiguous: 'a', clear: 'b' } },
        n: { type: 'noul', instructions: 'i' },
      }));
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.answers.t).toEqual({ type: 'score', raw: 1.05, index: 1 });
      expect(result.answers.c).toEqual({ type: 'choice', choice: 'ambiguous' });
      expect(result.answers.n).toEqual({ type: 'noul', noul: 0.59 });
      expect(result.meta.model).toBe('jev-1.13.0');
    });

    it('uses the argmax of probabilities over round(score)', () => {
      const severity = ['informational', 'low', 'medium', 'high', 'critical'];
      const result = validateJevResponse(fixture('score-clear.json'), questions({
        s: { type: 'score', instructions: 'i', criteria: severity },
        c: { type: 'choice', instructions: 'i', criteria: { functional: 'a', non_functional: 'b', unclear: 'c' } },
      }));
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(Math.round(1.62)).toBe(2);
      expect(result.answers.s).toEqual({ type: 'score', raw: 1.62, index: 0 });
      expect(result.answers.t).toEqual({ type: 'score', raw: 2.96, index: 3 });
      expect(result.answers.c).toEqual({ type: 'choice', choice: 'non_functional' });
    });

    const one = (answer: unknown, criteria: readonly string[] = legend): ReturnType<typeof validateJevResponse> =>
      validateJevResponse(body({ t: answer }), { t: { type: 'score', instructions: 'i', criteria } });

    it('falls back to round(score) when probabilities are missing or invalid', () => {
      const index = (answer: unknown): number | undefined => {
        const result = one(answer);
        return result.ok && result.answers.t.type === 'score' ? result.answers.t.index : undefined;
      };
      expect(index({ type: 'score', score: 2.4 })).toBe(2);
      expect(index({ score: 1.5, probabilities: {} })).toBe(2);
      expect(index({ score: 1.4, probabilities: { 0: 'x', 1: 1 } })).toBe(1);
      expect(index({ score: 1.4, probabilities: { 0: 2 } })).toBe(1);
      expect(index({ score: 1.4, probabilities: { 9: 1 } })).toBe(1);
      expect(index({ score: 1.4, probabilities: [0.5, 0.5] })).toBe(1);
    });

    it('breaks probability ties toward the lowest index and accepts a subset of levels', () => {
      const result = one({ score: 3, probabilities: { 2: 0.4, 1: 0.4 } });
      expect(result.ok && result.answers.t).toEqual({ type: 'score', raw: 3, index: 1 });
    });

    it.each([
      ['a type that differs from the question type', { type: 'choice', score: 1 }],
      ['a legend with a different level count', { score: 1, legend: { 0: 'a', 1: 'b' } }],
      ['an out-of-range rounded score', { score: 3.6 }],
      ['a non-finite score', { score: null }],
      ['a non-numeric score', { score: '1.2' }],
      ['a missing score value', { type: 'score', confidence: 0.5 }],
    ])('rejects %s', (_name, answer) => {
      expect(one(answer)).toEqual({ ok: false });
    });

    it.each([
      ['a choice outside the labels', { type: 'choice', choice: 'other' }],
      ['a wrong-typed choice answer', { type: 'noul', choice: 'a' }],
    ])('rejects %s', (_name, answer) => {
      expect(validateJevResponse(body({ c: answer }), { c: { type: 'choice', instructions: 'i', criteria: { a: 'x' } } })).toEqual({ ok: false });
    });

    it('rejects a noul answer outside [0,1] even with extra fields', () => {
      const noul: JevQuestionSet = { n: { type: 'noul', instructions: 'i' } };
      expect(validateJevResponse(body({ n: { type: 'noul', noul: 1.2 } }), noul)).toEqual({ ok: false });
      expect(validateJevResponse(body({ n: { type: 'noul', noul: 0.4, extra: 'kept out' } }), noul).ok).toBe(true);
    });

    it('rejects an answer that is missing both its value and a valid shape', () => {
      expect(validateJevResponse(body({ t: { type: 'score' } }), { t: { type: 'score', instructions: 'i', criteria: legend } })).toEqual({ ok: false });
    });
  });

  it('accepts a response with no score questions', () => {
    const questions: JevQuestionSet = { c: { type: 'choice', instructions: 'i', criteria: { yes: 'y' } } };
    expect(validateJevResponse(body({ c: { choice: 'yes' } }), questions).ok).toBe(true);
  });
});
