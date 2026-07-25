import { createHash } from 'node:crypto';
import path from 'node:path';
import { injectable, inject } from 'inversify';
import { TYPES } from '../../infrastructure/di/types.js';
import { FileSystemPort, LoggerPort } from '../../domain/ports.js';
import { PhaseApprovals, Project } from '../../domain/types.js';
import { SpecPathResolver } from './SpecPathResolver.js';

export type ContextLoadMode = 'compact' | 'standard' | 'full';
export type ApprovablePhase = keyof PhaseApprovals;
export type EffectivePhase = 'init' | ApprovablePhase | 'implementation';
export type PhaseStatus = 'init' | 'approved' | 'unapproved';

export interface ContextLoadRequest {
  readonly projectRoot: string;
  readonly featureName: string;
  readonly mode?: ContextLoadMode;
  readonly phase?: ApprovablePhase | 'implementation';
  readonly maxEstimatedTokens?: number;
  readonly ifNoneMatch?: string;
  readonly includeUnapproved?: boolean;
}

export interface ContextLoadResult {
  readonly content?: string;
  readonly mode: ContextLoadMode;
  readonly effectivePhase: EffectivePhase;
  readonly phaseStatus: PhaseStatus;
  readonly sourceFingerprint: string;
  readonly fingerprint: string;
  readonly cacheStatus: 'hit' | 'regenerated' | 'not-modified';
  readonly sourceCharacters: number;
  readonly sourceEstimatedTokens: number;
  readonly payloadCharacters: number;
  readonly payloadEstimatedTokens: number;
  readonly reductionPercentage: number;
  readonly omittedSources: string[];
}

export interface ContextSizeEstimate {
  readonly sourceCharacters: number;
  readonly sourceTokens: number;
  readonly compactCharacters: number;
  readonly compactTokens: number;
  readonly reductionPercentage: number;
}

export interface HandoffResult {
  readonly path: string;
  readonly content: string;
  readonly estimate: ContextSizeEstimate;
  readonly fingerprint?: string;
}

export class ContextBudgetTooSmallError extends Error {
  readonly code = 'ContextBudgetTooSmall';
  constructor(readonly requested: number, readonly minimumRequired: number) {
    super(`Context budget ${requested} is below the mandatory minimum ${minimumRequired}`);
    this.name = 'ContextBudgetTooSmallError';
  }
}

export class ContextBudgetExceededError extends Error {
  readonly code = 'ContextBudgetExceeded';
  constructor(readonly requested: number, readonly required: number) {
    super(`Full context requires ${required} estimated tokens; requested ${requested}`);
    this.name = 'ContextBudgetExceededError';
  }
}

export class PhaseNotApprovedError extends Error {
  readonly code = 'PhaseNotApproved';
  constructor(readonly phase: ApprovablePhase) {
    super(`Phase is not approved: ${phase}`);
    this.name = 'PhaseNotApprovedError';
  }
}

export class ContextArtifactDriftError extends Error {
  readonly code = 'ArtifactDrift';
  constructor(readonly phase: ApprovablePhase) {
    super(`Approved artifact has drifted: ${phase}`);
    this.name = 'ContextArtifactDriftError';
  }
}

export class ContextSourceError extends Error {
  readonly code = 'ContextSourceError';
  constructor(readonly sourcePath: string, message: string) {
    super(`${message}: ${sourcePath}`);
    this.name = 'ContextSourceError';
  }
}

interface ApprovalState { generated: boolean; approved: boolean; artifactSha256?: string }
interface WorkflowSpec {
  featureName: string;
  phase: string;
  approvals: Record<ApprovablePhase, ApprovalState>;
  reviewRequired: boolean;
  reviewCompleted: boolean;
  implementation?: {
    revision: number;
    tasks: Record<string, { status: string; blocker?: string; dependencies: string[] }>;
  };
}
interface DocumentSnapshot { name: string; relativePath: string; absolutePath: string; content: string }
interface SelectedState { phase: EffectivePhase; status: PhaseStatus; documents: DocumentSnapshot[] }
interface ContextCandidate { source: string; text: string }

const MODE_BUDGETS: Record<ContextLoadMode, number> = { compact: 2048, standard: 4096, full: 16384 };
const PHASES: ApprovablePhase[] = ['requirements', 'design', 'tasks'];
const HANDOFF_SCHEMA = 2;
const SELECTION_VERSION = 2;

@injectable()
export class ContextCompactionService {
  constructor(
    @inject(TYPES.FileSystemPort) private readonly fileSystem: FileSystemPort,
    @inject(TYPES.LoggerPort) private readonly logger: LoggerPort,
  ) {}

  async loadContext(request: ContextLoadRequest): Promise<ContextLoadResult>;
  async loadContext(project: Project, mode?: ContextLoadMode): Promise<string>;
  async loadContext(requestOrProject: ContextLoadRequest | Project, legacyMode: ContextLoadMode = 'compact'): Promise<ContextLoadResult | string> {
    if (!('projectRoot' in requestOrProject)) {
      const result = await this.loadContextRequest({ projectRoot: requestOrProject.path, featureName: requestOrProject.name, mode: legacyMode });
      return result.content ?? '';
    }
    return this.loadContextRequest(requestOrProject);
  }

  async generatePhaseHandoff(project: Project, approvedPhase: ApprovablePhase): Promise<HandoffResult> {
    const result = await this.loadContextRequest({ projectRoot: project.path, featureName: project.name, phase: approvedPhase, mode: 'compact' });
    const content = result.content ?? '';
    return {
      path: path.join(project.path, '.spec', 'specs', project.name, 'context', 'handoff.md'),
      content,
      fingerprint: result.fingerprint,
      estimate: this.estimateContextSize(result.sourceCharacters, result.payloadCharacters),
    };
  }

  async invalidateCanonicalHandoff(request: Pick<ContextLoadRequest, 'projectRoot' | 'featureName'>): Promise<void> {
    const resolved = await new SpecPathResolver(this.fileSystem).resolve(request.projectRoot, request.featureName);
    const handoffPath = path.join(resolved.featureRoot, 'context', 'handoff.md');
    const contextRoot = path.dirname(handoffPath);
    const resolver = new SpecPathResolver(this.fileSystem);
    await resolver.assertContained(resolved.featureRoot, contextRoot);
    await resolver.assertContained(resolved.featureRoot, handoffPath);
    if (await this.fileSystem.exists(handoffPath)) {
      if (!this.fileSystem.unlink) throw new Error('FileSystemPort.unlink is required to invalidate context');
      await this.fileSystem.unlink(handoffPath);
    }
  }

  estimateContextSize(sourceCharacters: number, compactCharacters: number): ContextSizeEstimate {
    const sourceTokens = Math.ceil(sourceCharacters / 4);
    const compactTokens = Math.ceil(compactCharacters / 4);
    return {
      sourceCharacters,
      sourceTokens,
      compactCharacters,
      compactTokens,
      reductionPercentage: sourceTokens === 0 || compactTokens >= sourceTokens ? 0 : Math.round((1 - compactTokens / sourceTokens) * 100),
    };
  }

  private async loadContextRequest(request: ContextLoadRequest): Promise<ContextLoadResult> {
    const { mode, budget } = this.resolveLoadOptions(request);
    const resolver = new SpecPathResolver(this.fileSystem);
    const resolved = await resolver.resolve(request.projectRoot, request.featureName);
    const specPath = path.join(resolved.featureRoot, 'spec.json');
    await resolver.assertContained(resolved.featureRoot, specPath);
    const spec = await this.readSpec(specPath, request.featureName);
    const selected = await this.selectState(resolved.featureRoot, spec, request, resolver);
    const sourceCharacters = selected.documents.reduce((total, document) => total + document.content.length, 0);
    const sourceFingerprint = this.hash(JSON.stringify({
      schema: HANDOFF_SCHEMA,
      phase: selected.phase,
      status: selected.status,
      approvals: spec.approvals,
      reviewRequired: spec.reviewRequired,
      reviewCompleted: spec.reviewCompleted,
      implementation: spec.implementation,
      sources: selected.documents.map(({ relativePath, content }) => [relativePath, content]),
    }));
    const fingerprint = this.hash(JSON.stringify({
      sourceFingerprint,
      mode,
      budget,
      includeUnapproved: request.includeUnapproved === true,
      selection: SELECTION_VERSION,
    }));
    const canonical = mode === 'compact'
      && request.maxEstimatedTokens === undefined
      && request.includeUnapproved !== true;
    const handoffPath = path.join(resolved.featureRoot, 'context', 'handoff.md');
    const built = mode === 'full'
      ? this.buildFull(spec, selected, budget)
      : this.buildBounded(spec, selected, budget, mode, sourceFingerprint, fingerprint, canonical);
    const cached = await this.readCanonicalCache(
      canonical,
      handoffPath,
      resolved.featureRoot,
      resolver,
      built.content,
    );
    if (cached !== undefined) {
      const result = this.resultFor(
        cached,
        mode,
        selected,
        sourceFingerprint,
        fingerprint,
        sourceCharacters,
        [],
        'hit',
      );
      return this.applyEtag(result, request.ifNoneMatch);
    }

    await this.persistCanonical(
      canonical,
      handoffPath,
      built.content,
      resolved.featureRoot,
      resolver,
    );
    const result = this.resultFor(
      built.content,
      mode,
      selected,
      sourceFingerprint,
      fingerprint,
      sourceCharacters,
      built.omittedSources,
      'regenerated',
    );
    this.logger.debug('Context payload prepared', {
      featureName: request.featureName,
      mode,
      phase: selected.phase,
      payloadEstimatedTokens: result.payloadEstimatedTokens,
    });
    return this.applyEtag(result, request.ifNoneMatch);
  }

  private resolveLoadOptions(request: ContextLoadRequest): { mode: ContextLoadMode; budget: number } {
    const mode = request.mode ?? 'compact';
    const budget = request.maxEstimatedTokens ?? MODE_BUDGETS[mode];
    if (!Number.isInteger(budget) || budget <= 0) throw new ContextBudgetTooSmallError(budget, 1);
    if (request.includeUnapproved && mode !== 'full') {
      throw new Error('includeUnapproved is supported only in full mode');
    }
    return { mode, budget };
  }

  private async readCanonicalCache(
    canonical: boolean,
    handoffPath: string,
    featureRoot: string,
    resolver: SpecPathResolver,
    expectedContent: string,
  ): Promise<string | undefined> {
    if (!canonical || !(await this.fileSystem.exists(handoffPath))) return undefined;
    await resolver.assertContained(featureRoot, handoffPath);
    const cached = await this.fileSystem.readFile(handoffPath);
    return cached === expectedContent ? cached : undefined;
  }

  private async persistCanonical(
    canonical: boolean,
    handoffPath: string,
    content: string,
    featureRoot: string,
    resolver: SpecPathResolver,
  ): Promise<void> {
    if (!canonical) return;
    const contextRoot = path.dirname(handoffPath);
    await resolver.assertContained(featureRoot, contextRoot);
    await this.fileSystem.mkdir(contextRoot);
    await resolver.assertContained(featureRoot, contextRoot);
    await resolver.assertContained(featureRoot, handoffPath);
    if (!this.fileSystem.writeFileAtomic) {
      throw new Error('FileSystemPort.writeFileAtomic is required for context persistence');
    }
    await this.fileSystem.writeFileAtomic(handoffPath, content);
  }

  private applyEtag(result: ContextLoadResult, ifNoneMatch?: string): ContextLoadResult {
    if (ifNoneMatch !== result.fingerprint) return result;
    return {
      ...result,
      content: undefined,
      cacheStatus: 'not-modified',
      payloadCharacters: 0,
      payloadEstimatedTokens: 0,
    };
  }

  private async readSpec(specPath: string, expectedFeature: string): Promise<WorkflowSpec> {
    if (!(await this.fileSystem.exists(specPath))) {
      throw new ContextSourceError(specPath, 'Missing required workflow metadata');
    }
    const record = await this.readJsonRecord(specPath);
    const approvalsRecord = this.requiredRecord(record.approvals, specPath, 'Missing approvals');
    const options = this.optionalRecord(record.workflow_options ?? record.workflowOptions);
    const checkpoints = this.optionalRecord(record.checkpoints);
    const test = this.optionalRecord(checkpoints.test_cases ?? checkpoints.testCases);
    const implementationRecord = this.optionalRecord(record.implementation);
    const implementationTasks = this.optionalRecord(implementationRecord.tasks);
    return {
      featureName: this.specFeatureName(record, expectedFeature, specPath),
      phase: typeof record.phase === 'string' ? record.phase : 'init',
      approvals: this.parseApprovals(approvalsRecord),
      reviewRequired: test.required === true
        || options.review_test_cases === true
        || options.reviewTestCases === true,
      reviewCompleted: test.reviewed === true,
      implementation: Object.keys(implementationTasks).length > 0
        ? {
            revision: typeof implementationRecord.revision === 'number' ? implementationRecord.revision : 0,
            tasks: Object.fromEntries(Object.entries(implementationTasks).map(([taskNumber, value]) => {
              const task = this.optionalRecord(value);
              const dependencies = Array.isArray(task.dependencies)
                ? task.dependencies.filter((dependency): dependency is string => typeof dependency === 'string')
                : [];
              return [taskNumber, {
                status: typeof task.status === 'string' ? task.status : 'pending',
                blocker: typeof task.blocker === 'string' ? task.blocker : undefined,
                dependencies,
              }];
            })),
          }
        : undefined,
    };
  }

  private async readJsonRecord(specPath: string): Promise<Record<string, unknown>> {
    let value: unknown;
    try {
      value = JSON.parse(await this.fileSystem.readFile(specPath));
    } catch {
      throw new ContextSourceError(specPath, 'Malformed workflow metadata');
    }
    if (!value || typeof value !== 'object') {
      throw new ContextSourceError(specPath, 'Invalid workflow metadata');
    }
    return value as Record<string, unknown>;
  }

  private requiredRecord(
    value: unknown,
    specPath: string,
    message: string,
  ): Record<string, unknown> {
    if (!value || typeof value !== 'object') throw new ContextSourceError(specPath, message);
    return value as Record<string, unknown>;
  }

  private optionalRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' ? value as Record<string, unknown> : {};
  }

  private parseApprovals(record: Record<string, unknown>): Record<ApprovablePhase, ApprovalState> {
    return Object.fromEntries(PHASES.map(phase => {
      const state = this.optionalRecord(record[phase]);
      return [phase, {
        generated: state.generated === true,
        approved: state.approved === true,
        artifactSha256: typeof state.artifact_sha256 === 'string'
          ? state.artifact_sha256
          : typeof state.artifactSha256 === 'string'
            ? state.artifactSha256
            : undefined,
      }];
    })) as Record<ApprovablePhase, ApprovalState>;
  }

  private specFeatureName(
    record: Record<string, unknown>,
    expectedFeature: string,
    specPath: string,
  ): string {
    const persisted = typeof record.feature_name === 'string'
      ? record.feature_name
      : typeof record.name === 'string'
        ? record.name
        : undefined;
    if (persisted !== undefined && persisted !== expectedFeature) {
      throw new ContextSourceError(specPath, 'Feature metadata name does not match directory');
    }
    return expectedFeature;
  }

  private async selectState(
    featureRoot: string,
    spec: WorkflowSpec,
    request: ContextLoadRequest,
    resolver: SpecPathResolver,
  ): Promise<SelectedState> {
    const selection = this.resolveEffectivePhase(spec, request);
    const documents = await this.readSelectedDocuments(featureRoot, spec, selection.phase, resolver);
    return { ...selection, documents };
  }

  private resolveEffectivePhase(
    spec: WorkflowSpec,
    request: ContextLoadRequest,
  ): Pick<SelectedState, 'phase' | 'status'> {
    if (spec.implementation && !request.phase) return { phase: 'implementation', status: 'approved' };
    if (request.phase) return this.resolveExplicitPhase(spec, request);
    if (request.mode === 'full' && request.includeUnapproved) {
      const latestGenerated = [...PHASES].reverse()
        .find(candidate => spec.approvals[candidate].generated);
      if (!latestGenerated) return { phase: 'init', status: 'init' };
      return {
        phase: latestGenerated,
        status: spec.approvals[latestGenerated].approved ? 'approved' : 'unapproved',
      };
    }
    const latestApproved = [...PHASES].reverse()
      .find(candidate => spec.approvals[candidate].approved);
    return latestApproved
      ? { phase: latestApproved, status: 'approved' }
      : { phase: 'init', status: 'init' };
  }

  private resolveExplicitPhase(
    spec: WorkflowSpec,
    request: ContextLoadRequest & { phase?: ApprovablePhase | 'implementation' },
  ): Pick<SelectedState, 'phase' | 'status'> {
    const phase = request.phase;
    if (!phase) return { phase: 'init', status: 'init' };
    if (phase === 'implementation') {
      if (!spec.approvals.tasks.approved || !spec.implementation) throw new PhaseNotApprovedError('tasks');
      return { phase, status: 'approved' };
    }
    const state = spec.approvals[phase];
    const draftAllowed = request.mode === 'full' && request.includeUnapproved && state.generated;
    if (!state.approved && !draftAllowed) throw new PhaseNotApprovedError(phase);
    return { phase, status: state.approved ? 'approved' : 'unapproved' };
  }

  private async readSelectedDocuments(
    featureRoot: string,
    spec: WorkflowSpec,
    phase: EffectivePhase,
    resolver: SpecPathResolver,
  ): Promise<DocumentSnapshot[]> {
    if (phase === 'init') return [];
    const documents: DocumentSnapshot[] = [];
    const last = phase === 'implementation' ? PHASES.length - 1 : PHASES.indexOf(phase);
    for (const selectedPhase of PHASES.slice(0, last + 1)) {
      if (!spec.approvals[selectedPhase].generated) {
        throw new ContextSourceError(`${selectedPhase}.md`, 'Selected phase metadata is inconsistent');
      }
      documents.push(await this.readPhaseDocument(
        featureRoot,
        selectedPhase,
        spec.approvals[selectedPhase],
        resolver,
      ));
    }
    return documents;
  }

  private async readPhaseDocument(
    featureRoot: string,
    selectedPhase: ApprovablePhase,
    approval: ApprovalState,
    resolver: SpecPathResolver,
  ): Promise<DocumentSnapshot> {
    const name = `${selectedPhase}.md`;
    const absolutePath = path.join(featureRoot, name);
    await resolver.assertContained(featureRoot, absolutePath);
    if (!(await this.fileSystem.exists(absolutePath))) {
      throw new ContextSourceError(absolutePath, 'Missing required selected-phase document');
    }
    let content: string;
    try {
      content = await this.fileSystem.readFile(absolutePath);
    } catch {
      throw new ContextSourceError(absolutePath, 'Unable to read selected-phase document');
    }
    if (approval.approved && approval.artifactSha256 && this.hash(content) !== approval.artifactSha256) {
      throw new ContextArtifactDriftError(selectedPhase);
    }
    return {
      name,
      relativePath: name,
      absolutePath,
      content,
    };
  }

  private buildBounded(
    spec: WorkflowSpec,
    selected: SelectedState,
    budget: number,
    mode: Exclude<ContextLoadMode, 'full'>,
    sourceFingerprint: string,
    fingerprint: string,
    canonical: boolean,
  ): { content: string; omittedSources: string[] } {
    const envelope = this.buildEnvelope(spec, selected, sourceFingerprint, fingerprint, canonical);
    const maximumCharacters = budget * 4;
    if (envelope.length > maximumCharacters) {
      throw new ContextBudgetTooSmallError(budget, Math.ceil(envelope.length / 4));
    }
    if (!selected.documents.length) {
      return { content: this.embedEstimate(envelope), omittedSources: [] };
    }
    const direct = this.buildDirectPayload(envelope, selected, maximumCharacters);
    if (direct) return { content: direct, omittedSources: [] };
    return this.selectCandidates(
      envelope,
      this.collectCandidates(selected.documents, mode),
      selected.documents,
      maximumCharacters,
    );
  }

  private buildEnvelope(
    spec: WorkflowSpec,
    selected: SelectedState,
    sourceFingerprint: string,
    fingerprint: string,
    canonical: boolean,
  ): string {
    const metadata = canonical
      ? `<!-- sdd-context schema=${HANDOFF_SCHEMA} phase=${selected.phase} source=${sourceFingerprint} payload=${fingerprint} -->\n`
      : '';
    const sourceReferences = selected.documents.length
      ? selected.documents.map(document => `- ${document.relativePath}`).join('\n')
      : '- spec.json';
    const review = spec.reviewRequired
      ? spec.reviewCompleted ? 'reviewed' : 'pending'
      : 'not required';
    const implementationProgress = spec.implementation
      ? `\n\n## Implementation Progress\n${this.implementationProgress(spec)}`
      : '';
    return `${metadata}# SDD Context: ${spec.featureName}\n\n## Workflow State\n- Effective phase: ${selected.phase}\n- Phase status: ${selected.status}\n- Requirements: ${this.approvalLabel(spec.approvals.requirements)}\n- Design: ${this.approvalLabel(spec.approvals.design)}\n- Tasks: ${this.approvalLabel(spec.approvals.tasks)}\n- Test-case review: ${review}${implementationProgress}\n\n## Next Action\n${this.nextAction(spec, selected)}\n\n## Source References\n${sourceReferences}\n\n## Payload Estimate\n- Payload estimated tokens: 00000`;
  }

  private nextAction(spec: WorkflowSpec, selected: SelectedState): string {
    const phase = selected.phase;
    if (selected.status === 'unapproved') {
      return `Continue the ${phase} Skill to revise, validate, and request approval for this draft.`;
    }
    if (phase === 'init') return 'Generate requirements through the requirements Skill.';
    if (phase === 'requirements') return 'Continue with the design Skill.';
    if (phase === 'design') return 'Continue with the tasks Skill.';
    if (phase === 'implementation' && spec.implementation) {
      const tasks = Object.entries(spec.implementation.tasks);
      const active = tasks.filter(([, task]) =>
        ['in-progress', 'red-observed', 'green-observed', 'blocked'].includes(task.status));
      if (active.length === 1) return `Continue task ${active[0][0]} from ${active[0][1].status}.`;
      if (active.length > 1) {
        return `Select a resumable task: ${this.taskCandidateSummary(active, true)}.`;
      }
      const ready = tasks.filter(([, task]) =>
        task.status === 'pending'
        && task.dependencies.every((dependency) =>
          spec.implementation!.tasks[dependency]?.status === 'completed'));
      if (ready.length === 1) return `Start task ${ready[0][0]}.`;
      if (ready.length > 1) return `Select a ready task: ${this.taskCandidateSummary(ready, false)}.`;
      return tasks.every(([, task]) => task.status === 'completed')
        ? 'Implementation is complete.'
        : 'No dependency-ready task is available; inspect persisted task blockers.';
    }
    if (spec.reviewRequired && !spec.reviewCompleted) return 'Review test cases before approving tasks.';
    return 'Start governed implementation.';
  }

  private taskCandidateSummary(
    candidates: Array<[string, { status: string }]>,
    includeStatus: boolean,
  ): string {
    const visible = candidates.slice(0, 20).map(([id, task]) =>
      includeStatus ? `${id} (${task.status})` : id);
    const omitted = candidates.length - visible.length;
    return `${visible.join(', ')}${omitted > 0 ? `, and ${omitted} more` : ''}`;
  }

  private implementationProgress(spec: WorkflowSpec): string {
    if (!spec.implementation) return '';
    const tasks = Object.entries(spec.implementation.tasks);
    const completed = tasks.filter(([, task]) => task.status === 'completed').length;
    const active = tasks.filter(([, task]) => ['in-progress', 'red-observed', 'green-observed'].includes(task.status));
    const blocked = tasks.filter(([, task]) => task.status === 'blocked');
    const details = [...active, ...blocked].slice(0, 20)
      .map(([taskNumber, task]) => `- ${taskNumber}: ${task.status}${this.blockerSummary(task.blocker)}`)
      .join('\n');
    return `- Revision: ${spec.implementation.revision}\n- Completed: ${completed}/${tasks.length}\n- Active: ${active.length}\n- Blocked: ${blocked.length}${details ? `\n${details}` : ''}`;
  }

  private blockerSummary(blocker: string | undefined): string {
    if (!blocker) return '';
    const normalized = blocker.replace(/\s+/g, ' ').trim();
    const summary = normalized.length > 160 ? `${normalized.slice(0, 159)}…` : normalized;
    return ` — ${summary}`;
  }

  private buildDirectPayload(
    envelope: string,
    selected: SelectedState,
    maximumCharacters: number,
  ): string | undefined {
    if (selected.documents.length !== 1 || selected.documents[0].content.length > 600) {
      return undefined;
    }
    const direct = `${envelope}\n\n## Approved Source\n${selected.documents[0].content.trim()}`;
    return direct.length <= maximumCharacters ? this.embedEstimate(direct) : undefined;
  }

  private collectCandidates(
    documents: DocumentSnapshot[],
    mode: Exclude<ContextLoadMode, 'full'>,
  ): ContextCandidate[] {
    const seen = new Set<string>();
    const candidates: ContextCandidate[] = [];
    const perLineCap = mode === 'compact' ? 320 : 640;
    for (const document of documents) {
      this.collectDocumentCandidates(document, perLineCap, seen, candidates);
    }
    return candidates;
  }

  private collectDocumentCandidates(
    document: DocumentSnapshot,
    perLineCap: number,
    seen: Set<string>,
    candidates: ContextCandidate[],
  ): void {
    for (const rawLine of document.content.split(/\r?\n/)) {
      const normalized = rawLine.trim().replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, '');
      if (!normalized || normalized.startsWith('```')) continue;
      const capped = normalized.slice(0, perLineCap);
      const key = capped.toLocaleLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({ source: document.relativePath, text: capped });
    }
  }

  private selectCandidates(
    envelope: string,
    candidates: ContextCandidate[],
    documents: DocumentSnapshot[],
    maximumCharacters: number,
  ): { content: string; omittedSources: string[] } {
    let content = envelope;
    const usedSources = new Set<string>();
    for (const candidate of candidates) {
      const line = `\n- ${candidate.text}`;
      if (content.length + '\n\n## Selected Context'.length + line.length > maximumCharacters) {
        continue;
      }
      if (!content.includes('\n\n## Selected Context')) content += '\n\n## Selected Context';
      content += line;
      usedSources.add(candidate.source);
    }
    return {
      content: this.embedEstimate(content),
      omittedSources: documents
        .filter(document => !usedSources.has(document.relativePath))
        .map(document => document.relativePath),
    };
  }

  private buildFull(spec: WorkflowSpec, selected: SelectedState, budget: number): { content: string; omittedSources: string[] } {
    let content = [
      `# Full SDD Context: ${spec.featureName}`,
      `Effective phase: ${selected.phase} (${selected.status})`,
      `Next action: ${this.nextAction(spec, selected)}`,
      ...selected.documents.map((document) => `## ${document.name}\n\n${document.content}`),
      '## Payload Estimate\n- Payload estimated tokens: 00000',
    ].join('\n\n');
    content = this.embedEstimate(content);
    const required = Math.ceil(content.length / 4);
    if (required > budget) throw new ContextBudgetExceededError(budget, required);
    return { content, omittedSources: [] };
  }

  private embedEstimate(content: string): string {
    return content.replace('Payload estimated tokens: 00000', `Payload estimated tokens: ${String(Math.ceil(content.length / 4)).padStart(5, '0')}`);
  }

  private resultFor(content: string, mode: ContextLoadMode, selected: SelectedState, sourceFingerprint: string, fingerprint: string, sourceCharacters: number, omittedSources: string[], cacheStatus: ContextLoadResult['cacheStatus']): ContextLoadResult {
    const payloadEstimatedTokens = Math.ceil(content.length / 4);
    const sourceEstimatedTokens = Math.ceil(sourceCharacters / 4);
    return { content, mode, effectivePhase: selected.phase, phaseStatus: selected.status, sourceFingerprint, fingerprint, cacheStatus, sourceCharacters, sourceEstimatedTokens, payloadCharacters: content.length, payloadEstimatedTokens, reductionPercentage: sourceEstimatedTokens === 0 || payloadEstimatedTokens >= sourceEstimatedTokens ? 0 : Math.round((1 - payloadEstimatedTokens / sourceEstimatedTokens) * 100), omittedSources };
  }


  private approvalLabel(state: ApprovalState): string {
    return state.approved ? 'approved' : state.generated ? 'generated, unapproved' : 'not generated';
  }

  private hash(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }
}
