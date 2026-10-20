import { createHash } from 'node:crypto';
import type { JevCase } from './JevCheckTypes.js';
import { buildTestcaseQuestions } from './JevQuestionCatalog.js';
import { redactThenClip } from './JevRedaction.js';
import { fitState, type BuiltExchange } from './JevSpecState.js';
import { metadata, parseList, parseSections, uniqueSections, visibleLines, type Section } from './WorkflowValidationService.js';
import type { AdvisorySnapshot } from './WorkflowEngineService.js';

const FIELD_LIMIT = 1500;
const CASE_FIELD_LIMIT = 500;
const TASK_HEADING = /^###\s+(\d+(?:\.\d+)+)\s+(.+?)\s*$/;
const REQUIREMENT_HEADING = /^###\s+((?:FR|NFR)-\d+):\s*(.+?)\s*$/;
const DECISION_HEADING = /^###\s+(D-\d+):\s*(.+?)\s*$/;

export interface TestcaseExchange extends BuiltExchange {
  /** Kept tasks with whether their TDD is marked not-applicable. */
  tasks: Array<{ id: string; notApplicable: boolean }>;
  /** Case task ids that do not belong to a kept TDD-required task, sorted. */
  unknownTasks: string[];
  caseListSha256: string;
}

function clip(value: string | undefined, limit: number, counts: { n: number }): string {
  const result = redactThenClip(value, limit);
  counts.n += result.count;
  return result.text;
}
const sectionsOf = (content: string, heading: RegExp): Section[] =>
  uniqueSections(parseSections(visibleLines(content), heading).sections);

/** Canonical, order-sensitive hash of the caller's whole case list. */
export function hashCaseList(cases: readonly JevCase[]): string {
  const canonical = cases.map((entry) => [entry.taskId, entry.kind, entry.given, entry.when, entry.then, entry.covers]);
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

const clipCase = (entry: JevCase, counts: { n: number }): Record<string, string> => ({
  kind: entry.kind,
  given: clip(entry.given, CASE_FIELD_LIMIT, counts),
  when: clip(entry.when, CASE_FIELD_LIMIT, counts),
  then: clip(entry.then, CASE_FIELD_LIMIT, counts),
  covers: clip(entry.covers, CASE_FIELD_LIMIT, counts),
});

export function buildTestcaseExchange(snapshot: AdvisorySnapshot, cases: readonly JevCase[]): TestcaseExchange | undefined {
  const counts = { n: 0 };
  const bound = (value: string | undefined, limit = FIELD_LIMIT): string => clip(value, limit, counts);
  const requirements = new Map(sectionsOf(snapshot.requirementsContent ?? '', REQUIREMENT_HEADING)
    .map((section) => [section.id, bound(metadata(section, 'EARS Specification'))] as const));
  const decisions = new Map(sectionsOf(snapshot.designContent ?? '', DECISION_HEADING)
    .map((section) => [section.id, bound(metadata(section, 'Decision'), 600)] as const));

  const tasks = sectionsOf(snapshot.content, TASK_HEADING).map((section) => {
    const tdd = metadata(section, 'TDD') ?? '';
    const covers = parseList(metadata(section, 'Covers'));
    return {
      section,
      notApplicable: tdd.startsWith('not-applicable'),
      reason: bound(tdd.replace(/^not-applicable\s*—\s*/, ''), 500),
      covers,
    };
  });
  if (tasks.length === 0) return undefined;

  const items = tasks.map(({ section, notApplicable, reason, covers }) => {
    const base = { id: section.id, title: bound(section.title, 300), acceptance: bound(metadata(section, 'Acceptance criteria')) };
    if (notApplicable) return { ...base, tddNotApplicable: true, reason };
    return {
      ...base,
      covers,
      coveredRequirements: covers.flatMap((id) => (requirements.has(id) ? [{ id, ears: requirements.get(id) }] : [])),
      coveredDecisions: covers.flatMap((id) => (decisions.has(id) ? [{ id, decision: decisions.get(id) }] : [])),
      cases: cases.filter((entry) => entry.taskId === section.id).map((entry) => clipCase(entry, counts)),
    };
  });

  const fit = fitState('testcases', items, undefined);
  if (fit.keptIds.length === 0) return undefined;
  const kept = tasks.filter(({ section }) => fit.keptIds.includes(section.id));
  const tddIds = new Set(kept.filter(({ notApplicable }) => !notApplicable).map(({ section }) => section.id));
  const unknownTasks = [...new Set(cases.map((entry) => entry.taskId).filter((id) => !tddIds.has(id)))].sort();
  const keptTasks = kept.map(({ section, notApplicable }) => ({ id: section.id, notApplicable }));
  return {
    state: fit.state,
    questions: buildTestcaseQuestions(keptTasks),
    itemIds: fit.keptIds,
    secondaryIds: [],
    omittedIds: fit.omittedIds,
    truncated: fit.truncated,
    redactions: fit.redactions + counts.n,
    tasks: keptTasks,
    unknownTasks,
    caseListSha256: hashCaseList(cases),
  };
}
