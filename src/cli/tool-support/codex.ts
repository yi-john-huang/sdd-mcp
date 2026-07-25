import * as fs from 'fs';
import * as path from 'path';
import { findTemplate } from '../utils/find-package-root.js';
import { PreservingWriter, validateChildName } from '../utils/preserving-writer.js';
import { parseSourceAgent, renderCodexAgent } from './target-agent-renderer.js';
import { buildCompactRootGuidance } from './root-guidance.js';
import {
  copyFlatComponents,
  TargetInstallSession,
  type BaseTargetInstallRequest,
} from './target-installer.js';

const CODEX_HOOK_RUNNER_FILE = 'sdd-hook-runner.mjs';
const GIT_ROOT_EXPRESSION = '$(git rev-parse --show-toplevel)';
/**
 * Load the template preamble for AGENTS.md
 */
function loadPreamble(): string {
  try {
    const templatePath = findTemplate('codex-AGENTS.md');
    if (templatePath) {
      return fs.readFileSync(templatePath, 'utf-8');
    }
    console.log('  ⚠️  AGENTS.md template not found, using minimal header');
  } catch (error) {
    console.error('  ⚠️  Failed to read AGENTS.md template:', (error as Error).message);
  }
  return '# AGENTS.md — Spec-Driven Development (SDD)\n\n';
}


export interface CodexInstallRequest extends BaseTargetInstallRequest {
  rootGuidancePreamble?: string;
  hookRunnerContent?: string;
}

export async function installCodexTarget(request: CodexInstallRequest) {
  const writer = request.writer ?? new PreservingWriter(request.projectRoot);
  return writer.withInstallLock(() => installCodexTargetLocked({ ...request, writer }));
}

async function installCodexTargetLocked(request: CodexInstallRequest & { writer: PreservingWriter }) {
  const session = new TargetInstallSession(
    'codex',
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
      const destination = path.join(destinationRoot, `${descriptor.name}.toml`);
      try {
        validateChildName(descriptor.name);
        const source = await fs.promises.readFile(descriptor.path, 'utf8');
        const rendered = renderCodexAgent(parseSourceAgent(source));
        await session.write('agents', descriptor.name, destination, rendered);
      } catch (error) {
        session.fail('agents', descriptor.name, destination, error);
      }
    }
  }
  if (selected.has('hooks')) {
    const runnerDestination = session.resolve(path.join(request.paths.hooks, CODEX_HOOK_RUNNER_FILE));
    const configDestination = session.resolve(
      path.join(path.dirname(request.paths.hooks), 'hooks.json'),
    );
    let runnerContent: string | null = request.hookRunnerContent ?? null;
    let templateLoadFailed = false;
    if (request.hookRunnerContent === undefined) {
      try {
        runnerContent = await loadHookRunnerTemplate();
      } catch (error) {
        templateLoadFailed = true;
        session.fail('hooks', CODEX_HOOK_RUNNER_FILE, runnerDestination, error);
      }
    }
    if (runnerContent === null && !templateLoadFailed) {
      session.fail('hooks', CODEX_HOOK_RUNNER_FILE, runnerDestination, new Error('Codex hook runner template not found'));
    } else if (runnerContent !== null) {
      await session.write('hooks', CODEX_HOOK_RUNNER_FILE, runnerDestination, runnerContent);
      await session.write(
        'hooks',
        'hooks.json',
        configDestination,
        renderCodexHooksConfig(request.paths.hooks, request.projectRoot),
      );
    }
  }

  if (selected.size > 0 || request.rootGuidancePreamble !== undefined) {
    await session.write(
      'root',
      request.paths.rootGuidance,
      session.resolve(request.paths.rootGuidance),
      buildCompactRootGuidance(
        'codex',
        request.paths,
        selected,
        request.rootGuidancePreamble ?? loadPreamble(),
      ),
    );
  }
  return session.complete(request.paths);
}


export function renderCodexHooksConfig(hooksPath: string, projectRoot = process.cwd()): string {
  const runner = resolveHookRunnerCommandPath(hooksPath, projectRoot);
  const command = (event: 'session-start' | 'stop') => `node ${runner} ${event}`;
  return `${JSON.stringify({
    hooks: {
      SessionStart: [{
        matcher: 'startup|resume',
        hooks: [{ type: 'command', command: command('session-start') }],
      }],
      Stop: [{
        hooks: [{ type: 'command', command: command('stop') }],
      }],
    },
  }, null, 2)}\n`;
}

function resolveHookRunnerCommandPath(hooksPath: string, projectRoot: string): string {
  const absoluteProjectRoot = path.resolve(projectRoot);
  const absoluteRunner = path.resolve(absoluteProjectRoot, hooksPath, CODEX_HOOK_RUNNER_FILE);
  const relativeRunner = path.relative(absoluteProjectRoot, absoluteRunner).split(path.sep).join('/');
  if (
    path.isAbsolute(hooksPath)
    || relativeRunner === ''
    || relativeRunner === '..'
    || relativeRunner.startsWith('../')
  ) {
    return shellQuote(absoluteRunner);
  }
  return `"${GIT_ROOT_EXPRESSION}/${shellDoubleQuote(relativeRunner)}"`;
}

function shellDoubleQuote(value: string): string {
  if (value.includes('\n') || value.includes('\r') || value.includes('\0')) {
    throw new Error('Hook path contains an unsupported control character');
  }
  return value.replace(/(["\\$`])/g, '\\$1');
}

function shellQuote(value: string): string {
  if (value.includes('\n') || value.includes('\r') || value.includes('\0')) {
    throw new Error('Hook path contains an unsupported control character');
  }
  return `'${value.replaceAll("'", "'\\''")}'`;
}
async function loadHookRunnerTemplate(): Promise<string | null> {
  const template = findTemplate('codex-hook-runner.js');
  if (!template) return null;
  return fs.promises.readFile(template, 'utf8');
}
