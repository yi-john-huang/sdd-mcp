// Core domain types for SDD workflow

export interface Project {
  readonly id: string;
  readonly name: string;
  readonly path: string;
  readonly phase: WorkflowPhase;
  readonly metadata: ProjectMetadata;
}

export interface ProjectMetadata {
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly language: string;
  readonly approvals: PhaseApprovals;
}

export interface PhaseApprovals {
  readonly requirements: ApprovalStatus;
  readonly design: ApprovalStatus;
  readonly tasks: ApprovalStatus;
}

export interface ApprovalStatus {
  readonly generated: boolean;
  readonly approved: boolean;
}

export enum WorkflowPhase {
  INIT = "init",
  REQUIREMENTS = "requirements-generated",
  DESIGN = "design-generated",
  TASKS = "tasks-generated",
  IMPLEMENTATION = "implementation-ready",
}

export enum WorkflowState {
  PENDING = "pending",
  IN_PROGRESS = "in-progress",
  COMPLETED = "completed",
  ERROR = "error",
}

export interface Requirement {
  readonly id: string;
  readonly title: string;
  readonly objective: string;
  readonly acceptanceCriteria: string[];
}

export interface Design {
  readonly architecture: string;
  readonly components: Component[];
  readonly interfaces: Interface[];
  readonly dataModels: DataModel[];
}

export interface Component {
  readonly name: string;
  readonly purpose: string;
  readonly dependencies: string[];
}

export interface Interface {
  readonly name: string;
  readonly methods: Method[];
}

export interface Method {
  readonly name: string;
  readonly parameters: Parameter[];
  readonly returnType: string;
}

export interface Parameter {
  readonly name: string;
  readonly type: string;
  readonly required: boolean;
}

export interface DataModel {
  readonly name: string;
  readonly properties: Property[];
}

export interface Property {
  readonly name: string;
  readonly type: string;
  readonly required: boolean;
}

export interface Task {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly requirements: string[];
  readonly completed: boolean;
}

export interface QualityReport {
  readonly score: TasteScore;
  readonly issues: QualityIssue[];
  readonly recommendations: string[];
}

export enum TasteScore {
  GOOD = "good",
  PASSABLE = "passable",
  GARBAGE = "garbage",
}

export interface QualityIssue {
  readonly type: IssueType;
  readonly message: string;
  readonly severity: IssueSeverity;
  readonly location?: CodeLocation;
}

export enum IssueType {
  COMPLEXITY = "complexity",
  SPECIAL_CASE = "special-case",
  DATA_STRUCTURE = "data-structure",
  BREAKING_CHANGE = "breaking-change",
  PRACTICALITY = "practicality",
}

export enum IssueSeverity {
  ERROR = "error",
  WARNING = "warning",
  INFO = "info",
}

export interface CodeLocation {
  readonly file: string;
  readonly line: number;
  readonly column: number;
}

// Requirements Clarification Types

export interface ClarificationQuestion {
  readonly id: string;
  readonly category: QuestionCategory;
  readonly question: string;
  readonly why: string; // Why this question is important
  readonly examples?: string[]; // Example answers
  readonly required: boolean;
}

export enum QuestionCategory {
  WHY = "why", // Business justification, problem being solved
  WHO = "who", // Target users, personas, stakeholders
  WHAT = "what", // Core features, scope, MVP
  HOW = "how", // Technical approach, architecture
  SUCCESS = "success", // Success criteria, metrics
}

export interface ClarificationAnalysis {
  readonly qualityScore: number; // 0-100
  readonly missingElements: string[];
  readonly ambiguousTerms: AmbiguousTerm[];
  readonly needsClarification: boolean;
  readonly hasWhy: boolean;
  readonly hasWho: boolean;
  readonly hasWhat: boolean;
  readonly hasSuccessCriteria: boolean;
}

export interface AmbiguousTerm {
  readonly term: string;
  readonly context: string;
  readonly suggestion: string;
}

export interface EnrichedProjectDescription {
  readonly original: string;
  readonly why: string; // Business justification
  readonly who: string; // Target users
  readonly what: string; // Core features
  readonly how?: string; // Technical approach
  readonly successCriteria: string;
  readonly constraints?: string;
  readonly assumptions?: string;
  readonly enriched: string; // Synthesized full description
}

export interface ClarificationResult {
  readonly needsClarification: boolean;
  readonly questions?: ClarificationQuestion[];
  readonly analysis?: ClarificationAnalysis;
  readonly enrichedDescription?: EnrichedProjectDescription;
}

export type ClarificationAnswers = Record<string, string>;

export interface AnswerValidationResult {
  readonly valid: boolean;
  readonly missingRequired: string[];
  readonly tooShort: Array<{
    question: string;
    minLength: number;
    currentLength: number;
  }>;
  readonly containsInvalidContent: string[];
}
