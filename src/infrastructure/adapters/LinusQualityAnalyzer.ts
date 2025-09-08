import { injectable } from 'inversify';
import { QualityAnalyzer } from '../../domain/ports.js';
import { QualityReport, TasteScore, IssueType, IssueSeverity } from '../../domain/types.js';

@injectable()
export class LinusQualityAnalyzer implements QualityAnalyzer {
  async analyzeCode(code: string, language: string): Promise<QualityReport> {
    // Placeholder implementation - will be enhanced in later tasks
    const issues = [];
    
    // Check indentation depth (Linus rule: max 3 levels)
    const lines = code.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const indentLevel = this.getIndentationLevel(lines[i]);
      if (indentLevel > 3) {
        issues.push({
          type: IssueType.COMPLEXITY,
          message: `Indentation depth ${indentLevel} exceeds maximum of 3`,
          severity: IssueSeverity.ERROR,
          location: { file: 'unknown', line: i + 1, column: 1 }
        });
      }
    }

    return {
      score: issues.length === 0 ? TasteScore.GOOD : TasteScore.PASSABLE,
      issues,
      recommendations: issues.length > 0 ? ['Refactor to reduce nesting depth'] : []
    };
  }

  async analyzeDataStructure(structure: object): Promise<QualityReport> {
    // Placeholder implementation
    return {
      score: TasteScore.GOOD,
      issues: [],
      recommendations: []
    };
  }

  async checkComplexity(code: string): Promise<number> {
    // Simple cyclomatic complexity calculation
    const complexityKeywords = /\b(if|else|while|for|switch|case|catch)\b/g;
    const matches = code.match(complexityKeywords);
    return (matches?.length ?? 0) + 1;
  }

  async detectSpecialCases(code: string): Promise<string[]> {
    const specialCases = [];
    
    // Look for multiple if-else chains
    if (code.includes('if') && code.includes('else')) {
      const ifCount = (code.match(/\bif\b/g) || []).length;
      const elseCount = (code.match(/\belse\b/g) || []).length;
      if (ifCount > 2 || elseCount > 2) {
        specialCases.push('Multiple if-else branches detected - consider using polymorphism');
      }
    }

    return specialCases;
  }

  private getIndentationLevel(line: string): number {
    let level = 0;
    for (const char of line) {
      if (char === ' ') level++;
      else if (char === '\t') level += 2; // Count tabs as 2 spaces
      else break;
    }
    return Math.floor(level / 2);
  }
}