// Enhanced Quality Service with Linus-style code review integration

import { injectable, inject } from 'inversify';
import { v4 as uuidv4 } from 'uuid';
import { TYPES } from '../../infrastructure/di/types.js';
import { QualityReport as LegacyQualityReport, TasteScore, IssueType } from '../../domain/types.js';
import { QualityAnalyzer, LoggerPort } from '../../domain/ports.js';
import type { 
  CodeQualityAnalyzerPort,
  QualityReport,
  CodeAnalysisResult,
  QualityScore
} from '../../domain/quality/index.js';
import { QualityGateService, type QualityGateResult } from './QualityGateService.js';
import type { Project, WorkflowPhase } from '../../domain/types.js';

export interface QualityCheckRequest {
  code?: string;
  language?: string;
  dataStructure?: object;
  context?: string;
}

export interface QualityRecommendation {
  priority: 'high' | 'medium' | 'low';
  category: IssueType;
  suggestion: string;
  example?: string;
}

@injectable()
export class QualityService {
  constructor(
    @inject(TYPES.QualityAnalyzer) private readonly qualityAnalyzer: QualityAnalyzer,
    @inject(TYPES.LoggerPort) private readonly logger: LoggerPort,
    @inject(TYPES.CodeQualityAnalyzerPort) private readonly linusAnalyzer: CodeQualityAnalyzerPort,
    @inject(TYPES.QualityGateService) private readonly qualityGateService: QualityGateService
  ) {}

  // Legacy quality check method (maintained for backward compatibility)
  async performQualityCheck(request: QualityCheckRequest): Promise<LegacyQualityReport> {
    const correlationId = uuidv4();
    
    this.logger.info('Performing legacy quality check', {
      correlationId,
      hasCode: !!request.code,
      language: request.language,
      hasDataStructure: !!request.dataStructure,
      context: request.context
    });

    let report: LegacyQualityReport;

    if (request.code) {
      report = await this.qualityAnalyzer.analyzeCode(
        request.code, 
        request.language ?? 'typescript'
      );
    } else if (request.dataStructure) {
      report = await this.qualityAnalyzer.analyzeDataStructure(request.dataStructure);
    } else {
      throw new Error('Either code or dataStructure must be provided for quality check');
    }

    this.logger.info('Legacy quality check completed', {
      correlationId,
      score: report.score,
      issueCount: report.issues.length,
      recommendationCount: report.recommendations.length
    });

    return report;
  }

  // New Linus-style code analysis methods
  async performLinusAnalysis(filePath: string, content: string): Promise<CodeAnalysisResult> {
    const correlationId = uuidv4();
    
    this.logger.info('Performing Linus-style analysis', {
      correlationId,
      filePath
    });

    const analysis = await this.linusAnalyzer.analyzeFile(filePath, content);
    
    this.logger.info('Linus analysis completed', {
      correlationId,
      filePath,
      overallScore: analysis.overallScore,
      violationsCount: analysis.violations.length,
      suggestionsCount: analysis.suggestions.length
    });

    return analysis;
  }

  async performBatchAnalysis(files: Array<{ path: string; content: string }>): Promise<QualityReport> {
    const correlationId = uuidv4();
    
    this.logger.info('Performing batch quality analysis', {
      correlationId,
      fileCount: files.length
    });

    const analyses = await this.linusAnalyzer.analyzeBatch(files);
    const report = await this.linusAnalyzer.getQualityReport(analyses);
    
    this.logger.info('Batch analysis completed', {
      correlationId,
      overallScore: report.overall,
      filesAnalyzed: analyses.length,
      technicalDebt: report.summary.technicalDebt
    });

    return report;
  }

  // Workflow integration methods
  async validateRequirements(project: Project): Promise<QualityGateResult> {
    return this.qualityGateService.validateRequirementsQuality(project);
  }

  async validateDesign(project: Project): Promise<QualityGateResult> {
    return this.qualityGateService.validateDesignQuality(project);
  }

  async validateTasks(project: Project): Promise<QualityGateResult> {
    return this.qualityGateService.validateTasksQuality(project);
  }

  async validateImplementation(project: Project): Promise<QualityGateResult> {
    return this.qualityGateService.validateImplementationQuality(project);
  }

  async executeWorkflowGate(project: Project, phase: WorkflowPhase): Promise<QualityGateResult> {
    const correlationId = uuidv4();
    
    this.logger.info('Executing quality gate for workflow phase', {
      correlationId,
      projectId: project.id,
      phase
    });

    const result = await this.qualityGateService.executeQualityGate(project, phase);
    
    this.logger.info('Quality gate executed', {
      correlationId,
      projectId: project.id,
      phase,
      passed: result.passed,
      blockersCount: result.blockers.length
    });

    return result;
  }

  async analyzeComplexity(code: string): Promise<{
    score: number;
    assessment: 'good' | 'acceptable' | 'too-complex';
    suggestions: string[];
  }> {
    const correlationId = uuidv4();
    
    this.logger.info('Analyzing code complexity', { correlationId });

    const complexity = await this.qualityAnalyzer.checkComplexity(code);
    
    let assessment: 'good' | 'acceptable' | 'too-complex';
    const suggestions: string[] = [];

    // Linus-style complexity assessment
    if (complexity <= 5) {
      assessment = 'good';
    } else if (complexity <= 10) {
      assessment = 'acceptable';
      suggestions.push('Consider breaking down into smaller functions');
    } else {
      assessment = 'too-complex';
      suggestions.push('Must be refactored - complexity exceeds acceptable threshold');
      suggestions.push('Break into multiple single-purpose functions');
      suggestions.push('Eliminate conditional complexity where possible');
    }

    this.logger.info('Complexity analysis completed', {
      correlationId,
      complexity,
      assessment
    });

    return { score: complexity, assessment, suggestions };
  }

  async detectSpecialCases(code: string): Promise<string[]> {
    const correlationId = uuidv4();
    
    this.logger.info('Detecting special cases', { correlationId });

    const specialCases = await this.qualityAnalyzer.detectSpecialCases(code);
    
    this.logger.info('Special case detection completed', {
      correlationId,
      specialCaseCount: specialCases.length
    });

    return specialCases;
  }

  generateQualityRecommendations(report: LegacyQualityReport): QualityRecommendation[] {
    const recommendations: QualityRecommendation[] = [];

    // Convert issues to actionable recommendations
    for (const issue of report.issues) {
      switch (issue.type) {
        case IssueType.COMPLEXITY:
          recommendations.push({
            priority: 'high',
            category: issue.type,
            suggestion: 'Reduce function complexity by extracting smaller functions',
            example: 'Instead of one 50-line function, create 3-5 focused functions'
          });
          break;

        case IssueType.SPECIAL_CASE:
          recommendations.push({
            priority: 'high',
            category: issue.type,
            suggestion: 'Eliminate special cases by redesigning data structures',
            example: 'Replace if-else chains with polymorphism or lookup tables'
          });
          break;

        case IssueType.DATA_STRUCTURE:
          recommendations.push({
            priority: 'medium',
            category: issue.type,
            suggestion: 'Optimize data structure design for simpler algorithms',
            example: 'Use appropriate containers (Map, Set) instead of arrays for lookups'
          });
          break;

        case IssueType.BREAKING_CHANGE:
          recommendations.push({
            priority: 'high',
            category: issue.type,
            suggestion: 'Ensure backward compatibility is maintained',
            example: 'Add new features through extension, not modification'
          });
          break;

        case IssueType.PRACTICALITY:
          recommendations.push({
            priority: 'low',
            category: issue.type,
            suggestion: 'Verify this solves a real problem',
            example: 'Check if complexity matches actual business value'
          });
          break;
      }
    }

    return recommendations;
  }

  formatQualityReport(report: LegacyQualityReport): string {
    const recommendations = this.generateQualityRecommendations(report);
    
    let output = `【Taste Score】\n`;
    
    switch (report.score) {
      case TasteScore.GOOD:
        output += `🟢 Good taste\n`;
        break;
      case TasteScore.PASSABLE:
        output += `🟡 Passable\n`;
        break;
      case TasteScore.GARBAGE:
        output += `🔴 Garbage\n`;
        break;
    }

    if (report.issues.length > 0) {
      output += `\n【Fatal Issues】\n`;
      for (const issue of report.issues) {
        output += `- ${issue.message}\n`;
      }
    }

    if (recommendations.length > 0) {
      output += `\n【Improvement Direction】\n`;
      for (const rec of recommendations) {
        output += `${rec.suggestion}\n`;
      }
    }

    return output;
  }
}