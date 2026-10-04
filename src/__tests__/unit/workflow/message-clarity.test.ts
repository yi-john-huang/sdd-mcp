import { checkClarity, countWords, splitSentences } from '../../helpers/message-clarity';

const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ');
const bounds = { maxSentences: 2, maxWords: 25 };

describe('message clarity helper', () => {
  it('does not split dotted identifiers or version numbers', () => {
    expect(splitSentences('Edit spec.json for FR-1.2 in 5.0.1.')).toEqual(['Edit spec.json for FR-1.2 in 5.0.1.']);
  });

  it('splits on terminators followed by whitespace or end of text', () => {
    expect(splitSentences('One. Two? Three!')).toEqual(['One.', 'Two?', 'Three!']);
    expect(splitSentences('One. Two')).toEqual(['One.', 'Two']);
  });

  it('counts whitespace tokens and treats a placeholder as one word', () => {
    expect(countWords('Missing section X now.')).toBe(4);
    expect(countWords('  a   b ')).toBe(2);
  });

  it('passes a 25-word sentence and two sentences', () => {
    expect(checkClarity(`${words(25)}.`, bounds).ok).toBe(true);
    expect(checkClarity('First fact. Next action.', bounds).ok).toBe(true);
  });

  it('fails a 26-word sentence naming the sentence and count', () => {
    const result = checkClarity(`${words(26)}.`, bounds);
    expect(result.ok).toBe(false);
    expect(result.wordCount).toBe(26);
    expect(result.sentence).toContain('w25');
  });

  it('fails a three-sentence message', () => {
    const result = checkClarity('One. Two. Three.', bounds);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/3 sentences/);
  });

  it('fails empty and whitespace-only text', () => {
    expect(checkClarity('', bounds)).toMatchObject({ ok: false, reason: expect.stringMatching(/empty/i) });
    expect(checkClarity('   \n', bounds).ok).toBe(false);
  });
});
