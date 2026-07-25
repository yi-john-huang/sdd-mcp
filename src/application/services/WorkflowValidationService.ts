import { injectable } from 'inversify';

export interface ValidationBlocker {
  code: string;
  message: string;
  reference?: string;
}

export interface ParsedTask {
  title: string;
  tddRequired: boolean;
  dependencies: string[];
  plannedArtifacts: string[];
}

export interface ArtifactValidationResult {
  status: 'passed' | 'failed';
  blockers: ValidationBlocker[];
}

export interface RequirementsValidationResult extends ArtifactValidationResult {
  requirementIds: string[];
}

export interface DesignValidationResult extends ArtifactValidationResult {
  decisionIds: string[];
}

export interface TasksValidationResult extends ArtifactValidationResult {
  tasks: Record<string, ParsedTask>;
}

interface Section {
  id: string;
  title: string;
  body: string[];
}

const REQUIRED_DESIGN_HEADINGS = [
  'Requirements Traceability',
  'Architecture and Data Flow',
  'Components and Interfaces',
  'Failure Handling',
  'Verification',
] as const;

function resultStatus(blockers: ValidationBlocker[]): 'passed' | 'failed' {
  return blockers.length === 0 ? 'passed' : 'failed';
}
function bounded(blockers: ValidationBlocker[]): ValidationBlocker[] {
  return blockers.slice(0, 100);
}


function blocker(code: string, message: string, reference?: string): ValidationBlocker {
  const boundedMessage = message.slice(0, 2_000);
  return reference === undefined
    ? { code: code.slice(0, 100), message: boundedMessage }
    : { code: code.slice(0, 100), message: boundedMessage, reference: reference.slice(0, 200) };
}

/** Removes fenced regions while preserving line boundaries for deterministic parsing. */
function visibleLines(content: string): string[] {
  const lines = content.replace(/\r\n?/g, '\n').split('\n');
  let fence: { marker: '`' | '~'; length: number } | undefined;
  return lines.map((line) => {
    const match = /^\s*(`{3,}|~{3,})/.exec(line);
    if (!fence) {
      if (match) {
        fence = { marker: match[1][0] as '`' | '~', length: match[1].length };
        return '';
      }
      return line;
    }
    const close = new RegExp(`^\\s*${fence.marker}{${fence.length},}\\s*$`);
    if (close.test(line)) fence = undefined;
    return '';
  });
}

function parseSections(lines: string[], heading: RegExp): { sections: Section[]; duplicates: string[] } {
  const sections: Section[] = [];
  let current: Section | undefined;
  for (const line of lines) {
    const headingMatch = heading.exec(line);
    if (headingMatch) {
      current = { id: headingMatch[1], title: headingMatch[2].trim(), body: [] };
      sections.push(current);
      continue;
    }
    if (/^#{1,3}(?:\s|$)/.test(line)) {
      current = undefined;
      continue;
    }
    current?.body.push(line);
  }
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const section of sections) {
    if (seen.has(section.id)) duplicates.push(section.id);
    seen.add(section.id);
  }
  return { sections, duplicates: [...new Set(duplicates)] };
}

function metadataValues(section: Section, label: string): string[] {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const expression = new RegExp(`^\\s*\\*\\*${escaped}:\\*\\*\\s*(\\S(?:.*\\S)?)\\s*$`);
  const values: string[] = [];
  for (const line of section.body) {
    const match = expression.exec(line);
    if (match) values.push(match[1]);
  }
  return values;
}

function metadata(section: Section, label: string): string | undefined {
  return metadataValues(section, label)[0];
}

function parseList(value: string | undefined): string[] {
  if (!value || value.trim() === 'none') return [];
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function hasDuplicates(values: readonly string[]): boolean {
  return new Set(values).size !== values.length;
}

function isProjectRelativePath(value: string): boolean {
  return value.length > 0
    && value.length <= 500
    && !/^[/\\]/.test(value)
    && !/^[A-Za-z]:/.test(value)
    && !value.includes('\0')
    && !value.split(/[\\/]/).includes('..')
    && value === value.trim();
}

function uniqueSections(sections: Section[]): Section[] {
  const byId = new Map<string, Section>();
  for (const section of sections) if (!byId.has(section.id)) byId.set(section.id, section);
  return [...byId.values()];
}

function extractRequirementIds(content: string): string[] {
  const { sections } = parseSections(visibleLines(content), /^###\s+((?:FR|NFR)-\d+):\s*(.+?)\s*$/);
  return uniqueSections(sections).map(({ id }) => id);
}

function extractDecisionIds(content: string): string[] {
  const { sections } = parseSections(visibleLines(content), /^###\s+(D-\d+):\s*(.+?)\s*$/);
  return uniqueSections(sections).map(({ id }) => id);
}

function addDuplicateBlockers(blockers: ValidationBlocker[], duplicates: string[]): void {
  for (const id of duplicates) blockers.push(blocker('DuplicateId', `Identifier is declared more than once: ${id}`, id));
}

function requireMetadata(
  blockers: ValidationBlocker[],
  section: Section,
  labels: readonly string[],
): Record<string, string | undefined> {
  const values: Record<string, string | undefined> = {};
  for (const label of labels) {
    const matches = metadataValues(section, label);
    values[label] = matches[0];
    if (!values[label]) blockers.push(blocker('MissingMetadata', `Missing or empty **${label}:** metadata`, section.id));
    if (matches.length > 1) blockers.push(blocker('DuplicateMetadata', `Metadata label appears more than once: **${label}:**`, section.id));
  }
  return values;
}

function coverageBlockers(actual: Set<string>, expected: readonly string[]): ValidationBlocker[] {
  return expected
    .filter((id) => !actual.has(id))
    .map((id) => blocker('CoverageMissing', `Required identifier is not covered: ${id}`, id));
}

@injectable()
export class WorkflowValidationService {
  validateRequirements(content: string): RequirementsValidationResult {
    const blockers: ValidationBlocker[] = [];
    if (content.trim().length === 0) blockers.push(blocker('EmptyContent', 'Requirements content must not be empty'));
    const { sections, duplicates } = parseSections(
      visibleLines(content),
      /^###\s+((?:FR|NFR)-\d+):\s*(.+?)\s*$/,
    );
    addDuplicateBlockers(blockers, duplicates);
    if (sections.length === 0) blockers.push(blocker('RequirementsMissing', 'At least one FR-N requirement section is required'));
    if (!sections.some(({ id }) => id.startsWith('FR-'))) {
      blockers.push(blocker('FunctionalRequirementMissing', 'At least one FR-N requirement section is required'));
    }
    for (const section of uniqueSections(sections)) {
      const values = requireMetadata(blockers, section, ['Objective', 'EARS Specification', 'Acceptance Criteria']);
      const ears = values['EARS Specification'];
      if (ears && !/\bSHALL\b/.test(ears)) {
        blockers.push(blocker('EarsShallMissing', 'EARS Specification must contain SHALL', section.id));
      }
      const acceptance = values['Acceptance Criteria'];
      if (acceptance && !/(?:^|\s)\d+\.\s+\S/.test(acceptance)) {
        blockers.push(blocker('AcceptanceCriteriaMissing', 'Acceptance Criteria must contain a numbered item', section.id));
      }
    }
    const requirementIds = uniqueSections(sections).map(({ id }) => id);
    return { status: resultStatus(blockers), blockers: bounded(blockers), requirementIds };
  }

  validateDesign(content: string, approvedRequirementsContent: string): DesignValidationResult {
    const blockers: ValidationBlocker[] = [];
    const lines = visibleLines(content);
    if (content.trim().length === 0) blockers.push(blocker('EmptyContent', 'Design content must not be empty'));
    for (const heading of REQUIRED_DESIGN_HEADINGS) {
      if (!lines.some((line) => line === `## ${heading}`)) {
        blockers.push(blocker('MissingHeading', `Missing exact heading: ## ${heading}`, heading));
      }
    }
    const { sections, duplicates } = parseSections(lines, /^###\s+(D-\d+):\s*(.+?)\s*$/);
    addDuplicateBlockers(blockers, duplicates);
    if (sections.length === 0) blockers.push(blocker('DesignDecisionMissing', 'At least one D-N decision section is required'));
    const knownRequirements = extractRequirementIds(approvedRequirementsContent);
    const knownSet = new Set(knownRequirements);
    const covered = new Set<string>();
    for (const section of uniqueSections(sections)) {
      const values = requireMetadata(blockers, section, ['Covers', 'Decision', 'Failure behavior', 'Verification']);
      for (const id of parseList(values.Covers)) {
        if (!knownSet.has(id)) {
          blockers.push(blocker('UnknownCoverageId', `Covers references unknown requirement: ${id}`, section.id));
        } else {
          covered.add(id);
        }
      }
    }
    blockers.push(...coverageBlockers(covered, knownRequirements));
    return {
      status: resultStatus(blockers),
      blockers: bounded(blockers),
      decisionIds: uniqueSections(sections).map(({ id }) => id),
    };
  }

  parseTasks(content: string): TasksValidationResult {
    const blockers: ValidationBlocker[] = [];
    const { sections, duplicates } = parseSections(
      visibleLines(content),
      /^###\s+(\d+(?:\.\d+)+)\s+(.+?)\s*$/,
    );
    addDuplicateBlockers(blockers, duplicates);
    if (sections.length === 0) blockers.push(blocker('TaskMissing', 'At least one N.M task section is required'));
    const unique = uniqueSections(sections);
    if (unique.length > 1_000) {
      blockers.push(blocker('TaskLimitExceeded', 'Tasks must contain at most 1000 unique task sections'));
    }
    const tasks: Record<string, ParsedTask> = {};
    for (const section of unique) {
      if (section.id.length > 50) {
        blockers.push(blocker('InvalidTaskId', 'Task identifiers must contain at most 50 characters', section.id.slice(0, 50)));
      }
      if (section.title.trim().length === 0 || section.title.length > 500) {
        blockers.push(blocker('InvalidTaskTitle', 'Task titles must be non-whitespace and at most 500 characters', section.id.slice(0, 50)));
      }
      const values = requireMetadata(blockers, section, [
        'Covers',
        'Dependencies',
        'TDD',
        'Affected artifacts',
        'Acceptance criteria',
        'Verification',
      ]);
      const tdd = values.TDD;
      let tddRequired = false;
      if (tdd === 'required') tddRequired = true;
      else if (!tdd || !/^not-applicable — \S(?:.*\S)?$/.test(tdd)) {
        blockers.push(blocker('InvalidTdd', 'TDD must be required or not-applicable — <reason>', section.id));
      }
      const dependencies = parseList(values.Dependencies);
      const plannedArtifacts = parseList(values['Affected artifacts']);
      if (dependencies.includes('none') || plannedArtifacts.includes('none')) {
        blockers.push(blocker('InvalidListValue', 'none must be the only value in an empty metadata list', section.id));
      }
      if (dependencies.length > 100) {
        blockers.push(blocker('ListTooLong', 'Dependencies must contain at most 100 entries', section.id));
      }
      if (plannedArtifacts.length > 100) {
        blockers.push(blocker('ListTooLong', 'Affected artifacts must contain at most 100 entries', section.id));
      }
      if (hasDuplicates(dependencies)) {
        blockers.push(blocker('DuplicateListItem', 'Dependencies must not contain duplicate task IDs', section.id));
      }
      if (hasDuplicates(plannedArtifacts)) {
        blockers.push(blocker('DuplicateListItem', 'Affected artifacts must not contain duplicate paths', section.id));
      }
      for (const artifact of plannedArtifacts) {
        if (!isProjectRelativePath(artifact)) {
          blockers.push(blocker('InvalidArtifactPath', `Affected artifact must be project-relative: ${artifact}`, section.id));
        }
      }
      tasks[section.id] = {
        title: section.title,
        tddRequired,
        dependencies,
        plannedArtifacts,
      };
      const acceptance = values['Acceptance criteria'];
      if (acceptance && !/(?:^|\s)\d+\.\s+\S/.test(acceptance)) {
        blockers.push(blocker('AcceptanceCriteriaMissing', 'Acceptance criteria must contain a numbered item', section.id));
      }
    }
    const taskIds = new Set(Object.keys(tasks));
    for (const [id, task] of Object.entries(tasks)) {
      for (const dependency of task.dependencies) {
        if (!taskIds.has(dependency)) blockers.push(blocker('UnknownDependency', `Unknown dependency: ${dependency}`, id));
      }
    }
    const visiting = new Set<string>();
    const visited = new Set<string>();
    let cycleFound = false;
    const visit = (id: string): void => {
      if (visiting.has(id)) {
        cycleFound = true;
        return;
      }
      if (visited.has(id)) return;
      visiting.add(id);
      for (const dependency of tasks[id]?.dependencies ?? []) if (taskIds.has(dependency)) visit(dependency);
      visiting.delete(id);
      visited.add(id);
    };
    for (const id of taskIds) visit(id);
    if (cycleFound) blockers.push(blocker('DependencyCycle', 'Task dependencies must form an acyclic graph'));
    return { status: resultStatus(blockers), blockers: bounded(blockers), tasks };
  }

  validateTasks(
    content: string,
    approvedRequirementsContent: string,
    approvedDesignContent: string,
  ): TasksValidationResult {
    const parsed = this.parseTasks(content);
    const blockers = [...parsed.blockers];
    if (content.trim().length === 0 && !blockers.some(({ code }) => code === 'EmptyContent')) {
      blockers.unshift(blocker('EmptyContent', 'Tasks content must not be empty'));
    }
    const known = [...extractRequirementIds(approvedRequirementsContent), ...extractDecisionIds(approvedDesignContent)];
    const knownSet = new Set(known);
    const covered = new Set<string>();
    const lines = visibleLines(content);
    const { sections } = parseSections(lines, /^###\s+(\d+(?:\.\d+)+)\s+(.+?)\s*$/);
    for (const section of uniqueSections(sections)) {
      for (const id of parseList(metadata(section, 'Covers'))) {
        if (!knownSet.has(id)) blockers.push(blocker('UnknownCoverageId', `Covers references unknown identifier: ${id}`, section.id));
        else covered.add(id);
      }
    }
    blockers.push(...coverageBlockers(covered, known));
    return { status: resultStatus(blockers), blockers: bounded(blockers), tasks: parsed.tasks };
  }
}
