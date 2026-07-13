import * as fs from 'fs';
import * as path from 'path';
import { findTemplate } from '../utils/find-package-root.js';
import { PreservingWriter, validateChildName } from '../utils/preserving-writer.js';
import { parseSourceAgent, renderClaudeCodeAgent } from './target-agent-renderer.js';
import {
  buildGuidanceSection,
  buildSteeringSection,
  buildTableSection,
  listMarkdownFiles,
} from './root-guidance.js';
import {
  copyFlatComponents,
  TargetInstallSession,
  type BaseTargetInstallRequest,
} from './target-installer.js';

export interface ClaudeCodeInstallRequest extends BaseTargetInstallRequest {
  rootGuidanceContent?: string;
}

export async function installClaudeCodeTarget(request: ClaudeCodeInstallRequest) {
  const session = new TargetInstallSession(
    'claude-code',
    request.projectRoot,
    request.writer ?? new PreservingWriter(request.projectRoot),
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
    return session.report;
  }
  const rootContent = await buildClaudeRootGuidance(request, selected, rootPreamble);
  await session.write(
    'root',
    request.paths.rootGuidance,
    session.resolve(request.paths.rootGuidance),
    rootContent,
  );
  return session.report;
}

async function buildClaudeRootGuidance(
  request: ClaudeCodeInstallRequest,
  selected: ReadonlySet<string>,
  preamble: string,
): Promise<string> {
  const [skills, rules, contexts, agents, steeringDocs] = await Promise.all([
    selected.has('skills') ? request.sources.skillManager.listSkills() : Promise.resolve([]),
    selected.has('rules') ? request.sources.rulesManager.listComponents() : Promise.resolve([]),
    selected.has('contexts') ? request.sources.contextManager.listComponents() : Promise.resolve([]),
    selected.has('agents') ? request.sources.agentManager.listComponents() : Promise.resolve([]),
    selected.has('steering') ? listMarkdownFiles(request.sources.steeringSource) : Promise.resolve([]),
  ]);

  const sections = [
    buildTableSection(
      'Skills',
      'On-demand guidance invoked via slash commands:',
      request.paths.skills,
      skills,
      skill => `${request.paths.skills}/${skill.name}/`,
    ),
    buildTableSection(
      'Rules',
      'Always-active coding standards:',
      request.paths.rules,
      rules,
      rule => `${request.paths.rules}/${path.basename(rule.path)}`,
    ),
    buildTableSection(
      'Contexts',
      'Switchable modes:',
      request.paths.contexts,
      contexts,
      context => `${request.paths.contexts}/${path.basename(context.path)}`,
    ),
    buildTableSection(
      'Agents',
      'Specialized roles with model routing:',
      request.paths.agents,
      agents,
      agent => `${request.paths.agents}/${path.basename(agent.path, path.extname(agent.path))}.md`,
    ),
    buildSteeringSection(request.paths.steering, steeringDocs),
    selected.has('hooks') ? buildGuidanceSection('Hooks', request.paths.hooks) : '',
  ].join('');

  const marker = '\n## MCP Tools';
  const markerIndex = preamble.indexOf(marker);
  if (markerIndex < 0) return `${preamble}${sections}`;
  return `${preamble.slice(0, markerIndex)}\n${sections}${preamble.slice(markerIndex)}`;
}

async function loadClaudeTemplate(): Promise<string> {
  const template = findTemplate('CLAUDE.md');
  if (!template) return '# CLAUDE.md — Spec-Driven Development (SDD)\n';
  return fs.promises.readFile(template, 'utf8');
}
