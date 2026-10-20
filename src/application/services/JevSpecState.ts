import { redactState, redactThenClip } from './JevRedaction.js';
import { buildDesignQuestions, buildRedQuestions, buildRequirementsQuestions } from './JevQuestionCatalog.js';
import type { JevQuestionSet } from './JevResponseValidator.js';
import { metadata, parseList, parseSections, uniqueSections, visibleLines, type Section } from './WorkflowValidationService.js';
import type { AdvisorySnapshot } from './WorkflowEngineService.js';

/** Serialized `state` cap for spec-text requests. */
export const MAX_STATE_BYTES = 32_768;
const FIELD_LIMIT = 1500;
const REQUIREMENT_HEADING = /^###\s+((?:FR|NFR)-\d+):\s*(.+?)\s*$/;
const DECISION_HEADING = /^###\s+(D-\d+):\s*(.+?)\s*$/;

export interface ExchangeState {
  kind: string;
  items: Array<Record<string, unknown>>;
  context?: Record<string, unknown>;
}

export interface FittedState {
  state: ExchangeState;
  keptIds: string[];
  omittedIds: string[];
  truncated: boolean;
  redactions: number;
}

export interface BuiltExchange {
  state: ExchangeState;
  questions: JevQuestionSet;
  /** Ids the answers are interpreted against, in document order. */
  itemIds: string[];
  /** Second id group (NFRs for the design check). */
  secondaryIds: string[];
  omittedIds: string[];
  truncated: boolean;
  redactions: number;
}

function clip(value: string | undefined, limit: number, counts: { n: number }): string {
  const result = redactThenClip(value, limit);
  counts.n += result.count;
  return result.text;
}
const sizeOf = (state: ExchangeState): number => Buffer.byteLength(JSON.stringify(state), 'utf8');

/** Redacts every item, then keeps whole items in order until the next one would exceed the cap. */
export function fitState(
  kind: string,
  items: ReadonlyArray<Record<string, unknown> & { id: string }>,
  context: Record<string, unknown> | undefined,
  maxBytes = MAX_STATE_BYTES,
): FittedState {
  const redactedContext = context && redactState(context);
  const kept: Array<Record<string, unknown>> = [];
  const keptIds: string[] = [];
  const omittedIds: string[] = [];
  let redactions = redactedContext?.count ?? 0;
  let full = false;
  for (const item of items) {
    const redacted = redactState(item);
    const candidate: ExchangeState = { kind, items: [...kept, redacted.state], ...(redactedContext && { context: redactedContext.state }) };
    if (full || sizeOf(candidate) > maxBytes) {
      full = true;
      omittedIds.push(item.id);
      continue;
    }
    kept.push(redacted.state);
    keptIds.push(item.id);
    redactions += redacted.count;
  }
  const state: ExchangeState = { kind, items: kept, ...(redactedContext && { context: redactedContext.state }) };
  return { state, keptIds, omittedIds, truncated: omittedIds.length > 0, redactions };
}

const sectionsOf = (content: string, heading: RegExp): Section[] =>
  uniqueSections(parseSections(visibleLines(content), heading).sections);

function toBuilt(fit: FittedState, questions: JevQuestionSet, itemIds: string[], secondaryIds: string[], extraRedactions = 0): BuiltExchange {
  return { state: fit.state, questions, itemIds, secondaryIds, omittedIds: fit.omittedIds, truncated: fit.truncated, redactions: fit.redactions + extraRedactions };
}

export function buildRequirementsExchange(snapshot: AdvisorySnapshot): BuiltExchange | undefined {
  const counts = { n: 0 };
  const bound = (value: string | undefined, limit = FIELD_LIMIT): string => clip(value, limit, counts);
  const items = sectionsOf(snapshot.content, REQUIREMENT_HEADING).map((section) => ({
    id: section.id,
    title: bound(section.title),
    objective: bound(metadata(section, 'Objective')),
    ears: bound(metadata(section, 'EARS Specification')),
    acceptance: bound(metadata(section, 'Acceptance Criteria')),
  }));
  if (items.length === 0) return undefined;
  const fit = fitState('requirements', items, { goal: bound(snapshot.description) });
  if (fit.keptIds.length === 0) return undefined;
  return toBuilt(fit, buildRequirementsQuestions(fit.keptIds), fit.keptIds, [], counts.n);
}

/** RED evidence is the whole state: command, summary, test name, and the task's acceptance criteria. No source code. */
export function buildRedExchange(
  taskNumber: string,
  testName: string,
  evidence: { command: string; summary: string },
  acceptanceCriteria: string,
): BuiltExchange | undefined {
  const counts = { n: 0 };
  const bound = (value: string | undefined, limit = FIELD_LIMIT): string => clip(value, limit, counts);
  const item = {
    id: 'red',
    taskNumber: bound(taskNumber, 50),
    testName: bound(testName, 300),
    command: bound(evidence.command, 500),
    summary: bound(evidence.summary, 2000),
    acceptance: bound(acceptanceCriteria),
  };
  const fit = fitState('red', [item], undefined);
  return fit.keptIds.length === 0 ? undefined : toBuilt(fit, buildRedQuestions(), fit.keptIds, [], counts.n);
}

export function buildDesignExchange(snapshot: AdvisorySnapshot): BuiltExchange | undefined {
  const counts = { n: 0 };
  const bound = (value: string | undefined, limit = FIELD_LIMIT): string => clip(value, limit, counts);
  const requirements = sectionsOf(snapshot.requirementsContent ?? '', REQUIREMENT_HEADING);
  const requirementText = new Map(requirements.map((section) => [section.id, {
    id: section.id, ears: bound(metadata(section, 'EARS Specification')), objective: bound(metadata(section, 'Objective')),
  }]));
  const decisions = sectionsOf(snapshot.content, DECISION_HEADING).map((section) => ({
    id: section.id,
    title: bound(section.title),
    covers: parseList(metadata(section, 'Covers')),
    decision: bound(metadata(section, 'Decision')),
    failureBehavior: bound(metadata(section, 'Failure behavior')),
    verification: bound(metadata(section, 'Verification')),
  }));
  if (decisions.length === 0) return undefined;
  const decisionItems = decisions.map((decision) => ({
    ...decision,
    coveredRequirements: decision.covers.flatMap((id) => requirementText.get(id) ?? []),
  }));
  const nfrItems = requirements.filter((section) => section.id.startsWith('NFR-')).map((section) => ({
    id: section.id,
    title: bound(section.title),
    ears: bound(metadata(section, 'EARS Specification')),
    objective: bound(metadata(section, 'Objective')),
    coveredBy: decisions.filter((decision) => decision.covers.includes(section.id)).map(({ id, decision }) => ({ id, decision })),
  }));
  const fit = fitState('design', [...decisionItems, ...nfrItems], undefined);
  const decisionIds = fit.keptIds.filter((id) => id.startsWith('D-'));
  const nfrIds = fit.keptIds.filter((id) => id.startsWith('NFR-'));
  if (decisionIds.length === 0) return undefined;
  return toBuilt(fit, buildDesignQuestions(decisionIds, nfrIds), decisionIds, nfrIds, counts.n);
}
