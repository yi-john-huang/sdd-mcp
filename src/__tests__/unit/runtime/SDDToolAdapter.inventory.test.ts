import { SDD_TOOL_DEFINITIONS } from '../../../infrastructure/mcp/sddToolDefinitions';
import { SDDToolAdapter, SDD_TOOL_NAMES } from '../../../adapters/cli/SDDToolAdapter';
import { AjvValidationAdapter } from '../../../infrastructure/adapters/AjvValidationAdapter';


const EXPECTED_TOOLS = [
  'sdd-init',
  'sdd-requirements',
  'sdd-design',
  'sdd-tasks',
  'sdd-implement',
  'sdd-status',
  'sdd-approve',
  'sdd-review-test-cases',
  'sdd-quality-check',
  'sdd-context-load',
  'sdd-template-render',
  'sdd-steering',
  'sdd-steering-custom',
  'sdd-validate-design',
  'sdd-validate-gap',
  'sdd-spec-impl',
  'sdd-jev-check',
] as const;


describe('v5 MCP tool inventory', () => {
  const dependency = {} as never;
  const adapter = new SDDToolAdapter(
    dependency,
    dependency,
    dependency,
    dependency,
    dependency,
    dependency,
    dependency,
    dependency,
  );
  const tools = adapter.getSDDTools();

  it('publishes exactly the canonical 17 tools in stable order', () => {
    expect(SDD_TOOL_NAMES).toEqual(EXPECTED_TOOLS);
    expect(tools.map(({ name }) => name)).toEqual(EXPECTED_TOOLS);
    expect(new Set(tools.map(({ name }) => name)).size).toBe(17);
  });

  it('uses featureName as the only public feature locator', () => {
    const workspaceTools: Record<string, true> = {
      'sdd-init': true,
      'sdd-quality-check': true,
      'sdd-steering': true,
      'sdd-steering-custom': true,
    };

    for (const { name, tool } of tools) {
      const properties = (tool.inputSchema.properties ?? {}) as Record<string, unknown>;
      expect(properties).not.toHaveProperty('projectId');
      expect(properties).not.toHaveProperty('projectRoot');
      expect(properties).not.toHaveProperty('projectPath');
      if (!workspaceTools[name]) {
        expect(properties).toHaveProperty('featureName');
      }
    }

    expect((tools.find(({ name }) => name === 'sdd-status')!.tool.inputSchema.required ?? [])).not.toContain('featureName');
  });

  it('publishes the complete context continuation schema', () => {
    const context = tools.find(({ name }) => name === 'sdd-context-load')!.tool.inputSchema;
    expect(Object.keys(context.properties ?? {})).toEqual([
      'featureName',
      'mode',
      'phase',
      'maxEstimatedTokens',
      'ifNoneMatch',
      'includeUnapproved',
    ]);
    expect(context.required).toEqual(['featureName']);
    expect(context.allOf).toEqual([{
      if: {
        properties: { includeUnapproved: { const: true } },
        required: ['includeUnapproved'],
      },
      then: {
        properties: { mode: { const: 'full' } },
        required: ['mode'],
      },
    }]);
  });

  it('binds approval and review to exact revision and hash', () => {
    const approve = tools.find(({ name }) => name === 'sdd-approve')!.tool.inputSchema;
    const review = tools.find(({ name }) => name === 'sdd-review-test-cases')!.tool.inputSchema;
    expect(Object.keys(approve.properties ?? {})).toEqual(['featureName', 'phase', 'expectedRevision', 'expectedArtifactSha256', 'approvedBy', 'reviewSidecar']);
    expect(approve.required).toEqual(['featureName', 'phase', 'expectedRevision', 'expectedArtifactSha256']);
    expect(Object.keys(review.properties ?? {})).toEqual(['featureName', 'expectedTasksRevision', 'expectedArtifactSha256']);
    expect(review.required).toEqual(['featureName', 'expectedTasksRevision', 'expectedArtifactSha256']);
  });

  describe('sdd-spec-impl evidence inputs', () => {
    const definition = tools.find(({ name }) => name === 'sdd-spec-impl')!.tool;
    const schema = definition.inputSchema as Record<string, unknown> & { properties: Record<string, unknown> };
    const validator = new AjvValidationAdapter();
    const accepts = (data: unknown): Promise<boolean> => validator.validate(data, schema).then(() => true, () => false);
    const base = { featureName: 'payments', taskNumber: '1.1', expectedRevision: 3 };
    const evidence = { command: 'jest order', exitCode: 1, summary: 'fails' };

    it('publishes a bounded run.argv next to the existing evidence object', () => {
      expect(schema.properties.run).toEqual({
        type: 'object',
        properties: {
          argv: {
            type: 'array', minItems: 1, maxItems: 64,
            items: { type: 'string', minLength: 1, maxLength: 4096, pattern: '^[^\\u0000\\r\\n]+$' },
          },
        },
        required: ['argv'],
        additionalProperties: false,
      });
      expect(schema.properties.evidence).toMatchObject({ required: ['command', 'exitCode', 'summary'] });
      expect(definition.description).toMatch(/run\.argv/);
      expect(definition.description).toMatch(/verified/i);
    });

    it('accepts the 5.5.0 request shape, a run, and rejects an evidence action with neither', async () => {
      await expect(accepts({ ...base, action: 'record-red', evidence })).resolves.toBe(true);
      await expect(accepts({ ...base, action: 'record-red', run: { argv: ['npm', 'test'] } })).resolves.toBe(true);
      await expect(accepts({ ...base, action: 'complete', run: { argv: ['npm', 'test'] }, affectedArtifacts: ['src/a.ts'] })).resolves.toBe(true);
      await expect(accepts({ ...base, action: 'record-red' })).resolves.toBe(false);
      await expect(accepts({ ...base, action: 'record-green' })).resolves.toBe(false);
      await expect(accepts({ ...base, action: 'start' })).resolves.toBe(true);
    });

    it('accepts complete without run or evidence so a project verify command can apply', async () => {
      await expect(accepts({ ...base, action: 'complete', affectedArtifacts: ['src/a.ts'] })).resolves.toBe(true);
      await expect(accepts({ ...base, action: 'complete' })).resolves.toBe(false);
    });

    it('rejects run values outside the published bounds before any handler runs', async () => {
      await expect(accepts({ ...base, action: 'record-red', run: { argv: [] } })).resolves.toBe(false);
      await expect(accepts({ ...base, action: 'record-red', run: { argv: ['npm', 'te\u0000st'] } })).resolves.toBe(false);
      await expect(accepts({ ...base, action: 'record-red', run: { argv: ['x'.repeat(4097)] } })).resolves.toBe(false);
      await expect(accepts({ ...base, action: 'record-red', run: { argv: new Array(65).fill('a') } })).resolves.toBe(false);
      await expect(accepts({ ...base, action: 'record-red', run: { argv: ['npm'], cwd: '/elsewhere' } })).resolves.toBe(false);
    });
  });
});

describe('v5 disk-authoritative handler routing', () => {
  const templateService = {
    generateRequirementsTemplate: jest.fn(),
    generateDesignTemplate: jest.fn(),
    generateTasksTemplate: jest.fn(),
  };
  const qualityService = {
    performQualityCheck: jest.fn(),
    formatQualityReport: jest.fn(),
  };
  const steeringService = { createSteeringDocument: jest.fn() };
  const codebaseAnalysisService = { analyzeCodebase: jest.fn() };
  const clarificationService = {
    analyzeDescription: jest.fn(),
    validateAnswers: jest.fn(),
    synthesizeDescription: jest.fn(),
  };
  const workflowEngineService = {
    approve: jest.fn(),
    reviewTestCases: jest.fn(),
    initializeFeature: jest.fn(),
    listFeatureStatuses: jest.fn(),
    getFeatureStatus: jest.fn(),
    submitPhaseArtifact: jest.fn(),
    beginImplementation: jest.fn(),
    recordTaskProgress: jest.fn(),
    loadFeatureContext: jest.fn(),
    loadProject: jest.fn(),
    validateDesignArtifact: jest.fn(),
  };
  const logger = { error: jest.fn() };
  const adapter = new SDDToolAdapter(
    templateService as never,
    qualityService as never,
    steeringService as never,
    codebaseAnalysisService as never,
    clarificationService as never,
    workflowEngineService as never,
    logger as never,
    { check: jest.fn() } as never,
  );
  const byName = Object.fromEntries(adapter.getSDDTools().map((tool) => [tool.name, tool.handler]));

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('binds the server workspace root into context requests', async () => {
    workflowEngineService.loadFeatureContext.mockResolvedValue({
      cacheStatus: 'not-modified',
      fingerprint: 'etag',
    });
    await byName['sdd-context-load']({
      featureName: 'payments',
      mode: 'standard',
      phase: 'design',
      maxEstimatedTokens: 3000,
      ifNoneMatch: 'etag',
      includeUnapproved: false,
    });
    expect(workflowEngineService.loadFeatureContext).toHaveBeenCalledWith({
      projectRoot: process.cwd(),
      featureName: 'payments',
      mode: 'standard',
      phase: 'design',
      maxEstimatedTokens: 3000,
      ifNoneMatch: 'etag',
      includeUnapproved: false,
    });
  });

  it('routes approval and review through canonical workflow services', async () => {
    workflowEngineService.approve.mockResolvedValue({ approved: true });
    workflowEngineService.reviewTestCases.mockResolvedValue({ reviewed: true });

    await expect(byName['sdd-approve']({
      featureName: 'payments',
      phase: 'requirements',
      expectedRevision: 1,
      expectedArtifactSha256: 'a'.repeat(64),
    })).resolves.toEqual({ approved: true });
    await expect(byName['sdd-review-test-cases']({
      featureName: 'payments',
      expectedTasksRevision: 2,
      expectedArtifactSha256: 'b'.repeat(64),
    })).resolves.toEqual({ reviewed: true });

    expect(workflowEngineService.approve).toHaveBeenCalledWith({
      projectRoot: process.cwd(),
      featureName: 'payments',
      phase: 'requirements',
      expectedRevision: 1,
      expectedArtifactSha256: 'a'.repeat(64),
    });
    expect(workflowEngineService.reviewTestCases).toHaveBeenCalledWith({
      projectRoot: process.cwd(),
      featureName: 'payments',
      expectedTasksRevision: 2,
      expectedArtifactSha256: 'b'.repeat(64),
    });
  });

  it('routes initialization through the guarded disk-authoritative workflow service', async () => {
    clarificationService.analyzeDescription.mockResolvedValue({ needsClarification: false });
    workflowEngineService.initializeFeature.mockResolvedValue({ name: 'payments' });

    await expect(byName['sdd-init']({
      featureName: 'Payments',
      description: 'Create a bounded payment flow',
      language: 'en',
    })).resolves.toMatchObject({ featureName: 'Payments', status: 'initialized', revision: 0 });
    expect(workflowEngineService.initializeFeature).toHaveBeenCalledWith({
      projectRoot: process.cwd(),
      featureName: 'Payments',
      description: 'Create a bounded payment flow',
      language: 'en',
    });
  });

  it('routes every workflow and project lookup through disk-authoritative services', async () => {
    workflowEngineService.listFeatureStatuses.mockResolvedValue([{ featureName: 'payments' }]);
    workflowEngineService.getFeatureStatus.mockResolvedValue({ featureName: 'payments', currentPhase: 'init' });
    workflowEngineService.submitPhaseArtifact.mockResolvedValue({ validation: { status: 'passed' } });
    workflowEngineService.beginImplementation.mockResolvedValue({ featureName: 'payments', ready: true });
    workflowEngineService.loadProject.mockResolvedValue({ name: 'payments' });
    templateService.generateDesignTemplate.mockResolvedValue('# Design');

    await expect(byName['sdd-status']({})).resolves.toEqual({ features: [{ featureName: 'payments' }] });
    await expect(byName['sdd-status']({ featureName: 'payments' })).resolves.toMatchObject({ featureName: 'payments' });
    await expect(byName['sdd-requirements']({ featureName: 'payments', content: '# Requirements', expectedRevision: 0, expectedArtifactSha256: null })).resolves.toMatchObject({ validation: { status: 'passed' } });
    await expect(byName['sdd-design']({ featureName: 'payments', content: '# Design', expectedRevision: 0, expectedArtifactSha256: null })).resolves.toMatchObject({ validation: { status: 'passed' } });
    await expect(byName['sdd-tasks']({ featureName: 'payments', content: '# Tasks', expectedRevision: 0, expectedArtifactSha256: null, reviewTestCases: true })).resolves.toMatchObject({ validation: { status: 'passed' } });
    await expect(byName['sdd-implement']({ featureName: 'payments' })).resolves.toMatchObject({ ready: true });
    await expect(byName['sdd-template-render']({ featureName: 'payments', templateType: 'design' })).resolves.toMatchObject({
      featureName: 'payments',
      content: '# Design',
    });

    expect(workflowEngineService.listFeatureStatuses).toHaveBeenCalledWith({ projectRoot: process.cwd() });
    expect(workflowEngineService.getFeatureStatus).toHaveBeenCalledWith({ projectRoot: process.cwd(), featureName: 'payments' });
    expect(workflowEngineService.submitPhaseArtifact).toHaveBeenNthCalledWith(1, {
      projectRoot: process.cwd(),
      featureName: 'payments',
      phase: 'requirements',
      content: '# Requirements',
      expectedRevision: 0,
      expectedArtifactSha256: null,
      reviewTestCases: undefined,
    });
    expect(workflowEngineService.submitPhaseArtifact).toHaveBeenNthCalledWith(3, {
      projectRoot: process.cwd(),
      featureName: 'payments',
      phase: 'tasks',
      content: '# Tasks',
      expectedRevision: 0,
      expectedArtifactSha256: null,
      reviewTestCases: true,
    });
    expect(workflowEngineService.loadProject).toHaveBeenCalledWith({
      projectRoot: process.cwd(),
      featureName: 'payments',
    });
  });
  it('routes quality, validation, gap, and progress handlers', async () => {
    qualityService.performQualityCheck.mockResolvedValue({ score: 'good' });
    qualityService.formatQualityReport.mockReturnValue('quality: good');
    workflowEngineService.validateDesignArtifact.mockResolvedValue({ status: 'passed' });
    workflowEngineService.recordTaskProgress.mockResolvedValue({ taskState: 'in-progress' });
    workflowEngineService.loadProject.mockResolvedValue({ name: 'payments', path: '/workspace/payments' });
    codebaseAnalysisService.analyzeCodebase.mockResolvedValue({ architecturePatterns: [] });

    await expect(byName['sdd-quality-check']({ code: 'export {}', language: 'typescript' }))
      .resolves.toBe('quality: good');
    await expect(byName['sdd-validate-design']({ featureName: 'payments' }))
      .resolves.toEqual({ status: 'passed' });
    await expect(byName['sdd-validate-gap']({ featureName: 'payments' }))
      .resolves.toEqual({ featureName: 'payments', analysis: { architecturePatterns: [] } });
    await expect(byName['sdd-spec-impl']({
      featureName: 'payments',
      taskNumber: '1.1',
      action: 'start',
      expectedRevision: 0,
    })).resolves.toEqual({ taskState: 'in-progress' });
  });

  it('forwards run.argv unchanged and returns the observed evidence with the mode', async () => {
    const result = { taskState: 'red-observed', evidenceMode: 'verified', observed: { exitCode: 1, outputExcerpt: 'Expected: 1', durationMs: 7 } };
    workflowEngineService.recordTaskProgress.mockResolvedValue(result);
    await expect(byName['sdd-spec-impl']({
      featureName: 'payments', taskNumber: '1.1', action: 'record-red', expectedRevision: 1, run: { argv: ['npm', 'test', '--', 'order'] },
    })).resolves.toEqual(result);
    expect(workflowEngineService.recordTaskProgress).toHaveBeenLastCalledWith(expect.objectContaining({
      action: 'record-red', run: { argv: ['npm', 'test', '--', 'order'] }, evidence: undefined,
    }));
  });

  it('renders every template form and rejects unsupported template input', async () => {
    workflowEngineService.loadProject.mockResolvedValue({ name: 'payments' });
    templateService.generateRequirementsTemplate.mockResolvedValue('# Requirements');
    templateService.generateTasksTemplate.mockResolvedValue('# Tasks');

    await expect(byName['sdd-template-render']({ featureName: 'payments', templateType: 'requirements' }))
      .resolves.toMatchObject({ content: '# Requirements' });
    await expect(byName['sdd-template-render']({ featureName: 'payments', templateType: 'tasks' }))
      .resolves.toMatchObject({ content: '# Tasks' });
    await expect(byName['sdd-template-render']({
      featureName: 'payments',
      templateType: 'design',
      customTemplate: '# Custom design',
    })).resolves.toMatchObject({ content: '# Custom design' });
    await expect(byName['sdd-template-render']({ featureName: 'payments', templateType: 'unknown' }))
      .rejects.toThrow('templateType must be requirements, design, or tasks');
  });

  it('handles clarification retries without creating premature state', async () => {
    clarificationService.analyzeDescription.mockResolvedValue({
      needsClarification: true,
      questions: [{ id: 'scope', required: true }],
    });
    await expect(byName['sdd-init']({
      featureName: 'payments',
      description: 'Build payments',
    })).resolves.toMatchObject({ status: 'clarification-required' });
    expect(workflowEngineService.initializeFeature).not.toHaveBeenCalled();

    clarificationService.validateAnswers.mockReturnValue({ valid: true, missingRequired: [] });
    clarificationService.synthesizeDescription.mockReturnValue({ enriched: 'Build bounded payments' });
    workflowEngineService.initializeFeature.mockResolvedValue({ name: 'payments' });
    await expect(byName['sdd-init']({
      featureName: 'payments',
      description: 'Build payments',
      clarificationAnswers: { scope: 'checkout only' },
    })).resolves.toMatchObject({ status: 'initialized' });
    expect(workflowEngineService.initializeFeature).toHaveBeenCalledWith(expect.objectContaining({
      description: 'Build bounded payments',
    }));
  });

  it('creates dynamic and custom steering through the managed service', async () => {
    codebaseAnalysisService.analyzeCodebase.mockResolvedValue({});
    steeringService.createSteeringDocument.mockResolvedValue({});

    const steering = await byName['sdd-steering']({ updateMode: 'update' });
    expect(steering).toContain('Steering Documents Updated');
    expect(steeringService.createSteeringDocument).toHaveBeenCalledWith(
      process.cwd(),
      expect.objectContaining({ name: 'product.md' }),
    );

    await expect(byName['sdd-steering-custom']({
      fileName: 'payments.md',
      topic: 'Payment boundaries',
      inclusionMode: 'conditional',
      filePattern: 'src/payments/**',
    })).resolves.toContain('payments.md');
    expect(steeringService.createSteeringDocument).toHaveBeenCalledWith(
      process.cwd(),
      expect.objectContaining({
        name: 'payments.md',
        patterns: ['src/payments/**'],
      }),
    );
  });
});

describe('run.argv element pattern', () => {
  const schema = SDD_TOOL_DEFINITIONS.find(({ name }) => name === 'sdd-spec-impl')!.inputSchema as unknown as { properties: { run: { properties: { argv: { items: { pattern: string } } } } } };
  const element = new RegExp(schema.properties.run.properties.argv.items.pattern, 'u');

  it.each([['test'], ['--runInBand'], ['a b & c']])('should accept %j', (value) => {
    expect(element.test(value)).toBe(true);
  });

  it.each([['line\nfeed'], ['carriage\rreturn'], ['nul\u0000byte']])('should reject %j, as the server does', (value) => {
    expect(element.test(value)).toBe(false);
  });
});
