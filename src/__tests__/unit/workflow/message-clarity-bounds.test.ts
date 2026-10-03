import { checkClarity, splitSentences } from '../../helpers/message-clarity';
import { MESSAGE_FILES, extractMessages, type ExtractedMessage } from '../../helpers/message-extractor';

const BOUNDS = { maxSentences: 2, maxWords: 25 };

/** Non-literal messages that forward text built elsewhere. Matched by file, code, and exact count, not line. */
const FORWARDED: ReadonlyArray<{ file: string; code: string; count: number; reason: string }> = [
  {
    file: 'src/application/services/WorkflowEngineService.ts',
    code: 'StateInvariantViolation',
    count: 1,
    reason: 'readRequired forwards a caller-supplied literal message',
  },
  {
    file: 'src/infrastructure/mcp/ToolRegistry.ts',
    code: 'InvalidParams',
    count: 1,
    reason: 'forwards the schema validator error text',
  },
];

/** A next-action sentence starts with one of these imperative verbs. */
const ACTION_VERBS = [
  'Add', 'Answer', 'Approve', 'Change', 'Complete', 'Continue', 'Correct', 'Declare', 'Fix', 'Give', 'Inspect',
  'List', 'Load', 'Make', 'Merge', 'Move', 'Name', 'Read', 'Record', 'Reload', 'Remove', 'Rename', 'Reread',
  'Restore', 'Resubmit', 'Resolve', 'Retry', 'Revise', 'Run', 'Select', 'Shorten', 'Split', 'Start', 'Submit',
  'Use', 'Wait', 'Write',
] as const;

/** Recoverable codes: the user or Skill can act on these, so the message names the next action. */
const RECOVERABLE_ENGINE_CODES: ReadonlySet<string> = new Set([
  'ArtifactDrift', 'LegacyStateConflict', 'LegacyTaskConflict', 'PhaseNotApproved', 'PhaseValidationFailed',
  'RecoveryConflict', 'RevisionConflict', 'TaskDependencyIncomplete', 'TaskTransitionInvalid',
]);

const REQUIRES_NEXT_ACTION: Readonly<Record<(typeof MESSAGE_FILES)[number], (entry: ExtractedMessage) => boolean>> = {
  'src/application/services/WorkflowValidationService.ts': () => true,
  'src/application/services/WorkflowEngineService.ts': (entry) => RECOVERABLE_ENGINE_CODES.has(entry.code ?? ''),
  'src/adapters/cli/SDDToolAdapter.ts': () => true,
  'src/infrastructure/mcp/ToolRegistry.ts': () => true,
};

function namesNextAction(message: string): boolean {
  return splitSentences(message).some((sentence) => ACTION_VERBS.some((verb) => sentence.startsWith(`${verb} `)));
}

function describeMessage(entry: ExtractedMessage): string {
  return `${entry.file}:${entry.line} [${entry.code}] ${entry.message}`;
}

describe.each(MESSAGE_FILES)('message clarity bounds: %s', (file) => {
  const messages = extractMessages(file);

  it('keeps every literal message within 2 sentences and 25 words per sentence', () => {
    const failures = messages
      .filter((entry) => entry.literal)
      .map((entry) => ({ entry, result: checkClarity(entry.message, BOUNDS) }))
      .filter(({ result }) => !result.ok)
      .map(({ entry, result }) => `${describeMessage(entry)} -> ${result.reason}`);
    expect(failures).toEqual([]);
  });

  it('names the next action in every actionable message', () => {
    const missing = messages
      .filter((entry) => entry.literal && REQUIRES_NEXT_ACTION[file](entry))
      .filter((entry) => !namesNextAction(entry.message))
      .map(describeMessage);
    expect(missing).toEqual([]);
  });

  it('never advises deleting an artifact, journal, or file', () => {
    const destructive = messages
      .filter((entry) => splitSentences(entry.message).some((sentence) =>
        /^(Remove|Delete)\b.*\b(artifact|journal|file)\b/i.test(sentence)))
      .map(describeMessage);
    expect(destructive).toEqual([]);
  });

  it('never names a host-specific command prefix', () => {
    const failures = messages
      .filter((entry) => /(^|\s)(\/skill:|\$sdd-|\/sdd-)/.test(entry.message))
      .map(describeMessage);
    expect(failures).toEqual([]);
  });

  it('allows exactly the listed number of non-literal messages per code', () => {
    const counts = new Map<string, number>();
    for (const entry of messages.filter((candidate) => !candidate.literal)) {
      const code = entry.code ?? '<dynamic>';
      counts.set(code, (counts.get(code) ?? 0) + 1);
    }
    const allowed = new Map(FORWARDED.filter((entry) => entry.file === file).map((entry) => [entry.code, entry.count]));
    expect(Object.fromEntries(counts)).toEqual(Object.fromEntries(allowed));
  });
});
