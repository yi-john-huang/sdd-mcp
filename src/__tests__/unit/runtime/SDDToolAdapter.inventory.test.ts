import { SDDToolAdapter, SDD_TOOL_NAMES } from '../../../adapters/cli/SDDToolAdapter';


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

  it('publishes exactly the canonical 16 tools in stable order', () => {
    expect(SDD_TOOL_NAMES).toEqual(EXPECTED_TOOLS);
    expect(tools.map(({ name }) => name)).toEqual(EXPECTED_TOOLS);
    expect(new Set(tools.map(({ name }) => name)).size).toBe(16);
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
  });

  it('binds approval and review to exact revision and hash', () => {
    const approve = tools.find(({ name }) => name === 'sdd-approve')!.tool.inputSchema;
    const review = tools.find(({ name }) => name === 'sdd-review-test-cases')!.tool.inputSchema;
    expect(Object.keys(approve.properties ?? {})).toEqual(['featureName', 'phase', 'expectedRevision', 'expectedArtifactSha256']);
    expect(approve.required).toEqual(['featureName', 'phase', 'expectedRevision', 'expectedArtifactSha256']);
    expect(Object.keys(review.properties ?? {})).toEqual(['featureName', 'expectedTasksRevision', 'expectedArtifactSha256']);
    expect(review.required).toEqual(['featureName', 'expectedTasksRevision', 'expectedArtifactSha256']);
  });
});

describe('v5 disk-authoritative handler routing', () => {
  const templateService = { generateDesignTemplate: jest.fn() };
  const qualityService = {};
  const steeringService = {};
  const codebaseAnalysisService = {};
  const clarificationService = { analyzeDescription: jest.fn() };
  const contextCompactionService = { loadContext: jest.fn() };
  const workflowEngineService = {
    approve: jest.fn(),
    reviewTestCases: jest.fn(),
    initializeFeature: jest.fn(),
    listFeatureStatuses: jest.fn(),
    getFeatureStatus: jest.fn(),
    submitPhaseArtifact: jest.fn(),
    beginImplementation: jest.fn(),
    recordTaskProgress: jest.fn(),
    loadProject: jest.fn(),
  };
  const logger = {};
  const adapter = new SDDToolAdapter(
    templateService as never,
    qualityService as never,
    steeringService as never,
    codebaseAnalysisService as never,
    clarificationService as never,
    contextCompactionService as never,
    workflowEngineService as never,
    logger as never,
  );
  const byName = Object.fromEntries(adapter.getSDDTools().map((tool) => [tool.name, tool.handler]));

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('binds the server workspace root into context requests', async () => {
    contextCompactionService.loadContext.mockResolvedValue({
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
    expect(contextCompactionService.loadContext).toHaveBeenCalledWith({
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
});
