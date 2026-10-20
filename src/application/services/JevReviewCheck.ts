import { createHash } from 'node:crypto';
import type { GitPort } from '../../domain/ports.js';
import type { JevCheckRequest, JevCheckResult, JevFindingInput, JevUnitInput } from './JevCheckTypes.js';
import { buildReviewManifest } from './JevChangeManifest.js';
import { buildExcerpts, type ExcerptResult } from './JevCodeExcerpts.js';
import type { ExchangeContext, ExchangePlan, JevExchange } from './JevExchange.js';
import { buildPrincipleQuestions, buildSecurityQuestions, QUESTION_SET_VERSION } from './JevQuestionCatalog.js';
import { flagSecurity, violatedPrinciples } from './JevReport.js';
import { skippedResult } from './JevResults.js';
import { fitState } from './JevSpecState.js';
import { redactThenClip } from './JevRedaction.js';

const TEXT_LIMIT = 1000;
function clip(value: string | undefined, limit: number, counts: { n: number }): string {
  const result = redactThenClip(value, limit);
  counts.n += result.count;
  return result.text;
}
const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

/** Hash of the findings or units the caller supplied, in caller order. */
export function inputHash(request: JevCheckRequest): string {
  return sha256(JSON.stringify((request.check === 'principles' ? request.units : request.findings) ?? []));
}

/**
 * B1 security triage and B2 principle adherence. Runs in the parent only, after the audit or
 * review returned, and judges findings and units that already exist; it never adds any.
 */
export class JevReviewCheck {
  constructor(
    private readonly git: GitPort,
    private readonly exchange: JevExchange,
  ) {}

  async run(request: JevCheckRequest, context: ExchangeContext): Promise<JevCheckResult> {
    const security = request.check === 'security';
    const inputs: ReadonlyArray<JevFindingInput | JevUnitInput> = (security ? request.findings : request.units) ?? [];
    if (inputs.length === 0) return skippedResult(request.check, 'not-ready');
    const manifest = await buildReviewManifest(this.git, request.projectRoot);
    if (manifest.status === 'empty') return skippedResult(request.check, 'no-changes');

    const excerpts = await buildExcerpts(request.projectRoot, inputs.map(({ id, path, line }) => ({ id, path, line })));
    const excerptOf = new Map(excerpts.items.map((entry) => [entry.id, entry]));
    const counts = { n: 0 };
    const items = security
      ? (inputs as JevFindingInput[]).map((entry) => this.findingItem(entry, excerptOf.get(entry.id), counts))
      : (inputs as JevUnitInput[]).map((entry) => this.unitItem(entry, excerptOf.get(entry.id), counts));
    const fit = fitState(security ? 'security' : 'principles', items, undefined);
    if (fit.keptIds.length === 0) return skippedResult(request.check, 'not-ready');

    const kept = inputs.filter(({ id }) => fit.keptIds.includes(id));
    const plan: ExchangePlan = {
      check: request.check,
      kind: security ? 'security' : 'principles',
      binding: {
        questionSetVersion: QUESTION_SET_VERSION,
        inputSha256: inputHash(request),
        ...(manifest.status === 'ok' && { diffSha256: manifest.diffSha256 }),
      },
      unbound: manifest.status !== 'ok',
      baseCommit: manifest.status === 'ok' ? manifest.baseCommit : undefined,
      state: fit.state,
      questions: security ? buildSecurityQuestions(fit.keptIds) : buildPrincipleQuestions(fit.keptIds),
      omittedIds: fit.omittedIds,
      truncated: fit.truncated,
      redactions: excerpts.redactions + fit.redactions + counts.n,
      droppedFindingIds: excerpts.droppedFindingIds,
      interpret: (answers) => {
        const located = kept.map(({ id, path, line }) => ({ id, location: `${path}:${line}` }));
        const locationOf = new Map(located.map(({ id, location }) => [id, location]));
        const excerptHash = (id: string): string | null => excerptOf.get(id)?.excerptSha256 ?? null;
        if (security) {
          const { flagged, items: triaged } = flagSecurity(
            answers,
            (kept as JevFindingInput[]).map(({ id, severity }) => ({ id, modelSeverity: severity })),
          );
          return {
            flagged,
            details: triaged.map((item) => ({
              id: item.id,
              flagged: flagged.includes(item.id),
              location: locationOf.get(item.id),
              note: `JEV ${item.jevSeverity} vs model ${item.modelSeverity}${item.disagreement ? ' (disagreement)' : ''}; ${item.classification}`,
            })),
            items: triaged.map((item) => ({
              id: item.id,
              location: locationOf.get(item.id),
              excerptSha256: excerptHash(item.id),
              modelSeverity: item.modelSeverity,
              jevSeverity: item.jevSeverity,
              disagreement: item.disagreement,
              classification: item.classification,
            })),
          };
        }
        const violations = violatedPrinciples(answers, located);
        return {
          flagged: [...new Set(violations.map(({ unitId }) => unitId))],
          details: violations.map(({ unitId, principle, location }) => ({ id: unitId, flagged: true, principle, location })),
          items: located.map(({ id, location }) => ({ id, location, excerptSha256: excerptHash(id) })),
        };
      },
    };
    return this.exchange.run(plan, context);
  }

  private findingItem(entry: JevFindingInput, excerpt: ExcerptResult | undefined, counts: { n: number }): Record<string, unknown> & { id: string } {
    return {
      id: entry.id,
      location: `${entry.path}:${entry.line}`,
      title: clip(entry.title, 300, counts),
      severity: entry.severity,
      description: clip(entry.description, TEXT_LIMIT, counts),
      preconditions: clip(entry.preconditions, TEXT_LIMIT, counts),
      remediation: clip(entry.remediation, TEXT_LIMIT, counts),
      excerpt: excerpt?.excerpt ?? null,
    };
  }

  private unitItem(entry: JevUnitInput, excerpt: ExcerptResult | undefined, counts: { n: number }): Record<string, unknown> & { id: string } {
    return { id: entry.id, location: `${entry.path}:${entry.line}`, summary: clip(entry.summary, 500, counts), excerpt: excerpt?.excerpt ?? null };
  }

}
