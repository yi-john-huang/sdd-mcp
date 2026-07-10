import {
  CliUsageError,
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
  });

  it('defines the approved model routes and leaves luna unassigned', () => {
    expect(ROLE_MODEL_ROUTES.planner.codex).toEqual({
      model: 'gpt-5.6-sol',
      reasoningEffort: 'high',
    });
    expect(ROLE_MODEL_ROUTES.implementer.codex).toEqual({
      model: 'gpt-5.6-terra',
      reasoningEffort: 'medium',
    });
    expect(ROLE_MODEL_ROUTES.reviewer.claudeCode.model).toBe('opus');
    expect(ROLE_MODEL_ROUTES['tdd-guide'].claudeCode.model).toBe('sonnet');
    expect(SUPPORTED_CODEX_MODELS).toContain('gpt-5.6-luna');
    expect(JSON.stringify(ROLE_MODEL_ROUTES)).not.toContain('gpt-5.6-luna');
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

  it('rejects codex prompt guidance in the command-policy directory', () => {
    expect(() => resolveInstallPaths(getTargetPolicy('codex'), {
      rules: '.codex/rules',
    })).toThrow(CliUsageError);
    expect(() => resolveInstallPaths(getTargetPolicy('codex'), {
      rules: '/tmp/project/.codex/rules/nested',
    })).toThrow(CliUsageError);
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
