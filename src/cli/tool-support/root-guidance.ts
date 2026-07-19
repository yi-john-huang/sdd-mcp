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
      'High-level work runs inline on Sol/medium by default. Project Sol/xhigh advisors are explicit opt-in.',
      'When explicitly invoked, use one advisor without nested delegation; on failure, record one fallback and continue inline without retrying.',
    ]
    : target === 'claude-code'
      ? [
        'High-level planning, architecture, review, and security execute in the current turn on Opus.',
        'Implementation and TDD execute in the current turn on Sonnet; do not spawn a redundant specialist.',
      ]
      : [
        'High-level planning, architecture, review, and security may use one configured Sol/xhigh custom agent.',
        'Implementation and TDD run inline on Sol/medium; on advisor failure, record one fallback and continue inline without retrying.',
      ];
  const lines = [
    heading || `# SDD guidance for ${target}`,
    '',
    '## Workflow',
    '',
    `Use \`${invocation}simple-task <description>\` for small changes. For formal work, run \`${invocation}sdd-requirements <feature-name>\`, then \`${invocation}sdd-design\`, \`${invocation}sdd-tasks\`, and \`${invocation}sdd-implement\` after each approval.`,
    'Use installed `sdd-*` MCP tools for durable workflow state; load compact context by default.',
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
