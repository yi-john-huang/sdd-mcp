import baseline from '../../fixtures/message-contract-baseline.json';
import {
  MESSAGE_FILES,
  buildContractSnapshot,
  compareToBaseline,
  extractMessagesFromSource,
  loadAllMessages,
} from '../../helpers/message-extractor';

describe('message contract', () => {
  const messages = loadAllMessages();

  it('extracts at least one message per file', () => {
    for (const file of MESSAGE_FILES) {
      expect(messages.filter((m) => m.file === file).length).toBeGreaterThan(0);
    }
  });

  it('keeps every baseline code and numeric token in the current source', () => {
    expect(compareToBaseline(buildContractSnapshot(messages), baseline)).toEqual([]);
  });

  describe('comparison on synthetic source', () => {
    const src = (body: string) => `function blocker(a,b){}\n${body}`;
    const base = buildContractSnapshot(
      extractMessagesFromSource('synthetic.ts', src("blocker('A', 'Limit is 2,000 characters'); blocker('B', `Found ${n} items`);")),
    );

    it('passes on equal source', () => {
      expect(compareToBaseline(base, base)).toEqual([]);
    });

    it('fails when a code is removed', () => {
      const cur = buildContractSnapshot(extractMessagesFromSource('synthetic.ts', src("blocker('A', 'Limit is 2000 characters');")));
      expect(compareToBaseline(cur, base).join('\n')).toMatch(/B/);
    });

    it('fails when a number is dropped', () => {
      const cur = buildContractSnapshot(
        extractMessagesFromSource('synthetic.ts', src("blocker('A', 'Limit is short'); blocker('B', 'x');")),
      );
      expect(compareToBaseline(cur, base).join('\n')).toMatch(/2000/);
    });

    it('records template placeholders, dynamic codes, and non-literals', () => {
      const entries = extractMessagesFromSource(
        'synthetic.ts',
        "blocker('B', `Found ${n} items`); blocker(c, 'a' + 'b'); new GovernanceError('E', err.message);",
      );
      expect(entries.map((e) => [e.code, e.message, e.literal])).toEqual([
        ['B', 'Found X items', true],
        [null, 'ab', true],
        ['E', '', false],
      ]);
    });

    it('extracts the message a caller passes to readRequired', () => {
      const entries = extractMessagesFromSource(
        'synthetic.ts',
        "class S { async f() { await this.readRequired(p, `${phase}.md is missing`); } }",
      );
      expect(entries.map((e) => [e.code, e.message, e.literal])).toEqual([
        ['StateInvariantViolation', 'X.md is missing', true],
      ]);
    });

    it('throws naming an unparsable or empty file', () => {
      expect(() => extractMessagesFromSource('empty.ts', 'const a = 1;')).toThrow(/empty\.ts/);
    });
  });
});
