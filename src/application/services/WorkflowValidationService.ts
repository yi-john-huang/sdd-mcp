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

const ANY_METADATA_LABEL = /^\s*\*\*[^*]+:\*\*/;

/**
 * A metadata value may sit inline after the label or, per the documented
 * requirements shape (skills/sdd-requirements/REFERENCE.md), on the lines
 * that follow a label with nothing after it (e.g. `**Acceptance Criteria:**`
 * followed by a numbered list). Collect both forms.
 */
function metadataValues(section: Section, label: string): string[] {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const start = new RegExp(`^\\s*\\*\\*${escaped}:\\*\\*\\s*(.*)$`);
  const body = section.body;
  const values: string[] = [];
  for (let i = 0; i < body.length; i++) {
    const match = start.exec(body[i]);
    if (!match) continue;
    const collected: string[] = [];
    const inline = match[1].trim();
    if (inline) collected.push(inline);
    let j = i + 1;
    while (j < body.length && !ANY_METADATA_LABEL.test(body[j])) {
      collected.push(body[j]);
      j++;
    }
    while (collected.length > 0 && collected[collected.length - 1] === '') {
      collected.pop();
    }
    const value = collected.join('\n').trim();
    if (value) values.push(value);
    i = j - 1;
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
  for (const id of duplicates) blockers.push(blocker('DuplicateId', `The identifier ${id} is declared more than once. Rename each duplicate so every identifier is unique.`, id));
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
    if (!values[label]) blockers.push(blocker('MissingMetadata', `The section has no **${label}:** metadata or it is empty. Add a value after **${label}:**.`, section.id));
    if (matches.length > 1) blockers.push(blocker('DuplicateMetadata', `The label **${label}:** appears more than once. Remove each duplicate label.`, section.id));
  }
  return values;
}

function coverageBlockers(actual: Set<string>, expected: readonly string[]): ValidationBlocker[] {
  return expected
    .filter((id) => !actual.has(id))
    .map((id) => blocker('CoverageMissing', `The required identifier ${id} is not covered. Add ${id} to a Covers list.`, id));
}

@injectable()
export class WorkflowValidationService {
  validateRequirements(content: string): RequirementsValidationResult {
    const blockers: ValidationBlocker[] = [];
    if (content.trim().length === 0) blockers.push(blocker('EmptyContent', 'The requirements content is empty. Write at least one requirement section.'));
    const { sections, duplicates } = parseSections(
      visibleLines(content),
      /^###\s+((?:FR|NFR)-\d+):\s*(.+?)\s*$/,
    );
    addDuplicateBlockers(blockers, duplicates);
    if (sections.length === 0) blockers.push(blocker('RequirementsMissing', 'The requirements have no FR-N requirement section. Add at least one FR-N requirement section.'));
    if (!sections.some(({ id }) => id.startsWith('FR-'))) {
      blockers.push(blocker('FunctionalRequirementMissing', 'The requirements have no FR-N requirement section. Add at least one FR-N requirement section.'));
    }
    for (const section of uniqueSections(sections)) {
      const values = requireMetadata(blockers, section, ['Objective', 'EARS Specification', 'Acceptance Criteria']);
      const ears = values['EARS Specification'];
      if (ears && !/\bSHALL\b/.test(ears)) {
        blockers.push(blocker('EarsShallMissing', 'The EARS Specification has no SHALL. Add SHALL to state the required behavior.', section.id));
      }
      const acceptance = values['Acceptance Criteria'];
      if (acceptance && !/(?:^|\s)\d+\.\s+\S/.test(acceptance)) {
        blockers.push(blocker('AcceptanceCriteriaMissing', 'The Acceptance Criteria has no numbered item. Add a numbered item that starts with a digit and a period.', section.id));
      }
    }
    const requirementIds = uniqueSections(sections).map(({ id }) => id);
    return { status: resultStatus(blockers), blockers: bounded(blockers), requirementIds };
  }

  validateDesign(content: string, approvedRequirementsContent: string): DesignValidationResult {
    const blockers: ValidationBlocker[] = [];
    const lines = visibleLines(content);
    if (content.trim().length === 0) blockers.push(blocker('EmptyContent', 'The design content is empty. Write the required headings and at least one D-N design decision.'));
    for (const heading of REQUIRED_DESIGN_HEADINGS) {
      if (!lines.some((line) => line === `## ${heading}`)) {
        blockers.push(blocker('MissingHeading', `The design has no exact heading ## ${heading}. Add the heading ## ${heading}.`, heading));
      }
    }
    const { sections, duplicates } = parseSections(lines, /^###\s+(D-\d+):\s*(.+?)\s*$/);
    addDuplicateBlockers(blockers, duplicates);
    if (sections.length === 0) blockers.push(blocker('DesignDecisionMissing', 'The design has no D-N design decision section. Add at least one D-N design decision section.'));
    const knownRequirements = extractRequirementIds(approvedRequirementsContent);
    const knownSet = new Set(knownRequirements);
    const covered = new Set<string>();
    for (const section of uniqueSections(sections)) {
      const values = requireMetadata(blockers, section, ['Covers', 'Decision', 'Failure behavior', 'Verification']);
      for (const id of parseList(values.Covers)) {
        if (!knownSet.has(id)) {
          blockers.push(blocker('UnknownCoverageId', `The Covers list names unknown requirement ${id}. Correct ${id} to an existing requirement section ID.`, section.id));
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
    if (sections.length === 0) blockers.push(blocker('TaskMissing', 'The tasks have no N.M task section. Add at least one N.M task section.'));
    const unique = uniqueSections(sections);
    if (unique.length > 1_000) {
      blockers.push(blocker('TaskLimitExceeded', 'The tasks exceed the limit of 1000 unique task sections. Remove or merge tasks to stay within 1000.'));
    }
    const tasks: Record<string, ParsedTask> = {};
    for (const section of unique) {
      if (section.id.length > 50) {
        blockers.push(blocker('InvalidTaskId', 'The task identifier exceeds the limit of 50 characters. Shorten the task identifier to 50 characters or fewer.', section.id.slice(0, 50)));
      }
      if (section.title.trim().length === 0 || section.title.length > 500) {
        blockers.push(blocker('InvalidTaskTitle', 'The task title is blank or exceeds the limit of 500 characters. Write a non-blank task title of 500 characters or fewer.', section.id.slice(0, 50)));
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
        blockers.push(blocker('InvalidTdd', 'The TDD value is not required or not-applicable — <reason>. Write required or not-applicable — <reason>.', section.id));
      }
      const dependencies = parseList(values.Dependencies);
      const plannedArtifacts = parseList(values['Affected artifacts']);
      if (dependencies.includes('none') || plannedArtifacts.includes('none')) {
        blockers.push(blocker('InvalidListValue', 'The metadata list mixes none with other values. Remove the other values or remove none.', section.id));
      }
      if (dependencies.length > 100) {
        blockers.push(blocker('ListTooLong', 'The Dependencies list exceeds the limit of 100 entries. Remove entries to keep 100 or fewer.', section.id));
      }
      if (plannedArtifacts.length > 100) {
        blockers.push(blocker('ListTooLong', 'The Affected artifacts list exceeds the limit of 100 entries. Remove entries to keep 100 or fewer.', section.id));
      }
      if (hasDuplicates(dependencies)) {
        blockers.push(blocker('DuplicateListItem', 'The Dependencies list repeats a task ID. Remove each duplicate task ID.', section.id));
      }
      if (hasDuplicates(plannedArtifacts)) {
        blockers.push(blocker('DuplicateListItem', 'The Affected artifacts list repeats a path. Remove each duplicate path.', section.id));
      }
      for (const artifact of plannedArtifacts) {
        if (!isProjectRelativePath(artifact)) {
          blockers.push(blocker('InvalidArtifactPath', `The Affected artifacts path ${artifact} is not project-relative. Change ${artifact} to a path relative to the project root.`, section.id));
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
        blockers.push(blocker('AcceptanceCriteriaMissing', 'The Acceptance criteria has no numbered item. Add a numbered item that starts with a digit and a period.', section.id));
      }
    }
    const taskIds = new Set(Object.keys(tasks));
    for (const [id, task] of Object.entries(tasks)) {
      for (const dependency of task.dependencies) {
        if (!taskIds.has(dependency)) blockers.push(blocker('UnknownDependency', `The Dependencies list names unknown task ${dependency}. Correct ${dependency} to an existing task ID.`, id));
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
    if (cycleFound) blockers.push(blocker('DependencyCycle', 'The task Dependencies form a cycle. Remove a dependency to break the cycle.'));
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
      blockers.unshift(blocker('EmptyContent', 'The tasks content is empty. Write at least one N.M task section.'));
    }
    const known = [...extractRequirementIds(approvedRequirementsContent), ...extractDecisionIds(approvedDesignContent)];
    const knownSet = new Set(known);
    const covered = new Set<string>();
    const lines = visibleLines(content);
    const { sections } = parseSections(lines, /^###\s+(\d+(?:\.\d+)+)\s+(.+?)\s*$/);
    for (const section of uniqueSections(sections)) {
      for (const id of parseList(metadata(section, 'Covers'))) {
        if (!knownSet.has(id)) blockers.push(blocker('UnknownCoverageId', `The Covers list names unknown identifier ${id}. Correct ${id} to an existing FR-N or D-N identifier.`, section.id));
        else covered.add(id);
      }
    }
    blockers.push(...coverageBlockers(covered, known));
    return { status: resultStatus(blockers), blockers: bounded(blockers), tasks: parsed.tasks };
  }
}
