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
    expect(installGuide).toContain('eligible Codex workspace or API organization');
    expect(modelGuide).toContain('total tokens');
  });

  it('keeps the approved model policy and release guidance aligned', () => {
    const requirements = read('.spec/specs/optimizing-for-different-llm/requirements.md');
    const design = read('.spec/specs/optimizing-for-different-llm/design.md');
    const tasks = read('.spec/specs/optimizing-for-different-llm/tasks.md');
    const changelog = read('CHANGELOG.md');
    const entrypoint = read('sdd-entry.js');

    for (const content of [requirements, design, tasks]) {
      expect(content).toContain('gpt-5.6-sol');
      expect(content).toContain('medium');
      expect(content).toContain('gpt-5.6-terra');
    }
    expect(changelog).toContain('gpt-5.6-sol');
    expect(changelog).toContain('medium');
    expect(changelog).not.toContain('Terra/Sonnet for implementation');
    expect(entrypoint).toContain('Install target-native components');
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
});
