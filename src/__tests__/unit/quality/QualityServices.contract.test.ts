import { QualityGateService } from '../../../application/services/QualityGateService';
import { QualityService } from '../../../application/services/QualityService';
import type { FileSystemPort, LoggerPort, QualityAnalyzer } from '../../../domain/ports';
import {
  IssueSeverity,
  IssueType,
  TasteScore,
  WorkflowPhase,
  type Project,
  type QualityReport as LegacyQualityReport,
} from '../../../domain/types';
import {
  ImprovementPriority,
  ProgrammingLanguage,
  QualityScore,
  ViolationSeverity,
  ViolationType,
  type CodeAnalysisResult,
  type CodeQualityAnalyzerPort,
  type QualityReport,
} from '../../../domain/quality';

const logger: LoggerPort = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

const project: Project = {
  id: 'project-1',
  name: 'checkout',
  path: '/workspace/checkout',
  phase: WorkflowPhase.IMPLEMENTATION,
  metadata: {
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    language: 'typescript',
    approvals: {
      requirements: { generated: true, approved: true, revision: 1, validation: { status: 'passed', blockers: [] } },
      design: { generated: true, approved: true, revision: 1, validation: { status: 'passed', blockers: [] } },
      tasks: { generated: true, approved: true, revision: 1, validation: { status: 'passed', blockers: [] } },
    },
  },
};

const analysis: CodeAnalysisResult = {
  filePath: '/workspace/checkout/src/index.ts',
  language: ProgrammingLanguage.TYPESCRIPT,
  overallScore: QualityScore.GARBAGE,
  tasteAnalysis: { score: 'garbage', reasoning: 'hard to follow', elegance: 1, simplicity: 1, intuition: 1, readability: 1, examples: [] },
  complexityAnalysis: { cyclomaticComplexity: 30, cognitiveComplexity: 30, nestingDepth: 8, lineCount: 200, functionCount: 2, classCount: 0, score: 1, hotspots: [], recommendations: [] },
  specialCaseAnalysis: { specialCases: [], score: 1, generalizations: [], magicNumbers: [], hardcodedValues: [] },
  dataStructureAnalysis: { appropriateness: 1, efficiency: 1, memoryUsage: { usage: 'high', efficiency: 1, leaks: [], optimizations: [] }, accessPatterns: [], suggestions: [] },
  organizationAnalysis: { singleResponsibility: 1, separationOfConcerns: 1, naming: { consistency: 1, clarity: 1, conventions: [], suggestions: [] }, structure: { logicalFlow: 1, layering: 1, modularity: 1, issues: [] }, dependencies: { count: 0, depth: 0, circular: [], unnecessary: [], suggestions: [] }, cohesion: 1, coupling: 9 },
  violations: [
    { type: ViolationType.COMPLEXITY, severity: ViolationSeverity.CRITICAL, line: 1, message: 'critical', rule: 'complexity', suggestion: 'split it' },
    { type: ViolationType.ORGANIZATION, severity: ViolationSeverity.MAJOR, line: 2, message: 'major', rule: 'organization', suggestion: 'separate it' },
  ],
  suggestions: [],
  metrics: { linesOfCode: 200, linesOfComments: 0, commentRatio: 0, maintainabilityIndex: 1, technicalDebt: { totalHours: 50, categories: [], priority: [], trends: [] } },
  analyzedAt: new Date('2026-01-01T00:00:00.000Z'),
} as unknown as CodeAnalysisResult;

const report: QualityReport = {
  overall: QualityScore.GARBAGE,
  summary: { totalFiles: 1, goodFiles: 0, passableFiles: 1, garbageFiles: 1, averageScore: 1, topIssues: [], technicalDebt: 50 },
  files: [analysis],
  trends: [{ metric: 'complexity', direction: 'degrading', change: 10, period: 'release' }],
  recommendations: [],
  generatedAt: new Date('2026-01-01T00:00:00.000Z'),
} as unknown as QualityReport;

describe('QualityGateService contracts', () => {
  const files = new Map<string, string>([
    ['/workspace/checkout/src/index.ts', 'export const checkout = () => true;'],
    ['/workspace/checkout/src/main.ts', 'export const main = () => true;'],
    ['/workspace/checkout/.spec/specs/checkout/requirements.md', '# Requirements'],
    ['/workspace/checkout/.spec/specs/checkout/design.md', '# Design'],
    ['/workspace/checkout/.spec/specs/checkout/tasks.md', '# Tasks'],
  ]);
  const written = new Map<string, string>();
  const fileSystem: FileSystemPort = {
    readFile: async (filePath) => {
      const content = files.get(filePath);
      if (content === undefined) throw new Error('missing');
      return content;
    },
    writeFile: async (filePath, content) => { written.set(filePath, content); },
    exists: async (filePath) => filePath === '/workspace/checkout/src' || files.has(filePath),
    mkdir: async () => undefined,
    readdir: async () => [],
    stat: async () => ({ isFile: () => true, isDirectory: () => false }),
  };
  const analyzer: CodeQualityAnalyzerPort = {
    analyzeFile: jest.fn(async (filePath) => ({ ...analysis, filePath })),
    analyzeBatch: jest.fn(async () => [analysis]),
    getQualityReport: jest.fn(async () => report),
  };
  const service = new QualityGateService(logger, fileSystem, analyzer);

  beforeEach(() => {
    jest.clearAllMocks();
    written.clear();
  });

  it('blocks garbage implementation quality and emits durable diagnostics', async () => {
    const result = await service.executeQualityGate(project, WorkflowPhase.IMPLEMENTATION, {
      maxCriticalViolations: 0,
      maxMajorViolations: 0,
      minimumScore: QualityScore.GOOD,
      failOnGarbage: true,
      generateReports: true,
    });

    expect(result.passed).toBe(false);
    expect(result.blockers.map(({ type }) => type)).toEqual(expect.arrayContaining(['score', 'violations', 'debt']));
    expect(result.warnings.map(({ type }) => type)).toEqual(expect.arrayContaining(['trend', 'pattern', 'maintenance']));
    expect(result.recommendations).toEqual(expect.arrayContaining([
      'Focus on high-priority quality improvements first',
      'Refactor garbage-quality files before proceeding',
      'Address 50 hours of technical debt',
    ]));
    expect([...written.values()][0]).toContain('"overall": "garbage"');
  });

  it('provides phase-specific gates and supports configuration updates', async () => {
    await service.updateQualityConfig({ requiredImprovements: [ImprovementPriority.HIGH] });
    expect((await service.getQualityConfig()).requiredImprovements).toEqual([ImprovementPriority.HIGH]);

    const [requirements, design, tasks, implementation] = await Promise.all([
      service.validateRequirementsQuality(project),
      service.validateDesignQuality(project),
      service.validateTasksQuality(project),
      service.validateImplementationQuality(project),
    ]);
    expect(requirements.recommendations).toContain('Ensure requirements are testable and measurable');
    expect(design.recommendations).toContain('Validate architectural decisions against requirements');
    expect(tasks.recommendations).toContain('Break down complex tasks into smaller, manageable units');
    expect(implementation.recommendations).toContain('Add comprehensive tests for complex logic');
  });

  it('skips unenforced phases and passes projects without source files', async () => {
    await expect(service.executeQualityGate(project, WorkflowPhase.INIT)).resolves.toMatchObject({ passed: true, blockers: [] });
    const emptyFs = { ...fileSystem, exists: async () => false };
    const emptyService = new QualityGateService(logger, emptyFs, analyzer);
    await expect(emptyService.executeQualityGate(project, WorkflowPhase.IMPLEMENTATION)).resolves.toMatchObject({ passed: true, blockers: [] });
  });
});

describe('QualityService contracts', () => {
  const issues = Object.values(IssueType).map((type) => ({ type, message: `${type} issue`, severity: IssueSeverity.WARNING }));
  const legacyReport: LegacyQualityReport = { score: TasteScore.GARBAGE, issues, recommendations: [] };
  const qualityAnalyzer: QualityAnalyzer = {
    analyzeCode: jest.fn(async () => legacyReport),
    analyzeDataStructure: jest.fn(async () => legacyReport),
    checkComplexity: jest.fn(),
    detectSpecialCases: jest.fn(async () => ['null branch']),
  };
  const gate = {
    validateRequirementsQuality: jest.fn(async () => ({ passed: true })),
    validateDesignQuality: jest.fn(async () => ({ passed: true })),
    validateTasksQuality: jest.fn(async () => ({ passed: true })),
    validateImplementationQuality: jest.fn(async () => ({ passed: true })),
    executeQualityGate: jest.fn(async () => ({ passed: true, blockers: [] })),
  } as unknown as QualityGateService;
  const linusAnalyzer: CodeQualityAnalyzerPort = {
    analyzeFile: jest.fn(async () => analysis),
    analyzeBatch: jest.fn(async () => [analysis]),
    getQualityReport: jest.fn(async () => report),
  };
  const service = new QualityService(qualityAnalyzer, logger, linusAnalyzer, gate);

  beforeEach(() => jest.clearAllMocks());

  it('supports legacy and Linus analysis entrypoints', async () => {
    await expect(service.performQualityCheck({ code: 'const x = 1;' })).resolves.toBe(legacyReport);
    await expect(service.performQualityCheck({ dataStructure: { key: 'value' } })).resolves.toBe(legacyReport);
    await expect(service.performQualityCheck({})).rejects.toThrow('Either code or dataStructure');
    await expect(service.performLinusAnalysis('src/index.ts', 'export {}')).resolves.toBe(analysis);
    await expect(service.performBatchAnalysis([{ path: 'src/index.ts', content: 'export {}' }])).resolves.toBe(report);
  });

  it('classifies complexity and formats all recommendation categories', async () => {
    const checkComplexity = qualityAnalyzer.checkComplexity as jest.MockedFunction<QualityAnalyzer['checkComplexity']>;
    checkComplexity.mockResolvedValueOnce(3).mockResolvedValueOnce(8).mockResolvedValueOnce(15);
    await expect(service.analyzeComplexity('simple')).resolves.toMatchObject({ assessment: 'good' });
    await expect(service.analyzeComplexity('moderate')).resolves.toMatchObject({ assessment: 'acceptable' });
    await expect(service.analyzeComplexity('complex')).resolves.toMatchObject({ assessment: 'too-complex' });
    await expect(service.detectSpecialCases('if (x == null)')).resolves.toEqual(['null branch']);

    const recommendations = service.generateQualityRecommendations(legacyReport);
    expect(recommendations).toHaveLength(Object.values(IssueType).length);
    expect(service.formatQualityReport(legacyReport)).toContain('Garbage');
    expect(service.formatQualityReport({ ...legacyReport, score: TasteScore.GOOD })).toContain('Good taste');
    expect(service.formatQualityReport({ ...legacyReport, score: TasteScore.PASSABLE })).toContain('Passable');
  });

  it('delegates every workflow gate', async () => {
    await service.validateRequirements(project);
    await service.validateDesign(project);
    await service.validateTasks(project);
    await service.validateImplementation(project);
    await service.executeWorkflowGate(project, WorkflowPhase.IMPLEMENTATION);

    expect(gate.validateRequirementsQuality).toHaveBeenCalledWith(project);
    expect(gate.validateDesignQuality).toHaveBeenCalledWith(project);
    expect(gate.validateTasksQuality).toHaveBeenCalledWith(project);
    expect(gate.validateImplementationQuality).toHaveBeenCalledWith(project);
    expect(gate.executeQualityGate).toHaveBeenCalledWith(project, WorkflowPhase.IMPLEMENTATION);
  });
});
