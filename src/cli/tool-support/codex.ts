import * as fs from 'fs';
import * as path from 'path';
import { SkillManager } from '../../skills/SkillManager.js';
import { RulesManager } from '../../rules/RulesManager.js';
import { AgentManager } from '../../agents/AgentManager.js';
import { findTemplate } from '../utils/find-package-root.js';
import { PreservingWriter, validateChildName } from '../utils/preserving-writer.js';
import { parseSourceAgent, renderCodexAgent } from './target-agent-renderer.js';
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

/**
 * References to manager instances needed for generating AGENTS.md
 */
export interface ManagerRefs {
  skillManager: SkillManager;
  rulesManager: RulesManager;
  agentManager: AgentManager;
  listSteering: () => Promise<string[]>;
}

/**
 * Effective install paths used by the installer.
 * These may differ from defaults when the user passes --path, --rules-path, etc.
 */
export interface InstallPaths {
  skillsPath: string;
  rulesPath: string;
  agentsPath: string;
  steeringPath: string;
  contextsPath?: string;
  hooksPath?: string;
  agentExtension?: '.md' | '.toml';
}

/**
 * Which component types were actually installed in this run.
 * Only installed components are rendered in AGENTS.md.
 */
export interface InstalledComponents {
  skills: boolean;
  rules: boolean;
  agents: boolean;
  steering: boolean;
  contexts?: boolean;
  hooks?: boolean;
}

export interface CodexGuidanceFailure {
  name: string;
  path: string;
  error: string;
}

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

/**
 * Generate AGENTS.md in the project root for OpenAI Codex CLI.
 *
 * Produces a lightweight summary file containing component names,
 * descriptions, and file path references. Codex CLI reads referenced
 * files on demand — no content duplication needed.
 *
 * Only sections for actually-installed component types are included,
 * and paths reflect the effective install targets (not hardcoded defaults).
 */
export async function generateCodexAgentsMd(
  projectRoot: string,
  managers: ManagerRefs,
  paths: InstallPaths,
  installed: InstalledComponents,
): Promise<CodexGuidanceFailure[]> {
  const targetPath = path.join(projectRoot, 'AGENTS.md');
  const failures: CodexGuidanceFailure[] = [];

  if (fs.existsSync(targetPath)) {
    console.log('  ⏭️  AGENTS.md already exists, skipping');
    return failures;
  }

  let content = loadPreamble();

  try {
    const [skills, rules, agents, steeringDocs] = await Promise.all([
      installed.skills ? managers.skillManager.listSkills() : Promise.resolve([]),
      installed.rules ? managers.rulesManager.listComponents() : Promise.resolve([]),
      installed.agents ? managers.agentManager.listComponents() : Promise.resolve([]),
      installed.steering ? managers.listSteering() : Promise.resolve([]),
    ]);

    content += buildTableSection('Skills', 'Workflow guidance invoked via slash commands:', paths.skillsPath,
      skills, (s) => `${paths.skillsPath}/${s.name}/`);

    content += buildTableSection('Rules', 'Always-active coding standards:', paths.rulesPath,
      rules, (r) => `${paths.rulesPath}/${path.basename(r.path)}`);

    content += buildTableSection('Agents', 'Specialized AI personas:', paths.agentsPath,
      agents, (a) => `${paths.agentsPath}/${path.basename(a.path, path.extname(a.path))}${paths.agentExtension ?? path.extname(a.path)}`);

    content += buildSteeringSection(paths.steeringPath, steeringDocs);
    if (installed.contexts) content += buildGuidanceSection('Contexts', paths.contextsPath);
    if (installed.hooks) content += buildGuidanceSection('Hooks', paths.hooksPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('  ⚠️  Failed to gather component metadata:', message);
    failures.push({ name: 'metadata', path: targetPath, error: message });
  }

  try {
    fs.writeFileSync(targetPath, content, { encoding: 'utf-8', flag: 'wx' });
    console.log('  ✅ Created AGENTS.md for Codex CLI');
  } catch (error) {
    if (isAlreadyExists(error)) {
      console.log('  ⏭️  AGENTS.md already exists, skipping');
      return failures;
    }
    const message = error instanceof Error ? error.message : String(error);
    failures.push({ name: 'AGENTS.md', path: targetPath, error: message });
    console.error('  ❌ Failed to create AGENTS.md:', message);
  }
  return failures;
}

export interface CodexInstallRequest extends BaseTargetInstallRequest {
  rootGuidancePreamble?: string;
  hookRunnerContent?: string;
}

export async function installCodexTarget(request: CodexInstallRequest) {
  const session = new TargetInstallSession(
    'codex',
    request.projectRoot,
    request.writer ?? new PreservingWriter(),
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
    const runnerDestination = session.resolve(path.join(request.paths.hooks, 'sdd-hook-runner.js'));
    const configDestination = session.resolve(
      path.join(path.dirname(request.paths.hooks), 'hooks.json'),
    );
    const runnerContent = request.hookRunnerContent ?? loadHookRunnerTemplate();
    if (runnerContent === null) {
      session.fail('hooks', 'sdd-hook-runner.js', runnerDestination, new Error('Codex hook runner template not found'));
    } else {
      await session.write('hooks', 'sdd-hook-runner.js', runnerDestination, runnerContent);
      await session.write(
        'hooks',
        'hooks.json',
        configDestination,
        renderCodexHooksConfig(request.paths.hooks),
      );
    }
  }

  const rootContent = await buildCodexRootGuidance(
    request,
    selected,
    request.rootGuidancePreamble ?? loadPreamble(),
  );
  await session.write(
    'root',
    request.paths.rootGuidance,
    session.resolve(request.paths.rootGuidance),
    rootContent,
  );
  return session.report;
}

async function buildCodexRootGuidance(
  request: CodexInstallRequest,
  selected: ReadonlySet<string>,
  preamble: string,
): Promise<string> {
  const [skills, rules, agents, steeringDocs] = await Promise.all([
    selected.has('skills') ? request.sources.skillManager.listSkills() : Promise.resolve([]),
    selected.has('rules') ? request.sources.rulesManager.listComponents() : Promise.resolve([]),
    selected.has('agents') ? request.sources.agentManager.listComponents() : Promise.resolve([]),
    selected.has('steering') ? listMarkdownFiles(request.sources.steeringSource) : Promise.resolve([]),
  ]);
  let content = preamble;
  content += buildTableSection(
    'Skills',
    'Workflow guidance invoked as skills:',
    request.paths.skills,
    skills,
    skill => `${request.paths.skills}/${skill.name}/`,
  );
  content += buildTableSection(
    'Rules',
    'Always-active project guidance:',
    request.paths.rules,
    rules,
    rule => `${request.paths.rules}/${path.basename(rule.path)}`,
  );
  content += buildTableSection(
    'Agents',
    'Specialized AI personas with role-specific model routing:',
    request.paths.agents,
    agents,
    agent => `${request.paths.agents}/${path.basename(agent.path, path.extname(agent.path))}.toml`,
  );
  content += buildSteeringSection(request.paths.steering, steeringDocs);
  if (selected.has('contexts')) content += buildGuidanceSection('Contexts', request.paths.contexts);
  if (selected.has('hooks')) content += buildGuidanceSection('Hooks', request.paths.hooks);
  return content;
}

export function renderCodexHooksConfig(hooksPath: string): string {
  const runner = `${hooksPath.replaceAll('\\', '/')}/sdd-hook-runner.js`;
  const command = (event: 'session-start' | 'stop') => `node ${shellQuote(runner)} ${event}`;
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

function shellQuote(value: string): string {
  if (value.includes('\n') || value.includes('\r') || value.includes('\0')) {
    throw new Error('Hook path contains an unsupported control character');
  }
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function loadHookRunnerTemplate(): string | null {
  const template = findTemplate('codex-hook-runner.js');
  return template ? fs.readFileSync(template, 'utf8') : null;
}


function isAlreadyExists(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST';
}
