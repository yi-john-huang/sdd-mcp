import {
  CliUsageError,
  DEFAULT_CODEX_MODEL,
  InstallCancelledError,
  ROLE_MODEL_ROUTES,
  SKILL_AGENT_ROUTES,
  SUPPORTED_CODEX_MODELS,
  getTargetPolicy,
  resolveInstallPaths,
  resolveInstallTarget,
} from '../../../cli/install-target';

describe('install target policy', () => {
  it('uses native paths for each target', () => {
    expect(getTargetPolicy('claude-code').defaultPaths).toMatchObject({
      skills: '.claude/skills',
      agents: '.claude/agents',
      rootGuidance: 'CLAUDE.md',
    });
    expect(getTargetPolicy('codex').defaultPaths).toMatchObject({
      skills: '.agents/skills',
      rules: '.codex/guidance/rules',
      agents: '.codex/agents',
      rootGuidance: 'AGENTS.md',
    });
    expect(getTargetPolicy('omp').defaultPaths).toMatchObject({
      skills: '.omp/skills',
      rules: '.omp/rules',
      contexts: '.omp/contexts',
      agents: '.omp/agents',
      rootGuidance: '.omp/AGENTS.md',
    });
  });

  it('routes high-level work to Opus 5.5 and Sol 6, implementation to Sonnet 5.5 and Luna 6', () => {
    expect(DEFAULT_CODEX_MODEL).toBe('gpt-6-luna');
    for (const role of ['planner', 'architect', 'reviewer', 'security-auditor'] as const) {
      expect(ROLE_MODEL_ROUTES[role].codex).toEqual({ model: 'gpt-6-sol', reasoningEffort: 'xhigh' });
      expect(ROLE_MODEL_ROUTES[role].claudeCode).toEqual({ model: 'claude-opus-5-5', effort: 'high' });
      expect(ROLE_MODEL_ROUTES[role].omp).toEqual({ model: 'openai-codex/gpt-6-sol', thinkingLevel: 'xhigh' });
      expect(ROLE_MODEL_ROUTES[role].taskClass).toBe('advisor');
    }
    for (const role of ['implementer', 'tdd-guide'] as const) {
      expect(ROLE_MODEL_ROUTES[role].codex).toEqual({ model: 'gpt-6-luna', reasoningEffort: 'medium' });
      expect(ROLE_MODEL_ROUTES[role].claudeCode).toEqual({ model: 'claude-sonnet-5-5', effort: 'medium' });
      expect(ROLE_MODEL_ROUTES[role].omp).toEqual({ model: 'openai-codex/gpt-6-luna', thinkingLevel: 'medium' });
      expect(ROLE_MODEL_ROUTES[role].taskClass).toBe('implementation');
    }
    expect(SUPPORTED_CODEX_MODELS).toEqual(['gpt-6-sol', 'gpt-6-luna']);
  });

  it('defines phase skill delegation routes', () => {
    expect(SKILL_AGENT_ROUTES['sdd-design']).toBe('architect');
    expect(SKILL_AGENT_ROUTES['sdd-implement']).toBe('implementer');
    expect(SKILL_AGENT_ROUTES['sdd-review']).toBe('reviewer');
  });

  it('applies only explicit path overrides', () => {
    const paths = resolveInstallPaths(getTargetPolicy('codex'), {
      skills: 'custom/skills',
    });
    expect(paths.skills).toBe('custom/skills');
    expect(paths.agents).toBe('.codex/agents');
  });

  it.each(['skills', 'steering', 'rules', 'contexts', 'agents', 'hooks'] as const)(
    'rejects %s guidance destinations in the Codex command-policy directory',
    component => {
      expect(() => resolveInstallPaths(getTargetPolicy('codex'), {
        [component]: '.codex/rules',
      })).toThrow(CliUsageError);
      expect(() => resolveInstallPaths(getTargetPolicy('codex'), {
        [component]: `nested/../.codex/rules/${component}`,
      })).toThrow(CliUsageError);
    },
  );

  it('allows Codex prompt guidance under the dedicated guidance tree', () => {
    const paths = resolveInstallPaths(getTargetPolicy('codex'), {
      contexts: '.codex/guidance/contexts',
    });
    expect(paths.contexts).toBe('.codex/guidance/contexts');
  });
  it.each(['', 'custom\npath', 'custom\0path'])('rejects unsafe path values before installation', value => {
    expect(() => resolveInstallPaths(getTargetPolicy('codex'), {
      hooks: value,
    })).toThrow(CliUsageError);
  });
});

describe('resolveInstallTarget', () => {
  const nonInteractive = {
    isInteractive: () => false,
    chooseTarget: jest.fn(),
    writeNotice: jest.fn(),
  };

  beforeEach(() => jest.clearAllMocks());

  it('uses an explicit target without prompting', async () => {
    await expect(resolveInstallTarget({
      target: 'codex', legacyCodex: false, profile: 'full',
    }, nonInteractive)).resolves.toEqual({ target: 'codex', source: 'explicit' });
    await expect(resolveInstallTarget({
      target: 'omp', legacyCodex: false, profile: 'lean',
    }, nonInteractive)).resolves.toEqual({ target: 'omp', source: 'explicit' });
    expect(nonInteractive.chooseTarget).not.toHaveBeenCalled();
  });

  it('maps legacy codex and rejects a conflict', async () => {
    await expect(resolveInstallTarget({
      legacyCodex: true, profile: 'full',
    }, nonInteractive)).resolves.toMatchObject({ target: 'codex', source: 'legacy-codex' });
    await expect(resolveInstallTarget({
      target: 'claude-code', legacyCodex: true, profile: 'full',
    }, nonInteractive)).rejects.toBeInstanceOf(CliUsageError);
  });

  it('uses the compatibility default outside a tty', async () => {
    await expect(resolveInstallTarget({
      legacyCodex: false, profile: 'full',
    }, nonInteractive)).resolves.toEqual({
      target: 'claude-code', source: 'compatibility-default',
    });
  });

  it('prompts for a full profile in a tty and supports cancellation', async () => {
    const io = {
      isInteractive: () => true,
      chooseTarget: jest.fn().mockResolvedValueOnce('codex').mockResolvedValueOnce(null),
      writeNotice: jest.fn(),
    };
    await expect(resolveInstallTarget({ legacyCodex: false, profile: 'full' }, io))
      .resolves.toEqual({ target: 'codex', source: 'interactive' });
    await expect(resolveInstallTarget({ legacyCodex: false, profile: 'full' }, io))
      .rejects.toBeInstanceOf(InstallCancelledError);
  });
});
