// Domain model for project context and memory management

export interface ProjectContext {
  readonly projectId: string;
  readonly basePath: string;
  readonly metadata: ProjectContextMetadata;
  readonly codebase: CodebaseAnalysis;
  readonly steering: SteeringContext;
  readonly session: SessionContext;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ProjectContextMetadata {
  readonly name: string;
  readonly description?: string;
  readonly technology: TechnologyStack;
  readonly architecture: ArchitecturePattern;
  readonly complexity: CodeComplexity;
  readonly changeHistory: ChangeHistoryEntry[];
}

export interface CodebaseAnalysis {
  readonly structure: FileTreeStructure;
  readonly dependencies: DependencyMap;
  readonly patterns: ArchitecturePattern[];
  readonly metrics: CodeMetrics;
  readonly hotspots: ComplexityHotspot[];
  readonly lastAnalyzed: Date;
}

export interface FileTreeStructure {
  readonly root: string;
  readonly directories: DirectoryNode[];
  readonly files: FileNode[];
  readonly totalFiles: number;
  readonly totalDirectories: number;
  readonly gitIgnored: string[];
}

export interface DirectoryNode {
  readonly path: string;
  readonly name: string;
  readonly children: string[];
  readonly fileCount: number;
  readonly purpose: DirectoryPurpose;
}

export interface FileNode {
  readonly path: string;
  readonly name: string;
  readonly extension: string;
  readonly size: number;
  readonly language: ProgrammingLanguage;
  readonly type: FileType;
  readonly complexity?: number;
  readonly dependencies: string[];
  readonly lastModified: Date;
}

export interface DependencyMap {
  readonly external: ExternalDependency[];
  readonly internal: InternalDependency[];
  readonly devDependencies: ExternalDependency[];
  readonly peerDependencies: ExternalDependency[];
  readonly graph: DependencyGraph;
}

export interface ExternalDependency {
  readonly name: string;
  readonly version: string;
  readonly type: DependencyType;
  readonly purpose: string;
  readonly isVulnerable?: boolean;
  readonly alternativePackages?: string[];
}

export interface InternalDependency {
  readonly from: string;
  readonly to: string;
  readonly type: 'import' | 'require' | 'reference';
  readonly strength: 'weak' | 'medium' | 'strong';
}

export interface DependencyGraph {
  readonly nodes: string[];
  readonly edges: { from: string; to: string; weight: number }[];
  readonly cycles: string[][];
  readonly orphans: string[];
}

export interface TechnologyStack {
  readonly primary: Technology[];
  readonly frameworks: Technology[];
  readonly tools: Technology[];
  readonly runtime: Technology[];
  readonly database?: Technology[];
  readonly infrastructure?: Technology[];
}

export interface Technology {
  readonly name: string;
  readonly version?: string;
  readonly category: TechnologyCategory;
  readonly confidence: number; // 0-1
  readonly evidence: string[];
}

export interface ArchitecturePattern {
  readonly name: ArchitecturePatternType;
  readonly confidence: number; // 0-1
  readonly evidence: PatternEvidence[];
  readonly violations: PatternViolation[];
}

export interface PatternEvidence {
  readonly description: string;
  readonly location: string;
  readonly strength: 'weak' | 'medium' | 'strong';
}

export interface PatternViolation {
  readonly description: string;
  readonly location: string;
  readonly severity: 'low' | 'medium' | 'high';
  readonly suggestion: string;
}

export interface CodeMetrics {
  readonly linesOfCode: number;
  readonly complexity: ComplexityMetrics;
  readonly maintainability: MaintainabilityMetrics;
  readonly testCoverage?: TestCoverageMetrics;
  readonly qualityScore: number; // 0-100
}

export interface ComplexityMetrics {
  readonly cyclomatic: number;
  readonly cognitive: number;
  readonly halstead: HalsteadMetrics;
  readonly nesting: NestingMetrics;
}

export interface HalsteadMetrics {
  readonly vocabulary: number;
  readonly length: number;
  readonly difficulty: number;
  readonly effort: number;
  readonly timeToCode: number; // in minutes
  readonly bugsDelivered: number;
}

export interface NestingMetrics {
  readonly average: number;
  readonly maximum: number;
  readonly violationsOver3: number;
}

export interface MaintainabilityMetrics {
  readonly index: number; // 0-100
  readonly duplication: number; // percentage
  readonly cohesion: number; // 0-1
  readonly coupling: number; // 0-1
  readonly debtRatio: number; // 0-1
}

export interface TestCoverageMetrics {
  readonly line: number; // percentage
  readonly branch: number; // percentage
  readonly function: number; // percentage
  readonly statement: number; // percentage
}

export interface ComplexityHotspot {
  readonly file: string;
  readonly function?: string;
  readonly line: number;
  readonly type: ComplexityType;
  readonly score: number;
  readonly reason: string;
  readonly suggestion: string;
}

export interface SteeringContext {
  readonly documents: SteeringDocument[];
  readonly mode: SteeringMode;
  readonly activeDocuments: string[];
  readonly lastRefresh: Date;
  readonly preferences: SteeringPreferences;
}

export interface SteeringDocument {
  readonly name: string;
  readonly path: string;
  readonly type: SteeringDocumentType;
  readonly mode: SteeringMode;
  readonly content: string;
  readonly patterns: string[];
  readonly priority: number;
  readonly lastModified: Date;
  readonly isValid: boolean;
  readonly errors?: string[];
}

export interface SteeringPreferences {
  readonly autoRefresh: boolean;
  readonly conditionalPatterns: Record<string, string[]>;
  readonly excludePatterns: string[];
  readonly priority: Record<string, number>;
}

export interface SessionContext {
  readonly sessionId: string;
  readonly workingDirectory: string;
  readonly preferences: SessionPreferences;
  readonly history: ContextChangeEntry[];
  readonly cache: ContextCache;
}

export interface SessionPreferences {
  readonly language: 'en' | 'ja' | 'zh-TW';
  readonly verbosity: 'minimal' | 'standard' | 'detailed';
  readonly autoSave: boolean;
  readonly contextWindow: number; // in minutes
}

export interface ContextChangeEntry {
  readonly timestamp: Date;
  readonly type: ContextChangeType;
  readonly description: string;
  readonly data: Record<string, unknown>;
  readonly impact: ContextImpact;
}

export interface ContextCache {
  readonly analyses: Record<string, CacheEntry>;
  readonly dependencies: Record<string, CacheEntry>;
  readonly steering: Record<string, CacheEntry>;
  readonly maxAge: number; // in minutes
  readonly size: number;
}

export interface CacheEntry {
  readonly data: unknown;
  readonly timestamp: Date;
  readonly hash: string;
  readonly ttl: number; // time to live in minutes
}

export interface ChangeHistoryEntry {
  readonly id: string;
  readonly timestamp: Date;
  readonly type: ChangeType;
  readonly files: string[];
  readonly impact: ChangeImpact;
  readonly triggeredBy: string;
}

// Enums and types
export enum DirectoryPurpose {
  SOURCE = 'source',
  TEST = 'test',
  CONFIG = 'config',
  DOCS = 'docs',
  BUILD = 'build',
  ASSETS = 'assets',
  VENDOR = 'vendor',
  UNKNOWN = 'unknown'
}

export enum ProgrammingLanguage {
  TYPESCRIPT = 'typescript',
  JAVASCRIPT = 'javascript',
  PYTHON = 'python',
  JAVA = 'java',
  GO = 'go',
  RUST = 'rust',
  CPP = 'cpp',
  CSHARP = 'csharp',
  PHP = 'php',
  RUBY = 'ruby',
  SWIFT = 'swift',
  KOTLIN = 'kotlin',
  DART = 'dart',
  UNKNOWN = 'unknown'
}

export enum FileType {
  SOURCE = 'source',
  TEST = 'test',
  CONFIG = 'config',
  DOCUMENTATION = 'documentation',
  ASSET = 'asset',
  BUILD = 'build',
  UNKNOWN = 'unknown'
}

export enum DependencyType {
  RUNTIME = 'runtime',
  DEVELOPMENT = 'development',
  PEER = 'peer',
  OPTIONAL = 'optional',
  BUNDLED = 'bundled'
}

export enum TechnologyCategory {
  LANGUAGE = 'language',
  FRAMEWORK = 'framework',
  LIBRARY = 'library',
  TOOL = 'tool',
  DATABASE = 'database',
  RUNTIME = 'runtime',
  PLATFORM = 'platform',
  SERVICE = 'service'
}

export enum ArchitecturePatternType {
  MVC = 'mvc',
  MVP = 'mvp',
  MVVM = 'mvvm',
  CLEAN = 'clean',
  HEXAGONAL = 'hexagonal',
  LAYERED = 'layered',
  MICROSERVICES = 'microservices',
  MONOLITHIC = 'monolithic',
  EVENT_DRIVEN = 'event-driven',
  PIPE_FILTER = 'pipe-filter',
  PLUGIN = 'plugin',
  UNKNOWN = 'unknown'
}

export enum ComplexityType {
  CYCLOMATIC = 'cyclomatic',
  COGNITIVE = 'cognitive',
  NESTING = 'nesting',
  LENGTH = 'length',
  PARAMETERS = 'parameters',
  DEPENDENCIES = 'dependencies'
}

export enum SteeringDocumentType {
  PRODUCT = 'product',
  TECHNICAL = 'technical',
  STRUCTURE = 'structure',
  CUSTOM = 'custom',
  LINUS_REVIEW = 'linus-review'
}

export enum SteeringMode {
  ALWAYS = 'always',
  CONDITIONAL = 'conditional',
  MANUAL = 'manual'
}

export enum ContextChangeType {
  FILE_ADDED = 'file-added',
  FILE_MODIFIED = 'file-modified',
  FILE_DELETED = 'file-deleted',
  DEPENDENCY_ADDED = 'dependency-added',
  DEPENDENCY_REMOVED = 'dependency-removed',
  STEERING_UPDATED = 'steering-updated',
  ANALYSIS_REFRESHED = 'analysis-refreshed'
}

export enum ContextImpact {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export enum ChangeType {
  CODE_CHANGE = 'code-change',
  CONFIG_CHANGE = 'config-change',
  DEPENDENCY_CHANGE = 'dependency-change',
  STRUCTURE_CHANGE = 'structure-change',
  STEERING_CHANGE = 'steering-change'
}

export enum ChangeImpact {
  NONE = 'none',
  MINOR = 'minor',
  MODERATE = 'moderate',
  MAJOR = 'major',
  BREAKING = 'breaking'
}

export enum CodeComplexity {
  SIMPLE = 'simple',
  MODERATE = 'moderate',
  COMPLEX = 'complex',
  VERY_COMPLEX = 'very-complex'
}