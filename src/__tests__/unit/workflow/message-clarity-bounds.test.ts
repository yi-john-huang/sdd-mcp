import { checkClarity, splitSentences } from '../../helpers/message-clarity';
import { MESSAGE_FILES, extractMessages, type ExtractedMessage } from '../../helpers/message-extractor';

const BOUNDS = { maxSentences: 2, maxWords: 25 };

/** Non-literal messages that forward text built elsewhere. Matched by file and code, not line. */
const FORWARDED: ReadonlyArray<{ file: string; code: string; reason: string }> = [
  {
    file: 'src/application/services/WorkflowEngineService.ts',
    code: 'StateInvariantViolation',
    reason: 'readRequired forwards a caller-supplied literal message',
  },
  {
    file: 'src/infrastructure/mcp/ToolRegistry.ts',
    code: 'InvalidParams',
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

  it('never names a host-specific command prefix', () => {
    const failures = messages
      .filter((entry) => /(^|\s)(\/skill:|\$sdd-|\/sdd-)/.test(entry.message))
      .map(describeMessage);
    expect(failures).toEqual([]);
  });

  it('allows a non-literal message only when it is a listed forward', () => {
    const unlisted = messages
      .filter((entry) => !entry.literal)
      .filter((entry) => !FORWARDED.some((allowed) => allowed.file === file && allowed.code === entry.code))
      .map(describeMessage);
    expect(unlisted).toEqual([]);
  });

  it('keeps every listed forward present in source', () => {
    for (const allowed of FORWARDED.filter((entry) => entry.file === file)) {
      expect(messages.some((entry) => !entry.literal && entry.code === allowed.code)).toBe(true);
    }
  });
});
