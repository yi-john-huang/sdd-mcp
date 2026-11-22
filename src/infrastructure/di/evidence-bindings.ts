import type { Container } from 'inversify';
import { EvidenceRunner } from '../../application/services/EvidenceRunner.js';
import type { ProcessPort } from '../../domain/ports.js';
import { NodeProcessAdapter } from '../adapters/NodeProcessAdapter.js';
import { TYPES } from './types.js';

export type ProcessEnvironment = Readonly<Record<string, string | undefined>>;

/**
 * Binds the process port, the evidence runner, and the one process environment that the
 * workflow engine and JEV both read. Kept apart from the container so tests can load it.
 */
export function bindEvidence(container: Container, environment: ProcessEnvironment): void {
  container.bind<ProcessPort>(TYPES.ProcessPort).toDynamicValue(() => new NodeProcessAdapter()).inSingletonScope();
  container.bind<ProcessEnvironment>(TYPES.ProcessEnvironment).toConstantValue(environment);
  container
    .bind<EvidenceRunner>(TYPES.EvidenceRunner)
    .toDynamicValue((context) => new EvidenceRunner(context.container.get<ProcessPort>(TYPES.ProcessPort)))
    .inSingletonScope();
}
