import { createHash } from 'node:crypto';
import path from 'node:path';
import { inject, injectable } from 'inversify';
import { TYPES } from '../../infrastructure/di/types.js';
import type { FileSystemPort, GitPort, JevHttpPort, LoggerPort } from '../../domain/ports.js';
import type { JevCheckRequest, JevCheckResult } from './JevCheckTypes.js';
import { buildReviewManifest } from './JevChangeManifest.js';
import { JevCommitLookup } from './JevCommitLookup.js';
import { JevExchange, type ExchangeContext, type ExchangePlan } from './JevExchange.js';
import { QUESTION_SET_VERSION } from './JevQuestionCatalog.js';
import { flagDesign, flagRed, flagRequirements, flagTestcases, renderJevLine } from './JevReport.js';
import { inputHash, JevReviewCheck } from './JevReviewCheck.js';
import { skippedResult, unavailableResult } from './JevResults.js';
import { classifyRedEvidence, type RedClassificationResult } from './RedEvidenceClassifier.js';
import { buildDesignExchange, buildRedExchange, buildRequirementsExchange } from './JevSpecState.js';
import { buildTestcaseExchange } from './JevTestcaseState.js';
import { JevSidecarStore, type JevSidecar } from './JevSidecarStore.js';
import { readProjectJevSetting, resolveJevSettings, type JevSettings } from './JevSettings.js';
import { validateFeatureName } from './SpecPathResolver.js';
import type { AdvisorySnapshot } from './WorkflowEngineService.js';

/** The only slice of the workflow engine JEV may use: a read-only snapshot. */
export interface AdvisoryEngine {
  readAdvisorySnapshot(request: {
    projectRoot: string;
    featureName: string;
    phase: 'requirements' | 'design' | 'tasks';
  }): Promise<AdvisorySnapshot>;
}

export type JevEnvironment = Readonly<Record<string, string | undefined>>;

const FEATURE_REQUIRED = new Set(['requirements', 'design', 'testcases', 'red']);

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

@injectable()
export class JevAdvisoryService {
  private readonly store: JevSidecarStore;
  private readonly exchange: JevExchange;
  private readonly review: JevReviewCheck;
  private readonly commit: JevCommitLookup;

  constructor(
    @inject(TYPES.JevHttpPort) private readonly http: JevHttpPort,
    @inject(TYPES.GitPort) private readonly git: GitPort,
    @inject(TYPES.WorkflowEngineService) private readonly engine: AdvisoryEngine,
    @inject(TYPES.FileSystemPort) private readonly fileSystem: FileSystemPort,
    @inject(TYPES.LoggerPort) private readonly logger: LoggerPort,
    @inject(TYPES.JevEnvironment) private readonly env: JevEnvironment,
  ) {
    this.store = new JevSidecarStore(fileSystem, logger);
    this.exchange = new JevExchange(http, this.store, logger);
    this.review = new JevReviewCheck(git, this.exchange);
    this.commit = new JevCommitLookup(fileSystem, git, this.store);
  }

  /** Never rejects: every failure becomes a result value. */
  async check(request: JevCheckRequest): Promise<JevCheckResult> {
    try {
      return await this.run(request);
    } catch (error) {
      this.logger.warn('JEV check failed locally', { check: request.check, errorName: error instanceof Error ? error.name : 'Error' });
      return skippedResult(request.check, 'not-ready');
    }
  }

  private async run(request: JevCheckRequest): Promise<JevCheckResult> {
    // Gates 1-2 return before any path resolution, lock, git call, or write.
    const settings = await this.resolveSettings(request.projectRoot);
    if (!settings.enabled) {
      return request.check === 'commit' ? skippedResult('commit', 'disabled') : unavailableResult(request.check, 'disabled');
    }
    if (request.check === 'commit') return this.commit.run(request.projectRoot);
    if (!settings.hasKey) return unavailableResult(request.check, 'no-key');
    if (!(await this.featureInScope(request))) return skippedResult(request.check, 'feature-not-found');
    if ((request.check === 'security' || request.check === 'principles') && !settings.allowCode) {
      return this.codeDisabled(request);
    }
    const context = { projectRoot: request.projectRoot, featureName: request.featureName, settings };
    if (request.check === 'requirements' || request.check === 'design') return this.specCheck(request, context);
    if (request.check === 'testcases') return this.testcasesCheck(request, context);
    if (request.check === 'red') return this.redCheck(request, context);
    if (request.check === 'security' || request.check === 'principles') return this.review.run(request, context);
    return skippedResult(request.check, 'not-ready');
  }

  /** A snapshot of a phase that passed validation and still matches what was recorded; else undefined. */
  private async readySnapshot(request: JevCheckRequest, phase: 'requirements' | 'design' | 'tasks'): Promise<AdvisorySnapshot | undefined> {
    const snapshot = await this.engine.readAdvisorySnapshot({ projectRoot: request.projectRoot, featureName: request.featureName ?? '', phase });
    const ready = snapshot.validationStatus === 'passed'
      && snapshot.recordedSha256 !== undefined && snapshot.recordedSha256 === snapshot.observedSha256;
    return ready ? snapshot : undefined;
  }

  /** A2: classify RED evidence locally; only ambiguous evidence is sent. Never affects record-red. */
  private async redCheck(request: JevCheckRequest, context: ExchangeContext): Promise<JevCheckResult> {
    const { taskNumber, testName, evidence } = request;
    if (!taskNumber || !testName || !evidence || evidence.exitCode === 0) return skippedResult('red', 'not-ready');
    const snapshot = await this.engine.readAdvisorySnapshot({ projectRoot: request.projectRoot, featureName: request.featureName ?? '', phase: 'tasks' });
    const task = snapshot.implementation?.tasks[taskNumber];
    if (!task || task.status !== 'in-progress' || !task.tddRequired) return skippedResult('red', 'not-ready');

    const binding = {
      questionSetVersion: QUESTION_SET_VERSION,
      evidenceSha256: sha256(JSON.stringify([taskNumber, testName, evidence.command, evidence.summary])),
    };
    const local = classifyRedEvidence(evidence.command, evidence.summary);
    if (local.classification !== 'ambiguous') return this.localRed(request, context, binding, local);

    const built = buildRedExchange(taskNumber, testName, evidence, task.acceptanceCriteria);
    if (!built) return skippedResult('red', 'not-ready');
    const plan: ExchangePlan = {
      check: 'red',
      kind: 'red',
      taskNumber,
      binding,
      state: built.state,
      questions: built.questions,
      omittedIds: built.omittedIds,
      truncated: built.truncated,
      redactions: built.redactions,
      interpret: (answers) => {
        const flagged = flagRed(answers).length > 0 ? [taskNumber] : [];
        return { flagged, details: [{ id: taskNumber, flagged: flagged.length > 0 }], extras: { classification: 'ambiguous' } };
      },
    };
    return this.exchange.run(plan, context);
  }

  /** A decisive local result costs nothing: no key use, no request. */
  private async localRed(
    request: JevCheckRequest,
    context: ExchangeContext,
    binding: { questionSetVersion: number; evidenceSha256: string },
    local: RedClassificationResult,
  ): Promise<JevCheckResult> {
    const taskNumber = request.taskNumber ?? '';
    const sidecar: JevSidecar = {
      schema: 1,
      kind: 'red',
      createdAt: new Date().toISOString(),
      binding,
      status: 'answered',
      source: 'local',
      meta: { classification: local.classification, ...(local.matchedPattern && { matchedPattern: local.matchedPattern }) },
      truncated: false,
      omittedIds: [],
      droppedFindingIds: [],
      redactions: 0,
    };
    const written = await this.store.write(context.projectRoot, context.featureName, sidecar, taskNumber);
    const flagged = local.classification === 'setup' ? [taskNumber] : [];
    return {
      check: 'red',
      status: 'answered',
      line: renderJevLine({ status: 'answered', flagged }),
      flagged,
      details: [{ id: taskNumber, flagged: flagged.length > 0, note: local.matchedPattern }],
      persisted: written.persisted,
      sidecar: written.path,
      truncated: false,
      redactions: 0,
      classification: local.classification,
      matchedPattern: local.matchedPattern,
    };
  }

  /**
   * A1: judge the planned test cases. The skill first calls without cases to learn whether JEV is active.
   * With no TDD-required task, only the not-applicable reasons are judged, so no cases are needed.
   */
  private async testcasesCheck(request: JevCheckRequest, context: ExchangeContext): Promise<JevCheckResult> {
    const cases = request.cases ?? [];
    const snapshot = await this.readySnapshot(request, 'tasks');
    const built = snapshot && buildTestcaseExchange(snapshot, cases);
    if (!snapshot || !built) return skippedResult('testcases', 'not-ready');
    // Without a single case for an existing TDD-required task, every task would be judged on `cases: []`.
    if (built.tddTaskCount > 0 && built.matchedCases === 0) return skippedResult('testcases', 'cases-required');
    const plan: ExchangePlan = {
      check: 'testcases',
      kind: 'testcases',
      binding: {
        questionSetVersion: QUESTION_SET_VERSION,
        revision: snapshot.revision,
        artifactSha256: snapshot.recordedSha256,
        caseListSha256: built.caseListSha256,
      },
      state: built.state,
      questions: built.questions,
      omittedIds: built.omittedIds,
      truncated: built.truncated,
      redactions: built.redactions,
      interpret: (answers) => {
        const flagged = flagTestcases(answers, built.tasks);
        const flaggedFirst = [...flagged, ...built.itemIds.filter((id) => !flagged.includes(id))];
        return {
          flagged,
          details: flaggedFirst.map((id) => ({ id, flagged: flagged.includes(id) })),
          extras: {
            ...(built.unknownTasks.length > 0 && { unknownTasks: built.unknownTasks }),
            ...(built.truncatedTasks.length > 0 && { truncatedTasks: built.truncatedTasks }),
          },
        };
      },
    };
    return this.exchange.run(plan, context);
  }

  /** Requirements and design: one advisory check on a passed, unchanged artifact. */
  private async specCheck(request: JevCheckRequest, context: ExchangeContext): Promise<JevCheckResult> {
    const phase = request.check === 'design' ? 'design' : 'requirements';
    const snapshot = await this.readySnapshot(request, phase);
    const built = snapshot && (phase === 'design' ? buildDesignExchange(snapshot) : buildRequirementsExchange(snapshot));
    if (!snapshot || !built) return skippedResult(request.check, 'not-ready');
    const plan: ExchangePlan = {
      check: request.check,
      kind: phase,
      binding: { questionSetVersion: QUESTION_SET_VERSION, revision: snapshot.revision, artifactSha256: snapshot.recordedSha256 },
      state: built.state,
      questions: built.questions,
      omittedIds: built.omittedIds,
      truncated: built.truncated,
      redactions: built.redactions,
      interpret: (answers) => {
        const flagged = phase === 'design'
          ? flagDesign(answers, built.itemIds, built.secondaryIds)
          : flagRequirements(answers, built.itemIds);
        return { flagged, details: flagged.map((id) => ({ id, flagged: true })) };
      },
    };
    return this.exchange.run(plan, context);
  }

  private async resolveSettings(projectRoot: string): Promise<JevSettings> {
    const envDecides = (this.env.SDD_JEV_ENABLED ?? '').trim() !== '';
    const project = envDecides ? undefined : await readProjectJevSetting(projectRoot, this.fileSystem);
    return resolveJevSettings(this.env, project);
  }

  /** Read-only existence check; never creates the feature directory (unlike the lock helper). */
  private async featureInScope(request: JevCheckRequest): Promise<boolean> {
    const { featureName } = request;
    if (featureName === undefined) return !FEATURE_REQUIRED.has(request.check);
    try {
      validateFeatureName(featureName);
    } catch {
      return false;
    }
    return this.fileSystem.exists(path.join(path.resolve(request.projectRoot), '.spec', 'specs', featureName, 'spec.json'));
  }

  /** Reported whatever the working tree holds (FR-14); a sidecar needs a manifest to bind to. */
  private async codeDisabled(request: JevCheckRequest): Promise<JevCheckResult> {
    const result = unavailableResult(request.check, 'code-disabled');
    const manifest = await buildReviewManifest(this.git, request.projectRoot);
    if (manifest.status !== 'ok') return result;
    const kind = request.check === 'principles' ? 'principles' : 'security';
    const sidecar: JevSidecar = {
      schema: 1,
      kind,
      createdAt: new Date().toISOString(),
      binding: { questionSetVersion: QUESTION_SET_VERSION, diffSha256: manifest.diffSha256, inputSha256: inputHash(request) },
      status: 'unavailable',
      reason: 'code-disabled',
      source: 'jev',
      baseCommit: manifest.baseCommit,
      truncated: false,
      omittedIds: [],
      droppedFindingIds: [],
      redactions: 0,
    };
    const written = await this.store.write(request.projectRoot, request.featureName, sidecar);
    return { ...result, persisted: written.persisted, sidecar: written.path };
  }
}
