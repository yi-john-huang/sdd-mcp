import * as fs from 'fs';
import * as path from 'path';
import { SkillManager } from '../../skills/SkillManager.js';
import { RulesManager } from '../../rules/RulesManager.js';
import { AgentManager } from '../../agents/AgentManager.js';

/**
 * References to manager instances needed for generating AGENTS.md
 */
export interface ManagerRefs {
  skillManager: SkillManager;
  rulesManager: RulesManager;
  agentManager: AgentManager;
  listSteering: () => Promise<string[]>;
}

/**
 * Resolve the codex-AGENTS.md template from the package.
 *
 * Uses the same strategy as install-skills.ts: walk up from
 * process.argv[1] looking for the sdd-mcp-server package root.
 */
function findTemplate(): string | null {
  const findPackageRoot = (startDir: string): string | null => {
    let dir = startDir;
    while (dir !== path.dirname(dir)) {
      const pkgPath = path.join(dir, 'package.json');
      if (fs.existsSync(pkgPath)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
          if (pkg.name === 'sdd-mcp-server') {
            return dir;
          }
        } catch {
          // Continue searching
        }
      }
      dir = path.dirname(dir);
    }
    return null;
  };

  const searchRoots: string[] = [];

  // Strategy 1: From the running script's real location
  if (process.argv[1]) {
    try {
      searchRoots.push(path.dirname(fs.realpathSync(process.argv[1])));
    } catch {
      // Fall through
    }
  }

  // Strategy 2: From cwd
  searchRoots.push(process.cwd());

  for (const root of searchRoots) {
    const pkgRoot = findPackageRoot(root);
    if (pkgRoot) {
      const templatePath = path.join(pkgRoot, 'templates', 'codex-AGENTS.md');
      if (fs.existsSync(templatePath)) {
        return templatePath;
      }
    }
  }

  return null;
}

/**
 * Generate AGENTS.md in the project root for OpenAI Codex CLI.
 *
 * Produces a lightweight summary file containing component names,
 * descriptions, and file path references. Codex CLI reads referenced
 * files on demand — no content duplication needed.
 */
export async function generateCodexAgentsMd(
  projectRoot: string,
  managers: ManagerRefs,
): Promise<void> {
  const targetPath = path.join(projectRoot, 'AGENTS.md');

  if (fs.existsSync(targetPath)) {
    console.log('  ⏭️  AGENTS.md already exists, skipping');
    return;
  }

  // Load template preamble
  const templatePath = findTemplate();
  let content: string;
  if (templatePath) {
    content = fs.readFileSync(templatePath, 'utf-8');
  } else {
    content = '# AGENTS.md — Spec-Driven Development (SDD)\n\n';
    console.log('  ⚠️  AGENTS.md template not found, using minimal header');
  }

  // Gather component metadata
  const [skills, rules, agents, steeringDocs] = await Promise.all([
    managers.skillManager.listSkills(),
    managers.rulesManager.listComponents(),
    managers.agentManager.listComponents(),
    managers.listSteering(),
  ]);

  // Append skills section
  if (skills.length > 0) {
    content += '### Skills (`.claude/skills/`)\n\n';
    content += 'Workflow guidance invoked via slash commands:\n\n';
    content += '| Skill | Description | Path |\n';
    content += '|-------|-------------|------|\n';
    for (const skill of skills) {
      content += `| ${skill.name} | ${skill.description || '—'} | \`.claude/skills/${skill.name}/\` |\n`;
    }
    content += '\n';
  }

  // Append rules section
  if (rules.length > 0) {
    content += '### Rules (`.claude/rules/`)\n\n';
    content += 'Always-active coding standards:\n\n';
    content += '| Rule | Description | Path |\n';
    content += '|------|-------------|------|\n';
    for (const rule of rules) {
      const fileName = path.basename(rule.path);
      content += `| ${rule.name} | ${rule.description || '—'} | \`.claude/rules/${fileName}\` |\n`;
    }
    content += '\n';
  }

  // Append agents section
  if (agents.length > 0) {
    content += '### Agents (`.claude/agents/`)\n\n';
    content += 'Specialized AI personas:\n\n';
    content += '| Agent | Description | Path |\n';
    content += '|-------|-------------|------|\n';
    for (const agent of agents) {
      const fileName = path.basename(agent.path);
      content += `| ${agent.name} | ${agent.description || '—'} | \`.claude/agents/${fileName}\` |\n`;
    }
    content += '\n';
  }

  // Append steering section
  if (steeringDocs.length > 0) {
    content += '### Steering (`.spec/steering/`)\n\n';
    content += 'Project-specific context documents:\n\n';
    for (const doc of steeringDocs) {
      content += `- \`.spec/steering/${doc}\`\n`;
    }
    content += '\n';
  }

  try {
    fs.writeFileSync(targetPath, content, 'utf-8');
    console.log('  ✅ Created AGENTS.md for Codex CLI');
  } catch (error) {
    console.error('  ❌ Failed to create AGENTS.md:', (error as Error).message);
  }
}
