export interface ClarityBounds {
  maxSentences: number;
  maxWords: number;
}

export interface ClarityResult {
  ok: boolean;
  reason?: string;
  sentence?: string;
  wordCount?: number;
}

/** Split on . ? ! followed by whitespace or end of text; dotted identifiers stay whole. */
export function splitSentences(text: string): string[] {
  const parts = text.trim().match(/[\s\S]*?[.?!](?=\s|$)|[\s\S]+$/g) ?? [];
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}

/** Words are whitespace-separated tokens; a placeholder such as X is one word. */
export function countWords(sentence: string): number {
  const trimmed = sentence.trim();
  return trimmed === '' ? 0 : trimmed.split(/\s+/).length;
}

export function checkClarity(text: string, bounds: ClarityBounds): ClarityResult {
  if (text.trim() === '') return { ok: false, reason: 'Message is empty or whitespace-only' };
  const sentences = splitSentences(text);
  if (sentences.length > bounds.maxSentences) {
    return { ok: false, reason: `Message has ${sentences.length} sentences; maximum is ${bounds.maxSentences}`, sentence: text };
  }
  for (const sentence of sentences) {
    const wordCount = countWords(sentence);
    if (wordCount > bounds.maxWords) {
      return { ok: false, reason: `Sentence has ${wordCount} words; maximum is ${bounds.maxWords}`, sentence, wordCount };
    }
  }
  return { ok: true };
}
