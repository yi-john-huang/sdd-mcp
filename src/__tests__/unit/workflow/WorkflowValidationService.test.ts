import {
  WorkflowValidationService,
  type ValidationBlocker,
} from '../../../application/services/WorkflowValidationService';

const requirements = [
  '# 需求',
  '### FR-1: 結帳',
  '**Objective:** 讓使用者完成結帳',
  '**EARS Specification:** WHEN a cart is valid, THE system SHALL create an order.',
  '**Acceptance Criteria:** 1. A persisted order is returned.',
  '',
  '### NFR-1: 效能',
  '**Objective:** 提供快速回應',
  '**EARS Specification:** THE system SHALL respond within two seconds.',
  '**Acceptance Criteria:** 1. The measured response is at most two seconds.',
].join('\r\n');

const design = [
  '# 設計',
  '## Requirements Traceability',
  'FR-1, NFR-1',
  '## Architecture and Data Flow',
  'Request to service to store.',
  '## Components and Interfaces',
  'Checkout service and order store.',
  '## Failure Handling',
  'Failures are returned without partial writes.',
  '## Verification',
  'Unit and integration checks.',
  '### D-1: Atomic order creation',
  '**Covers:** FR-1, NFR-1',
  '**Decision:** Commit the order atomically.',
  '**Failure behavior:** Roll back the transaction.',
  '**Verification:** Exercise successful and failed commits.',
].join('\n');

const tasks = [
  '# Tasks',
  '### 1.1 Create order transaction',
  '**Covers:** FR-1, D-1',
  '**Dependencies:** none',
  '**TDD:** required',
  '**Affected artifacts:** src/order.ts, src/order.test.ts',
  '**Acceptance criteria:** 1. The transaction is atomic.',
  '**Verification:** Run the focused order test.',
  '### 1.2 Verify latency',
  '**Covers:** NFR-1',
  '**Dependencies:** 1.1',
  '**TDD:** not-applicable — measurement-only task',
  '**Affected artifacts:** none',
  '**Acceptance criteria:** 1. Latency is recorded.',
  '**Verification:** Run the benchmark.',
].join('\n');

const codes = (blockers: ValidationBlocker[]) => blockers.map(({ code }) => code);

describe('WorkflowValidationService', () => {
  const service = new WorkflowValidationService();

  it('accepts multilingual CRLF requirements and returns machine IDs', () => {
    const result = service.validateRequirements(requirements);
    expect(result.status).toBe('passed');
    expect(result.requirementIds).toEqual(['FR-1', 'NFR-1']);
  });

  it('ignores headings and metadata inside backtick and tilde fences', () => {
    const fenced = `${requirements}\n\`\`\`md\n### FR-1: duplicate example\n\`\`\`\n~~~\n### FR-99: example\n~~~`;
    expect(service.validateRequirements(fenced).status).toBe('passed');
  });

  it('rejects duplicate IDs, missing SHALL, and missing numbered acceptance criteria', () => {
    const invalid = `${requirements.replace(' SHALL ', ' will ').replace('1. A persisted', 'A persisted')}\n### FR-1: Duplicate\n**Objective:** Duplicate\n**EARS Specification:** THE system SHALL reject it.\n**Acceptance Criteria:** 1. Rejected.`;
    const result = service.validateRequirements(invalid);
    expect(codes(result.blockers)).toEqual(expect.arrayContaining([
      'DuplicateId',
      'EarsShallMissing',
      'AcceptanceCriteriaMissing',
    ]));
  });

  it('validates design headings, traceability, and known Covers IDs', () => {
    expect(service.validateDesign(design, requirements).status).toBe('passed');
    const invalid = design.replaceAll('NFR-1', 'FR-99');
    const result = service.validateDesign(invalid, requirements);
    expect(codes(result.blockers)).toContain('UnknownCoverageId');
    expect(codes(result.blockers)).toContain('CoverageMissing');
  });

  it('parses task governance metadata without changing prose casing', () => {
    const result = service.validateTasks(tasks, requirements, design);
    expect(result.status).toBe('passed');
    expect(result.tasks['1.1']).toEqual({
      title: 'Create order transaction',
      tddRequired: true,
      dependencies: [],
      plannedArtifacts: ['src/order.ts', 'src/order.test.ts'],
    });
    expect(result.tasks['1.2'].tddRequired).toBe(false);
  });

  it('rejects missing coverage, invalid TDD, unknown dependencies, and cycles', () => {
    const invalid = tasks
      .replace('**Covers:** NFR-1', '**Covers:** none')
      .replace('**TDD:** required', '**TDD:** optional')
      .replace('**Dependencies:** none', '**Dependencies:** 9.9')
      .replace('**Dependencies:** 1.1', '**Dependencies:** 1.1, 1.2');
    const result = service.validateTasks(invalid, requirements, design);
    expect(codes(result.blockers)).toEqual(expect.arrayContaining([
      'CoverageMissing',
      'InvalidTdd',
      'UnknownDependency',
      'DependencyCycle',
    ]));
  });

  it('rejects duplicate task and decision IDs', () => {
    const duplicateDesign = `${design}\n### D-1: Duplicate\n**Covers:** FR-1\n**Decision:** no\n**Failure behavior:** no\n**Verification:** no`;
    expect(codes(service.validateDesign(duplicateDesign, requirements).blockers)).toContain('DuplicateId');
    const duplicateTasks = `${tasks}\n${tasks.slice(tasks.indexOf('### 1.1'))}`;
    expect(codes(service.validateTasks(duplicateTasks, requirements, design).blockers)).toContain('DuplicateId');
  });
});
