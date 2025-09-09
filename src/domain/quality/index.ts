// Domain models and interfaces for code quality analysis

export interface CodeAnalysisResult {
  readonly filePath: string;
  readonly language: ProgrammingLanguage;
  readonly overallScore: QualityScore;
  readonly tasteAnalysis: TasteAnalysis;
  readonly complexityAnalysis: ComplexityAnalysis;
  readonly specialCaseAnalysis: SpecialCaseAnalysis;
  readonly dataStructureAnalysis: DataStructureAnalysis;
  readonly organizationAnalysis: OrganizationAnalysis;
  readonly violations: QualityViolation[];
  readonly suggestions: QualityImprovement[];
  readonly metrics: CodeMetrics;
  readonly analyzedAt: Date;
}

export interface TasteAnalysis {
  readonly score: TasteScore;
  readonly reasoning: string;
  readonly elegance: number; // 0-10
  readonly simplicity: number; // 0-10
  readonly intuition: number; // 0-10
  readonly readability: number; // 0-10
  readonly examples: TasteExample[];
}

export interface ComplexityAnalysis {
  readonly cyclomaticComplexity: number;
  readonly cognitiveComplexity: number;
  readonly nestingDepth: number;
  readonly lineCount: number;
  readonly functionCount: number;
  readonly classCount: number;
  readonly score: number; // 0-10, higher is better (less complex)
  readonly hotspots: ComplexityHotspot[];
  readonly recommendations: string[];
}

export interface SpecialCaseAnalysis {
  readonly specialCases: SpecialCase[];
  readonly score: number; // 0-10, higher is better (fewer special cases)
  readonly generalizations: GeneralizationSuggestion[];
  readonly magicNumbers: MagicNumber[];
  readonly hardcodedValues: HardcodedValue[];
}

export interface DataStructureAnalysis {
  readonly appropriateness: number; // 0-10
  readonly efficiency: number; // 0-10
  readonly memoryUsage: MemoryAnalysis;
  readonly accessPatterns: AccessPatternAnalysis[];
  readonly suggestions: DataStructureSuggestion[];
}

export interface OrganizationAnalysis {
  readonly singleResponsibility: number; // 0-10
  readonly separationOfConcerns: number; // 0-10
  readonly naming: NamingAnalysis;
  readonly structure: StructureAnalysis;
  readonly dependencies: DependencyAnalysis;
  readonly cohesion: number; // 0-10
  readonly coupling: number; // 0-10 (lower is better)
}

export interface QualityViolation {
  readonly type: ViolationType;
  readonly severity: ViolationSeverity;
  readonly line: number;
  readonly column?: number;
  readonly message: string;
  readonly rule: string;
  readonly suggestion: string;
  readonly example?: string;
}

export interface QualityImprovement {
  readonly type: ImprovementType;
  readonly priority: ImprovementPriority;
  readonly description: string;
  readonly before: string;
  readonly after: string;
  readonly benefit: string;
  readonly effort: EffortEstimate;
}

export interface TasteExample {
  readonly category: TasteCategory;
  readonly code: string;
  readonly issue: string;
  readonly improvement: string;
  readonly impact: TasteImpact;
}

export interface ComplexityHotspot {
  readonly functionName: string;
  readonly line: number;
  readonly complexity: number;
  readonly type: ComplexityType;
  readonly reason: string;
  readonly suggestion: string;
}

export interface SpecialCase {
  readonly line: number;
  readonly type: SpecialCaseType;
  readonly description: string;
  readonly generalization: string;
  readonly confidence: number; // 0-1
}

export interface GeneralizationSuggestion {
  readonly description: string;
  readonly impact: string;
  readonly effort: EffortEstimate;
  readonly examples: string[];
}

export interface MagicNumber {
  readonly value: number | string;
  readonly line: number;
  readonly context: string;
  readonly suggestedConstant: string;
}

export interface HardcodedValue {
  readonly value: string;
  readonly line: number;
  readonly type: HardcodedType;
  readonly suggestion: string;
}

export interface MemoryAnalysis {
  readonly usage: MemoryUsage;
  readonly efficiency: number; // 0-10
  readonly leaks: MemoryLeak[];
  readonly optimizations: MemoryOptimization[];
}

export interface AccessPatternAnalysis {
  readonly pattern: AccessPattern;
  readonly frequency: number;
  readonly efficiency: number; // 0-10
  readonly suggestion?: string;
}

export interface DataStructureSuggestion {
  readonly current: string;
  readonly suggested: string;
  readonly reason: string;
  readonly benefit: string;
  readonly tradeoffs: string[];
}

export interface NamingAnalysis {
  readonly consistency: number; // 0-10
  readonly clarity: number; // 0-10
  readonly conventions: ConventionCompliance[];
  readonly suggestions: NamingSuggestion[];
}

export interface StructureAnalysis {
  readonly logicalFlow: number; // 0-10
  readonly layering: number; // 0-10
  readonly modularity: number; // 0-10
  readonly issues: StructuralIssue[];
}

export interface DependencyAnalysis {
  readonly count: number;
  readonly depth: number;
  readonly circular: CircularDependency[];
  readonly unnecessary: UnnecessaryDependency[];
  readonly suggestions: DependencyImprovement[];
}

export interface CodeMetrics {
  readonly linesOfCode: number;
  readonly linesOfComments: number;
  readonly commentRatio: number;
  readonly testCoverage?: number;
  readonly maintainabilityIndex: number; // 0-100
  readonly technicalDebt: TechnicalDebtAnalysis;
}

export interface TechnicalDebtAnalysis {
  readonly totalHours: number;
  readonly categories: DebtCategory[];
  readonly priority: DebtPriority[];
  readonly trends: DebtTrend[];
}

// Enums and types
export enum ProgrammingLanguage {
  TYPESCRIPT = 'typescript',
  JAVASCRIPT = 'javascript',
  PYTHON = 'python',
  JAVA = 'java',
  GO = 'go',
  RUST = 'rust',
  CPP = 'cpp',
  CSHARP = 'csharp'
}

export enum QualityScore {
  GOOD = 'good',
  PASSABLE = 'passable',
  GARBAGE = 'garbage'
}

export enum TasteScore {
  GOOD = 'good',
  PASSABLE = 'passable', 
  GARBAGE = 'garbage'
}

export enum ViolationType {
  TASTE = 'taste',
  COMPLEXITY = 'complexity',
  SPECIAL_CASE = 'special-case',
  DATA_STRUCTURE = 'data-structure',
  ORGANIZATION = 'organization',
  SECURITY = 'security',
  PERFORMANCE = 'performance'
}

export enum ViolationSeverity {
  CRITICAL = 'critical',
  MAJOR = 'major',
  MINOR = 'minor',
  SUGGESTION = 'suggestion'
}

export enum ImprovementType {
  REFACTOR = 'refactor',
  OPTIMIZE = 'optimize',
  SIMPLIFY = 'simplify',
  REORGANIZE = 'reorganize',
  MODERNIZE = 'modernize'
}

export enum ImprovementPriority {
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low'
}

export enum EffortEstimate {
  TRIVIAL = 'trivial',     // < 1 hour
  SMALL = 'small',         // 1-4 hours
  MEDIUM = 'medium',       // 4-16 hours
  LARGE = 'large',         // 16-40 hours
  MASSIVE = 'massive'      // > 40 hours
}

export enum TasteCategory {
  ELEGANCE = 'elegance',
  SIMPLICITY = 'simplicity',
  CLARITY = 'clarity',
  CONSISTENCY = 'consistency'
}

export enum TasteImpact {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high'
}

export enum ComplexityType {
  CYCLOMATIC = 'cyclomatic',
  COGNITIVE = 'cognitive',
  NESTING = 'nesting',
  LENGTH = 'length'
}

export enum SpecialCaseType {
  CONDITIONAL = 'conditional',
  EXCEPTION = 'exception',
  EDGE_CASE = 'edge-case',
  WORKAROUND = 'workaround'
}

export enum HardcodedType {
  STRING = 'string',
  NUMBER = 'number',
  URL = 'url',
  PATH = 'path',
  CONFIG = 'config'
}

export enum MemoryUsage {
  EFFICIENT = 'efficient',
  MODERATE = 'moderate',
  WASTEFUL = 'wasteful'
}

export enum AccessPattern {
  SEQUENTIAL = 'sequential',
  RANDOM = 'random',
  BULK = 'bulk',
  SPARSE = 'sparse'
}

// Supporting interfaces
export interface MemoryLeak {
  readonly line: number;
  readonly type: string;
  readonly description: string;
  readonly severity: ViolationSeverity;
}

export interface MemoryOptimization {
  readonly description: string;
  readonly impact: string;
  readonly effort: EffortEstimate;
}

export interface ConventionCompliance {
  readonly convention: string;
  readonly compliance: number; // 0-10
  readonly violations: string[];
}

export interface NamingSuggestion {
  readonly current: string;
  readonly suggested: string;
  readonly reason: string;
  readonly line: number;
}

export interface StructuralIssue {
  readonly type: string;
  readonly description: string;
  readonly impact: string;
  readonly suggestion: string;
}

export interface CircularDependency {
  readonly cycle: string[];
  readonly impact: string;
  readonly suggestion: string;
}

export interface UnnecessaryDependency {
  readonly dependency: string;
  readonly reason: string;
  readonly suggestion: string;
}

export interface DependencyImprovement {
  readonly description: string;
  readonly benefit: string;
  readonly effort: EffortEstimate;
}

export interface DebtCategory {
  readonly name: string;
  readonly hours: number;
  readonly percentage: number;
}

export interface DebtPriority {
  readonly issue: string;
  readonly hours: number;
  readonly impact: string;
  readonly urgency: number; // 0-10
}

export interface DebtTrend {
  readonly period: string;
  readonly change: number; // hours
  readonly direction: 'increasing' | 'decreasing' | 'stable';
}

// Port interfaces
export interface CodeQualityAnalyzerPort {
  analyzeFile(filePath: string, content: string): Promise<CodeAnalysisResult>;
  analyzeBatch(files: Array<{ path: string; content: string }>): Promise<CodeAnalysisResult[]>;
  getQualityReport(results: CodeAnalysisResult[]): Promise<QualityReport>;
}

export interface QualityReport {
  readonly overall: QualityScore;
  readonly summary: QualitySummary;
  readonly files: CodeAnalysisResult[];
  readonly trends: QualityTrend[];
  readonly recommendations: QualityRecommendation[];
  readonly generatedAt: Date;
}

export interface QualitySummary {
  readonly totalFiles: number;
  readonly goodFiles: number;
  readonly passableFiles: number;
  readonly garbageFiles: number;
  readonly averageScore: number;
  readonly topIssues: string[];
  readonly technicalDebt: number; // hours
}

export interface QualityTrend {
  readonly metric: string;
  readonly current: number;
  readonly previous: number;
  readonly change: number;
  readonly direction: 'improving' | 'degrading' | 'stable';
}

export interface QualityRecommendation {
  readonly priority: ImprovementPriority;
  readonly description: string;
  readonly impact: string;
  readonly effort: EffortEstimate;
  readonly files: string[];
}