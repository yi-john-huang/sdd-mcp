// Linus-style code reviewer implementing the five-layer analysis framework

import { injectable, inject } from 'inversify';
import type { LoggerPort } from '../../domain/ports.js';
import type { 
  CodeQualityAnalyzerPort,
  CodeAnalysisResult,
  ProgrammingLanguage,
  QualityScore,
  TasteAnalysis,
  TasteScore,
  ComplexityAnalysis,
  SpecialCaseAnalysis,
  DataStructureAnalysis,
  OrganizationAnalysis,
  QualityViolation,
  QualityImprovement,
  QualityReport,
  ViolationType,
  ViolationSeverity,
  ImprovementType,
  ImprovementPriority,
  EffortEstimate,
  TasteExample,
  TasteCategory,
  TasteImpact,
  SpecialCase,
  SpecialCaseType,
  MagicNumber,
  HardcodedValue,
  HardcodedType,
  NamingAnalysis,
  StructureAnalysis,
  DependencyAnalysis,
  CodeMetrics,
  TechnicalDebtAnalysis,
  QualitySummary,
  QualityTrend,
  QualityRecommendation
} from '../../domain/quality/index.js';
import { ASTAnalyzer, type ParsedAST } from './ASTAnalyzer.js';
import { TYPES } from '../di/types.js';

interface LinusReviewContext {
  readonly filePath: string;
  readonly content: string;
  readonly ast: ParsedAST;
  readonly lines: string[];
}

@injectable()
export class LinusCodeReviewer implements CodeQualityAnalyzerPort {
  constructor(
    @inject(TYPES.LoggerPort) private readonly logger: LoggerPort,
    private readonly astAnalyzer: ASTAnalyzer = new ASTAnalyzer(this.logger as any)
  ) {}

  async analyzeFile(filePath: string, content: string): Promise<CodeAnalysisResult> {
    const language = this.detectLanguage(filePath);
    const ast = await this.astAnalyzer.parseFile(content, language, filePath);
    const lines = content.split('\n');
    
    const context: LinusReviewContext = {
      filePath,
      content,
      ast,
      lines
    };

    try {
      // Apply the five-layer Linus analysis framework
      const tasteAnalysis = await this.analyzeTaste(context);
      const complexityAnalysis = await this.analyzeComplexity(context);
      const specialCaseAnalysis = await this.analyzeSpecialCases(context);
      const dataStructureAnalysis = await this.analyzeDataStructures(context);
      const organizationAnalysis = await this.analyzeOrganization(context);

      // Collect all violations and improvements
      const violations: QualityViolation[] = [
        ...this.extractTasteViolations(tasteAnalysis),
        ...this.extractComplexityViolations(complexityAnalysis),
        ...this.extractSpecialCaseViolations(specialCaseAnalysis),
        ...this.extractDataStructureViolations(dataStructureAnalysis),
        ...this.extractOrganizationViolations(organizationAnalysis)
      ];

      const suggestions: QualityImprovement[] = [
        ...this.generateTasteImprovements(tasteAnalysis),
        ...this.generateComplexityImprovements(complexityAnalysis),
        ...this.generateSpecialCaseImprovements(specialCaseAnalysis),
        ...this.generateDataStructureImprovements(dataStructureAnalysis),
        ...this.generateOrganizationImprovements(organizationAnalysis)
      ];

      // Calculate overall score
      const overallScore = this.calculateOverallScore(
        tasteAnalysis,
        complexityAnalysis,
        specialCaseAnalysis,
        dataStructureAnalysis,
        organizationAnalysis
      );

      const metrics = this.calculateCodeMetrics(context);

      const result: CodeAnalysisResult = {
        filePath,
        language,
        overallScore,
        tasteAnalysis,
        complexityAnalysis,
        specialCaseAnalysis,
        dataStructureAnalysis,
        organizationAnalysis,
        violations,
        suggestions,
        metrics,
        analyzedAt: new Date()
      };

      this.logger.info('Code analysis completed', {
        filePath,
        overallScore,
        violationsCount: violations.length,
        suggestionsCount: suggestions.length
      });

      return result;
    } catch (error) {
      this.logger.error('Code analysis failed', {
        filePath,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  async analyzeBatch(files: Array<{ path: string; content: string }>): Promise<CodeAnalysisResult[]> {
    const results: CodeAnalysisResult[] = [];
    
    for (const file of files) {
      try {
        const result = await this.analyzeFile(file.path, file.content);
        results.push(result);
      } catch (error) {
        this.logger.warn('Failed to analyze file in batch', {
          filePath: file.path,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    
    return results;
  }

  async getQualityReport(results: CodeAnalysisResult[]): Promise<QualityReport> {
    const summary = this.calculateQualitySummary(results);
    const trends = this.calculateQualityTrends(results);
    const recommendations = this.generateQualityRecommendations(results);
    
    const goodCount = results.filter(r => r.overallScore === QualityScore.GOOD).length;
    const passableCount = results.filter(r => r.overallScore === QualityScore.PASSABLE).length;
    const garbageCount = results.filter(r => r.overallScore === QualityScore.GARBAGE).length;
    
    let overall: QualityScore;
    if (garbageCount > results.length * 0.2) {
      overall = QualityScore.GARBAGE;
    } else if (passableCount > results.length * 0.5) {
      overall = QualityScore.PASSABLE;
    } else {
      overall = QualityScore.GOOD;
    }

    return {
      overall,
      summary,
      files: results,
      trends,
      recommendations,
      generatedAt: new Date()
    };
  }

  // Layer 1: Taste Analysis (Good/Passable/Garbage)
  private async analyzeTaste(context: LinusReviewContext): Promise<TasteAnalysis> {
    const examples: TasteExample[] = [];
    let eleganceScore = 10;
    let simplicityScore = 10;
    let intuitionScore = 10;
    let readabilityScore = 10;

    // Check for elegance issues
    const longLines = context.lines.filter((line, index) => {
      if (line.length > 120) {
        examples.push({
          category: TasteCategory.ELEGANCE,
          code: line.substring(0, 80) + '...',
          issue: `Line ${index + 1} is too long (${line.length} characters)`,
          improvement: 'Break into multiple lines or extract to variable',
          impact: TasteImpact.MEDIUM
        });
        return true;
      }
      return false;
    });
    eleganceScore -= Math.min(longLines.length * 0.5, 3);

    // Check for simplicity issues (nested ternary operators, complex expressions)
    const nestedTernary = context.content.match(/\?[^:]*\?[^:]*:/g);
    if (nestedTernary) {
      simplicityScore -= nestedTernary.length * 2;
      examples.push({
        category: TasteCategory.SIMPLICITY,
        code: nestedTernary[0],
        issue: 'Nested ternary operators reduce readability',
        improvement: 'Use if-else statements or extract to function',
        impact: TasteImpact.HIGH
      });
    }

    // Check for intuitive naming
    const confusingNames = this.findConfusingNames(context);
    intuitionScore -= confusingNames.length * 0.5;
    examples.push(...confusingNames.map(name => ({
      category: TasteCategory.CLARITY as TasteCategory,
      code: name.name,
      issue: name.issue,
      improvement: name.suggestion,
      impact: TasteImpact.MEDIUM
    })));

    // Check readability
    const commentRatio = context.ast.metrics.linesOfComments / context.ast.metrics.linesOfCode;
    if (commentRatio < 0.1) {
      readabilityScore -= 2;
      examples.push({
        category: TasteCategory.CLARITY,
        code: '// Missing comments',
        issue: 'Low comment ratio, code may be hard to understand',
        improvement: 'Add meaningful comments explaining complex logic',
        impact: TasteImpact.MEDIUM
      });
    }

    const averageScore = (eleganceScore + simplicityScore + intuitionScore + readabilityScore) / 4;
    
    let score: TasteScore;
    if (averageScore >= 8) score = TasteScore.GOOD;
    else if (averageScore >= 6) score = TasteScore.PASSABLE;
    else score = TasteScore.GARBAGE;

    return {
      score,
      reasoning: this.generateTasteReasoning(score, eleganceScore, simplicityScore, intuitionScore, readabilityScore),
      elegance: eleganceScore,
      simplicity: simplicityScore,
      intuition: intuitionScore,
      readability: readabilityScore,
      examples
    };
  }

  // Layer 2: Complexity Analysis
  private async analyzeComplexity(context: LinusReviewContext): Promise<ComplexityAnalysis> {
    const hotspots = this.astAnalyzer.findComplexityHotspots(context.ast.ast, context.filePath);
    const metrics = context.ast.metrics;
    
    // Score based on complexity metrics (0-10, higher is better)
    let complexityScore = 10;
    
    if (metrics.cyclomaticComplexity > 20) complexityScore -= 4;
    else if (metrics.cyclomaticComplexity > 10) complexityScore -= 2;
    
    if (metrics.nestingDepth > 5) complexityScore -= 3;
    else if (metrics.nestingDepth > 3) complexityScore -= 1;
    
    const avgFunctionLength = metrics.linesOfCode / (metrics.functionCount || 1);
    if (avgFunctionLength > 50) complexityScore -= 2;
    
    const recommendations: string[] = [];
    
    if (metrics.cyclomaticComplexity > 10) {
      recommendations.push('Reduce cyclomatic complexity by extracting functions and simplifying conditional logic');
    }
    
    if (metrics.nestingDepth > 3) {
      recommendations.push('Reduce nesting depth by using early returns and extracting nested logic');
    }
    
    if (hotspots.length > 0) {
      recommendations.push(`Address ${hotspots.length} complexity hotspots identified in the code`);
    }

    return {
      cyclomaticComplexity: metrics.cyclomaticComplexity,
      cognitiveComplexity: metrics.cyclomaticComplexity * 1.2, // Approximate cognitive complexity
      nestingDepth: metrics.nestingDepth,
      lineCount: metrics.linesOfCode,
      functionCount: metrics.functionCount,
      classCount: metrics.classCount,
      score: Math.max(complexityScore, 0),
      hotspots,
      recommendations
    };
  }

  // Layer 3: Special Case Analysis
  private async analyzeSpecialCases(context: LinusReviewContext): Promise<SpecialCaseAnalysis> {
    const specialCases: SpecialCase[] = [];
    const magicNumbers = this.findMagicNumbers(context);
    const hardcodedValues = this.findHardcodedValues(context);
    
    // Look for special case handling patterns
    context.lines.forEach((line, index) => {
      const trimmed = line.trim();
      
      // Detect special case conditionals
      if (trimmed.includes('if') && (trimmed.includes('null') || trimmed.includes('undefined') || trimmed.includes('===') && (trimmed.includes('"') || trimmed.includes("'")))) {
        specialCases.push({
          line: index + 1,
          type: SpecialCaseType.CONDITIONAL,
          description: 'Special case conditional handling',
          generalization: 'Consider using polymorphism or strategy pattern',
          confidence: 0.7
        });
      }
      
      // Detect try-catch with specific exception handling
      if (trimmed.includes('catch') && trimmed.includes('instanceof')) {
        specialCases.push({
          line: index + 1,
          type: SpecialCaseType.EXCEPTION,
          description: 'Specific exception type handling',
          generalization: 'Consider using a general error handling strategy',
          confidence: 0.8
        });
      }
      
      // Detect workaround comments
      if (trimmed.includes('//') && (trimmed.toLowerCase().includes('hack') || trimmed.toLowerCase().includes('workaround') || trimmed.toLowerCase().includes('todo'))) {
        specialCases.push({
          line: index + 1,
          type: SpecialCaseType.WORKAROUND,
          description: 'Code marked as hack or workaround',
          generalization: 'Refactor to proper solution',
          confidence: 0.9
        });
      }
    });

    const score = Math.max(10 - specialCases.length - magicNumbers.length * 0.5 - hardcodedValues.length * 0.3, 0);

    const generalizations = this.generateGeneralizations(specialCases, magicNumbers, hardcodedValues);

    return {
      specialCases,
      score,
      generalizations,
      magicNumbers,
      hardcodedValues
    };
  }

  // Layer 4: Data Structure Analysis
  private async analyzeDataStructures(context: LinusReviewContext): Promise<DataStructureAnalysis> {
    const appropriateness = this.analyzeDataStructureAppropriateness(context);
    const efficiency = this.analyzeDataStructureEfficiency(context);
    const memoryAnalysis = this.analyzeMemoryUsage(context);
    const accessPatterns = this.analyzeAccessPatterns(context);
    const suggestions = this.generateDataStructureSuggestions(context);

    return {
      appropriateness,
      efficiency,
      memoryUsage: memoryAnalysis,
      accessPatterns,
      suggestions
    };
  }

  // Layer 5: Organization Analysis
  private async analyzeOrganization(context: LinusReviewContext): Promise<OrganizationAnalysis> {
    const singleResponsibility = this.analyzeSingleResponsibility(context);
    const separationOfConcerns = this.analyzeSeparationOfConcerns(context);
    const naming = this.analyzeNaming(context);
    const structure = this.analyzeStructure(context);
    const dependencies = this.analyzeDependencies(context);
    
    const cohesion = this.calculateCohesion(context);
    const coupling = this.calculateCoupling(context);

    return {
      singleResponsibility,
      separationOfConcerns,
      naming,
      structure,
      dependencies,
      cohesion,
      coupling
    };
  }

  // Helper methods for analysis
  private detectLanguage(filePath: string): ProgrammingLanguage {
    const extension = filePath.split('.').pop()?.toLowerCase();
    
    switch (extension) {
      case 'ts':
      case 'tsx':
        return ProgrammingLanguage.TYPESCRIPT;
      case 'js':
      case 'jsx':
        return ProgrammingLanguage.JAVASCRIPT;
      case 'py':
        return ProgrammingLanguage.PYTHON;
      case 'java':
        return ProgrammingLanguage.JAVA;
      case 'go':
        return ProgrammingLanguage.GO;
      case 'rs':
        return ProgrammingLanguage.RUST;
      case 'cpp':
      case 'cc':
      case 'cxx':
        return ProgrammingLanguage.CPP;
      case 'cs':
        return ProgrammingLanguage.CSHARP;
      default:
        return ProgrammingLanguage.TYPESCRIPT; // Default fallback
    }
  }

  private calculateOverallScore(
    taste: TasteAnalysis,
    complexity: ComplexityAnalysis,
    specialCase: SpecialCaseAnalysis,
    dataStructure: DataStructureAnalysis,
    organization: OrganizationAnalysis
  ): QualityScore {
    // Weight the scores based on Linus priorities
    const tasteWeight = 0.3;
    const complexityWeight = 0.25;
    const specialCaseWeight = 0.2;
    const dataStructureWeight = 0.15;
    const organizationWeight = 0.1;

    const tasteScore = taste.score === TasteScore.GOOD ? 10 : taste.score === TasteScore.PASSABLE ? 6 : 2;
    const weightedScore = 
      tasteScore * tasteWeight +
      complexity.score * complexityWeight +
      specialCase.score * specialCaseWeight +
      (dataStructure.appropriateness + dataStructure.efficiency) / 2 * dataStructureWeight +
      (organization.singleResponsibility + organization.separationOfConcerns + organization.cohesion + (10 - organization.coupling)) / 4 * organizationWeight;

    if (weightedScore >= 8) return QualityScore.GOOD;
    if (weightedScore >= 5) return QualityScore.PASSABLE;
    return QualityScore.GARBAGE;
  }

  // Placeholder implementations for helper methods (would be fully implemented in production)
  private findConfusingNames(context: LinusReviewContext): Array<{name: string, issue: string, suggestion: string}> {
    const confusing = [];
    const singleLetterVars = context.content.match(/\b[a-z]\b/g);
    if (singleLetterVars) {
      confusing.push({
        name: singleLetterVars[0],
        issue: 'Single letter variable names are not descriptive',
        suggestion: 'Use descriptive variable names'
      });
    }
    return confusing;
  }

  private findMagicNumbers(context: LinusReviewContext): MagicNumber[] {
    const magicNumbers: MagicNumber[] = [];
    const numberRegex = /\b(\d+(?:\.\d+)?)\b/g;
    
    context.lines.forEach((line, index) => {
      let match;
      while ((match = numberRegex.exec(line)) !== null) {
        const num = parseFloat(match[1]);
        if (num !== 0 && num !== 1 && num !== -1) { // Ignore common constants
          magicNumbers.push({
            value: num,
            line: index + 1,
            context: line.trim(),
            suggestedConstant: `CONSTANT_${num.toString().replace('.', '_')}`
          });
        }
      }
    });
    
    return magicNumbers;
  }

  private findHardcodedValues(context: LinusReviewContext): HardcodedValue[] {
    const hardcoded: HardcodedValue[] = [];
    
    // Find string literals that look like URLs, paths, or config values
    const stringRegex = /(['"`])((?:(?!\1)[^\\]|\\.)*)(\1)/g;
    
    context.lines.forEach((line, index) => {
      let match;
      while ((match = stringRegex.exec(line)) !== null) {
        const value = match[2];
        if (value.length > 10) { // Only flag longer strings
          let type: HardcodedType = HardcodedType.STRING;
          if (value.startsWith('http')) type = HardcodedType.URL;
          else if (value.includes('/') || value.includes('\\')) type = HardcodedType.PATH;
          
          hardcoded.push({
            value,
            line: index + 1,
            type,
            suggestion: 'Move to configuration or constants file'
          });
        }
      }
    });
    
    return hardcoded;
  }

  // More placeholder implementations (would be expanded in production)
  private generateTasteReasoning(score: TasteScore, elegance: number, simplicity: number, intuition: number, readability: number): string {
    if (score === TasteScore.GOOD) {
      return 'Code demonstrates good taste with clear, elegant solutions and intuitive design choices.';
    } else if (score === TasteScore.PASSABLE) {
      return 'Code is functional but lacks elegance. Some areas need refinement for better clarity and maintainability.';
    } else {
      return 'Code quality is poor. Major improvements needed in clarity, simplicity, and overall design approach.';
    }
  }

  private generateGeneralizations(specialCases: SpecialCase[], magicNumbers: MagicNumber[], hardcodedValues: HardcodedValue[]) {
    return [{
      description: 'Extract constants and configuration',
      impact: 'Improved maintainability and reduced coupling',
      effort: EffortEstimate.SMALL,
      examples: ['Replace magic numbers with named constants', 'Move hardcoded strings to config']
    }];
  }

  // Simplified implementations for remaining analysis methods
  private analyzeDataStructureAppropriateness = (context: LinusReviewContext) => 8;
  private analyzeDataStructureEfficiency = (context: LinusReviewContext) => 7;
  private analyzeMemoryUsage = (context: LinusReviewContext) => ({
    usage: 'moderate' as const,
    efficiency: 7,
    leaks: [],
    optimizations: []
  });
  private analyzeAccessPatterns = (context: LinusReviewContext) => [];
  private generateDataStructureSuggestions = (context: LinusReviewContext) => [];
  
  private analyzeSingleResponsibility = (context: LinusReviewContext) => 7;
  private analyzeSeparationOfConcerns = (context: LinusReviewContext) => 7;
  private analyzeNaming = (context: LinusReviewContext): NamingAnalysis => ({
    consistency: 8,
    clarity: 7,
    conventions: [],
    suggestions: []
  });
  private analyzeStructure = (context: LinusReviewContext): StructureAnalysis => ({
    logicalFlow: 7,
    layering: 8,
    modularity: 7,
    issues: []
  });
  private analyzeDependencies = (context: LinusReviewContext): DependencyAnalysis => ({
    count: 5,
    depth: 3,
    circular: [],
    unnecessary: [],
    suggestions: []
  });
  
  private calculateCohesion = (context: LinusReviewContext) => 7;
  private calculateCoupling = (context: LinusReviewContext) => 4;

  private calculateCodeMetrics(context: LinusReviewContext): CodeMetrics {
    return {
      linesOfCode: context.ast.metrics.linesOfCode,
      linesOfComments: context.ast.metrics.linesOfComments,
      commentRatio: context.ast.metrics.linesOfComments / context.ast.metrics.linesOfCode,
      maintainabilityIndex: 85, // Simplified calculation
      technicalDebt: {
        totalHours: 8,
        categories: [{name: 'Complexity', hours: 5, percentage: 62.5}],
        priority: [{issue: 'High complexity functions', hours: 3, impact: 'High', urgency: 8}],
        trends: [{period: 'current', change: -2, direction: 'decreasing'}]
      }
    };
  }

  // Quality report generation methods
  private calculateQualitySummary(results: CodeAnalysisResult[]): QualitySummary {
    const total = results.length;
    const good = results.filter(r => r.overallScore === QualityScore.GOOD).length;
    const passable = results.filter(r => r.overallScore === QualityScore.PASSABLE).length;
    const garbage = results.filter(r => r.overallScore === QualityScore.GARBAGE).length;
    
    return {
      totalFiles: total,
      goodFiles: good,
      passableFiles: passable,
      garbageFiles: garbage,
      averageScore: (good * 10 + passable * 6 + garbage * 2) / total,
      topIssues: ['High complexity', 'Magic numbers', 'Poor naming'],
      technicalDebt: results.reduce((sum, r) => sum + r.metrics.technicalDebt.totalHours, 0)
    };
  }

  private calculateQualityTrends(results: CodeAnalysisResult[]): QualityTrend[] {
    return [{
      metric: 'Overall Quality',
      current: 7.5,
      previous: 7.0,
      change: 0.5,
      direction: 'improving'
    }];
  }

  private generateQualityRecommendations(results: CodeAnalysisResult[]): QualityRecommendation[] {
    return [{
      priority: ImprovementPriority.HIGH,
      description: 'Address high complexity functions',
      impact: 'Improved maintainability and reduced bugs',
      effort: EffortEstimate.MEDIUM,
      files: results.filter(r => r.complexityAnalysis.score < 6).map(r => r.filePath)
    }];
  }

  // Extract violations and generate improvements (simplified implementations)
  private extractTasteViolations = (taste: TasteAnalysis): QualityViolation[] => [];
  private extractComplexityViolations = (complexity: ComplexityAnalysis): QualityViolation[] => [];
  private extractSpecialCaseViolations = (specialCase: SpecialCaseAnalysis): QualityViolation[] => [];
  private extractDataStructureViolations = (dataStructure: DataStructureAnalysis): QualityViolation[] => [];
  private extractOrganizationViolations = (organization: OrganizationAnalysis): QualityViolation[] => [];
  
  private generateTasteImprovements = (taste: TasteAnalysis): QualityImprovement[] => [];
  private generateComplexityImprovements = (complexity: ComplexityAnalysis): QualityImprovement[] => [];
  private generateSpecialCaseImprovements = (specialCase: SpecialCaseAnalysis): QualityImprovement[] => [];
  private generateDataStructureImprovements = (dataStructure: DataStructureAnalysis): QualityImprovement[] => [];
  private generateOrganizationImprovements = (organization: OrganizationAnalysis): QualityImprovement[] => [];
}