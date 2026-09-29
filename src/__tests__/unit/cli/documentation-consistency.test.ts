import * as fs from 'fs';
import * as path from 'path';

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
