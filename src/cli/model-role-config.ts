import * as fs from 'fs';
import { parseDocument } from 'yaml';
import { z } from 'zod';
import { CliUsageError, ROLE_MODEL_ROUTES, type AgentRole } from './install-target.js';

export type ModelRoutes = Record<AgentRole, {
  taskClass: 'advisor' | 'implementation' | 'local';
  codex: { model: string; reasoningEffort: string };
  omp: { model: string; thinkingLevel: string };
  claudeCode: { model: string; effort: string };
}>;

const selectorSchema = z.string().regex(/^[^\s:]+\/[^\s:]+:(minimal|low|medium|high|xhigh|max)$/, 'expected provider/model:effort');
const roleSchema = z.union([
  selectorSchema,
  z.object({ codex: selectorSchema.optional(), omp: selectorSchema.optional(), claudeCode: z.union([
    z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/),
    z.object({
      model: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/).optional(),
      effort: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).optional(),
    }).strict().refine(value => value.model !== undefined || value.effort !== undefined, 'specify model or effort'),
  ]).optional() }).strict(),
]);
const configSchema = z.object({
  modelRoles: z.object({
    planner: roleSchema.optional(),
    architect: roleSchema.optional(),
    reviewer: roleSchema.optional(),
    'security-auditor': roleSchema.optional(),
    implementer: roleSchema.optional(),
    'tdd-guide': roleSchema.optional(),
  }).strict(),
}).strict();

function selector(value: string) {
  const separator = value.lastIndexOf(':');
  return { model: value.slice(0, separator), reasoningEffort: value.slice(separator + 1) };
}

export function loadModelRoutes(file: string): ModelRoutes {
  let source: string;
  try {
    source = fs.readFileSync(file, 'utf8');
  } catch (error) {
    throw new CliUsageError(`Cannot read model roles file ${file}: ${String(error)}`);
  }
  const document = parseDocument(source, { uniqueKeys: true });
  if (document.errors.length) throw new CliUsageError(`Invalid model roles YAML: ${document.errors[0].message}`);
  const parsed = configSchema.safeParse(document.toJS());
  if (!parsed.success) throw new CliUsageError(`Invalid model roles file: ${parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`);
  const routes: ModelRoutes = { ...ROLE_MODEL_ROUTES };
  for (const [role, value] of Object.entries(parsed.data.modelRoles)) {
    if (value === undefined) continue;
    const defaults = ROLE_MODEL_ROUTES[role as AgentRole];
    const codex = typeof value === 'string' ? value : value.codex;
    const omp = typeof value === 'string' ? value : value.omp;
    const claudeCode = typeof value === 'string' ? undefined : value.claudeCode;
    const codexRoute = codex === undefined ? undefined : selector(codex);
    const ompRoute = omp === undefined ? undefined : selector(omp);
    routes[role as AgentRole] = {
      taskClass: defaults.taskClass,
      codex: codexRoute === undefined ? defaults.codex : { model: codexRoute.model.slice(codexRoute.model.indexOf('/') + 1), reasoningEffort: codexRoute.reasoningEffort },
      omp: ompRoute === undefined ? defaults.omp : { model: ompRoute.model, thinkingLevel: ompRoute.reasoningEffort },
      claudeCode: typeof claudeCode === 'string'
        ? { ...defaults.claudeCode, model: claudeCode }
        : { ...defaults.claudeCode, ...claudeCode },
    };
  }
  return routes;
}
