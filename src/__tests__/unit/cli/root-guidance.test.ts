import { getTargetPolicy, type ComponentType, type InstallTarget } from '../../../cli/install-target';
import { buildCompactRootGuidance } from '../../../cli/tool-support/root-guidance';

describe('compact target root guidance', () => {
  it.each([
    ['codex', '$', 2000],
    ['claude-code', '/', 2500],
    ['omp', '/skill:', 2000],
  ] as const)('uses native %s invocation and stays within its byte budget', (target, prefix, budget) => {
    const selected = new Set<ComponentType>(['skills', 'steering', 'rules', 'contexts', 'agents', 'hooks']);
    const guidance = buildCompactRootGuidance(
      target as InstallTarget,
      getTargetPolicy(target as InstallTarget).defaultPaths,
      selected,
      '# Target guidance\n\nA deliberately long template body that must not be retained.\n',
    );
    expect(guidance).toContain(`\`${prefix}simple-task <description>\``);
    expect(guidance).toContain(`\`${prefix}sdd-requirements <feature-name>\``);
    expect(guidance).toContain('reload or restart the host');
    expect(guidance).toContain('accept project trust');
    expect(guidance).toContain('automatically restore durable workflow state and approved compact context');
    expect(guidance).toContain('## Commits and pull requests');
    expect(guidance).toContain('Do not add `Co-Authored-By:` trailers');
    expect(guidance).toContain('"Generated with Claude Code"');
    expect(guidance).not.toContain('deliberately long template body');
    expect(guidance).not.toContain('| Description |');
    expect(guidance).not.toContain('sdd-context-load');
    expect(guidance).not.toMatch(/call [`"]?sdd-(?:init|status|approve|context-load)/);
    expect(Buffer.byteLength(guidance)).toBeLessThanOrEqual(budget);
  });

  it('renders only selected directory pointers and no per-file catalog', () => {
    const paths = getTargetPolicy('omp').defaultPaths;
    const guidance = buildCompactRootGuidance('omp', paths, new Set<ComponentType>(['skills', 'agents']));
    expect(guidance).toContain('- Skills: `.omp/skills/`');
    expect(guidance).toContain('- Agents: `.omp/agents/`');
    expect(guidance).not.toContain('- Rules:');
    expect(guidance).not.toContain('- Contexts:');
    expect(guidance).not.toContain('planner.md');
  });
});

describe('output-clarity-ladder root guidance line', () => {
  const line = 'The `output-clarity-ladder` skill applies automatically to explanation, summary, and teaching replies; it is the only model-invocable skill.';
  it.each(['claude-code', 'codex', 'omp'] as const)('adds exactly one line under Workflow for %s', target => {
    const guidance = buildCompactRootGuidance(target, getTargetPolicy(target).defaultPaths, new Set<ComponentType>(['skills']));
    const workflow = guidance.split('## Workflow')[1].split('\n## ')[0];
    expect(workflow.split('\n').filter(l => l === line)).toHaveLength(1);
    expect(guidance.split(line)).toHaveLength(2);
    expect(guidance).not.toContain('ASD-STE100');
  });
});
