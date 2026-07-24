import * as path from 'path';

export type InstallTarget = 'codex' | 'claude-code' | 'omp';
export type InstallProfile = 'lean' | 'full';
export type ComponentType = 'skills' | 'steering' | 'rules' | 'contexts' | 'agents' | 'hooks';
export type AgentRole =
  | 'planner'
  | 'architect'
  | 'reviewer'
  | 'security-auditor'
  | 'implementer'
  | 'tdd-guide';

export interface ResolvedInstallPaths {
  skills: string;
  steering: string;
  rules: string;
  contexts: string;
  agents: string;
  hooks: string;
  rootGuidance: string;
  runtimeConfig: string;
  runtimePermissionConfig?: string;
}

export interface PathOverrides {
  skills?: string;
  steering?: string;
  rules?: string;
  contexts?: string;
  agents?: string;
  hooks?: string;
}

export interface TargetPolicy {
  target: InstallTarget;
  defaultPaths: ResolvedInstallPaths;
  ignoreEntries: readonly string[];
}

export interface TargetResolutionOptions {
  target?: InstallTarget;
  legacyCodex: boolean;
  profile: InstallProfile;
}

export interface TargetPromptIO {
  isInteractive(): boolean;
  chooseTarget(): Promise<InstallTarget | null>;
  writeNotice(message: string): void;
}

export interface ResolvedTarget {
  target: InstallTarget;
  source: 'explicit' | 'legacy-codex' | 'interactive' | 'compatibility-default';
}

export interface InstallFailure {
  component: ComponentType | 'root' | 'runtime';
  name: string;
  path: string;
  error: string;
}

export interface InstallConflict {
  component: ComponentType | 'root';
  name: string;
  path: string;
  reason: 'modified' | 'legacy-unmanaged' | 'obsolete-modified';
}

export interface TargetInstallReport {
  target: InstallTarget;
  installed: string[];
  skipped: string[];
  failed: InstallFailure[];
  conflicts: InstallConflict[];
  warnings: string[];
}

export class CliUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CliUsageError';
  }
}

export class InstallCancelledError extends Error {
  constructor() {
    super('Installation cancelled');
    this.name = 'InstallCancelledError';
  }
}

export const SUPPORTED_CODEX_MODELS = [
  'gpt-5.6-sol',
  'gpt-5.6-terra',
  'gpt-5.6-luna',
] as const;

export const DEFAULT_CODEX_MODEL = 'gpt-5.6-sol' as const;

export const ROLE_MODEL_ROUTES = {
  planner: route('advisor', 'gpt-5.6-sol', 'xhigh', 'opus'),
  architect: route('advisor', 'gpt-5.6-sol', 'xhigh', 'opus'),
  reviewer: route('advisor', 'gpt-5.6-sol', 'xhigh', 'opus'),
  'security-auditor': route('advisor', 'gpt-5.6-sol', 'xhigh', 'opus'),
  implementer: route('implementation', DEFAULT_CODEX_MODEL, 'medium', 'sonnet'),
  'tdd-guide': route('implementation', DEFAULT_CODEX_MODEL, 'medium', 'sonnet'),
} as const;

function route(
  taskClass: 'advisor' | 'implementation' | 'local',
  model: typeof SUPPORTED_CODEX_MODELS[number],
  reasoningEffort: 'xhigh' | 'medium',
  claudeModel: 'opus' | 'sonnet',
) {
  return {
    taskClass,
    codex: { model, reasoningEffort },
    claudeCode: { model: claudeModel },
    omp: { model, thinkingLevel: reasoningEffort },
  } as const;
}

export const SKILL_AGENT_ROUTES: Readonly<Record<string, AgentRole>> = {
  'sdd-requirements': 'planner',
  'sdd-tasks': 'planner',
  'sdd-steering': 'planner',
  'sdd-steering-custom': 'planner',
  'sdd-design': 'architect',
  'sdd-implement': 'implementer',
  'simple-task': 'implementer',
  'sdd-test-gen': 'tdd-guide',
  'sdd-review': 'reviewer',
  'sdd-security-check': 'security-auditor',
};

const TARGET_POLICIES: Readonly<Record<InstallTarget, TargetPolicy>> = {
  'claude-code': {
    target: 'claude-code',
    defaultPaths: {
      skills: '.claude/skills',
      steering: '.spec/steering',
      rules: '.claude/rules',
      contexts: '.claude/contexts',
      agents: '.claude/agents',
      hooks: '.claude/hooks',
      rootGuidance: 'CLAUDE.md',
      runtimeConfig: '.mcp.json',
      runtimePermissionConfig: '.claude/settings.json',
    },
    ignoreEntries: ['.claude/', '.sdd-mcp/'],
  },
  codex: {
    target: 'codex',
    defaultPaths: {
      skills: '.agents/skills',
      steering: '.spec/steering',
      rules: '.codex/guidance/rules',
      contexts: '.codex/guidance/contexts',
      agents: '.codex/agents',
      hooks: '.codex/hooks',
      rootGuidance: 'AGENTS.md',
      runtimeConfig: '.codex/config.toml',
    },
    ignoreEntries: ['.agents/', '.codex/', '.sdd-mcp/'],
  },
  omp: {
    target: 'omp',
    defaultPaths: {
      skills: '.omp/skills',
      steering: '.spec/steering',
      rules: '.omp/rules',
      contexts: '.omp/contexts',
      agents: '.omp/agents',
      hooks: '.omp/hooks',
      rootGuidance: '.omp/AGENTS.md',
      runtimeConfig: '.omp/mcp.json',
    },
    ignoreEntries: ['.omp/', '.sdd-mcp/'],
  },
};

export function isInstallTarget(value: string): value is InstallTarget {
  return value === 'codex' || value === 'claude-code' || value === 'omp';
}

export function getTargetPolicy(target: InstallTarget): TargetPolicy {
  return TARGET_POLICIES[target];
}

export function resolveInstallPaths(
  policy: TargetPolicy,
  overrides: PathOverrides,
): ResolvedInstallPaths {
  const paths = { ...policy.defaultPaths, ...overrides };
  for (const [component, value] of Object.entries(paths)) {
    if (!value || containsControlCharacter(value)) {
      throw new CliUsageError(`Invalid ${component} path: paths must be non-empty and contain no control characters.`);
    }
  }
  if (policy.target === 'codex') {
    const unsafePath = Object.entries(paths).find(([, value]) => isCodexCommandPolicyPath(value));
    if (unsafePath) {
      throw new CliUsageError(
        `Codex ${unsafePath[0]} path cannot be installed under .codex/rules; choose a guidance path instead.`,
      );
    }
  }
  return paths;
}

function containsControlCharacter(value: string): boolean {
  return [...value].some(character => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
}

function isCodexCommandPolicyPath(value: string): boolean {
  const normalized = path.posix.normalize(value.replaceAll('\\', '/'))
    .replace(/^\.\//, '')
    .replace(/\/+$/, '');
  return /(?:^|\/)\.codex\/rules(?:\/|$)/.test(normalized);
}

export async function resolveInstallTarget(
  options: TargetResolutionOptions,
  io: TargetPromptIO,
): Promise<ResolvedTarget> {
  if (options.target && options.legacyCodex && options.target !== 'codex') {
    throw new CliUsageError(`--codex conflicts with --target ${options.target}`);
  }
  if (options.target) return { target: options.target, source: 'explicit' };
  if (options.legacyCodex) {
    io.writeNotice('--codex is deprecated; use --target codex.');
    return { target: 'codex', source: 'legacy-codex' };
  }
  if (options.profile === 'full' && io.isInteractive()) {
    const target = await io.chooseTarget();
    if (!target) throw new InstallCancelledError();
    return { target, source: 'interactive' };
  }
  io.writeNotice('No target selected; using claude-code. Use --target codex, --target claude-code, or --target omp.');
  return { target: 'claude-code', source: 'compatibility-default' };
}
