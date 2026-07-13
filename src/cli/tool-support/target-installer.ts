import * as fs from 'fs';
import * as path from 'path';
import type { SkillManager } from '../../skills/SkillManager.js';
import type { RulesManager } from '../../rules/RulesManager.js';
import type { ContextManager } from '../../contexts/ContextManager.js';
import type { AgentManager } from '../../agents/AgentManager.js';
import type { HookLoader } from '../../hooks/HookLoader.js';
import type {
  ComponentType,
  InstallFailure,
  InstallTarget,
  ResolvedInstallPaths,
  TargetInstallReport,
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
}

export class TargetInstallSession {
  readonly report: TargetInstallReport;

  constructor(
    readonly target: InstallTarget,
    readonly projectRoot: string,
    readonly writer: PreservingWriter,
  ) {
    this.report = { target, installed: [], skipped: [], failed: [] };
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
      const outcome = await this.writer.writeIfAbsent(destination, content);
      this.report[outcome].push(this.label(destination));
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
      validateDestinationPath(this.projectRoot, destination);
      const outcome = await this.writer.copyIfAbsent(source, destination);
      this.report[outcome].push(this.label(destination));
    } catch (error) {
      this.fail(component, name, destination, error);
    }
  }

  async copySkills(sourceManager: SkillManager, configuredPath: string): Promise<void> {
    const destinationRoot = this.resolve(configuredPath);
    const skills = await sourceManager.listSkills();
    for (const skill of skills) {
      try {
        validateChildName(skill.name);
        const destination = path.join(destinationRoot, skill.name);
        validateDestinationPath(this.projectRoot, destination);
        const result = await this.writer.copyTreePreserving(skill.path, destination);
        for (const item of result.installed) {
          this.report.installed.push(this.label(path.join(destination, item)));
        }
        for (const item of result.skipped ?? []) {
          this.report.skipped.push(this.label(path.join(destination, item)));
        }
        for (const failure of result.failed) {
          this.report.failed.push({
            component: 'skills',
            name: `${skill.name}/${failure.name}`,
            path: failure.path ?? path.join(destination, failure.name),
            error: failure.error,
          });
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
      await this.copy(
        'steering',
        entry.name,
        path.join(source, entry.name),
        path.join(this.resolve(configuredPath), entry.name),
      );
    }
  }

  fail(
    component: ComponentType | 'root',
    name: string,
    destination: string,
    error: unknown,
  ): void {
    const failure: InstallFailure = {
      component,
      name,
      path: destination,
      error: error instanceof Error ? error.message : String(error),
    };
    this.report.failed.push(failure);
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
      await session.copy(
        component,
        descriptor.name,
        descriptor.path,
        path.join(destinationRoot, fileName),
      );
    } catch (error) {
      session.fail(component, descriptor.name, path.join(destinationRoot, fileName), error);
    }
  }
}
