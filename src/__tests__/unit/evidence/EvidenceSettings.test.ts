import {
  DEFAULT_ALLOWED_COMMANDS,
  DEFAULT_EVIDENCE_TIMEOUT_MS,
  resolveEvidenceSettings,
} from '../../../application/services/EvidenceSettings';

const resolve = (env: Record<string, string | undefined> = {}, config?: Record<string, unknown>) =>
  resolveEvidenceSettings(env, config);

describe('resolveEvidenceSettings', () => {
  describe('defaults', () => {
    it('should resolve verified mode, 120 s, 18 default commands, and no warnings with no env and no config', () => {
      const settings = resolve();
      expect(settings.mode).toBe('verified');
      expect(settings.timeoutMs).toBe(DEFAULT_EVIDENCE_TIMEOUT_MS);
      expect(settings.timeoutMs).toBe(120_000);
      expect(settings.allowedCommands.size).toBe(18);
      expect([...settings.allowedCommands]).toEqual([...DEFAULT_ALLOWED_COMMANDS]);
      expect(settings.allowedCommands.has('sh')).toBe(false);
      expect(settings.passEnv.size).toBe(0);
      expect(settings.warnings).toEqual([]);
    });

    it('should return a frozen object', () => {
      expect(Object.isFrozen(resolve())).toBe(true);
    });
  });

  describe('mode', () => {
    it('should let the environment win over the project config', () => {
      expect(resolve({ SDD_EVIDENCE_MODE: 'self-reported' }, { evidence: { mode: 'verified' } }).mode).toBe('self-reported');
      expect(resolve({ SDD_EVIDENCE_MODE: ' Verified ' }, { evidence: { mode: 'self-reported' } }).mode).toBe('verified');
    });

    it('should use the project config when the environment is unset or empty', () => {
      expect(resolve({}, { evidence: { mode: 'self-reported' } }).mode).toBe('self-reported');
      expect(resolve({ SDD_EVIDENCE_MODE: '' }, { evidence: { mode: 'self-reported' } }).mode).toBe('self-reported');
    });

    it('should fall back to verified with one warning naming an unrecognized environment value', () => {
      const settings = resolve({ SDD_EVIDENCE_MODE: 'bogus' }, { evidence: { mode: 'self-reported' } });
      expect(settings.mode).toBe('verified');
      expect(settings.warnings).toHaveLength(1);
      expect(settings.warnings[0]).toContain('SDD_EVIDENCE_MODE');
      expect(settings.warnings[0]).toContain('bogus');
    });

    it('should fall back to verified with one warning for an unrecognized config value', () => {
      const settings = resolve({}, { evidence: { mode: 42 } });
      expect(settings.mode).toBe('verified');
      expect(settings.warnings).toHaveLength(1);
      expect(settings.warnings[0]).toContain('evidence.mode');
    });
  });

  describe('timeoutMs', () => {
    it.each([
      ['1', 5000],
      ['4999', 5000],
      ['5000', 5000],
      ['30000', 30000],
      ['600000', 600000],
      ['999999999', 600000],
    ])('should clamp SDD_EVIDENCE_TIMEOUT_MS=%s to %i', (value, expected) => {
      expect(resolve({ SDD_EVIDENCE_TIMEOUT_MS: value }).timeoutMs).toBe(expected);
    });

    it('should use the config timeout when the environment is unset', () => {
      expect(resolve({}, { evidence: { timeoutMs: 30000 } }).timeoutMs).toBe(30000);
      expect(resolve({}, { evidence: { timeoutMs: 1 } }).timeoutMs).toBe(5000);
    });

    it('should warn and fall through when the environment value is not an integer', () => {
      const settings = resolve({ SDD_EVIDENCE_TIMEOUT_MS: 'soon' }, { evidence: { timeoutMs: 30000 } });
      expect(settings.timeoutMs).toBe(30000);
      expect(settings.warnings).toHaveLength(1);
      expect(settings.warnings[0]).toContain('SDD_EVIDENCE_TIMEOUT_MS');
    });

    it('should warn and use the default when the config timeout is not an integer', () => {
      const settings = resolve({}, { evidence: { timeoutMs: '30000' } });
      expect(settings.timeoutMs).toBe(DEFAULT_EVIDENCE_TIMEOUT_MS);
      expect(settings.warnings).toHaveLength(1);
    });
  });

  describe('allowedCommands', () => {
    it('should replace the defaults with the project list', () => {
      const settings = resolve({}, { evidence: { allowedCommands: ['npm', 'my-runner.sh'] } });
      expect([...settings.allowedCommands]).toEqual(['npm', 'my-runner.sh']);
      expect(settings.allowedCommands.has('node')).toBe(false);
      expect(settings.warnings).toEqual([]);
    });

    it.each([
      ['a path separator', ['npm', 'bin/npm']],
      ['a backslash', ['npm', 'tools\\npm']],
      ['whitespace', ['npm test']],
      ['a non-string', ['npm', 7]],
      ['an empty list', []],
      ['a non-array', 'npm'],
    ])('should fall back to the defaults with one warning when the list has %s', (_name, value) => {
      const settings = resolve({}, { evidence: { allowedCommands: value } });
      expect([...settings.allowedCommands]).toEqual([...DEFAULT_ALLOWED_COMMANDS]);
      expect(settings.warnings).toHaveLength(1);
      expect(settings.warnings[0]).toContain('evidence.allowedCommands');
    });
  });

  describe('passEnv', () => {
    it('should keep valid variable names', () => {
      const settings = resolve({}, { evidence: { passEnv: ['MY_TEST_TOKEN', '_private'] } });
      expect([...settings.passEnv]).toEqual(['MY_TEST_TOKEN', '_private']);
      expect(settings.warnings).toEqual([]);
    });

    it('should drop the whole list with one warning when a name is invalid', () => {
      const settings = resolve({}, { evidence: { passEnv: ['OK', 'not valid'] } });
      expect(settings.passEnv.size).toBe(0);
      expect(settings.warnings).toHaveLength(1);
      expect(settings.warnings[0]).toContain('evidence.passEnv');
    });
  });

  describe('verifyCommand', () => {
    it('should resolve a valid configured argv with no warning', () => {
      const settings = resolve({}, { evidence: { verifyCommand: ['npm', 'test'] } });
      expect(settings.verifyCommand).toEqual(['npm', 'test']);
      expect(settings.warnings).toEqual([]);
    });

    it('should leave verifyCommand undefined when it is not configured', () => {
      expect(resolve().verifyCommand).toBeUndefined();
    });

    it.each<[string, unknown]>([
      ['a string', 'npm test'],
      ['an empty array', []],
      ['a non-string element', ['npm', 3]],
      ['an element with a NUL', ['npm', 'te\u0000st']],
      ['an element with a line break', ['npm', 'te\nst']],
      ['more than 64 elements', Array.from({ length: 65 }, () => 'x')],
      ['a program outside the allowlist', ['sh', '-c', 'exit 0']],
      ['inline eval', ['node', '-e', 'process.exit(0)']],
      ['an absolute program path', ['/tmp/fakebin/jest']],
      ['a program outside the runner directories', ['tools/jest']],
    ])('should ignore %s with exactly one warning', (...[, value]) => {
      const settings = resolve({}, { evidence: { verifyCommand: value } });
      expect(settings.verifyCommand).toBeUndefined();
      expect(settings.warnings).toHaveLength(1);
      expect(settings.warnings[0]).toContain('evidence.verifyCommand');
    });

    it('should check the program against a project allowlist', () => {
      const settings = resolve({}, { evidence: { allowedCommands: ['make'], verifyCommand: ['npm', 'test'] } });
      expect(settings.verifyCommand).toBeUndefined();
      expect(settings.warnings).toHaveLength(1);
    });

    it('should not be overridden by any environment variable', () => {
      const settings = resolve({ SDD_EVIDENCE_VERIFY_COMMAND: 'node -e 1', SDD_VERIFY_COMMAND: 'x' }, { evidence: { verifyCommand: ['npm', 'test'] } });
      expect(settings.verifyCommand).toEqual(['npm', 'test']);
    });
  });

  describe('serialization', () => {
    it('should expose only mode and timeout through JSON.stringify and toString', () => {
      const settings = resolve(
        { SDD_EVIDENCE_MODE: 'verified', SDD_JEV_API_KEY: 'sk-live-secret-value', HOME: '/home/someone' },
        { evidence: { passEnv: ['MY_TEST_TOKEN'] } },
      );
      const json = JSON.stringify(settings);
      expect(JSON.parse(json)).toEqual({ mode: 'verified', timeoutMs: 120_000 });
      expect(json).not.toContain('secret');
      expect(json).not.toContain('someone');
      expect(String(settings)).toBe('[EvidenceSettings]');
    });
  });
});
