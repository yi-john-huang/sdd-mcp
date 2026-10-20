import { PRINCIPLES } from './JevQuestionCatalog.js';
import type { JevAnswer } from './JevResponseValidator.js';

export type JevStatus = 'answered' | 'unavailable' | 'skipped';
export type JevAnswers = Readonly<Record<string, JevAnswer>>;

export interface JevLineInput {
  status: JevStatus;
  reason?: string;
  flagged: readonly string[];
}

export interface SecurityItem {
  id: string;
  modelSeverity: string;
  jevSeverity: string;
  disagreement: boolean;
  classification: string;
}

const MAX_LISTED_IDS = 3;
const NOUL_FLAG_THRESHOLD = 0.5;
const WEAK_LEVEL_MAX_INDEX = 1;
const SEVERITY_LEVELS = ['informational', 'low', 'medium', 'high', 'critical'] as const;

export function renderJevLine({ status, reason, flagged }: JevLineInput): string | null {
  if (status === 'skipped') return null;
  if (status === 'unavailable') return `JEV: unavailable (${reason ?? 'invalid-response'})`;
  if (flagged.length === 0) return 'JEV: no flags';
  const listed = flagged.slice(0, MAX_LISTED_IDS).join(', ');
  const more = flagged.length > MAX_LISTED_IDS ? `, +${flagged.length - MAX_LISTED_IDS} more` : '';
  return `JEV: ${flagged.length} flagged (${listed}${more})`;
}

export function renderCommitWarning(count: number): string {
  return `JEV: warning (${count} confirmed high/critical security findings in staged changes)`;
}

function choiceOf(answers: JevAnswers, id: string): string | undefined {
  const answer = answers[id];
  return answer?.type === 'choice' ? answer.choice : undefined;
}
function indexOf(answers: JevAnswers, id: string): number | undefined {
  const answer = answers[id];
  return answer?.type === 'score' ? answer.index : undefined;
}
function noulOf(answers: JevAnswers, id: string): number | undefined {
  const answer = answers[id];
  return answer?.type === 'noul' ? answer.noul : undefined;
}
const atLeastThreshold = (value: number | undefined): boolean => value !== undefined && value >= NOUL_FLAG_THRESHOLD;
const weak = (value: number | undefined): boolean => value !== undefined && value <= WEAK_LEVEL_MAX_INDEX;

export function flagRequirements(answers: JevAnswers, requirementIds: readonly string[]): string[] {
  const flagged = requirementIds.filter(
    (id) => weak(indexOf(answers, `${id}.testability`)) || choiceOf(answers, `${id}.ambiguity`) === 'unbounded',
  );
  const scope = choiceOf(answers, 'goal.scope');
  if ((scope !== undefined && scope !== 'all') || atLeastThreshold(noulOf(answers, 'goal.clarification'))) {
    flagged.push('goal');
  }
  return flagged;
}

export function flagDesign(answers: JevAnswers, decisionIds: readonly string[], nfrIds: readonly string[]): string[] {
  const fidelity = (id: string): string | undefined => choiceOf(answers, `${id}.fidelity`);
  const decisions = decisionIds.filter(
    (id) => (fidelity(id) !== undefined && fidelity(id) !== 'fully') || weak(indexOf(answers, `${id}.failure`)),
  );
  return [...decisions, ...nfrIds.filter((id) => choiceOf(answers, `${id}.mechanism`) === 'none')];
}

function testcaseFlagged(answers: JevAnswers, task: { id: string; notApplicable: boolean }): boolean {
  const { id } = task;
  if (task.notApplicable) return choiceOf(answers, `${id}.tddReason`) === 'not-justified';
  const missing = choiceOf(answers, `${id}.missing`);
  const proportion = choiceOf(answers, `${id}.proportion`);
  return weak(indexOf(answers, `${id}.coverage`))
    || (missing !== undefined && missing !== 'none-missing')
    || (proportion !== undefined && proportion !== 'proportionate')
    || choiceOf(answers, `${id}.observability`) === 'coupled'
    || atLeastThreshold(noulOf(answers, `${id}.noRed`));
}

export function flagTestcases(answers: JevAnswers, tasks: ReadonlyArray<{ id: string; notApplicable: boolean }>): string[] {
  return tasks.filter((task) => testcaseFlagged(answers, task)).map((task) => task.id);
}

export function flagRed(answers: JevAnswers): string[] {
  return choiceOf(answers, 'red.cause') === 'setup-error' || atLeastThreshold(noulOf(answers, 'red.setup')) ? ['red'] : [];
}

/** Maps a model severity (review or security-check scale) onto allowed unified-scale indexes. */
export function allowedSeverityIndexes(modelSeverity: string): number[] {
  switch (modelSeverity.toLowerCase()) {
    case 'critical': return [4];
    case 'important': return [2, 3];
    case 'high': return [3];
    case 'medium': return [2];
    case 'minor':
    case 'low': return [1];
    default: return [];
  }
}

export function flagSecurity(
  answers: JevAnswers,
  findings: ReadonlyArray<{ id: string; modelSeverity: string }>,
): { flagged: string[]; items: SecurityItem[] } {
  const items: SecurityItem[] = findings.map(({ id, modelSeverity }) => {
    const index = indexOf(answers, `${id}.severity`);
    const allowed = allowedSeverityIndexes(modelSeverity);
    return {
      id,
      modelSeverity,
      jevSeverity: index === undefined ? 'unknown' : SEVERITY_LEVELS[index] ?? 'unknown',
      disagreement: index !== undefined && allowed.length > 0 && !allowed.includes(index),
      classification: choiceOf(answers, `${id}.classification`) ?? 'unknown',
    };
  });
  const flagged = items
    .filter((item) => item.disagreement
      || item.classification === 'false-positive'
      || (choiceOf(answers, `${item.id}.remediation`) ?? 'yes') !== 'yes')
    .map((item) => item.id);
  return { flagged, items };
}

export function violatedPrinciples(
  answers: JevAnswers,
  units: ReadonlyArray<{ id: string; location: string }>,
): Array<{ unitId: string; principle: string; location: string }> {
  return units.flatMap(({ id, location }) =>
    PRINCIPLES
      .filter(({ key }) => choiceOf(answers, `${id}.${key}`) === 'violated')
      .map(({ key }) => ({ unitId: id, principle: key, location })),
  );
}
