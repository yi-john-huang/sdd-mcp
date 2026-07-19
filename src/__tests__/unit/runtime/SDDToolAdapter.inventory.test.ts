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


describe('v4 MCP tool inventory', () => {
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

  it('keeps approval and test review inputs metadata-only', () => {
    const approve = tools.find(({ name }) => name === 'sdd-approve')!.tool.inputSchema;
    const review = tools.find(({ name }) => name === 'sdd-review-test-cases')!.tool.inputSchema;
    expect(Object.keys(approve.properties ?? {})).toEqual(['featureName', 'phase']);
    expect(approve.required).toEqual(['featureName', 'phase']);
    expect(Object.keys(review.properties ?? {})).toEqual(['featureName']);
    expect(review.required).toEqual(['featureName']);
  });
});

describe('v4 disk-authoritative handler routing', () => {
  const projectService = { listProjects: jest.fn() };
  const workflowService = {};
  const templateService = {};
  const qualityService = {};
  const steeringService = {};
  const codebaseAnalysisService = {};
  const clarificationService = {};
  const contextCompactionService = { loadContext: jest.fn() };
  const workflowEngineService = {
    approve: jest.fn(),
    reviewTestCases: jest.fn(),
  };
  const logger = {};
  const adapter = new SDDToolAdapter(
    projectService as never,
    workflowService as never,
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
    })).resolves.toEqual({ approved: true });
    await expect(byName['sdd-review-test-cases']({
      featureName: 'payments',
    })).resolves.toEqual({ reviewed: true });

    expect(workflowEngineService.approve).toHaveBeenCalledWith({
      projectRoot: process.cwd(),
      featureName: 'payments',
      phase: 'requirements',
    });
    expect(workflowEngineService.reviewTestCases).toHaveBeenCalledWith({
      projectRoot: process.cwd(),
      featureName: 'payments',
    });
  });
});
