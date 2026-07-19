import {
  ROLE_MODEL_ROUTES,
  type AgentRole,
} from '../install-target.js';

export interface SourceAgent {
  name: string;
  description: string;
  role: AgentRole;
  expertise: string;
  instructions: string;
}

export function parseSourceAgent(content: string): SourceAgent {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) throw new Error('Agent source requires YAML frontmatter');
  const metadata = new Map<string, string>();
  for (const line of match[1].split(/\r?\n/)) {
    const separator = line.indexOf(':');
    if (separator <= 0) continue;
    metadata.set(line.slice(0, separator).trim(), stripQuotes(line.slice(separator + 1).trim()));
  }
  const role = metadata.get('role');
  if (!role || !(role in ROLE_MODEL_ROUTES)) throw new Error(`Unsupported agent role: ${role ?? '(missing)'}`);
  return {
    name: required(metadata, 'name'),
    description: required(metadata, 'description'),
    role: role as AgentRole,
    expertise: metadata.get('expertise') ?? '',
    instructions: match[2].trim(),
  };
}

export function renderClaudeCodeAgent(agent: SourceAgent): string {
  const route = ROLE_MODEL_ROUTES[agent.role];
  const readOnly = route.taskClass === 'advisor';
  const tools = readOnly ? 'Read, Grep, Glob' : 'Read, Grep, Glob, Edit, Write, Bash';
  const maxTurns = readOnly ? 12 : 24;
  return `---\nname: ${agent.name}\ndescription: ${agent.description}\nrole: ${agent.role}\nexpertise: ${agent.expertise}\nmodel: ${route.claudeCode.model}\ntools: ${tools}\nmaxTurns: ${maxTurns}\n---\n\n${agent.instructions}\n`;
}

export function renderCodexAgent(agent: SourceAgent): string {
  const roleRoute = ROLE_MODEL_ROUTES[agent.role];
  const route = roleRoute.codex;
  const readOnly = roleRoute.taskClass === 'advisor';
  const instructions = `${agent.instructions}\n\nDo not delegate or spawn another agent. Return only decisions, affected artifacts, verification evidence, and unresolved blockers; at most 2,048 estimated tokens.`;
  return [
    `name = ${JSON.stringify(agent.name)}`,
    `description = ${JSON.stringify(agent.description)}`,
    `model = ${JSON.stringify(route.model)}`,
    `model_reasoning_effort = ${JSON.stringify(route.reasoningEffort)}`,
    `sandbox_mode = ${JSON.stringify(readOnly ? 'read-only' : 'workspace-write')}`,
    `max_turns = ${readOnly ? 12 : 24}`,
    `developer_instructions = ${JSON.stringify(instructions)}`,
    '',
  ].join('\n');
}

export function renderOmpAgent(agent: SourceAgent): string {
  const route = ROLE_MODEL_ROUTES[agent.role].omp;
  const readOnly = ROLE_MODEL_ROUTES[agent.role].taskClass === 'advisor';
  const tools = readOnly
    ? ['read', 'grep', 'glob']
    : ['read', 'grep', 'glob', 'edit', 'write', 'bash'];
  const maxTurns = readOnly ? 12 : 24;
  return [
    '---',
    `name: ${agent.name}`,
    `description: ${agent.description}`,
    `model: ${route.model}`,
    `thinkingLevel: ${route.thinkingLevel}`,
    'tools:',
    ...tools.map(tool => `  - ${tool}`),
    `maxTurns: ${maxTurns}`,
    '---',
    '',
    agent.instructions,
    '',
    'Return only: decisions, affected artifacts, verification evidence, and unresolved blockers.',
    'Do not delegate or spawn another agent. Keep the result at most 2,048 estimated tokens.',
    '',
  ].join('\n');
}

function required(metadata: Map<string, string>, key: string): string {
  const value = metadata.get(key);
  if (!value) throw new Error(`Agent source requires ${key}`);
  return value;
}

function stripQuotes(value: string): string {
  if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))) {
    return value.slice(1, -1);
  }
  return value;
}
