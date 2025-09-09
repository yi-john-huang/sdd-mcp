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
  INIT = 'init',
  REQUIREMENTS = 'requirements-generated',
  DESIGN = 'design-generated', 
  TASKS = 'tasks-generated',
  IMPLEMENTATION = 'implementation-ready'
}

export enum WorkflowState {
  PENDING = 'pending',
  IN_PROGRESS = 'in-progress',
  COMPLETED = 'completed',
  ERROR = 'error'
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
  GOOD = 'good',
  PASSABLE = 'passable',
  GARBAGE = 'garbage'
}

export interface QualityIssue {
  readonly type: IssueType;
  readonly message: string;
  readonly severity: IssueSeverity;
  readonly location?: CodeLocation;
}

export enum IssueType {
  COMPLEXITY = 'complexity',
  SPECIAL_CASE = 'special-case',
  DATA_STRUCTURE = 'data-structure',
  BREAKING_CHANGE = 'breaking-change',
  PRACTICALITY = 'practicality'
}

export enum IssueSeverity {
  ERROR = 'error',
  WARNING = 'warning',
  INFO = 'info'
}

export interface CodeLocation {
  readonly file: string;
  readonly line: number;
  readonly column: number;
}