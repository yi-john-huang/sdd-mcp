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
        'High-level planning, architecture, review, and security execute in the current turn on their configured skill model/effort.',
        'Implementation and TDD use their configured skill model/effort; do not spawn a redundant specialist.',
      ]
      : [
        'High-level planning, architecture, review, and security may use one custom agent with its configured route.',
        'Implementation and TDD run inline on the host-selected parent; generated agents use their configured routes. On advisor failure, record one fallback and continue inline without retrying.',
      ];
  const lines = [
    heading || `# SDD guidance for ${target}`,
    '',
    '## Workflow',
    '',
    `After installation, reload or restart the host and accept project trust. Use \`${invocation}simple-task <description>\` for small changes. For formal work, invoke \`${invocation}sdd-requirements <feature-name>\`, then \`${invocation}sdd-design\`, \`${invocation}sdd-tasks\`, and \`${invocation}sdd-implement\` after each explicit approval.`,
    'Skills automatically restore durable workflow state and approved compact context; users do not call MCP tools or paste workflow JSON.',
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
    '',
  );
  return `${lines.join('\n').trim()}\n`;
}
