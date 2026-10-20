import { JEV_DECIDE_URL, JevTransportError } from '../../domain/ports.js';
import type { JevHttpPort, LoggerPort } from '../../domain/ports.js';
import type { JevCheckKind, JevCheckResult, JevItemDetail } from './JevCheckTypes.js';
import type { ExchangeState } from './JevSpecState.js';
import { renderJevLine } from './JevReport.js';
import { MAX_JEV_RESPONSE_BYTES, validateJevResponse } from './JevResponseValidator.js';
import type { JevAnswer, JevMeta, JevQuestionSet } from './JevResponseValidator.js';
import { unavailableResult } from './JevResults.js';
import type { JevSettings } from './JevSettings.js';
import type { JevSidecar, JevSidecarStore, SidecarBinding, SidecarItem, SidecarKind } from './JevSidecarStore.js';

/** Extra time beyond the adapter timeout before the caller gives up on a port that never settles. */
const DEADLINE_GRACE_MS = 200;

export interface Interpretation {
  flagged: string[];
  details: JevItemDetail[];
  items?: SidecarItem[];
  extras?: Partial<JevCheckResult>;
}

/** Everything one request/response round trip needs; built by the per-check state builders. */
export interface ExchangePlan {
  check: JevCheckKind;
  kind: SidecarKind;
  taskNumber?: string;
  binding: SidecarBinding;
  state: ExchangeState | Record<string, unknown>;
  questions: JevQuestionSet;
  omittedIds: string[];
  truncated: boolean;
  redactions: number;
  droppedFindingIds?: string[];
  baseCommit?: string | null;
  sidecarItems?: SidecarItem[];
  source?: 'jev' | 'local';
  /** No stable binding exists (for example git is unavailable): neither read nor write a sidecar. */
  unbound?: boolean;
  interpret(answers: Record<string, JevAnswer>): Interpretation;
}

export interface ExchangeContext {
  projectRoot: string;
  featureName?: string;
  settings: JevSettings;
}

type Outcome =
  | { ok: true; answers: Record<string, JevAnswer>; meta: JevMeta }
  | { ok: false; reason: string };

function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new JevTransportError('timeout')), ms);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

const reasonFor = (error: unknown): string => {
  if (!(error instanceof JevTransportError)) return 'network';
  return error.kind === 'too-large' ? 'invalid-response' : error.kind;
};

/** Reuse a matching sidecar, else send exactly one request, validate, persist, and report. */
export class JevExchange {
  constructor(
    private readonly http: JevHttpPort,
    private readonly store: JevSidecarStore,
    private readonly logger: LoggerPort,
  ) {}

  async run(plan: ExchangePlan, context: ExchangeContext): Promise<JevCheckResult> {
    const reused = plan.unbound
      ? undefined
      : await this.store.readMatching(context.projectRoot, context.featureName, plan.kind, plan.binding, plan.taskNumber);
    if (reused?.answers) {
      const path = this.store.relativePath(context.featureName, plan.kind, plan.binding, plan.taskNumber);
      return this.answered(plan, reused.answers, { persisted: true, path, truncated: reused.truncated, redactions: reused.redactions });
    }
    const started = Date.now();
    const outcome = await this.send(plan, context.settings);
    this.logger.debug('JEV exchange finished', { check: plan.check, ok: outcome.ok, durationMs: Date.now() - started });
    if (outcome.ok === false) {
      const written = await this.persist(plan, context, { status: 'unavailable', reason: outcome.reason });
      return this.decorate(unavailableResult(plan.check, outcome.reason), plan, written.persisted, written.path);
    }
    const interpretation = plan.interpret(outcome.answers);
    const written = await this.persist(plan, context, {
      status: 'answered', answers: outcome.answers, meta: outcome.meta, items: interpretation.items,
    });
    return this.answered(plan, outcome.answers, { persisted: written.persisted, path: written.path, interpretation });
  }

  private async send(plan: ExchangePlan, settings: JevSettings): Promise<Outcome> {
    const key = settings.apiKey();
    if (!key) return { ok: false, reason: 'no-key' };
    try {
      const response = await withDeadline(
        this.http.post({
          url: JEV_DECIDE_URL,
          body: JSON.stringify({ state: plan.state, questions: plan.questions }),
          headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${key}` },
          timeoutMs: settings.timeoutMs,
          maxResponseBytes: MAX_JEV_RESPONSE_BYTES,
        }),
        settings.timeoutMs + DEADLINE_GRACE_MS,
      );
      if (response.status < 200 || response.status > 299) return { ok: false, reason: `http-${response.status}` };
      const validated = validateJevResponse(response.body, plan.questions);
      return validated.ok
        ? { ok: true, answers: validated.answers, meta: validated.meta }
        : { ok: false, reason: 'invalid-response' };
    } catch (error) {
      return { ok: false, reason: reasonFor(error) };
    }
  }

  private async persist(
    plan: ExchangePlan,
    context: ExchangeContext,
    body: Pick<JevSidecar, 'status' | 'reason' | 'answers' | 'meta'> & { items?: SidecarItem[] },
  ): Promise<{ persisted: boolean; path?: string }> {
    if (plan.unbound) return { persisted: false };
    const sidecar: JevSidecar = {
      schema: 1,
      kind: plan.kind,
      createdAt: new Date().toISOString(),
      binding: plan.binding,
      source: plan.source ?? 'jev',
      baseCommit: plan.baseCommit,
      truncated: plan.truncated,
      omittedIds: plan.omittedIds,
      droppedFindingIds: plan.droppedFindingIds ?? [],
      redactions: plan.redactions,
      ...body,
      items: body.items ?? plan.sidecarItems,
    };
    return this.store.write(context.projectRoot, context.featureName, sidecar, plan.taskNumber);
  }

  private decorate(result: JevCheckResult, plan: ExchangePlan, persisted: boolean, path?: string): JevCheckResult {
    return {
      ...result,
      persisted,
      sidecar: path,
      truncated: plan.truncated,
      redactions: plan.redactions,
      ...(plan.droppedFindingIds?.length ? { droppedFindingIds: plan.droppedFindingIds } : {}),
    };
  }

  private answered(
    plan: ExchangePlan,
    answers: Record<string, JevAnswer>,
    stored: { persisted: boolean; path?: string; truncated?: boolean; redactions?: number; interpretation?: Interpretation },
  ): JevCheckResult {
    const interpretation = stored.interpretation ?? plan.interpret(answers);
    const result: JevCheckResult = {
      check: plan.check,
      status: 'answered',
      line: renderJevLine({ status: 'answered', flagged: interpretation.flagged }),
      flagged: interpretation.flagged,
      details: interpretation.details,
      persisted: stored.persisted,
      sidecar: stored.path,
      truncated: stored.truncated ?? plan.truncated,
      redactions: stored.redactions ?? plan.redactions,
      ...interpretation.extras,
    };
    return plan.droppedFindingIds?.length ? { ...result, droppedFindingIds: plan.droppedFindingIds } : result;
  }
}
