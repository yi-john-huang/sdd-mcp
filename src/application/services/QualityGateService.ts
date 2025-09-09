// Quality gate service for integrating code quality enforcement throughout the SDD workflow

import { injectable, inject } from 'inversify';
import type { LoggerPort, FileSystemPort } from '../../domain/ports.js';
import { WorkflowPhase } from '../../domain/types.js';
import type { Project } from '../../domain/types.js';
import type { 
  CodeQualityAnalyzerPort,
  CodeAnalysisResult,
  QualityReport
} from '../../domain/quality/index.js';

import { 
  QualityScore,
  ViolationSeverity,
  ImprovementPriority
} from '../../domain/quality/index.js';
import { TYPES } from '../../infrastructure/di/types.js';

export interface QualityGateConfig {
  readonly enforceOnPhases: WorkflowPhase[];
  readonly minimumScore: QualityScore;
  readonly maxCriticalViolations: number;
  readonly maxMajorViolations: number;
  readonly requiredImprovements: ImprovementPriority[];
  readonly excludePatterns: string[];
  readonly includePatterns: string[];
  readonly failOnGarbage: boolean;
  readonly generateReports: boolean;
}

export interface QualityGateResult {
  readonly passed: boolean;
  readonly phase: WorkflowPhase;
  readonly project: Project;
  readonly report: QualityReport;
  readonly blockers: QualityBlocker[];
  readonly warnings: QualityWarning[];
  readonly recommendations: string[];
  readonly executedAt: Date;
}

export interface QualityBlocker {
  readonly type: 'score' | 'violations' | 'debt';
  readonly severity: ViolationSeverity;
  readonly description: string;
  readonly files: string[];
  readonly suggestedAction: string;
  readonly estimatedEffort: string;
}

export interface QualityWarning {
  readonly type: 'trend' | 'pattern' | 'maintenance';
  readonly description: string;
  readonly impact: string;
  readonly suggestion: string;
}

const DEFAULT_QUALITY_CONFIG: QualityGateConfig = {
  enforceOnPhases: [WorkflowPhase.REQUIREMENTS, WorkflowPhase.DESIGN, WorkflowPhase.TASKS, WorkflowPhase.IMPLEMENTATION],
  minimumScore: QualityScore.PASSABLE,
  maxCriticalViolations: 0,
  maxMajorViolations: 5,
  requiredImprovements: [ImprovementPriority.HIGH],
  excludePatterns: ['*.test.ts', '*.spec.ts', 'node_modules/**', 'dist/**'],
  includePatterns: ['src/**/*.ts', 'src/**/*.js'],
  failOnGarbage: true,
  generateReports: true
};

@injectable()
export class QualityGateService {
  private readonly config: QualityGateConfig;

  constructor(
    @inject(TYPES.LoggerPort) private readonly logger: LoggerPort,
    @inject(TYPES.FileSystemPort) private readonly fileSystem: FileSystemPort,
    @inject(TYPES.CodeQualityAnalyzerPort) private readonly qualityAnalyzer: CodeQualityAnalyzerPort,
    config: Partial<QualityGateConfig> = {}
  ) {
    this.config = { ...DEFAULT_QUALITY_CONFIG, ...config };
  }

  async executeQualityGate(
    project: Project, 
    phase: WorkflowPhase,
    customConfig?: Partial<QualityGateConfig>
  ): Promise<QualityGateResult> {
    const effectiveConfig = customConfig 
      ? { ...this.config, ...customConfig }
      : this.config;

    this.logger.info('Executing quality gate', {
      projectId: project.id,
      phase,
      minimumScore: effectiveConfig.minimumScore
    });

    try {
      // Check if quality gate should run for this phase
      if (!effectiveConfig.enforceOnPhases.includes(phase)) {
        this.logger.debug('Quality gate skipped for phase', { phase });
        return this.createPassingResult(project, phase);
      }

      // Discover and analyze source files
      const sourceFiles = await this.discoverSourceFiles(project, effectiveConfig);
      if (sourceFiles.length === 0) {
        this.logger.warn('No source files found for quality analysis', {
          projectPath: project.path,
          patterns: effectiveConfig.includePatterns
        });
        return this.createPassingResult(project, phase);
      }

      // Perform quality analysis
      const analysisResults = await this.analyzeSourceFiles(sourceFiles);
      const qualityReport = await this.qualityAnalyzer.getQualityReport(analysisResults);

      // Evaluate quality gate criteria
      const blockers = this.evaluateQualityCriteria(qualityReport, effectiveConfig);
      const warnings = this.generateWarnings(qualityReport);
      const recommendations = this.generateRecommendations(qualityReport, phase);

      const passed = blockers.length === 0;
      
      // Generate quality report if enabled
      if (effectiveConfig.generateReports) {
        await this.generateQualityReport(project, phase, qualityReport);
      }

      const result: QualityGateResult = {
        passed,
        phase,
        project,
        report: qualityReport,
        blockers,
        warnings,
        recommendations,
        executedAt: new Date()
      };

      this.logger.info('Quality gate completed', {
        projectId: project.id,
        phase,
        passed,
        blockersCount: blockers.length,
        warningsCount: warnings.length
      });

      return result;
    } catch (error) {
      this.logger.error('Quality gate execution failed', {
        projectId: project.id,
        phase,
        error: error instanceof Error ? error.message : String(error)
      } as any);
      throw error;
    }
  }

  async validateRequirementsQuality(project: Project): Promise<QualityGateResult> {
    // Requirements phase: Focus on clarity, completeness, and testability
    const config: Partial<QualityGateConfig> = {
      minimumScore: QualityScore.PASSABLE,
      maxCriticalViolations: 0,
      maxMajorViolations: 3,
      includePatterns: ['**/requirements.md', '**/specs/**/*.md']
    };
    
    return this.executeQualityGate(project, WorkflowPhase.REQUIREMENTS, config);
  }

  async validateDesignQuality(project: Project): Promise<QualityGateResult> {
    // Design phase: Focus on architecture, modularity, and maintainability
    const config: Partial<QualityGateConfig> = {
      minimumScore: QualityScore.PASSABLE,
      maxCriticalViolations: 0,
      maxMajorViolations: 5,
      requiredImprovements: [ImprovementPriority.HIGH],
      includePatterns: ['**/design.md', 'src/**/*.ts', '!src/**/*.test.ts']
    };
    
    return this.executeQualityGate(project, WorkflowPhase.DESIGN, config);
  }

  async validateTasksQuality(project: Project): Promise<QualityGateResult> {
    // Tasks phase: Focus on implementation plan quality and feasibility
    const config: Partial<QualityGateConfig> = {
      minimumScore: QualityScore.PASSABLE,
      maxCriticalViolations: 0,
      maxMajorViolations: 2,
      includePatterns: ['**/tasks.md', 'src/**/*.ts']
    };
    
    return this.executeQualityGate(project, WorkflowPhase.TASKS, config);
  }

  async validateImplementationQuality(project: Project): Promise<QualityGateResult> {
    // Implementation phase: Full code quality analysis
    const config: Partial<QualityGateConfig> = {
      minimumScore: QualityScore.PASSABLE,
      maxCriticalViolations: 0,
      maxMajorViolations: 10,
      requiredImprovements: [ImprovementPriority.HIGH, ImprovementPriority.MEDIUM],
      failOnGarbage: true
    };
    
    return this.executeQualityGate(project, WorkflowPhase.IMPLEMENTATION, config);
  }

  private async discoverSourceFiles(
    project: Project, 
    config: QualityGateConfig
  ): Promise<Array<{ path: string; content: string }>> {
    const files: Array<{ path: string; content: string }> = [];
    
    try {
      // This is a simplified implementation - in production, would use glob patterns
      const srcDir = `${project.path}/src`;
      if (await this.fileSystem.exists(srcDir)) {
        const sourceFiles = await this.findFilesRecursively(srcDir, config.includePatterns, config.excludePatterns);
        
        for (const filePath of sourceFiles) {
          try {
            const content = await this.fileSystem.readFile(filePath);
            files.push({ path: filePath, content });
          } catch (error) {
            this.logger.warn('Failed to read source file', {
              filePath,
              error: error instanceof Error ? error.message : String(error)
            });
          }
        }
      }

      // Also check documentation files for requirements/design phases
      const docsFiles = [
        `${project.path}/.kiro/specs/${project.name}/requirements.md`,
        `${project.path}/.kiro/specs/${project.name}/design.md`,
        `${project.path}/.kiro/specs/${project.name}/tasks.md`
      ];

      for (const filePath of docsFiles) {
        if (await this.fileSystem.exists(filePath)) {
          try {
            const content = await this.fileSystem.readFile(filePath);
            files.push({ path: filePath, content });
          } catch (error) {
            this.logger.debug('Failed to read documentation file', {
              filePath,
              error: error instanceof Error ? error.message : String(error)
            });
          }
        }
      }
    } catch (error) {
      this.logger.error('Failed to discover source files', {
        projectPath: project.path,
        error: error instanceof Error ? error.message : String(error)
      } as any);
    }
    
    return files;
  }

  private async findFilesRecursively(
    dir: string, 
    includePatterns: string[], 
    excludePatterns: string[]
  ): Promise<string[]> {
    // Simplified file discovery - in production would use proper glob matching
    const files: string[] = [];
    
    try {
      if (await this.fileSystem.exists(dir)) {
        // This is a placeholder - would implement proper recursive file discovery
        const typescriptFiles = [
          `${dir}/index.ts`,
          `${dir}/main.ts`,
          `${dir}/app.ts`
        ];
        
        for (const file of typescriptFiles) {
          if (await this.fileSystem.exists(file)) {
            files.push(file);
          }
        }
      }
    } catch (error) {
      this.logger.error('File discovery failed', {
        dir,
        error: error instanceof Error ? error.message : String(error)
      } as any);
    }
    
    return files;
  }

  private async analyzeSourceFiles(
    sourceFiles: Array<{ path: string; content: string }>
  ): Promise<CodeAnalysisResult[]> {
    const results: CodeAnalysisResult[] = [];
    
    for (const file of sourceFiles) {
      try {
        const analysis = await this.qualityAnalyzer.analyzeFile(file.path, file.content);
        results.push(analysis);
      } catch (error) {
        this.logger.warn('Failed to analyze source file', {
          filePath: file.path,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    
    return results;
  }

  private evaluateQualityCriteria(
    report: QualityReport, 
    config: QualityGateConfig
  ): QualityBlocker[] {
    const blockers: QualityBlocker[] = [];

    // Check overall quality score
    if (config.failOnGarbage && report.overall === QualityScore.GARBAGE) {
      blockers.push({
        type: 'score',
        severity: ViolationSeverity.CRITICAL,
        description: 'Overall code quality is rated as GARBAGE',
        files: report.files.filter(f => f.overallScore === QualityScore.GARBAGE).map(f => f.filePath),
        suggestedAction: 'Refactor code to improve taste, reduce complexity, and eliminate special cases',
        estimatedEffort: '16-40 hours'
      });
    }

    // Check minimum score requirement
    const scoreValues = {
      [QualityScore.GOOD]: 3,
      [QualityScore.PASSABLE]: 2,
      [QualityScore.GARBAGE]: 1
    };
    
    if (scoreValues[report.overall] < scoreValues[config.minimumScore]) {
      blockers.push({
        type: 'score',
        severity: ViolationSeverity.MAJOR,
        description: `Code quality (${report.overall}) is below minimum requirement (${config.minimumScore})`,
        files: report.files.map(f => f.filePath),
        suggestedAction: 'Address quality issues to meet minimum standards',
        estimatedEffort: '4-16 hours'
      });
    }

    // Check violation thresholds
    const criticalViolations = report.files.reduce((sum, file) => 
      sum + file.violations.filter(v => v.severity === ViolationSeverity.CRITICAL).length, 0);
    
    if (criticalViolations > config.maxCriticalViolations) {
      blockers.push({
        type: 'violations',
        severity: ViolationSeverity.CRITICAL,
        description: `${criticalViolations} critical violations exceed limit of ${config.maxCriticalViolations}`,
        files: report.files.filter(f => 
          f.violations.some(v => v.severity === ViolationSeverity.CRITICAL)
        ).map(f => f.filePath),
        suggestedAction: 'Fix all critical violations before proceeding',
        estimatedEffort: '1-4 hours per violation'
      });
    }

    const majorViolations = report.files.reduce((sum, file) => 
      sum + file.violations.filter(v => v.severity === ViolationSeverity.MAJOR).length, 0);
    
    if (majorViolations > config.maxMajorViolations) {
      blockers.push({
        type: 'violations',
        severity: ViolationSeverity.MAJOR,
        description: `${majorViolations} major violations exceed limit of ${config.maxMajorViolations}`,
        files: report.files.filter(f => 
          f.violations.some(v => v.severity === ViolationSeverity.MAJOR)
        ).map(f => f.filePath),
        suggestedAction: 'Address major violations to improve code quality',
        estimatedEffort: '30min-2 hours per violation'
      });
    }

    // Check technical debt
    if (report.summary.technicalDebt > 40) {
      blockers.push({
        type: 'debt',
        severity: ViolationSeverity.MAJOR,
        description: `Technical debt of ${report.summary.technicalDebt} hours is too high`,
        files: report.files.map(f => f.filePath),
        suggestedAction: 'Prioritize technical debt reduction',
        estimatedEffort: `${Math.ceil(report.summary.technicalDebt / 4)} days`
      });
    }

    return blockers;
  }

  private generateWarnings(report: QualityReport): QualityWarning[] {
    const warnings: QualityWarning[] = [];
    
    // Check quality trends
    const decliningTrends = report.trends.filter(t => t.direction === 'degrading');
    if (decliningTrends.length > 0) {
      warnings.push({
        type: 'trend',
        description: `${decliningTrends.length} quality metrics are declining`,
        impact: 'Code quality may continue to degrade over time',
        suggestion: 'Monitor and address declining trends proactively'
      });
    }

    // Check for patterns
    if (report.summary.passableFiles > report.summary.goodFiles) {
      warnings.push({
        type: 'pattern',
        description: 'More files are rated as passable than good',
        impact: 'Overall codebase quality is mediocre',
        suggestion: 'Focus on improving passable files to good quality'
      });
    }

    // Maintenance warnings
    const avgComplexity = report.files.reduce((sum, f) => 
      sum + f.complexityAnalysis.cyclomaticComplexity, 0) / report.files.length;
    
    if (avgComplexity > 15) {
      warnings.push({
        type: 'maintenance',
        description: 'Average complexity is high across the codebase',
        impact: 'Code will be harder to maintain and debug',
        suggestion: 'Refactor complex functions and reduce branching logic'
      });
    }

    return warnings;
  }

  private generateRecommendations(report: QualityReport, phase: WorkflowPhase): string[] {
    const recommendations: string[] = [];
    
    switch (phase) {
      case WorkflowPhase.REQUIREMENTS:
        recommendations.push('Ensure requirements are testable and measurable');
        recommendations.push('Review requirements with stakeholders for completeness');
        break;
        
      case WorkflowPhase.DESIGN:
        recommendations.push('Validate architectural decisions against requirements');
        recommendations.push('Consider design patterns for complex interactions');
        if (report.summary.technicalDebt > 20) {
          recommendations.push('Design should minimize technical debt accumulation');
        }
        break;
        
      case WorkflowPhase.TASKS:
        recommendations.push('Break down complex tasks into smaller, manageable units');
        recommendations.push('Ensure task dependencies are clearly defined');
        break;
        
      case WorkflowPhase.IMPLEMENTATION:
        recommendations.push('Focus on high-priority quality improvements first');
        if (report.summary.garbageFiles > 0) {
          recommendations.push('Refactor garbage-quality files before proceeding');
        }
        recommendations.push('Add comprehensive tests for complex logic');
        break;
    }

    // Add general recommendations based on report
    if (report.summary.technicalDebt > 10) {
      recommendations.push(`Address ${Math.ceil(report.summary.technicalDebt)} hours of technical debt`);
    }

    return recommendations;
  }

  private async generateQualityReport(
    project: Project, 
    phase: WorkflowPhase, 
    report: QualityReport
  ): Promise<void> {
    try {
      const reportDir = `${project.path}/.kiro/quality`;
      await this.fileSystem.mkdir(reportDir);
      
      const reportPath = `${reportDir}/quality-report-${phase.toLowerCase()}-${Date.now()}.json`;
      const reportContent = JSON.stringify(report, null, 2);
      
      await this.fileSystem.writeFile(reportPath, reportContent);
      
      this.logger.debug('Quality report generated', { reportPath });
    } catch (error) {
      this.logger.warn('Failed to generate quality report', {
        projectId: project.id,
        phase,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private createPassingResult(project: Project, phase: WorkflowPhase): QualityGateResult {
    return {
      passed: true,
      phase,
      project,
      report: {
        overall: QualityScore.GOOD,
        summary: {
          totalFiles: 0,
          goodFiles: 0,
          passableFiles: 0,
          garbageFiles: 0,
          averageScore: 10,
          topIssues: [],
          technicalDebt: 0
        },
        files: [],
        trends: [],
        recommendations: [],
        generatedAt: new Date()
      },
      blockers: [],
      warnings: [],
      recommendations: [],
      executedAt: new Date()
    };
  }

  // Public utility methods
  async getQualityConfig(): Promise<QualityGateConfig> {
    return this.config;
  }

  async updateQualityConfig(updates: Partial<QualityGateConfig>): Promise<void> {
    Object.assign(this.config as any, updates);
    this.logger.info('Quality gate configuration updated', updates);
  }
}