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
    expect(guidance).toContain('High-level work runs inline on Sol/medium by default');
    expect(guidance).toContain('Sol/xhigh advisors are explicit opt-in');
  });
});
