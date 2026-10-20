import * as fs from 'fs';
import * as path from 'path';
import { SDD_TOOL_NAMES } from '../../../infrastructure/mcp/sddToolDefinitions';

function read(relativePath: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');
}

describe('target-aware documentation consistency', () => {
  it('keeps root agent guidance target-neutral', () => {
    const guidance = read('AGENTS.md');

    expect(guidance).toMatch(/^# SDD-MCP Project Guidance/);
    expect(guidance).toContain('Claude Code, Codex, and Oh My Pi');
    expect(guidance).toContain('/skill:simple-task');
    expect(guidance).toContain('Sol/xhigh');
    expect(guidance).toContain('Sol/medium');
    expect(guidance).not.toContain('| Skill |');
  });



  it('documents both native output trees in architecture and workflow docs', () => {
    const architecture = read('ARCHITECTURE.md');
    const workflow = read('docs/WORKFLOW.md');

    for (const content of [architecture, workflow]) {
      expect(content).toContain('.agents/skills');
      expect(content).toContain('.codex/guidance/rules');
      expect(content).toContain('.claude/skills');
    }
    expect(workflow).toContain('Resolve primary target');
  });

  it('keeps CLI and migration guidance provider-neutral', () => {
    const cli = read('src/cli/sdd-mcp-cli.ts');
    const migration = read('src/cli/migrate-steering.ts');
    const server = read('src/index.ts');
    const adapter = read('src/adapters/cli/SDDToolAdapter.ts');

    expect(cli).toContain('Install target-native SDD components');
    expect(cli).not.toContain('Install SDD skills AND steering');
    expect(migration).not.toContain('Design principles: .claude/');
    expect(migration).toContain('Design principles: rules/coding-style.md');
    expect(server).not.toContain('installed for Claude Code');
    expect(server).not.toContain('install --target codex --skills');
    expect(server).not.toContain('.claude/commands/');
    expect(adapter).not.toContain('This installs both \\`.claude/skills/');
    expect(read('src/application/services/staticSteering.ts')).not.toContain('.ai agent/');
  });

  it('references packaged steering sources instead of one generated target', () => {
    const readme = read('README.md');

    expect(readme).toContain('**Design Principles**: `rules/coding-style.md`');
    expect(readme).toContain('**TDD Methodology**: `agents/tdd-guide.md`');
  });

  it('documents a Skill-first journey and confines raw tools to integrator reference', () => {
    const publicGuidance = [
      read('AGENTS.md'),
      read('templates/CLAUDE.md'),
      read('templates/codex-AGENTS.md'),
      read('README.md'),
      read('docs/WORKFLOW.md'),
      read('docs/INSTALL-GUIDE.md'),
    ];

    for (const content of publicGuidance) {
      expect(content).toMatch(/sdd-requirements/);
      expect(content).toMatch(/reload|restart/i);
      expect(content).toMatch(/trust/i);
      expect(content).not.toMatch(/\b(?:user|you)\s+(?:must|should|can|then)?\s*call\s+`?sdd-(?:init|status|approve|context-load|review-test-cases|spec-impl)/i);
    }

    expect(read('README.md')).toContain('Integrator/runtime reference: canonical v5 inventory');
    expect(read('docs/WORKFLOW.md')).toContain('Integrator/runtime reference: exact inventory');
    expect(read('docs/WORKFLOW.md')).toContain('User --> Skill');
    expect(read('docs/WORKFLOW.md')).toContain('Skill --> MCP');
    expect(read('docs/WORKFLOW.md')).toContain('MCP --> Spec');
  });
  it('publishes the versioned changelog with the npm package', () => {
    const packageJson = JSON.parse(read('package.json')) as { files?: unknown };

    expect(Array.isArray(packageJson.files)).toBe(true);
    expect(packageJson.files).toContain('CHANGELOG.md');
  });
});

describe('documented MCP tool contract', () => {
  const names: readonly string[] = SDD_TOOL_NAMES;
  const inventoryDocs = ['README.md', 'docs/WORKFLOW.md', 'ARCHITECTURE.md'];

  it('has 17 tools and ends with the JEV tool', () => {
    expect(names).toHaveLength(17);
    expect(names[16]).toBe('sdd-jev-check');
  });

  it.each(inventoryDocs)('%s names every defined tool', (file) => {
    const content = read(file);
    for (const name of names) expect(content).toContain(`\`${name}\``);
  });

  it.each(inventoryDocs)('%s states 17 tools and no stale 16-tool inventory', (file) => {
    const content = read(file);
    expect(content).toMatch(/\b17\b[- ]tools?|exactly 17 tools|same 17 tools/);
    expect(content).not.toMatch(/\b16[- ]tools?\b|exactly 16 tools|same 16 tools/);
  });

  it('lists exactly the defined tools in the Claude plugin manifest', () => {
    const manifest = JSON.parse(read('.claude-plugin/plugin.json')) as { tools: Array<{ name: string }> };
    const listed = manifest.tools.map(({ name }) => name);
    expect(new Set(listed)).toEqual(new Set(names));
    expect(listed).toHaveLength(names.length);
  });
});

describe('documented JEV advisory feature', () => {
  const workflow = read('docs/WORKFLOW.md');

  it('documents the settings, key, code opt-in, timeout, and project setting', () => {
    expect(workflow).toContain('Optional JEV advisory');
    for (const setting of ['SDD_JEV_ENABLED', 'SDD_JEV_API_KEY', 'SDD_JEV_ALLOW_CODE', 'SDD_JEV_TIMEOUT_MS', '.spec/sdd-config.json']) {
      expect(workflow).toContain(setting);
    }
    expect(workflow).toMatch(/environment variable wins|env(?:ironment)? .{0,30}wins/i);
  });

  it('documents the data sent, the sidecars, and the ignore policy', () => {
    expect(workflow).toMatch(/redact/i);
    expect(workflow).toMatch(/8 ?KB|8,192/);
    expect(workflow).toContain('.spec/reviews/');
    expect(workflow).toContain('jev-review-');
    expect(workflow).toMatch(/jev-requirements|spec-phase sidecars?/i);
    expect(workflow).toMatch(/git-?ignored?/i);
  });

  it('documents every reason code', () => {
    for (const reason of ['disabled', 'no-key', 'network', 'timeout', 'http-', 'invalid-response', 'code-disabled']) {
      expect(workflow).toContain(reason);
    }
    expect(workflow).toContain('JEV: unavailable (');
  });

  it('states that JEV is advisory and never changes approval or spec.json', () => {
    expect(workflow).toMatch(/never (?:changes|affects) approval/i);
    expect(workflow).toMatch(/never (?:changes|writes)[^.]{0,60}spec\.json|spec\.json[^.]{0,60}unchanged/i);
  });

  it('records the feature in the changelog under Unreleased', () => {
    const unreleased = read('CHANGELOG.md').split('## [5.4.0]')[0]!;
    expect(unreleased).toMatch(/JEV/);
    expect(unreleased).toContain('sdd-jev-check');
  });

  it('documents reviewing committed branch changes with baseRef', () => {
    expect(workflow).toContain('`baseRef`');
    expect(workflow).toContain('invalid-base-ref');
    expect(workflow).toMatch(/Git 2\.30/);
    expect(workflow).toMatch(/merge base/i);
    expect(workflow).toContain('-range-');
    expect(workflow).toMatch(/staged (?:diffs?|changes) only|only (?:the )?staged/i);
    expect(workflow).toMatch(/`--end-of-options`/);
  });

  it('documents the zero-based score scale and never a fallback', () => {
    expect(workflow).toMatch(/zero-based/i);
    expect(workflow).toMatch(/0 (?:to|through) (?:the )?(?:last|highest) level|integer from 0/i);
    expect(workflow).not.toMatch(/one-based|1-based|inferred/i);
  });

  it('records baseRef and the zero-based scale in the changelog under Unreleased', () => {
    const unreleased = read('CHANGELOG.md').split('## [5.4.0]')[0]!;
    expect(unreleased).toContain('`baseRef`');
    expect(unreleased).toMatch(/zero-based/i);
    expect(unreleased).not.toMatch(/one-based|1-based|inferred/i);
    expect(read('README.md')).toContain('`baseRef`');
  });
});
