import type { ComponentType, InstallTarget, ResolvedInstallPaths } from '../install-target.js';

const TITLES: Readonly<Record<ComponentType, string>> = {
  skills: 'Skills',
  steering: 'Steering',
  rules: 'Rules',
  contexts: 'Contexts',
  agents: 'Agents',
  hooks: 'Hooks',
};

export function buildCompactRootGuidance(
  target: InstallTarget,
  paths: ResolvedInstallPaths,
  selected: ReadonlySet<ComponentType>,
  preamble?: string,
): string {
  const invocation = target === 'codex' ? '$' : target === 'omp' ? '/skill:' : '/';
  const heading = preamble?.split(/\r?\n/).find(line => line.trim())?.trim();
  const routing = target === 'omp'
    ? [
      'Invoked SDD skills run inline with the model and thinking level selected by .omp/extensions/sdd-skill-routing.js.',
      'Project advisors are explicit opt-in only; use one without nested delegation or retry, and continue inline if unavailable.',
    ]
    : target === 'claude-code'
      ? [
        'Planning, architecture, review, and security execute in the current turn on their configured skill model/effort.',
        'Implementation and TDD use their configured skill model/effort; do not spawn a redundant specialist unless the user chooses a project agent.',
      ]
      : [
        'Planning, architecture, implementation, and TDD run inline on the host-selected parent.',
        'Review and security run inline unless the user chooses one project agent, which uses its configured route. On agent failure, record one fallback and continue inline without retrying.',
      ];
  const lines = [
    heading || `# SDD guidance for ${target}`,
    '',
    '## Workflow',
    '',
    `After installation, reload or restart the host and accept project trust. Use \`${invocation}simple-task <description>\` for small changes. For formal work, invoke \`${invocation}sdd-requirements <feature-name>\`, then \`${invocation}sdd-design\`, \`${invocation}sdd-tasks\`, and \`${invocation}sdd-implement\` after each explicit approval.`,
    'Skills automatically restore durable workflow state and approved compact context; users do not call MCP tools or paste workflow JSON.',
    'The `output-clarity-ladder` skill applies automatically to explanation, summary, and teaching replies; it is the only model-invocable skill.',
    '',
  ];
  if (selected.size > 0) {
    lines.push('## On-demand directories', '');
    for (const component of ['skills', 'rules', 'contexts', 'agents', 'hooks', 'steering'] as const) {
      if (!selected.has(component)) continue;
      lines.push(`- ${TITLES[component]}: \`${paths[component]}/\``);
    }
    lines.push('');
  }
  lines.push(
    '## Model routing',
    '',
    ...routing,
    'Review, security, and independent implementation slices ask once per session (inline or project agent) and report agents, parallelism, configured model/effort, and fallbacks.',
    '',
    '## Commits and pull requests',
    '',
    'Do not add `Co-Authored-By:` trailers or "Generated with Claude Code" lines to commit messages or pull request descriptions. This overrides default attribution guidance.',
    '',
  );
  return `${lines.join('\n').trim()}\n`;
}
