import { createHash } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { redactSecrets } from './JevRedaction.js';

export const MAX_EXCERPT_BYTES = 8192;
export const EXCERPT_CONTEXT_LINES = 15;
const MAX_SOURCE_BYTES = 1_048_576;

export interface ExcerptRequest {
  id: string;
  path: string;
  line: number;
}

export interface ExcerptResult {
  id: string;
  path: string;
  line: number;
  excerpt: string | null;
  excerptSha256: string | null;
  redactions: number;
}

export interface ExcerptBatch {
  items: ExcerptResult[];
  droppedFindingIds: string[];
  redactions: number;
}

const EXCLUDED_BASENAME_PREFIXES = ['.env', 'id_rsa', 'id_ed25519'];
const EXCLUDED_BASENAME_SUFFIXES = ['.pem', '.key', '.p12', '.pfx', '.crt', '.min.js'];
const EXCLUDED_BASENAMES = new Set([
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb', 'cargo.lock', 'poetry.lock', 'gemfile.lock', 'go.sum',
]);
const EXCLUDED_SEGMENTS = new Set(['dist', 'build', 'node_modules', '.claude', '.agents', '.codex', '.omp']);

const normalize = (value: string): string => value.replace(/\\/g, '/');

/** Secrets, keys, lockfiles, and generated output never leave the machine, even redacted. */
export function isExcludedPath(relativePath: string): boolean {
  const segments = normalize(relativePath).toLowerCase().split('/').filter(Boolean);
  const base = segments[segments.length - 1] ?? '';
  return EXCLUDED_BASENAMES.has(base)
    || EXCLUDED_BASENAME_PREFIXES.some((prefix) => base.startsWith(prefix))
    || EXCLUDED_BASENAME_SUFFIXES.some((suffix) => base.endsWith(suffix))
    || segments.slice(0, -1).some((segment) => EXCLUDED_SEGMENTS.has(segment));
}

function isSafeRelative(relativePath: string): boolean {
  const normalized = normalize(relativePath);
  return normalized.length > 0
    && !normalized.includes('\0')
    && !normalized.startsWith('/')
    && !/^[A-Za-z]:/.test(normalized)
    && !normalized.split('/').includes('..');
}

const isInside = (root: string, candidate: string): boolean => {
  const relative = path.relative(root, candidate);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
};

/** Reads the window of lines around `line`, or null for any unsafe, unreadable, or binary file. */
async function readWindow(root: string, request: ExcerptRequest): Promise<string | null> {
  if (!isSafeRelative(request.path) || isExcludedPath(request.path)) return null;
  try {
    const canonicalRoot = await realpath(root);
    const canonicalFile = await realpath(path.join(root, normalize(request.path)));
    if (!isInside(canonicalRoot, canonicalFile)) return null;
    const info = await stat(canonicalFile);
    if (!info.isFile() || info.size > MAX_SOURCE_BYTES) return null;
    const content = await readFile(canonicalFile, 'utf8');
    if (content.includes('\0')) return null;
    const lines = content.replace(/\r\n?/g, '\n').split('\n');
    if (request.line < 1 || request.line > lines.length) return null;
    const start = Math.max(1, request.line - EXCERPT_CONTEXT_LINES);
    const end = Math.min(lines.length, request.line + EXCERPT_CONTEXT_LINES);
    return lines.slice(start - 1, end).join('\n');
  } catch {
    return null;
  }
}

const empty = (request: ExcerptRequest): ExcerptResult => ({ ...request, excerpt: null, excerptSha256: null, redactions: 0 });

export async function buildExcerpts(projectRoot: string, requests: readonly ExcerptRequest[]): Promise<ExcerptBatch> {
  const root = path.resolve(projectRoot);
  const items: ExcerptResult[] = [];
  const droppedFindingIds: string[] = [];
  let usedBytes = 0;
  let overflowed = false;
  let redactions = 0;
  for (const request of requests) {
    if (overflowed) {
      items.push(empty(request));
      droppedFindingIds.push(request.id);
      continue;
    }
    const window = await readWindow(root, request);
    if (window === null) {
      items.push(empty(request));
      continue;
    }
    const redacted = redactSecrets(window);
    const bytes = Buffer.byteLength(redacted.text, 'utf8');
    if (usedBytes + bytes > MAX_EXCERPT_BYTES) {
      overflowed = true;
      items.push(empty(request));
      droppedFindingIds.push(request.id);
      continue;
    }
    usedBytes += bytes;
    redactions += redacted.count;
    items.push({
      ...request,
      excerpt: redacted.text,
      excerptSha256: createHash('sha256').update(redacted.text).digest('hex'),
      redactions: redacted.count,
    });
  }
  return { items, droppedFindingIds, redactions };
}
