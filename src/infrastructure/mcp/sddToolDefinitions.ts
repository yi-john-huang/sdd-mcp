import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export const SDD_TOOL_NAMES = [
  'sdd-init', 'sdd-requirements', 'sdd-design', 'sdd-tasks', 'sdd-implement', 'sdd-status',
  'sdd-approve', 'sdd-review-test-cases', 'sdd-quality-check', 'sdd-context-load',
  'sdd-template-render', 'sdd-steering', 'sdd-steering-custom', 'sdd-validate-design',
  'sdd-validate-gap', 'sdd-spec-impl',
] as const;

export type SDDToolName = (typeof SDD_TOOL_NAMES)[number];
type JsonSchema = Tool['inputSchema'];

const featureName = {
  type: 'string' as const,
  pattern: '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$',
  description: 'Feature name under .spec/specs',
};
const revision = { type: 'integer' as const, minimum: 0 };
const artifactHash = {
  oneOf: [
    { type: 'null' as const },
    { type: 'string' as const, pattern: '^[a-f0-9]{64}$' },
  ],
};
const content = { type: 'string' as const, minLength: 1, maxLength: 1_048_576 };
const phase = { type: 'string' as const, enum: ['requirements', 'design', 'tasks'] };
const featureSchema = (properties: Record<string, unknown> = {}, required: string[] = []): JsonSchema => ({
  type: 'object', properties: { featureName, ...properties }, required: ['featureName', ...required], additionalProperties: false,
});
const submissionSchema = (extra: Record<string, unknown> = {}, extraRequired: string[] = []): JsonSchema =>
  featureSchema({ content, expectedRevision: revision, expectedArtifactSha256: artifactHash, ...extra },
    ['content', 'expectedRevision', 'expectedArtifactSha256', ...extraRequired]);
const evidence = {
  type: 'object',
  properties: {
    command: { type: 'string', minLength: 1, maxLength: 500 },
    exitCode: { type: 'integer' },
    summary: { type: 'string', minLength: 1, maxLength: 2000 },
  },
  required: ['command', 'exitCode', 'summary'],
  additionalProperties: false,
};
const affectedArtifacts = {
  type: 'array', maxItems: 100, uniqueItems: true,
  items: { type: 'string', minLength: 1, maxLength: 500, pattern: '^(?![/\\\\])(?![A-Za-z]:)(?!.*(?:^|[/\\\\])\\.\\.(?:[/\\\\]|$))(?!.*\\u0000).+$' },
};

export const SDD_TOOL_DEFINITIONS: ReadonlyArray<Tool & { name: SDDToolName }> = [
  {
    name: 'sdd-init', description: 'Initialize a governed SDD feature',
    inputSchema: {
      type: 'object',
      properties: {
        featureName, description: { type: 'string', minLength: 1, maxLength: 20_000 },
        language: { type: 'string', enum: ['en', 'ja', 'zh-TW'] },
        clarificationAnswers: { type: 'object', additionalProperties: { type: 'string' } },
      },
      required: ['featureName', 'description'], additionalProperties: false,
    },
  },
  { name: 'sdd-requirements', description: 'Submit requirements artifact', inputSchema: submissionSchema() },
  { name: 'sdd-design', description: 'Submit design artifact', inputSchema: submissionSchema() },
  {
    name: 'sdd-tasks', description: 'Submit implementation tasks artifact',
    inputSchema: submissionSchema({ reviewTestCases: { type: 'boolean' } }, ['reviewTestCases']),
  },
  { name: 'sdd-implement', description: 'Begin implementation of approved tasks', inputSchema: featureSchema() },
  { name: 'sdd-status', description: 'Get one feature status or list all features', inputSchema: { type: 'object', properties: { featureName }, additionalProperties: false } },
  { name: 'sdd-approve', description: 'Approve an exact validated phase revision', inputSchema: featureSchema({ phase, expectedRevision: revision, expectedArtifactSha256: { type: 'string', pattern: '^[a-f0-9]{64}$' } }, ['phase', 'expectedRevision', 'expectedArtifactSha256']) },
  { name: 'sdd-review-test-cases', description: 'Record review for an exact tasks revision', inputSchema: featureSchema({ expectedTasksRevision: revision, expectedArtifactSha256: { type: 'string', pattern: '^[a-f0-9]{64}$' } }, ['expectedTasksRevision', 'expectedArtifactSha256']) },
  { name: 'sdd-quality-check', description: 'Perform code quality analysis', inputSchema: { type: 'object', properties: { code: { type: 'string' }, language: { type: 'string' } }, required: ['code'], additionalProperties: false } },
  {
    name: 'sdd-context-load',
    description: 'Load phase-aware governed context',
    inputSchema: {
      ...featureSchema({
        mode: { type: 'string', enum: ['compact', 'standard', 'full'] },
        phase: { type: 'string', enum: ['requirements', 'design', 'tasks', 'implementation'] },
        maxEstimatedTokens: { type: 'integer', minimum: 1 },
        ifNoneMatch: { type: 'string' },
        includeUnapproved: { type: 'boolean' },
      }),
      allOf: [{
        if: {
          properties: { includeUnapproved: { const: true } },
          required: ['includeUnapproved'],
        },
        then: {
          properties: { mode: { const: 'full' } },
          required: ['mode'],
        },
      }],
    },
  },
  { name: 'sdd-template-render', description: 'Render an optional SDD scaffold', inputSchema: featureSchema({ templateType: phase, customTemplate: { type: 'string' } }, ['templateType']) },
  { name: 'sdd-steering', description: 'Create or update project steering documents', inputSchema: { type: 'object', properties: { updateMode: { type: 'string', enum: ['create', 'update'] } }, additionalProperties: false } },
  { name: 'sdd-steering-custom', description: 'Create a custom steering document', inputSchema: { type: 'object', properties: { fileName: { type: 'string' }, topic: { type: 'string' }, inclusionMode: { type: 'string', enum: ['always', 'conditional', 'manual'] }, filePattern: { type: 'string' } }, required: ['fileName', 'topic', 'inclusionMode'], additionalProperties: false } },
  { name: 'sdd-validate-design', description: 'Validate design artifact', inputSchema: featureSchema() },
  { name: 'sdd-validate-gap', description: 'Analyze the implementation gap', inputSchema: featureSchema() },
  {
    name: 'sdd-spec-impl', description: 'Record governed implementation task progress',
    inputSchema: {
      type: 'object',
      properties: {
        featureName, taskNumber: { type: 'string', minLength: 1, maxLength: 50, pattern: '^\\d+(?:\\.\\d+)*$' },
        action: { type: 'string', enum: ['start', 'record-red', 'record-green', 'complete', 'block'] },
        expectedRevision: revision, evidence, affectedArtifacts,
        blocker: { type: 'string', minLength: 1, maxLength: 2000 },
      },
      required: ['featureName', 'taskNumber', 'action', 'expectedRevision'], additionalProperties: false,
      allOf: [
        { if: { properties: { action: { enum: ['record-red', 'record-green', 'complete'] } }, required: ['action'] }, then: { required: ['evidence'] } },
        { if: { properties: { action: { const: 'complete' } }, required: ['action'] }, then: { required: ['affectedArtifacts'] } },
        { if: { properties: { action: { const: 'block' } }, required: ['action'] }, then: { required: ['blocker'] } },
      ],
    },
  },
];
