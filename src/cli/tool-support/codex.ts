import * as fs from 'fs';
import * as path from 'path';
import { SkillManager } from '../../skills/SkillManager.js';
import { RulesManager } from '../../rules/RulesManager.js';
import { AgentManager } from '../../agents/AgentManager.js';
import { findTemplate } from '../utils/find-package-root.js';

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
 * Effective install paths used by the installer.
 * These may differ from defaults when the user passes --path, --rules-path, etc.
 */
export interface InstallPaths {
  skillsPath: string;
  rulesPath: string;
  agentsPath: string;
  steeringPath: string;
}

/**
 * Which component types were actually installed in this run.
 * Only installed components are rendered in AGENTS.md.
 */
export interface InstalledComponents {
  skills: boolean;
  rules: boolean;
  agents: boolean;
  steering: boolean;
}

/** Item with a name, description, and a path to derive a filename from */
interface TableItem {
  name: string;
  description: string;
  path: string;
}

/**
 * Build a markdown table section for a component type.
 * Returns the section string, or empty string if items is empty.
 */
function buildTableSection(
  title: string,
  subtitle: string,
  basePath: string,
  items: TableItem[],
  pathFormatter: (item: TableItem) => string,
): string {
  if (items.length === 0) return '';

  let section = `### ${title} (\`${basePath}/\`)\n\n`;
  section += `${subtitle}\n\n`;
  section += `| ${title.slice(0, -1)} | Description | Path |\n`;
  section += '|-------|-------------|------|\n';
  for (const item of items) {
    section += `| ${item.name} | ${item.description || '—'} | \`${pathFormatter(item)}\` |\n`;
  }
  section += '\n';
  return section;
}

/**
 * Build a markdown bullet list section for steering docs.
 */
function buildSteeringSection(basePath: string, docs: string[]): string {
  if (docs.length === 0) return '';

  let section = `### Steering (\`${basePath}/\`)\n\n`;
  section += 'Project-specific context documents:\n\n';
  for (const doc of docs) {
    section += `- \`${basePath}/${doc}\`\n`;
  }
  section += '\n';
  return section;
}

/**
 * Load the template preamble for AGENTS.md
 */
function loadPreamble(): string {
  try {
    const templatePath = findTemplate('codex-AGENTS.md');
    if (templatePath) {
      return fs.readFileSync(templatePath, 'utf-8');
    }
    console.log('  ⚠️  AGENTS.md template not found, using minimal header');
  } catch (error) {
    console.error('  ⚠️  Failed to read AGENTS.md template:', (error as Error).message);
  }
  return '# AGENTS.md — Spec-Driven Development (SDD)\n\n';
}

/**
 * Generate AGENTS.md in the project root for OpenAI Codex CLI.
 *
 * Produces a lightweight summary file containing component names,
 * descriptions, and file path references. Codex CLI reads referenced
 * files on demand — no content duplication needed.
 *
 * Only sections for actually-installed component types are included,
 * and paths reflect the effective install targets (not hardcoded defaults).
 */
export async function generateCodexAgentsMd(
  projectRoot: string,
  managers: ManagerRefs,
  paths: InstallPaths,
  installed: InstalledComponents,
): Promise<void> {
  const targetPath = path.join(projectRoot, 'AGENTS.md');

  if (fs.existsSync(targetPath)) {
    console.log('  ⏭️  AGENTS.md already exists, skipping');
    return;
  }

  let content = loadPreamble();

  try {
    const [skills, rules, agents, steeringDocs] = await Promise.all([
      installed.skills ? managers.skillManager.listSkills() : Promise.resolve([]),
      installed.rules ? managers.rulesManager.listComponents() : Promise.resolve([]),
      installed.agents ? managers.agentManager.listComponents() : Promise.resolve([]),
      installed.steering ? managers.listSteering() : Promise.resolve([]),
    ]);

    content += buildTableSection('Skills', 'Workflow guidance invoked via slash commands:', paths.skillsPath,
      skills, (s) => `${paths.skillsPath}/${s.name}/`);

    content += buildTableSection('Rules', 'Always-active coding standards:', paths.rulesPath,
      rules, (r) => `${paths.rulesPath}/${path.basename(r.path)}`);

    content += buildTableSection('Agents', 'Specialized AI personas:', paths.agentsPath,
      agents, (a) => `${paths.agentsPath}/${path.basename(a.path)}`);

    content += buildSteeringSection(paths.steeringPath, steeringDocs);
  } catch (error) {
    console.error('  ⚠️  Failed to gather component metadata:', (error as Error).message);
  }

  try {
    fs.writeFileSync(targetPath, content, 'utf-8');
    console.log('  ✅ Created AGENTS.md for Codex CLI');
  } catch (error) {
    console.error('  ❌ Failed to create AGENTS.md:', (error as Error).message);
  }
}
