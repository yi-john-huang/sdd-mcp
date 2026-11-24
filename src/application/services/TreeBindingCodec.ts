import type { TreeBinding, TreeDirtyEntry, TreeUnavailableReason } from '../../domain/types.js';
import { GovernanceError } from './WorkflowErrors.js';

/** At most this many dirty entries are stored; past it a binding is marked truncated. */
export const MAX_STORED_DIRTY_ENTRIES = 200;

const SHA256 = /^[a-f0-9]{64}$/;
const GIT_OBJECT_ID = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/;
const REASONS: ReadonlySet<TreeUnavailableReason> = new Set<TreeUnavailableReason>([
  'not-a-git-repo', 'git-unavailable', 'git-failed', 'timeout', 'too-many-changes',
]);

const invalid = (reference: string): GovernanceError =>
  new GovernanceError('StateInvariantViolation', `${reference} is not a valid working-tree binding`);

function isRelativePosixPath(value: unknown, allowEmpty = false): value is string {
  if (typeof value !== 'string') return false;
  if (value.length === 0) return allowEmpty;
  return value.length <= 500
    && !value.startsWith('/')
    && !value.includes('\\')
    && !/^[A-Za-z]:/.test(value)
    && !value.includes('\0')
    && !value.split('/').includes('..');
}

function isDirtyEntry(value: unknown): value is TreeDirtyEntry {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entry = value as Record<string, unknown>;
  return Object.keys(entry).every((key) => key === 'path' || key === 'token')
    && isRelativePosixPath(entry.path)
    && typeof entry.token === 'string'
    && (entry.token === 'deleted' || GIT_OBJECT_ID.test(entry.token));
}

function isValidBound(binding: Extract<TreeBinding, { status: 'bound' }>): boolean {
  const checks = [
    SHA256.test(binding.sha256),
    binding.head === null || GIT_OBJECT_ID.test(binding.head),
    isRelativePosixPath(binding.prefix, true) && (binding.prefix === '' || binding.prefix.endsWith('/')),
    binding.dirty === undefined || isDirtyList(binding.dirty),
    binding.dirtyTruncated === undefined || typeof binding.dirtyTruncated === 'boolean',
  ];
  return checks.every(Boolean);
}

function isDirtyList(value: unknown): boolean {
  return Array.isArray(value) && value.length <= MAX_STORED_DIRTY_ENTRIES && value.every(isDirtyEntry);
}

/** Validates an in-memory binding; throws StateInvariantViolation naming the reference. */
export function assertTreeBinding(binding: TreeBinding, reference: string): void {
  const valid = binding.status === 'unavailable' ? REASONS.has(binding.reason) : binding.status === 'bound' && isValidBound(binding);
  if (!valid) throw invalid(reference);
}

/** Reads a persisted snake_case binding into its in-memory form. */
export function parseTreeBinding(value: unknown, reference: string): TreeBinding {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid(reference);
  const raw = value as Record<string, unknown>;
  let binding: TreeBinding;
  if (raw.status === 'unavailable') {
    binding = { status: 'unavailable', reason: raw.reason as TreeUnavailableReason };
  } else if (raw.status === 'bound') {
    if (typeof raw.sha256 !== 'string' || typeof raw.prefix !== 'string') throw invalid(reference);
    binding = {
      status: 'bound',
      sha256: raw.sha256,
      head: raw.head as string | null,
      prefix: raw.prefix,
      ...(raw.dirty === undefined ? {} : { dirty: raw.dirty as TreeDirtyEntry[] }),
      ...(raw.dirty_truncated === undefined ? {} : { dirtyTruncated: raw.dirty_truncated as boolean }),
    };
  } else {
    throw invalid(reference);
  }
  assertTreeBinding(binding, reference);
  return binding;
}

/** The persisted snake_case form, with keys in a fixed order so rewrites stay byte-stable. */
export function serializeTreeBinding(binding: TreeBinding): Record<string, unknown> {
  if (binding.status === 'unavailable') return { status: 'unavailable', reason: binding.reason };
  return {
    status: 'bound',
    sha256: binding.sha256,
    head: binding.head,
    prefix: binding.prefix,
    ...(binding.dirty === undefined ? {} : { dirty: binding.dirty.map(({ path, token }) => ({ path, token })) }),
    ...(binding.dirtyTruncated === undefined ? {} : { dirty_truncated: binding.dirtyTruncated }),
  };
}
