import { injectable, inject } from 'inversify';
import { v4 as uuidv4 } from 'uuid';
import { TYPES } from '../../infrastructure/di/types.js';
import { FileSystemPort, LoggerPort } from '../../domain/ports.js';
import { PhaseApprovals, Project } from '../../domain/types.js';

export type ContextLoadMode = 'compact' | 'standard' | 'full';
export type ApprovablePhase = keyof PhaseApprovals;

interface DocumentSnapshot {
  readonly name: string;
  readonly path: string;
  readonly content: string;
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
}

@injectable()
export class ContextCompactionService {
  constructor(
    @inject(TYPES.FileSystemPort) private readonly fileSystem: FileSystemPort,
    @inject(TYPES.LoggerPort) private readonly logger: LoggerPort
  ) {}

  async generatePhaseHandoff(
    project: Project,
    approvedPhase: ApprovablePhase
  ): Promise<HandoffResult> {
    const correlationId = uuidv4();
    const contextDir = this.getContextDir(project);
    const handoffPath = `${contextDir}/handoff.md`;
    const phaseHandoffPath = `${contextDir}/${approvedPhase}-handoff.md`;

    this.logger.info('Generating compact workflow handoff', {
      correlationId,
      projectId: project.id,
      approvedPhase
    });

    await this.fileSystem.mkdir(contextDir);

    const documents = await this.loadAvailableDocuments(project);
    const sourceCharacters = documents.reduce((sum, doc) => sum + doc.content.length, 0);
    const content = this.buildHandoff(project, approvedPhase, documents, sourceCharacters);

    await this.fileSystem.writeFile(handoffPath, content);
    await this.fileSystem.writeFile(phaseHandoffPath, content);

    const estimate = this.estimateContextSize(sourceCharacters, content.length);

    this.logger.info('Compact workflow handoff generated', {
      correlationId,
      projectId: project.id,
      approvedPhase,
      sourceTokens: estimate.sourceTokens,
      compactTokens: estimate.compactTokens,
      reductionPercentage: estimate.reductionPercentage
    });

    return {
      path: handoffPath,
      content,
      estimate
    };
  }

  async loadContext(
    project: Project,
    mode: ContextLoadMode = 'compact'
  ): Promise<string> {
    if (mode === 'full') {
      return this.loadFullContext(project);
    }

    const handoffPath = `${this.getContextDir(project)}/handoff.md`;
    if (await this.fileSystem.exists(handoffPath)) {
      const handoff = await this.fileSystem.readFile(handoffPath);

      if (mode === 'standard') {
        const spec = await this.readOptionalFile(`${this.getSpecDir(project)}/spec.json`);
        return [
          handoff,
          spec ? '\n## Current Spec Metadata\n\n```json\n' + spec + '\n```' : ''
        ].filter(Boolean).join('\n');
      }

      return handoff;
    }

    const documents = await this.loadAvailableDocuments(project);
    const sourceCharacters = documents.reduce((sum, doc) => sum + doc.content.length, 0);
    return this.buildHandoff(project, 'requirements', documents, sourceCharacters);
  }

  estimateContextSize(sourceCharacters: number, compactCharacters: number): ContextSizeEstimate {
    const sourceTokens = this.estimateTokens(sourceCharacters);
    const compactTokens = this.estimateTokens(compactCharacters);
    const reductionPercentage = sourceTokens === 0
      ? 0
      : Math.max(0, Math.round((1 - compactTokens / sourceTokens) * 100));

    return {
      sourceCharacters,
      sourceTokens,
      compactCharacters,
      compactTokens,
      reductionPercentage
    };
  }

  private async loadFullContext(project: Project): Promise<string> {
    const documents = await this.loadAvailableDocuments(project);
    const sections = documents.map((doc) => `## ${doc.name}\n\n${doc.content}`);
    return [`# Full SDD Context: ${project.name}`, ...sections].join('\n\n');
  }

  private buildHandoff(
    project: Project,
    approvedPhase: ApprovablePhase,
    documents: DocumentSnapshot[],
    sourceCharacters: number
  ): string {
    const sourceTokens = this.estimateTokens(sourceCharacters);
    const sections = documents.map((doc) => this.summarizeDocument(doc));
    const approvals = project.metadata.approvals;
    const checkpoint = project.metadata.checkpoints?.testCases;
    const nextSteps = this.getNextSteps(approvedPhase, checkpoint?.required === true && !checkpoint.reviewed);

    const draft = [
      `# SDD Context Handoff: ${project.name}`,
      '',
      `Generated: ${new Date().toISOString()}`,
      `Approved phase: ${approvedPhase}`,
      '',
      '## Workflow State',
      '',
      `- Requirements: ${this.formatApproval(approvals.requirements)}`,
      `- Design: ${this.formatApproval(approvals.design)}`,
      `- Tasks: ${this.formatApproval(approvals.tasks)}`,
      checkpoint?.required
        ? `- TDD test-case review: ${checkpoint.reviewed ? 'reviewed' : 'pending'}`
        : '- TDD test-case review: not required',
      '',
      '## Compact Phase Summaries',
      '',
      sections.join('\n\n'),
      '',
      '## Next Actions',
      '',
      ...nextSteps.map((step) => `- ${step}`),
      '',
      '## Source References',
      '',
      ...documents.map((doc) => `- ${doc.path}`),
      '',
      '## Context Budget Estimate',
      '',
      `- Full source context: ~${sourceTokens} tokens`,
      `- Handoff context: ~${this.estimateTokens(sourceCharacters > 0 ? Math.min(sourceCharacters, 1) : 0)} tokens before final write estimate`,
      '- Use `sdd-context-load` default compact mode for routine continuation.',
      '- Use `sdd-context-load` with `mode: "full"` only for audits or ambiguous decisions.'
    ].join('\n');

    const estimate = this.estimateContextSize(sourceCharacters, draft.length);
    return draft.replace(
      /- Handoff context: ~\d+ tokens before final write estimate/,
      `- Handoff context: ~${estimate.compactTokens} tokens`
    );
  }

  private summarizeDocument(doc: DocumentSnapshot): string {
    const lines = this.normalizeLines(doc.content);
    const headings = this.extractHeadings(lines);
    const bullets = this.extractBullets(lines);
    const requirements = this.extractRequirementLikeLines(lines);

    return [
      `### ${doc.name}`,
      '',
      headings.length > 0 ? '**Key sections:**' : '',
      ...headings.slice(0, 8).map((line) => `- ${line}`),
      bullets.length > 0 ? '\n**Important points:**' : '',
      ...bullets.slice(0, 8).map((line) => `- ${line}`),
      requirements.length > 0 ? '\n**Constraints and acceptance signals:**' : '',
      ...requirements.slice(0, 8).map((line) => `- ${line}`),
      headings.length === 0 && bullets.length === 0 && requirements.length === 0
        ? '- No structured summary points found; open source document if this phase is active.'
        : ''
    ].filter(Boolean).join('\n');
  }

  private async loadAvailableDocuments(project: Project): Promise<DocumentSnapshot[]> {
    const specDir = this.getSpecDir(project);
    const names = ['requirements.md', 'design.md', 'tasks.md', 'spec.json'];
    const documents: DocumentSnapshot[] = [];

    for (const name of names) {
      const path = `${specDir}/${name}`;
      const content = await this.readOptionalFile(path);
      if (content) {
        documents.push({ name, path, content });
      }
    }

    return documents;
  }

  private async readOptionalFile(path: string): Promise<string | null> {
    try {
      if (!(await this.fileSystem.exists(path))) {
        return null;
      }
      return await this.fileSystem.readFile(path);
    } catch {
      return null;
    }
  }

  private normalizeLines(content: string): string[] {
    return content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('```'));
  }

  private extractHeadings(lines: string[]): string[] {
    return this.unique(lines
      .filter((line) => /^#{1,4}\s+/.test(line))
      .map((line) => line.replace(/^#{1,4}\s+/, '').trim()));
  }

  private extractBullets(lines: string[]): string[] {
    return this.unique(lines
      .filter((line) => /^[-*]\s+/.test(line) || /^\d+\.\s+/.test(line))
      .map((line) => line.replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, '').trim())
      .filter((line) => line.length > 0 && line.length <= 220));
  }

  private extractRequirementLikeLines(lines: string[]): string[] {
    const keywords = /\b(SHALL|MUST|WHEN|IF|THEN|WHERE|constraint|risk|security|performance|error|edge case)\b/i;
    return this.unique(lines
      .filter((line) => keywords.test(line))
      .map((line) => line.replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, '').trim())
      .filter((line) => line.length <= 240));
  }

  private unique(lines: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];

    for (const line of lines) {
      const key = line.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        result.push(line);
      }
    }

    return result;
  }

  private getNextSteps(approvedPhase: ApprovablePhase, testReviewPending: boolean): string[] {
    if (approvedPhase === 'requirements') {
      return ['Generate or review design using the approved requirements handoff.'];
    }

    if (approvedPhase === 'design') {
      return ['Generate TDD task breakdown from the approved design handoff.'];
    }

    if (testReviewPending) {
      return ['Review TDD test cases, then run sdd-review-test-cases before approving tasks.'];
    }

    return ['Begin implementation with compact context loaded; open full docs only for ambiguous details.'];
  }

  private formatApproval(status: { generated: boolean; approved: boolean }): string {
    if (status.generated && status.approved) {
      return 'generated, approved';
    }
    if (status.generated) {
      return 'generated, pending approval';
    }
    return 'not generated';
  }

  private estimateTokens(characters: number): number {
    return Math.max(1, Math.ceil(characters / 4));
  }

  private getSpecDir(project: Project): string {
    return `${project.path}/.spec/specs/${project.name}`;
  }

  private getContextDir(project: Project): string {
    return `${this.getSpecDir(project)}/context`;
  }
}
