import path from 'node:path';
import type { FileSystemPort, LoggerPort } from '../../domain/ports.js';
import type { JevAnswer, JevMeta, JevScoreBase } from './JevResponseValidator.js';
import { SpecPathResolver, validateFeatureName } from './SpecPathResolver.js';

export type SidecarKind = 'requirements' | 'design' | 'testcases' | 'red' | 'security' | 'principles';

export interface SidecarBinding {
  questionSetVersion: number;
  revision?: number;
  artifactSha256?: string;
  caseListSha256?: string;
  evidenceSha256?: string;
  diffSha256?: string;
  inputSha256?: string;
}

export interface SidecarItem {
  id: string;
  location?: string;
  excerptSha256?: string | null;
  modelSeverity?: string;
  jevSeverity?: string;
  disagreement?: boolean;
  classification?: string;
}

export interface JevSidecar {
  schema: 1;
  kind: SidecarKind;
  createdAt: string;
  binding: SidecarBinding;
  status: 'answered' | 'unavailable';
  reason?: string;
  source: 'jev' | 'local';
  answers?: Record<string, JevAnswer>;
  scoreBase?: JevScoreBase;
  meta?: JevMeta;
  baseCommit?: string | null;
  truncated: boolean;
  omittedIds: string[];
  droppedFindingIds: string[];
  redactions: number;
  items?: SidecarItem[];
}

export interface WriteResult {
  persisted: boolean;
  /** Project-relative POSIX path of the written sidecar. */
  path?: string;
}

const MAX_SIDECAR_BYTES = 1_048_576;
const HASH_PREFIX = 12;
const KINDS: ReadonlySet<string> = new Set(['requirements', 'design', 'testcases', 'red', 'security', 'principles']);
/** Reasons that must leave no filesystem trace at all. */
const TRACELESS_REASONS: ReadonlySet<string> = new Set(['disabled', 'no-key']);
const BINDING_KEYS = ['questionSetVersion', 'revision', 'artifactSha256', 'caseListSha256', 'evidenceSha256', 'diffSha256', 'inputSha256'] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === 'string');

function pickBinding(binding: SidecarBinding): SidecarBinding {
  const picked: Record<string, unknown> = {};
  for (const key of BINDING_KEYS) if (binding[key] !== undefined) picked[key] = binding[key];
  return picked as unknown as SidecarBinding;
}

function pickAnswer(answer: JevAnswer): JevAnswer {
  if (answer.type === 'choice') return { type: 'choice', choice: answer.choice };
  if (answer.type === 'score') return { type: 'score', raw: answer.raw, index: answer.index };
  return { type: 'noul', noul: answer.noul };
}

function pickItem(item: SidecarItem): SidecarItem {
  return {
    id: item.id, location: item.location, excerptSha256: item.excerptSha256, modelSeverity: item.modelSeverity,
    jevSeverity: item.jevSeverity, disagreement: item.disagreement, classification: item.classification,
  };
}

/** Whitelist serialization: unknown fields (a key, a request body, excerpt text) can never be written. */
function toStored(sidecar: JevSidecar): JevSidecar {
  return {
    schema: 1,
    kind: sidecar.kind,
    createdAt: sidecar.createdAt,
    binding: pickBinding(sidecar.binding),
    status: sidecar.status,
    reason: sidecar.reason,
    source: sidecar.source,
    answers: sidecar.answers && Object.fromEntries(Object.entries(sidecar.answers).map(([id, answer]) => [id, pickAnswer(answer)])),
    scoreBase: sidecar.scoreBase,
    meta: sidecar.meta && Object.fromEntries(Object.entries(sidecar.meta).filter(([, value]) => value === null || ['string', 'number', 'boolean'].includes(typeof value))),
    baseCommit: sidecar.baseCommit,
    truncated: sidecar.truncated,
    omittedIds: [...sidecar.omittedIds],
    droppedFindingIds: [...sidecar.droppedFindingIds],
    redactions: sidecar.redactions,
    items: sidecar.items?.map(pickItem),
  };
}

function isAnswer(value: unknown): value is JevAnswer {
  if (!isRecord(value)) return false;
  if (value.type === 'choice') return typeof value.choice === 'string';
  if (value.type === 'score') return Number.isInteger(value.raw) && Number.isInteger(value.index);
  return value.type === 'noul' && typeof value.noul === 'number';
}

function hasValidHeader(value: Record<string, unknown>): boolean {
  return value.schema === 1
    && typeof value.kind === 'string' && KINDS.has(value.kind)
    && typeof value.createdAt === 'string'
    && isRecord(value.binding) && typeof value.binding.questionSetVersion === 'number'
    && (value.status === 'answered' || value.status === 'unavailable')
    && (value.source === 'jev' || value.source === 'local');
}

function hasValidBody(value: Record<string, unknown>): boolean {
  return typeof value.truncated === 'boolean'
    && typeof value.redactions === 'number'
    && isStringArray(value.omittedIds)
    && isStringArray(value.droppedFindingIds)
    && (value.answers === undefined || (isRecord(value.answers) && Object.values(value.answers).every(isAnswer)));
}

function isSidecar(value: unknown): value is JevSidecar {
  return isRecord(value) && hasValidHeader(value) && hasValidBody(value);
}

function sameBinding(stored: SidecarBinding, current: SidecarBinding): boolean {
  return BINDING_KEYS.every((key) => stored[key] === current[key]);
}

export class JevSidecarStore {
  constructor(
    private readonly fileSystem: FileSystemPort,
    private readonly logger: LoggerPort,
  ) {}

  fileNameFor(kind: SidecarKind, binding: SidecarBinding, taskNumber?: string): string {
    if (kind === 'red') {
      const task = (taskNumber ?? '').replace(/[^0-9.]/g, '') || 'task';
      return `jev-red-${task}-${(binding.evidenceSha256 ?? '').slice(0, HASH_PREFIX)}.json`;
    }
    if (kind === 'security' || kind === 'principles') {
      return `jev-review-${kind}-${(binding.diffSha256 ?? '').slice(0, HASH_PREFIX)}.json`;
    }
    return `jev-${kind}-r${binding.revision ?? 0}.json`;
  }

  /** Project-relative POSIX path a sidecar for this binding is (or would be) stored at. */
  relativePath(featureName: string | undefined, kind: SidecarKind, binding: SidecarBinding, taskNumber?: string): string {
    const dir = featureName === undefined ? '.spec/reviews' : `.spec/specs/${featureName}/review`;
    return `${dir}/${this.fileNameFor(kind, binding, taskNumber)}`;
  }

  async write(
    projectRoot: string,
    featureName: string | undefined,
    sidecar: JevSidecar,
    taskNumber?: string,
  ): Promise<WriteResult> {
    if (sidecar.status === 'unavailable' && sidecar.reason !== undefined && TRACELESS_REASONS.has(sidecar.reason)) {
      return { persisted: false };
    }
    try {
      const root = path.resolve(projectRoot);
      const dir = this.reviewDir(root, featureName);
      if (featureName !== undefined && !(await this.fileSystem.exists(path.join(root, '.spec', 'specs', featureName)))) {
        return { persisted: false };
      }
      await this.contain(root, dir);
      const file = path.join(dir, this.fileNameFor(sidecar.kind, sidecar.binding, taskNumber));
      const content = `${JSON.stringify(toStored(sidecar), null, 2)}\n`;
      if (Buffer.byteLength(content, 'utf8') > MAX_SIDECAR_BYTES) return { persisted: false };
      await this.fileSystem.mkdir(dir);
      await this.contain(root, dir);
      await this.contain(root, file);
      if (this.fileSystem.writeFileAtomic) await this.fileSystem.writeFileAtomic(file, content);
      else await this.fileSystem.writeFile(file, content);
      return { persisted: true, path: path.relative(root, file).split(path.sep).join('/') };
    } catch (error) {
      this.logger.warn('JEV sidecar not persisted', { kind: sidecar.kind, errorName: error instanceof Error ? error.name : 'Error' });
      return { persisted: false };
    }
  }

  async readMatching(
    projectRoot: string,
    featureName: string | undefined,
    kind: SidecarKind,
    binding: SidecarBinding,
    taskNumber?: string,
  ): Promise<JevSidecar | undefined> {
    const parsed = await this.readAnswered(projectRoot, featureName, kind, this.fileNameFor(kind, binding, taskNumber));
    return parsed && sameBinding(parsed.binding, binding) ? parsed : undefined;
  }

  /** Looks a review sidecar up by the full diff hash alone; used by the read-only commit lookup. */
  async findByDiff(
    projectRoot: string,
    featureName: string | undefined,
    kind: 'security' | 'principles',
    diffSha256: string,
  ): Promise<JevSidecar | undefined> {
    const parsed = await this.readAnswered(projectRoot, featureName, kind, this.fileNameFor(kind, { questionSetVersion: 0, diffSha256 }));
    return parsed?.binding.diffSha256 === diffSha256 ? parsed : undefined;
  }

  /** Names of review sidecars of one kind in a location; empty on any problem. */
  async listReviewSidecars(projectRoot: string, featureName: string | undefined, kind: 'security' | 'principles'): Promise<string[]> {
    try {
      const root = path.resolve(projectRoot);
      const dir = this.reviewDir(root, featureName);
      await this.contain(root, dir);
      if (!(await this.fileSystem.exists(dir))) return [];
      return (await this.fileSystem.readdir(dir)).filter((name) => name.startsWith(`jev-review-${kind}-`) && name.endsWith('.json'));
    } catch {
      return [];
    }
  }

  private async readAnswered(
    projectRoot: string,
    featureName: string | undefined,
    kind: SidecarKind,
    fileName: string,
  ): Promise<JevSidecar | undefined> {
    try {
      const root = path.resolve(projectRoot);
      const dir = this.reviewDir(root, featureName);
      const file = path.join(dir, fileName);
      await this.contain(root, dir);
      await this.contain(root, file);
      if (!(await this.fileSystem.exists(file))) return undefined;
      const info = await this.fileSystem.stat(file);
      if (!info.isFile() || (info.size ?? 0) > MAX_SIDECAR_BYTES) return undefined;
      const parsed: unknown = JSON.parse(await this.fileSystem.readFile(file));
      return isSidecar(parsed) && parsed.kind === kind && parsed.status === 'answered' ? parsed : undefined;
    } catch {
      return undefined;
    }
  }

  private reviewDir(root: string, featureName: string | undefined): string {
    if (featureName === undefined) return path.join(root, '.spec', 'reviews');
    validateFeatureName(featureName);
    return path.join(root, '.spec', 'specs', featureName, 'review');
  }

  private async contain(root: string, target: string): Promise<void> {
    await new SpecPathResolver(this.fileSystem).assertContained(path.join(root, '.spec'), target);
  }
}
