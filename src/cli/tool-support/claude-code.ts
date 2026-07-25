import * as fs from 'fs';
import * as path from 'path';
import { findTemplate } from '../utils/find-package-root.js';
import { PreservingWriter, validateChildName } from '../utils/preserving-writer.js';
import { parseSourceAgent, renderClaudeCodeAgent } from './target-agent-renderer.js';
import { buildCompactRootGuidance } from './root-guidance.js';
import {
  copyFlatComponents,
  TargetInstallSession,
  type BaseTargetInstallRequest,
} from './target-installer.js';

export interface ClaudeCodeInstallRequest extends BaseTargetInstallRequest {
  rootGuidanceContent?: string;
}

export async function installClaudeCodeTarget(request: ClaudeCodeInstallRequest) {
  const writer = request.writer ?? new PreservingWriter(request.projectRoot);
  return writer.withInstallLock(() => installClaudeCodeTargetLocked({ ...request, writer }));
}

async function installClaudeCodeTargetLocked(request: ClaudeCodeInstallRequest & { writer: PreservingWriter }) {
  const session = new TargetInstallSession(
    'claude-code',
    request.projectRoot,
    request.writer,
    request.profile ?? 'lean',
    request.components,
    request.refreshGenerated,
  );
  const selected = new Set(request.components);

  if (selected.has('skills')) {
    await session.copySkills(request.sources.skillManager, request.paths.skills);
  }
  if (selected.has('steering')) {
    await session.copySteering(request.sources.steeringSource, request.paths.steering);
  }
  if (selected.has('rules')) {
    await copyFlatComponents(
      session,
      'rules',
      request.paths.rules,
      await request.sources.rulesManager.listComponents(),
    );
  }
  if (selected.has('contexts')) {
    await copyFlatComponents(
      session,
      'contexts',
      request.paths.contexts,
      await request.sources.contextManager.listComponents(),
    );
  }
  if (selected.has('agents')) {
    const destinationRoot = session.resolve(request.paths.agents);
    for (const descriptor of await request.sources.agentManager.listComponents()) {
      const destination = path.join(destinationRoot, `${descriptor.name}.md`);
      try {
        validateChildName(descriptor.name);
        const source = await fs.promises.readFile(descriptor.path, 'utf8');
        const rendered = renderClaudeCodeAgent(parseSourceAgent(source));
        await session.write('agents', descriptor.name, destination, rendered);
      } catch (error) {
        session.fail('agents', descriptor.name, destination, error);
      }
    }
  }
  if (selected.has('hooks')) {
    const destinationRoot = session.resolve(request.paths.hooks);
    for (const hook of await request.sources.hookLoader.listComponents()) {
      const fileName = path.basename(hook.path);
      const destination = path.join(destinationRoot, hook.event, fileName);
      try {
        validateChildName(hook.event);
        validateChildName(fileName);
        await session.copy('hooks', hook.name, hook.path, destination);
      } catch (error) {
        session.fail('hooks', hook.name, destination, error);
      }
    }
  }

  if (selected.size > 0 || request.rootGuidanceContent !== undefined) {
    let rootPreamble: string;
    try {
      rootPreamble = request.rootGuidanceContent ?? await loadClaudeTemplate();
    } catch (error) {
      session.fail(
        'root',
        request.paths.rootGuidance,
        session.resolve(request.paths.rootGuidance),
        error,
      );
      return session.complete(request.paths);
    }
    await session.write(
      'root',
      request.paths.rootGuidance,
      session.resolve(request.paths.rootGuidance),
      buildCompactRootGuidance('claude-code', request.paths, selected, rootPreamble),
    );
  }
  return session.complete(request.paths);
}


async function loadClaudeTemplate(): Promise<string> {
  const template = findTemplate('CLAUDE.md');
  if (!template) return '# CLAUDE.md — Spec-Driven Development (SDD)\n';
  return fs.promises.readFile(template, 'utf8');
}
