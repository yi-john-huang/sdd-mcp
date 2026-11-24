import 'reflect-metadata';
import { Container } from 'inversify';
import { EvidenceRunner } from '../../../application/services/EvidenceRunner';
import { JevAdvisoryService } from '../../../application/services/JevAdvisoryService';
import { WorkflowEngineService } from '../../../application/services/WorkflowEngineService';
import { NodeProcessAdapter } from '../../../infrastructure/adapters/NodeProcessAdapter';
import { bindEvidence } from '../../../infrastructure/di/evidence-bindings';
import { TYPES } from '../../../infrastructure/di/types';

/** The engine, runner, and JEV keep their collaborators private; these tests look through that for wiring only. */
type EngineInternals = { evidenceRunner?: unknown; environment?: unknown; git?: unknown };
type RunnerInternals = { processes?: unknown };
type JevInternals = { env?: unknown };

const stub = (): never => ({} as never);

function containerWithEvidence(environment: Record<string, string | undefined>): Container {
  const container = new Container();
  for (const type of [TYPES.ProjectRepository, TYPES.ContextCompactionService, TYPES.LoggerPort, TYPES.FileSystemPort, TYPES.JevHttpPort, TYPES.GitPort]) {
    container.bind(type).toConstantValue(stub());
  }
  container.bind(TYPES.WorkflowEngineService).to(WorkflowEngineService);
  container.bind(TYPES.JevAdvisoryService).to(JevAdvisoryService);
  bindEvidence(container, environment);
  return container;
}

describe('bindEvidence', () => {
  const environment = { SDD_EVIDENCE_MODE: 'verified', PATH: '/usr/bin' };

  it('should bind an EvidenceRunner backed by NodeProcessAdapter', () => {
    const container = containerWithEvidence(environment);
    expect(container.isBound(TYPES.ProcessPort)).toBe(true);
    expect(container.get(TYPES.ProcessPort)).toBeInstanceOf(NodeProcessAdapter);
    const runner = container.get<EvidenceRunner>(TYPES.EvidenceRunner);
    expect(runner).toBeInstanceOf(EvidenceRunner);
    expect((runner as unknown as RunnerInternals).processes).toBeInstanceOf(NodeProcessAdapter);
  });

  it('should give the workflow engine the runner and the shared environment through optional injection', () => {
    const engine = containerWithEvidence(environment).get<WorkflowEngineService>(TYPES.WorkflowEngineService) as unknown as EngineInternals;
    expect(engine.evidenceRunner).toBeInstanceOf(EvidenceRunner);
    expect(engine.environment).toBe(environment);
  });

  it('should give the workflow engine the bound GitPort for working-tree bindings', () => {
    const container = containerWithEvidence(environment);
    const engine = container.get<WorkflowEngineService>(TYPES.WorkflowEngineService) as unknown as EngineInternals;
    expect(engine.git).toBeDefined();
    expect(engine.git).toBe(container.get(TYPES.GitPort));
  });

  it('should give JEV the same environment under the ProcessEnvironment binding', () => {
    const container = containerWithEvidence(environment);
    const jev = container.get<JevAdvisoryService>(TYPES.JevAdvisoryService) as unknown as JevInternals;
    expect(jev.env).toBe(environment);
    expect(container.isBound(TYPES.ProcessEnvironment)).toBe(true);
    expect(container.isBound(TYPES.JevEnvironment)).toBe(false);
  });
});
