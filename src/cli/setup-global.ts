import * as fs from 'fs';
import { execFile } from 'child_process';
import { homedir as systemHomedir } from 'os';
import * as path from 'path';
import {
  CliUsageError,
  getTargetPolicy,
  type InstallConflict,
  type TargetInstallReport,
  type InstallTarget,
} from './install-target.js';
import { PreservingWriter, validateDestinationPath } from './utils/preserving-writer.js';
import { resolvePackageComponentPath } from './utils/find-package-root.js';
import { SkillManager } from '../skills/SkillManager.js';
import { TargetInstallSession } from './tool-support/target-installer.js';
import { RuntimeRegistrationConflictError, type RuntimeConflictReason } from './tool-support/mcp-registration.js';

export interface GlobalSetupOptions {
  target?: InstallTarget;
}

export interface GlobalSetupDependencies {
  env: NodeJS.ProcessEnv;
  homedir(): string;
  runOmpConfigPath(): Promise<string>;
}

export interface GlobalTargetLocations {
  target: InstallTarget;
  runtimeRoot: string;
  runtimeConfig: string;
  runtimeStateDirectory: string;
  skillsRoot: string;
  skillsDirectory: string;
  skillsStateDirectory: string;
  fallbackNotice?: string;
}

export interface RuntimeInstallConflict {
  component: 'runtime';
  name: 'sdd-mcp';
  path: string;
  reason: RuntimeConflictReason;
}

export interface GlobalTargetReport extends Omit<TargetInstallReport, 'conflicts'> {
  conflicts: Array<InstallConflict | RuntimeInstallConflict>;
}

const TARGETS: readonly InstallTarget[] = ['claude-code', 'codex', 'omp'];
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;

export class GlobalSetupCLI {
  private readonly dependencies: GlobalSetupDependencies;

  constructor(dependencies: Partial<GlobalSetupDependencies> = {}) {
    this.dependencies = {
      env: process.env,
      homedir: systemHomedir,
      runOmpConfigPath: runDefaultOmpConfigPath,
      ...dependencies,
    };
  }

  parseArgs(args: string[]): GlobalSetupOptions {
    if (args.length === 0) return {};
    if (args[0] !== '--target') {
      throw new CliUsageError(`Unknown setup-global argument: ${args[0]}`);
    }
    if (args.length < 2 || args[1].startsWith('--')) {
      throw new CliUsageError('--target requires a value');
    }
    if (args.length > 2) {
      if (args.slice(2).includes('--target')) {
        throw new CliUsageError('--target may be specified only once');
      }
      throw new CliUsageError(`Unknown setup-global argument: ${args[2]}`);
    }

    const target = args[1];
    if (!isInstallTarget(target)) {
      throw new CliUsageError(
        `Unsupported target "${target}". Choose claude-code, codex, or omp.`,
      );
    }
    return { target };
  }
  async run(options: GlobalSetupOptions): Promise<GlobalTargetReport[]> {
    const source = resolvePackageComponentPath('skills');
    const skills = await new SkillManager(source).listSkills();
    if (skills.length === 0) throw new Error(`No packaged Skills found at ${source}`);
    const reports: GlobalTargetReport[] = [];
    for (const target of options.target ? [options.target] : TARGETS) {
      const report: GlobalTargetReport = { target, installed: [], skipped: [], conflicts: [], failed: [], warnings: [] };
      reports.push(report);
      let destination = this.dependencies.homedir();
      let component: 'runtime' | 'skills' = 'runtime';
      try {
        const locations = await this.resolveLocations(target);
        destination = path.join(locations.runtimeRoot, locations.runtimeConfig);
        if (locations.fallbackNotice) report.warnings.push(locations.fallbackNotice);
        const runtimeWriter = new PreservingWriter(locations.runtimeRoot, { stateDirectory: locations.runtimeStateDirectory });
        await runtimeWriter.withInstallLock(async assertHeld => {
          const runtime = await runtimeWriter.installRuntimeRegistration(target, {
            ...getTargetPolicy(target).defaultPaths,
            runtimeConfig: locations.runtimeConfig,
          }, { configureClaudePermissions: false });
          report.installed.push(...runtime.installed.map(file => path.join(locations.runtimeRoot, file)));
          report.skipped.push(...runtime.skipped.map(file => path.join(locations.runtimeRoot, file)));
          report.warnings.push(...runtime.warnings);
          component = 'skills';
          destination = path.join(locations.skillsRoot, locations.skillsStateDirectory);
          const skillsWriter = new PreservingWriter(locations.skillsRoot, { stateDirectory: locations.skillsStateDirectory });
          const result = await skillsWriter.withInstallLock(async () => {
            const session = new TargetInstallSession(target, locations.skillsRoot, skillsWriter, 'lean', ['skills'], false, false);
            await session.copySkills({ listSkills: async () => skills }, locations.skillsDirectory);
            return session.complete();
          });
          report.installed.push(...result.installed.map(file => path.join(locations.skillsRoot, file)));
          report.skipped.push(...result.skipped.map(file => path.join(locations.skillsRoot, file)));
          report.conflicts.push(...result.conflicts);
          report.failed.push(...result.failed);
          report.warnings.push(...result.warnings);
          await assertHeld();
          return report;
        });
      } catch (error) {
        if (error instanceof RuntimeRegistrationConflictError) {
          report.conflicts.push({ component: 'runtime', name: 'sdd-mcp', path: error.configPath, reason: error.reason });
        } else {
          report.failed.push({
            component, name: 'sdd-mcp', path: destination,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
    return reports;
  }

  async resolveLocations(target: InstallTarget): Promise<GlobalTargetLocations> {
    const configuredHome = this.dependencies.homedir();
    const home = resolveRootPath(configuredHome, configuredHome, 'home directory');
    if (target === 'claude-code') return this.resolveClaudeLocations(home);
    if (target === 'codex') return this.resolveCodexLocations(home);
    return this.resolveOmpLocations(home);
  }

  private resolveClaudeLocations(home: string): GlobalTargetLocations {
    const override = this.dependencies.env.CLAUDE_CONFIG_DIR;
    const hasOverride = override !== undefined && override !== '';
    const personal = hasOverride
      ? resolveRootPath(override, home, 'CLAUDE_CONFIG_DIR')
      : path.join(home, '.claude');
    const locations: GlobalTargetLocations = hasOverride
      ? {
        target: 'claude-code',
        runtimeRoot: personal,
        runtimeConfig: '.claude.json',
        runtimeStateDirectory: path.join('.sdd-mcp', 'global-runtime'),
        skillsRoot: personal,
        skillsDirectory: 'skills',
        skillsStateDirectory: path.join('.sdd-mcp', 'global-skills'),
      }
      : {
        target: 'claude-code',
        runtimeRoot: home,
        runtimeConfig: '.claude.json',
        runtimeStateDirectory: path.join('.claude', '.sdd-mcp', 'global-runtime'),
        skillsRoot: personal,
        skillsDirectory: 'skills',
        skillsStateDirectory: path.join('.sdd-mcp', 'global-skills'),
      };
    validateLocations(locations);
    return locations;
  }

  private resolveCodexLocations(home: string): GlobalTargetLocations {
    const override = this.dependencies.env.CODEX_HOME;
    const runtimeRoot = override !== undefined && override !== ''
      ? resolveRootPath(override, home, 'CODEX_HOME')
      : path.join(home, '.codex');
    const locations: GlobalTargetLocations = {
      target: 'codex',
      runtimeRoot,
      runtimeConfig: 'config.toml',
      runtimeStateDirectory: path.join('.sdd-mcp', 'global-runtime'),
      skillsRoot: path.join(home, '.agents'),
      skillsDirectory: 'skills',
      skillsStateDirectory: path.join('.sdd-mcp', 'global-skills'),
    };
    validateLocations(locations);
    return locations;
  }
  private async resolveOmpLocations(home: string): Promise<GlobalTargetLocations> {
    let discovered: string | undefined;
    try {
      discovered = parseOmpDiscoveryOutput(await this.dependencies.runOmpConfigPath());
    } catch {
      discovered = undefined;
    }

    if (discovered !== undefined) {
      const root = resolveRootPath(discovered, home, 'OMP discovered agent directory');
      const locations = createOmpLocations(root);
      validateLocations(locations);
      return locations;
    }

    const root = this.resolveOmpFallback(home);
    const locations = createOmpLocations(root);
    locations.fallbackNotice = `OMP discovery unavailable; using fallback directory: ${root}`;
    validateLocations(locations);
    return locations;
  }

  private resolveOmpFallback(home: string): string {
    const rawProfile = this.dependencies.env.OMP_PROFILE !== undefined
      ? this.dependencies.env.OMP_PROFILE
      : this.dependencies.env.PI_PROFILE ?? '';
    const normalizedProfile = normalizeOmpProfile(rawProfile);
    const configuredDirectory = this.dependencies.env.PI_CONFIG_DIR || '.omp';
    const configRoot = resolveHomeRelativePath(configuredDirectory, home, 'PI_CONFIG_DIR');

    if (normalizedProfile !== undefined) {
      return resolveContainedPath(
        configRoot,
        'profiles',
        normalizedProfile,
        'agent',
      );
    }

    const agentOverride = this.dependencies.env.PI_CODING_AGENT_DIR;
    if (agentOverride) {
      return resolveRootPath(agentOverride, home, 'PI_CODING_AGENT_DIR');
    }
    return resolveContainedPath(configRoot, 'agent');
  }
}

export async function mainGlobalSetup(args = process.argv.slice(3)): Promise<void> {
  try {
    const cli = new GlobalSetupCLI();
    const reports = await cli.run(cli.parseArgs(args));
    for (const report of reports) {
      console.log(`\n${report.target}`);
      for (const warning of report.warnings) console.log(`Notice: ${warning}`);
      if (report.installed.length || report.skipped.length) {
        console.log('Installed / unchanged');
        for (const file of report.installed) console.log(`  Installed: ${file}`);
        for (const file of report.skipped) console.log(`  Unchanged: ${file}`);
      }
      if (report.conflicts.length) {
        console.log('Preserved conflicts');
        for (const conflict of report.conflicts) console.log(`  ${conflict.path} (${conflict.reason})`);
      }
      if (report.failed.length) {
        console.error('Failures');
        for (const failure of report.failed) console.error(`  ${failure.path}: ${failure.error}`);
      }
    }
    process.exitCode = reports.some(report => report.failed.length || report.conflicts.length) ? 1 : 0;
  } catch (error) {
    console.error(`Global setup failed: ${errorMessage(error)}`);
    process.exitCode = 1;
  }
}

function runDefaultOmpConfigPath(): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'omp',
      ['config', 'path'],
      { encoding: 'utf8', shell: false },
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(stdout);
      },
    );
  });
}

function parseOmpDiscoveryOutput(output: string): string | undefined {
  let candidate = output;
  if (candidate.endsWith('\r\n')) candidate = candidate.slice(0, -2);
  else if (candidate.endsWith('\n') || candidate.endsWith('\r')) candidate = candidate.slice(0, -1);

  if (!candidate || CONTROL_CHARACTER.test(candidate) || !path.isAbsolute(candidate)) {
    return undefined;
  }
  return candidate;
}

function normalizeOmpProfile(rawProfile: string): string | undefined {
  const normalized = rawProfile.trim();
  if (CONTROL_CHARACTER.test(rawProfile) && normalized !== '') {
    throw new CliUsageError('OMP profile must contain no control characters');
  }
  if (normalized === '' || normalized === 'default') return undefined;
  if (
    normalized === '.'
    || normalized === '..'
    || normalized.includes('/')
    || normalized.includes('\\')
  ) {
    throw new CliUsageError(`Unsafe OMP profile: ${rawProfile}`);
  }
  return normalized;
}

function resolveHomeRelativePath(value: string, home: string, setting: string): string {
  if (CONTROL_CHARACTER.test(value) || path.isAbsolute(value)) {
    throw new CliUsageError(`${setting} must be a control-free home-relative directory`);
  }
  const destination = path.resolve(home, value);
  try {
    validateDestinationPath(home, destination);
  } catch (error) {
    throw new CliUsageError(`${setting} is unsafe: ${errorMessage(error)}`);
  }
  return canonicalizeExistingAncestors(destination);
}

function resolveContainedPath(root: string, ...segments: string[]): string {
  const destination = path.join(root, ...segments);
  try {
    validateDestinationPath(root, destination);
  } catch (error) {
    throw new CliUsageError(`Unsafe OMP fallback destination: ${errorMessage(error)}`);
  }
  return canonicalizeExistingAncestors(destination);
}

function createOmpLocations(root: string): GlobalTargetLocations {
  return {
    target: 'omp',
    runtimeRoot: root,
    runtimeConfig: 'mcp.json',
    runtimeStateDirectory: path.join('.sdd-mcp', 'global-runtime'),
    skillsRoot: root,
    skillsDirectory: 'skills',
    skillsStateDirectory: path.join('.sdd-mcp', 'global-skills'),
  };
}

function isInstallTarget(value: string): value is InstallTarget {
  return TARGETS.includes(value as InstallTarget);
}

function resolveRootPath(value: string, home: string, setting: string): string {
  if (!value || CONTROL_CHARACTER.test(value)) {
    throw new CliUsageError(`${setting} must be non-empty and contain no control characters`);
  }

  let expanded = value;
  if (value === '~') expanded = home;
  else if (value.startsWith('~/')) expanded = path.join(home, value.slice(2));

  if (!path.isAbsolute(expanded)) {
    throw new CliUsageError(`${setting} must be an absolute path or use ~ or ~/...`);
  }

  try {
    return canonicalizeExistingAncestors(expanded);
  } catch (error) {
    throw new CliUsageError(`Cannot resolve ${setting}: ${errorMessage(error)}`);
  }
}

function canonicalizeExistingAncestors(value: string): string {
  const missingSegments: string[] = [];
  let existing = path.normalize(value);

  while (!fs.existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) break;
    missingSegments.unshift(path.basename(existing));
    existing = parent;
  }

  const canonical = fs.realpathSync(existing);
  return path.join(canonical, ...missingSegments);
}

function validateLocations(locations: GlobalTargetLocations): void {
  try {
    validateDestinationPath(
      locations.runtimeRoot,
      path.join(locations.runtimeRoot, locations.runtimeConfig),
    );
    validateDestinationPath(
      locations.runtimeRoot,
      path.join(locations.runtimeRoot, locations.runtimeStateDirectory),
    );
    validateDestinationPath(
      locations.skillsRoot,
      path.join(locations.skillsRoot, locations.skillsDirectory),
    );
    validateDestinationPath(
      locations.skillsRoot,
      path.join(locations.skillsRoot, locations.skillsStateDirectory),
    );
  } catch (error) {
    throw new CliUsageError(errorMessage(error));
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
