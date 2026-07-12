import * as fs from 'fs';
import * as path from 'path';

function read(relativePath: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');
}

describe('target-aware documentation consistency', () => {
  it('keeps root agent guidance target-neutral', () => {
    const guidance = read('AGENTS.md');

    expect(guidance).toMatch(/^# AGENTS\.md/);
    expect(guidance).toContain('--target codex');
    expect(guidance).toContain('--target claude-code');
    expect(guidance).toContain('gpt-5.6-sol');
    expect(guidance).toContain('gpt-5.6-luna');
    expect(guidance).toContain('xhigh effort');
    expect(guidance).toContain('max effort');
  });

  it('links the model routing guide from operator documentation', () => {
    const readme = read('README.md');
    const installGuide = read('docs/INSTALL-GUIDE.md');
    const architecture = read('ARCHITECTURE.md');
    const modelGuide = read('docs/MODEL-ROUTING.md');

    expect(readme).toContain('docs/MODEL-ROUTING.md');
    expect(installGuide).toContain('MODEL-ROUTING.md');
    expect(architecture).toContain('docs/MODEL-ROUTING.md');
    expect(modelGuide).toContain('## What happens when a skill runs');
    expect(modelGuide).toContain('The repository cannot force a model switch');
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
    expect(server).toContain('install --target codex --skills');
    expect(server).not.toContain('.claude/commands/');
    expect(adapter).not.toContain('This installs both \\`.claude/skills/');
    expect(read('src/application/services/staticSteering.ts')).not.toContain('.ai agent/');
  });

  it('references packaged steering sources instead of one generated target', () => {
    const readme = read('README.md');

    expect(readme).toContain('**Design Principles**: `rules/coding-style.md`');
    expect(readme).toContain('**TDD Methodology**: `agents/tdd-guide.md`');
  });
});
