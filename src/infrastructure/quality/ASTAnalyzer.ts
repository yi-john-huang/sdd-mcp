// AST parsing and analysis for multiple programming languages

import { injectable, inject } from 'inversify';
import * as typescript from '@typescript-eslint/typescript-estree';
import { parse as parseJavaScript } from 'esprima';
import { parse as parseBabel } from '@babel/parser';
import * as t from '@babel/types';
import type { LoggerPort } from '../../domain/ports.js';
import type { 
  ProgrammingLanguage,
  CodeMetrics,
  ComplexityHotspot,
  ComplexityType
} from '../../domain/quality/index.js';
import { TYPES } from '../di/types.js';

export interface ASTNode {
  readonly type: string;
  readonly start?: number;
  readonly end?: number;
  readonly loc?: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
  readonly [key: string]: unknown;
}

export interface ParsedAST {
  readonly ast: ASTNode;
  readonly language: ProgrammingLanguage;
  readonly errors: ParseError[];
  readonly metrics: BasicMetrics;
}

export interface ParseError {
  readonly message: string;
  readonly line?: number;
  readonly column?: number;
  readonly severity: 'error' | 'warning';
}

export interface BasicMetrics {
  readonly linesOfCode: number;
  readonly linesOfComments: number;
  readonly functionCount: number;
  readonly classCount: number;
  readonly cyclomaticComplexity: number;
  readonly nestingDepth: number;
}

export interface ComplexityCalculator {
  calculateCyclomatic(ast: ASTNode): number;
  calculateCognitive(ast: ASTNode): number;
  calculateNesting(ast: ASTNode): number;
  findHotspots(ast: ASTNode): ComplexityHotspot[];
}

@injectable()
export class ASTAnalyzer {
  constructor(
    @inject(TYPES.LoggerPort) private readonly logger: LoggerPort
  ) {}

  async parseFile(content: string, language: ProgrammingLanguage, filePath?: string): Promise<ParsedAST> {
    try {
      switch (language) {
        case ProgrammingLanguage.TYPESCRIPT:
          return this.parseTypeScript(content, filePath);
        case ProgrammingLanguage.JAVASCRIPT:
          return this.parseJavaScript(content, filePath);
        default:
          throw new Error(`Unsupported language for AST parsing: ${language}`);
      }
    } catch (error) {
      this.logger.error('AST parsing failed', {
        language,
        filePath,
        error: error instanceof Error ? error.message : String(error)
      });
      
      return {
        ast: { type: 'Error' },
        language,
        errors: [{
          message: error instanceof Error ? error.message : String(error),
          severity: 'error'
        }],
        metrics: this.getEmptyMetrics()
      };
    }
  }

  private parseTypeScript(content: string, filePath?: string): ParsedAST {
    const errors: ParseError[] = [];
    
    try {
      const ast = typescript.parse(content, {
        loc: true,
        range: true,
        comment: true,
        attachComments: true,
        errorOnUnknownASTType: false,
        errorOnTypeScriptSyntacticAndSemanticIssues: false,
        jsx: filePath?.endsWith('.tsx') || content.includes('jsx'),
        useJSXTextNode: true
      });

      const metrics = this.calculateMetrics(ast as ASTNode, content);
      
      this.logger.debug('TypeScript AST parsed successfully', {
        filePath,
        nodeCount: this.countNodes(ast as ASTNode),
        linesOfCode: metrics.linesOfCode
      });

      return {
        ast: ast as ASTNode,
        language: ProgrammingLanguage.TYPESCRIPT,
        errors,
        metrics
      };
    } catch (error) {
      if (error instanceof Error) {
        errors.push({
          message: error.message,
          severity: 'error'
        });
      }
      throw error;
    }
  }

  private parseJavaScript(content: string, filePath?: string): ParsedAST {
    const errors: ParseError[] = [];
    
    try {
      // Try Babel parser first for modern JavaScript features
      const ast = parseBabel(content, {
        sourceType: 'module',
        allowImportExportEverywhere: true,
        allowReturnOutsideFunction: true,
        plugins: [
          'jsx',
          'typescript',
          'decorators-legacy',
          'classProperties',
          'functionBind',
          'exportDefaultFrom',
          'exportNamespaceFrom',
          'dynamicImport',
          'nullishCoalescingOperator',
          'optionalChaining',
          'objectRestSpread',
          'asyncGenerators'
        ],
        ranges: true
      });

      const metrics = this.calculateMetrics(ast as ASTNode, content);
      
      this.logger.debug('JavaScript AST parsed successfully', {
        filePath,
        nodeCount: this.countNodes(ast as ASTNode),
        linesOfCode: metrics.linesOfCode
      });

      return {
        ast: ast as ASTNode,
        language: ProgrammingLanguage.JAVASCRIPT,
        errors,
        metrics
      };
    } catch (babelError) {
      // Fallback to Esprima for compatibility
      try {
        const ast = parseJavaScript(content, {
          loc: true,
          range: true,
          attachComments: true,
          tolerant: true,
          jsx: true
        });

        const metrics = this.calculateMetrics(ast as ASTNode, content);
        
        return {
          ast: ast as ASTNode,
          language: ProgrammingLanguage.JAVASCRIPT,
          errors,
          metrics
        };
      } catch (esprimaError) {
        if (babelError instanceof Error) {
          errors.push({
            message: `Babel: ${babelError.message}`,
            severity: 'error'
          });
        }
        if (esprimaError instanceof Error) {
          errors.push({
            message: `Esprima: ${esprimaError.message}`,
            severity: 'error'
          });
        }
        throw babelError;
      }
    }
  }

  private calculateMetrics(ast: ASTNode, content: string): BasicMetrics {
    const lines = content.split('\n');
    const linesOfCode = this.countLinesOfCode(lines);
    const linesOfComments = this.countLinesOfComments(lines);
    const functionCount = this.countFunctions(ast);
    const classCount = this.countClasses(ast);
    const cyclomaticComplexity = this.calculateCyclomaticComplexity(ast);
    const nestingDepth = this.calculateMaxNestingDepth(ast);

    return {
      linesOfCode,
      linesOfComments,
      functionCount,
      classCount,
      cyclomaticComplexity,
      nestingDepth
    };
  }

  private countLinesOfCode(lines: string[]): number {
    let count = 0;
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('//') && !trimmed.startsWith('/*') && trimmed !== '*/') {
        count++;
      }
    }
    return count;
  }

  private countLinesOfComments(lines: string[]): number {
    let count = 0;
    let inBlockComment = false;
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      if (trimmed.includes('/*')) inBlockComment = true;
      if (inBlockComment || trimmed.startsWith('//')) {
        count++;
      }
      if (trimmed.includes('*/')) inBlockComment = false;
    }
    return count;
  }

  private countNodes(node: ASTNode): number {
    let count = 1;
    
    for (const [key, value] of Object.entries(node)) {
      if (key === 'parent' || key === 'leadingComments' || key === 'trailingComments') {
        continue;
      }
      
      if (Array.isArray(value)) {
        for (const item of value) {
          if (item && typeof item === 'object' && 'type' in item) {
            count += this.countNodes(item as ASTNode);
          }
        }
      } else if (value && typeof value === 'object' && 'type' in value) {
        count += this.countNodes(value as ASTNode);
      }
    }
    
    return count;
  }

  private countFunctions(ast: ASTNode): number {
    const functionTypes = [
      'FunctionDeclaration',
      'FunctionExpression',
      'ArrowFunctionExpression',
      'MethodDefinition',
      'Property' // For object method properties
    ];
    
    return this.countNodeTypes(ast, functionTypes);
  }

  private countClasses(ast: ASTNode): number {
    return this.countNodeTypes(ast, ['ClassDeclaration', 'ClassExpression']);
  }

  private countNodeTypes(node: ASTNode, types: string[]): number {
    let count = types.includes(node.type) ? 1 : 0;
    
    for (const [key, value] of Object.entries(node)) {
      if (key === 'parent' || key === 'leadingComments' || key === 'trailingComments') {
        continue;
      }
      
      if (Array.isArray(value)) {
        for (const item of value) {
          if (item && typeof item === 'object' && 'type' in item) {
            count += this.countNodeTypes(item as ASTNode, types);
          }
        }
      } else if (value && typeof value === 'object' && 'type' in value) {
        count += this.countNodeTypes(value as ASTNode, types);
      }
    }
    
    return count;
  }

  private calculateCyclomaticComplexity(ast: ASTNode): number {
    // Start with base complexity of 1
    let complexity = 1;
    
    const complexityNodes = [
      'IfStatement',
      'ConditionalExpression',
      'SwitchCase',
      'WhileStatement',
      'ForStatement',
      'ForInStatement',
      'ForOfStatement',
      'DoWhileStatement',
      'CatchClause',
      'LogicalExpression'
    ];
    
    complexity += this.countNodeTypes(ast, complexityNodes);
    
    // Add complexity for logical operators
    complexity += this.countLogicalOperators(ast);
    
    return complexity;
  }

  private countLogicalOperators(node: ASTNode): number {
    let count = 0;
    
    if (node.type === 'LogicalExpression') {
      const operator = (node as any).operator;
      if (operator === '&&' || operator === '||') {
        count += 1;
      }
    }
    
    for (const [key, value] of Object.entries(node)) {
      if (key === 'parent' || key === 'leadingComments' || key === 'trailingComments') {
        continue;
      }
      
      if (Array.isArray(value)) {
        for (const item of value) {
          if (item && typeof item === 'object' && 'type' in item) {
            count += this.countLogicalOperators(item as ASTNode);
          }
        }
      } else if (value && typeof value === 'object' && 'type' in value) {
        count += this.countLogicalOperators(value as ASTNode);
      }
    }
    
    return count;
  }

  private calculateMaxNestingDepth(ast: ASTNode, currentDepth = 0): number {
    const nestingNodes = [
      'BlockStatement',
      'IfStatement',
      'WhileStatement',
      'ForStatement',
      'ForInStatement',
      'ForOfStatement',
      'DoWhileStatement',
      'SwitchStatement',
      'TryStatement',
      'CatchClause',
      'FunctionDeclaration',
      'FunctionExpression',
      'ArrowFunctionExpression'
    ];
    
    const isNestingNode = nestingNodes.includes(ast.type);
    const depth = isNestingNode ? currentDepth + 1 : currentDepth;
    let maxDepth = depth;
    
    for (const [key, value] of Object.entries(ast)) {
      if (key === 'parent' || key === 'leadingComments' || key === 'trailingComments') {
        continue;
      }
      
      if (Array.isArray(value)) {
        for (const item of value) {
          if (item && typeof item === 'object' && 'type' in item) {
            const childDepth = this.calculateMaxNestingDepth(item as ASTNode, depth);
            maxDepth = Math.max(maxDepth, childDepth);
          }
        }
      } else if (value && typeof value === 'object' && 'type' in value) {
        const childDepth = this.calculateMaxNestingDepth(value as ASTNode, depth);
        maxDepth = Math.max(maxDepth, childDepth);
      }
    }
    
    return maxDepth;
  }

  findComplexityHotspots(ast: ASTNode, filePath?: string): ComplexityHotspot[] {
    const hotspots: ComplexityHotspot[] = [];
    this.findHotspotsRecursive(ast, hotspots, filePath);
    
    // Sort by complexity descending
    return hotspots.sort((a, b) => b.complexity - a.complexity);
  }

  private findHotspotsRecursive(node: ASTNode, hotspots: ComplexityHotspot[], filePath?: string): void {
    const functionTypes = [
      'FunctionDeclaration',
      'FunctionExpression',
      'ArrowFunctionExpression',
      'MethodDefinition'
    ];
    
    if (functionTypes.includes(node.type)) {
      const complexity = this.calculateCyclomaticComplexity(node);
      const nestingDepth = this.calculateMaxNestingDepth(node);
      const name = this.getFunctionName(node);
      const line = node.loc?.start.line || 0;
      
      // Consider functions with complexity > 10 or nesting > 4 as hotspots
      if (complexity > 10) {
        hotspots.push({
          functionName: name,
          line,
          complexity,
          type: ComplexityType.CYCLOMATIC,
          reason: `High cyclomatic complexity (${complexity})`,
          suggestion: 'Break down into smaller functions and reduce branching'
        });
      }
      
      if (nestingDepth > 4) {
        hotspots.push({
          functionName: name,
          line,
          complexity: nestingDepth,
          type: ComplexityType.NESTING,
          reason: `Deep nesting (${nestingDepth} levels)`,
          suggestion: 'Extract nested logic into separate functions'
        });
      }
      
      // Check function length
      if (node.loc) {
        const length = node.loc.end.line - node.loc.start.line;
        if (length > 50) {
          hotspots.push({
            functionName: name,
            line,
            complexity: length,
            type: ComplexityType.LENGTH,
            reason: `Long function (${length} lines)`,
            suggestion: 'Split into smaller, focused functions'
          });
        }
      }
    }
    
    // Recursively check child nodes
    for (const [key, value] of Object.entries(node)) {
      if (key === 'parent' || key === 'leadingComments' || key === 'trailingComments') {
        continue;
      }
      
      if (Array.isArray(value)) {
        for (const item of value) {
          if (item && typeof item === 'object' && 'type' in item) {
            this.findHotspotsRecursive(item as ASTNode, hotspots, filePath);
          }
        }
      } else if (value && typeof value === 'object' && 'type' in value) {
        this.findHotspotsRecursive(value as ASTNode, hotspots, filePath);
      }
    }
  }

  private getFunctionName(node: ASTNode): string {
    const nodeAny = node as any;
    
    switch (node.type) {
      case 'FunctionDeclaration':
        return nodeAny.id?.name || 'anonymous';
      case 'FunctionExpression':
        return nodeAny.id?.name || 'anonymous';
      case 'ArrowFunctionExpression':
        return 'arrow function';
      case 'MethodDefinition':
        return nodeAny.key?.name || 'method';
      default:
        return 'unknown';
    }
  }

  private getEmptyMetrics(): BasicMetrics {
    return {
      linesOfCode: 0,
      linesOfComments: 0,
      functionCount: 0,
      classCount: 0,
      cyclomaticComplexity: 0,
      nestingDepth: 0
    };
  }
}