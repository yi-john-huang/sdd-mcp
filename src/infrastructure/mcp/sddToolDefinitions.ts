import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export const SDD_TOOL_NAMES = [
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

export type SDDToolName = (typeof SDD_TOOL_NAMES)[number];

type JsonSchema = Tool['inputSchema'];

const featureName = {
  type: 'string' as const,
  description: 'Feature name under .spec/specs',
};

const featureSchema = (properties: Record<string, unknown> = {}, required: string[] = []): JsonSchema => ({
  type: 'object',
  properties: { featureName, ...properties },
  required: ['featureName', ...required],
});

export const SDD_TOOL_DEFINITIONS: ReadonlyArray<Tool & { name: SDDToolName }> = [
  {
    name: 'sdd-init',
    description: 'Initialize a new SDD feature',
    inputSchema: {
      type: 'object',
      properties: {
        projectName: { type: 'string', description: 'Feature or project name' },
        description: { type: 'string', description: 'Project description' },
        clarificationAnswers: { type: 'object', additionalProperties: { type: 'string' } },
        reviewTestCases: { type: 'boolean', description: 'Require TDD test-case review before tasks approval' },
      },
      required: ['projectName'],
    },
  },
  { name: 'sdd-requirements', description: 'Generate requirements', inputSchema: featureSchema() },
  { name: 'sdd-design', description: 'Generate design', inputSchema: featureSchema() },
  {
    name: 'sdd-tasks',
    description: 'Generate implementation tasks',
    inputSchema: featureSchema({ reviewTestCases: { type: 'boolean' } }),
  },
  { name: 'sdd-implement', description: 'Begin implementation of approved tasks', inputSchema: featureSchema() },
  {
    name: 'sdd-status',
    description: 'Get one feature status or list all features',
    inputSchema: { type: 'object', properties: { featureName } },
  },
  {
    name: 'sdd-approve',
    description: 'Approve a generated workflow phase',
    inputSchema: featureSchema({ phase: { type: 'string', enum: ['requirements', 'design', 'tasks'] } }, ['phase']),
  },
  {
    name: 'sdd-review-test-cases',
    description: 'Record the configured TDD test-case review checkpoint',
    inputSchema: featureSchema(),
  },
  {
    name: 'sdd-quality-check',
    description: 'Perform code quality analysis',
    inputSchema: {
      type: 'object',
      properties: { code: { type: 'string' }, language: { type: 'string' } },
      required: ['code'],
    },
  },
  {
    name: 'sdd-context-load',
    description: 'Load phase-aware context; compact mode is the default',
    inputSchema: featureSchema({
      mode: { type: 'string', enum: ['compact', 'standard', 'full'] },
      phase: { type: 'string', enum: ['requirements', 'design', 'tasks'] },
      maxEstimatedTokens: { type: 'integer', minimum: 1 },
      ifNoneMatch: { type: 'string' },
      includeUnapproved: { type: 'boolean', description: 'Full mode only' },
    }),
  },
  {
    name: 'sdd-template-render',
    description: 'Render an SDD template for a feature',
    inputSchema: featureSchema({
      templateType: { type: 'string', enum: ['requirements', 'design', 'tasks'] },
      customTemplate: { type: 'string' },
    }, ['templateType']),
  },
  {
    name: 'sdd-steering',
    description: 'Create or update project steering documents',
    inputSchema: {
      type: 'object',
      properties: { updateMode: { type: 'string', enum: ['create', 'update'] } },
    },
  },
  {
    name: 'sdd-steering-custom',
    description: 'Create a custom steering document',
    inputSchema: {
      type: 'object',
      properties: {
        fileName: { type: 'string' },
        topic: { type: 'string' },
        inclusionMode: { type: 'string', enum: ['always', 'conditional', 'manual'] },
        filePattern: { type: 'string' },
      },
      required: ['fileName', 'topic', 'inclusionMode'],
    },
  },
  { name: 'sdd-validate-design', description: 'Validate design quality', inputSchema: featureSchema() },
  { name: 'sdd-validate-gap', description: 'Analyze the implementation gap', inputSchema: featureSchema() },
  {
    name: 'sdd-spec-impl',
    description: 'Execute selected spec tasks using TDD',
    inputSchema: featureSchema({ taskNumbers: { type: 'string' } }),
  },
];
