import * as fs from 'fs';
import * as path from 'path';
import type { SkillManager } from '../../skills/SkillManager.js';
import type { RulesManager } from '../../rules/RulesManager.js';
import type { ContextManager } from '../../contexts/ContextManager.js';
import type { AgentManager } from '../../agents/AgentManager.js';
import type { HookLoader } from '../../hooks/HookLoader.js';
import {
  ROLE_MODEL_ROUTES,
  SKILL_AGENT_ROUTES,
  type ComponentType,
  type InstallFailure,
  type InstallProfile,
  type InstallTarget,
  type ResolvedInstallPaths,
  type TargetInstallReport,
} from '../install-target.js';
import { PreservingWriter, validateChildName, validateDestinationPath } from '../utils/preserving-writer.js';

export interface TargetSources {
  skillManager: SkillManager;
  rulesManager: RulesManager;
  contextManager: ContextManager;
  agentManager: AgentManager;
  hookLoader: HookLoader;
  steeringSource: string;
}

export interface BaseTargetInstallRequest {
  projectRoot: string;
  paths: ResolvedInstallPaths;
  components: readonly ComponentType[];
  sources: TargetSources;
  writer?: PreservingWriter;
  profile?: InstallProfile;
  refreshGenerated?: boolean;
}

export class TargetInstallSession {
  readonly report: TargetInstallReport;

  constructor(
    readonly target: InstallTarget,
    readonly projectRoot: string,
    readonly writer: PreservingWriter,
    profile: InstallProfile,
    components: readonly ComponentType[],
    refreshGenerated = false,
  ) {
    this.report = { target, installed: [], skipped: [], failed: [], conflicts: [] };
    writer.beginTarget(target, profile, components, refreshGenerated);
  }

  resolve(configuredPath: string): string {
    return path.resolve(this.projectRoot, configuredPath);
  }

  label(destination: string): string {
    const relative = path.relative(this.projectRoot, destination);
    return (relative || path.basename(destination)).split(path.sep).join('/');
  }

  async write(
    component: ComponentType | 'root',
    name: string,
    destination: string,
    content: string,
  ): Promise<void> {
    try {
      validateDestinationPath(this.projectRoot, destination);
      const result = await this.writer.writeManaged(this.target, component, name, destination, content);
      this.report[result.outcome].push(this.label(destination));
      if (result.conflict) this.report.conflicts.push(result.conflict);
    } catch (error) {
      this.fail(component, name, destination, error);
    }
  }

  async copy(
    component: ComponentType | 'root',
    name: string,
    source: string,
    destination: string,
  ): Promise<void> {
    try {
      await this.write(component, name, destination, await fs.promises.readFile(source, 'utf8'));
    } catch (error) {
      this.fail(component, name, destination, error);
    }
  }

  async copySkills(sourceManager: SkillManager, configuredPath: string): Promise<void> {
    const destinationRoot = this.resolve(configuredPath);
    for (const skill of await sourceManager.listSkills()) {
      try {
        validateChildName(skill.name);
        await this.copySkillTree(skill.name, skill.path, path.join(destinationRoot, skill.name), '');
        if (this.target === 'codex') {
          await this.write(
            'skills',
            `${skill.name}/agents/openai.yaml`,
            path.join(destinationRoot, skill.name, 'agents', 'openai.yaml'),
            renderCodexSkillPolicy(skill.name),
          );
        }
      } catch (error) {
        this.fail('skills', skill.name, path.join(destinationRoot, skill.name), error);
      }
    }
  }

  async copySteering(source: string, configuredPath: string): Promise<void> {
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(source, { withFileTypes: true });
    } catch (error) {
      this.fail('steering', 'steering', this.resolve(configuredPath), error);
      return;
    }
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
      try {
        validateChildName(entry.name);
      } catch (error) {
        this.fail('steering', entry.name, this.resolve(configuredPath), error);
        continue;
      }
      await this.copy('steering', entry.name, path.join(source, entry.name), path.join(this.resolve(configuredPath), entry.name));
    }
  }

  async complete(): Promise<TargetInstallReport> {
    try {
      this.report.conflicts.push(...await this.writer.finalizeTarget(this.target));
    } catch (error) {
      this.fail('root', 'install-manifest.json', path.join(this.projectRoot, '.sdd-mcp/install-manifest.json'), error);
    }
    return this.report;
  }

  fail(component: ComponentType | 'root', name: string, destination: string, error: unknown): void {
    const failure: InstallFailure = {
      component,
      name,
      path: destination,
      error: error instanceof Error ? error.message : String(error),
    };
    this.report.failed.push(failure);
  }

  private async copySkillTree(skillName: string, source: string, destination: string, relative: string): Promise<void> {
    validateDestinationPath(this.projectRoot, destination);
    const entries = await fs.promises.readdir(source, { withFileTypes: true });
    for (const entry of entries) {
      validateChildName(entry.name);
      const sourcePath = path.join(source, entry.name);
      const destinationPath = path.join(destination, entry.name);
      const nested = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await this.copySkillTree(skillName, sourcePath, destinationPath, nested);
      } else if (entry.isFile()) {
        const sourceContent = await fs.promises.readFile(sourcePath, 'utf8');
        const content = entry.name === 'SKILL.md'
          ? renderTargetSkill(this.target, skillName, sourceContent)
          : sourceContent;
        await this.write('skills', `${skillName}/${nested}`, destinationPath, content);
      }
    }
  }
}

export async function copyFlatComponents(
  session: TargetInstallSession,
  component: 'rules' | 'contexts',
  configuredPath: string,
  descriptors: Array<{ name: string; path: string }>,
): Promise<void> {
  const destinationRoot = session.resolve(configuredPath);
  for (const descriptor of descriptors) {
    const fileName = path.basename(descriptor.path);
    try {
      validateChildName(fileName);
      const source = await fs.promises.readFile(descriptor.path, 'utf8');
      const content = component === 'rules' ? renderTargetRule(session.target, fileName, source) : source;
      await session.write(component, descriptor.name, path.join(destinationRoot, fileName), content);
    } catch (error) {
      session.fail(component, descriptor.name, path.join(destinationRoot, fileName), error);
    }
  }
}

const RULE_SCOPES: Readonly<Record<string, readonly string[]>> = {
  'coding-style.md': ['**/*.{js,jsx,ts,tsx,py,go,rs,java,kt,c,cc,cpp,h,hpp}', '**/*.{json,yaml,yml,toml}'],
  'error-handling.md': ['**/*.{js,jsx,ts,tsx,py,go,rs,java,kt,c,cc,cpp,h,hpp}'],
  'security.md': ['**/*.{js,jsx,ts,tsx,py,go,rs,java,kt,c,cc,cpp,h,hpp,json,yaml,yml,toml}'],
  'testing.md': ['**/{test,tests,spec,__tests__}/**/*', '**/*.{test,spec}.{js,jsx,ts,tsx,py}', '**/src/**/*'],
};

export function renderTargetRule(target: InstallTarget, fileName: string, source: string): string {
  const globs = RULE_SCOPES[fileName] ?? ['**/*'];
  const body = stripFrontmatter(source).trim();
  if (target === 'claude-code') {
    return `---\npaths:\n${globs.map(glob => `  - ${JSON.stringify(glob)}`).join('\n')}\n---\n\n${body}\n`;
  }
  if (target === 'omp') {
    return `---\ndescription: SDD ${path.basename(fileName, '.md')} guidance\nglobs:\n${globs.map(glob => `  - ${JSON.stringify(glob)}`).join('\n')}\nalwaysApply: false\n---\n\n${body}\n`;
  }
  return `${body}\n`;
}

export function renderTargetSkill(target: InstallTarget, skillName: string, source: string): string {
  const role = SKILL_AGENT_ROUTES[skillName];
  const extra: string[] = ['disable-model-invocation: true'];
  let execution = '';
  if (role && target === 'claude-code') {
    extra.push(`model: ${ROLE_MODEL_ROUTES[role].claudeCode.model}`);
    execution = '\nExecute in this turn; do not spawn a second specialist.\n';
  } else if (role && target === 'omp' && ROLE_MODEL_ROUTES[role].taskClass === 'advisor') {
    execution = `\nRun inline by default. The project advisor at .omp/agents/${role}.md is explicit opt-in only; if the user invokes it, allow one specialistDepth: 1 handoff without nesting or retry.\n`;
  } else if (role && target === 'codex' && ROLE_MODEL_ROUTES[role].taskClass === 'advisor') {
    execution = `\nRequest the configured ${role} custom agent once with specialistDepth: 1; nested delegation is prohibited. If unavailable, record the fallback and continue inline.\n`;
  }
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return `---\n${extra.join('\n')}\n---\n\n${source.trim()}${execution}\n`;
  const metadata = match[1].split(/\r?\n/).filter(line => !/^(disable-model-invocation|model):/.test(line));
  return `---\n${metadata.join('\n')}\n${extra.join('\n')}\n---\n\n${match[2].trim()}${execution}\n`;
}

function renderCodexSkillPolicy(skillName: string): string {
  const role = SKILL_AGENT_ROUTES[skillName];
  const route = role ? ROLE_MODEL_ROUTES[role] : undefined;
  const description = route?.taskClass === 'advisor'
    ? `Explicitly invoke the configured ${role} agent once; nested delegation is prohibited.`
    : 'Execute inline in the current turn.';
  return `policy:\n  allow_implicit_invocation: false\ninterface:\n  description: ${JSON.stringify(description)}\n`;
}

function stripFrontmatter(content: string): string {
  const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?([\s\S]*)$/);
  return match ? match[1] : content;
}
