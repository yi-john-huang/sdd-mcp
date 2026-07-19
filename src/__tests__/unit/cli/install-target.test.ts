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

  it('uses sol medium as the default and sol xhigh for high-level roles', () => {
    expect(DEFAULT_CODEX_MODEL).toBe('gpt-5.6-sol');
    expect(ROLE_MODEL_ROUTES.planner.codex).toEqual({
      model: 'gpt-5.6-sol',
      reasoningEffort: 'xhigh',
    });
    expect(ROLE_MODEL_ROUTES.architect.codex).toEqual({
      model: 'gpt-5.6-sol',
      reasoningEffort: 'xhigh',
    });
    expect(ROLE_MODEL_ROUTES.reviewer.codex).toEqual({
      model: 'gpt-5.6-sol',
      reasoningEffort: 'xhigh',
    });
    expect(ROLE_MODEL_ROUTES['security-auditor'].codex).toEqual({
      model: 'gpt-5.6-sol',
      reasoningEffort: 'xhigh',
    });
    expect(ROLE_MODEL_ROUTES.implementer.codex).toEqual({
      model: 'gpt-5.6-sol',
      reasoningEffort: 'medium',
    });
    expect(ROLE_MODEL_ROUTES['tdd-guide'].codex).toEqual({
      model: 'gpt-5.6-sol',
      reasoningEffort: 'medium',
    });
    expect(ROLE_MODEL_ROUTES.reviewer.claudeCode.model).toBe('opus');
    expect(ROLE_MODEL_ROUTES['tdd-guide'].claudeCode.model).toBe('sonnet');
    expect(ROLE_MODEL_ROUTES.planner.omp).toEqual({
      model: 'gpt-5.6-sol',
      thinkingLevel: 'xhigh',
    });
    expect(ROLE_MODEL_ROUTES.implementer.omp.thinkingLevel).toBe('medium');
    expect(ROLE_MODEL_ROUTES.planner.taskClass).toBe('advisor');
    expect(ROLE_MODEL_ROUTES.implementer.taskClass).toBe('implementation');
    expect(SUPPORTED_CODEX_MODELS).toEqual([
      'gpt-5.6-sol',
      'gpt-5.6-terra',
      'gpt-5.6-luna',
    ]);
    expect(JSON.stringify(ROLE_MODEL_ROUTES)).not.toContain('gpt-5.6-terra');
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
