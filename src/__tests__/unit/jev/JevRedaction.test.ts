import { redactSecrets, redactState, redactThenClip } from '../../../application/services/JevRedaction';

const PEM = '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA1234567890abcdef\n-----END RSA PRIVATE KEY-----';

describe('redactSecrets', () => {
  it.each([
    ['PEM private key block', `before\n${PEM}\nafter`, 'MIIEowIBAAKCAQEA1234567890abcdef'],
    ['AWS access key id', 'id AKIAIOSFODNN7EXAMPLE end', 'AKIAIOSFODNN7EXAMPLE'],
    ['GitHub ghp token', `t ghp_${'a1B2'.repeat(9)} e`, 'a1B2a1B2a1B2a1B2'],
    ['GitHub gho token', `t gho_${'a1B2'.repeat(9)} e`, 'a1B2a1B2a1B2a1B2'],
    ['GitHub ghs token', `t ghs_${'a1B2'.repeat(9)} e`, 'a1B2a1B2a1B2a1B2'],
    ['GitHub fine-grained token', `t github_pat_${'Zz9_'.repeat(8)} e`, 'Zz9_Zz9_Zz9_Zz9_'],
    ['Slack token', 'hook xoxb-1234567890-abcdefghij end', '1234567890-abcdefghij'],
    ['JWT', 'jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r end', 'eyJzdWIiOiIxMjM0NTY3ODkwIn0'],
    ['Bearer token', 'Authorization: Bearer abcDEF123456.token-value_x', 'abcDEF123456.token-value_x'],
  ])('redacts a %s', (_name, input, secret) => {
    const result = redactSecrets(input);
    expect(result.text).not.toContain(secret);
    expect(result.text).toContain('[REDACTED]');
    expect(result.count).toBeGreaterThanOrEqual(1);
  });

  it.each([
    ['api_key = "sk_live_123456789"', 'api_key', 'sk_live_123456789'],
    ['apikey: abcdef123456', 'apikey', 'abcdef123456'],
    ["const secret = 'hunter2hunter2'", 'secret', 'hunter2hunter2'],
    ['token: tok_value_123', 'token', 'tok_value_123'],
    ['password=P@ssw0rd!', 'password', 'P@ssw0rd!'],
    ['passwd = "letmein99"', 'passwd', 'letmein99'],
    ['DB_PASSWORD=supersecretvalue', 'DB_PASSWORD', 'supersecretvalue'],
    ['{"client_secret": "abc-secret-value"}', 'client_secret', 'abc-secret-value'],
    ['{"api_key": "sk_live_quoted_key"}', 'api_key', 'sk_live_quoted_key'],
    ["{'password': 'hunter2hunter2'}", 'password', 'hunter2hunter2'],
    ['{"token": "tok_value_123"}', 'token', 'tok_value_123'],
  ])('redacts the value of assignment %p and keeps the name', (input, name, secret) => {
    const result = redactSecrets(input);
    expect(result.text).not.toContain(secret);
    expect(result.text).toContain(name);
    expect(result.text).toContain('[REDACTED]');
    expect(result.count).toBe(1);
  });

  it('keeps the name and operator of an assignment', () => {
    expect(redactSecrets('password=P@ssw0rd!').text).toBe('password=[REDACTED]');
  });

  it('counts every match', () => {
    const result = redactSecrets('AKIAIOSFODNN7EXAMPLE and AKIAABCDEFGHIJKLMNOP');
    expect(result.count).toBe(2);
    expect(result.text).toBe('[REDACTED] and [REDACTED]');
  });

  it('counts a value once when two patterns match it', () => {
    const result = redactSecrets('api_key=AKIAIOSFODNN7EXAMPLE');
    expect(result.count).toBe(1);
    expect(result.text).toBe('api_key=[REDACTED]');
  });

  it('returns text without secrets unchanged with count 0', () => {
    const input = 'The system SHALL reject an unknown token type. Tokens are described in FR-2.';
    expect(redactSecrets(input)).toEqual({ text: input, count: 0 });
  });

  it('handles a 100 KB adversarial input in under 200 ms', () => {
    const inputs = [
      'a'.repeat(100_000),
      'token='.repeat(16_000),
      '"token":'.repeat(12_000),
      `-----BEGIN PRIVATE KEY-----${'x'.repeat(100_000)}`,
      `eyJ${'a'.repeat(100_000)}`,
      `Bearer ${'a'.repeat(100_000)}`,
      `xoxb-${'1'.repeat(100_000)}`,
    ];
    for (const input of inputs) {
      const started = Date.now();
      redactSecrets(input);
      expect(Date.now() - started).toBeLessThan(200);
    }
  });
});

describe('redactThenClip', () => {
  it('redacts an AWS key before clipping so a partial key is not sent', () => {
    const secret = 'AKIAIOSFODNN7EXAMPLE';
    const input = `${' '.repeat(1490)}${secret}`;
    const result = redactThenClip(input, 1500);
    expect(result.text).not.toContain('AKIA');
    expect(result.text).not.toContain(secret.slice(0, 10));
    expect(result.count).toBe(1);
  });

  it('redacts an assignment that straddles the clip boundary', () => {
    const secret = 'supersecretvalue';
    const input = `${' '.repeat(1480)}password=${secret}`;
    const result = redactThenClip(input, 1500);
    expect(result.text).not.toContain(secret);
    expect(result.text).not.toContain(secret.slice(0, 8));
    expect(result.count).toBe(1);
  });
});

describe('redactState', () => {
  it('walks nested objects and arrays and totals the count without mutating the input', () => {
    const state = {
      kind: 'requirements',
      items: [{ id: 'FR-1', text: 'use AKIAIOSFODNN7EXAMPLE' }, { id: 'FR-2', nested: { note: 'password=abc12345' } }],
      context: { goal: 'plain text' },
      truncated: false,
      count: 3,
    };
    const snapshot = JSON.stringify(state);
    const result = redactState(state);
    expect(result.count).toBe(2);
    const serialized = JSON.stringify(result.state);
    expect(serialized).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(serialized).not.toContain('abc12345');
    expect(serialized).toContain('plain text');
    expect(JSON.stringify(state)).toBe(snapshot);
    expect((result.state as typeof state).truncated).toBe(false);
    expect((result.state as typeof state).count).toBe(3);
  });
});
