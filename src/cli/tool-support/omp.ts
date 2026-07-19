import * as fs from 'fs';
import * as path from 'path';
import { CliUsageError } from '../install-target.js';
import { PreservingWriter, validateChildName } from '../utils/preserving-writer.js';
import { buildCompactRootGuidance } from './root-guidance.js';
import { parseSourceAgent, renderOmpAgent } from './target-agent-renderer.js';
import {
  copyFlatComponents,
  TargetInstallSession,
  type BaseTargetInstallRequest,
} from './target-installer.js';

export interface OmpInstallRequest extends BaseTargetInstallRequest {
  rootGuidancePreamble?: string;
}

export async function installOmpTarget(request: OmpInstallRequest) {
  if (request.components.includes('hooks')) {
    throw new CliUsageError('Oh My Pi does not support packaged Markdown hooks; omit --hooks.');
  }
  const session = new TargetInstallSession(
    'omp',
    request.projectRoot,
    request.writer ?? new PreservingWriter(request.projectRoot),
    request.profile ?? 'lean',
    request.components,
    request.refreshGenerated,
  );
  const selected = new Set(request.components);

  if (selected.has('skills')) await session.copySkills(request.sources.skillManager, request.paths.skills);
  if (selected.has('steering')) await session.copySteering(request.sources.steeringSource, request.paths.steering);
  if (selected.has('rules')) {
    await copyFlatComponents(session, 'rules', request.paths.rules, await request.sources.rulesManager.listComponents());
  }
  if (selected.has('contexts')) {
    await copyFlatComponents(session, 'contexts', request.paths.contexts, await request.sources.contextManager.listComponents());
  }
  if (selected.has('agents')) {
    const destinationRoot = session.resolve(request.paths.agents);
    for (const descriptor of await request.sources.agentManager.listComponents()) {
      const destination = path.join(destinationRoot, `${descriptor.name}.md`);
      try {
        validateChildName(descriptor.name);
        const source = await fs.promises.readFile(descriptor.path, 'utf8');
        await session.write('agents', descriptor.name, destination, renderOmpAgent(parseSourceAgent(source)));
      } catch (error) {
        session.fail('agents', descriptor.name, destination, error);
      }
    }
  }

  if (selected.size > 0 || request.rootGuidancePreamble !== undefined) {
    await session.write(
      'root',
      request.paths.rootGuidance,
      session.resolve(request.paths.rootGuidance),
      buildCompactRootGuidance('omp', request.paths, selected, request.rootGuidancePreamble),
    );
  }
  return session.complete();
}
