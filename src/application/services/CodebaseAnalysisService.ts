import { injectable, inject } from 'inversify';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { TYPES } from '../../infrastructure/di/types.js';
import { 
  FileSystemPort, 
  LoggerPort, 
  ValidationPort 
} from '../../domain/ports.js';
import {
  CodebaseAnalysis,
  FileTreeStructure,
  DirectoryNode,
  FileNode,
  DependencyMap,
  TechnologyStack,
  ArchitecturePattern,
  CodeMetrics,
  ComplexityHotspot,
  DirectoryPurpose,
  ProgrammingLanguage,
  FileType,
  Technology,
  TechnologyCategory,
  ArchitecturePatternType,
  ComplexityType,
  DependencyType,
  ExternalDependency,
  InternalDependency,
  DependencyGraph
} from '../../domain/context/ProjectContext.js';

export interface AnalysisOptions {
  includeNodeModules?: boolean;
  includeBuildOutputs?: boolean;
  maxDepth?: number;
  languages?: ProgrammingLanguage[];
  skipPatterns?: string[];
}

export interface TechnologyDetectionResult {
  technologies: Technology[];
  confidence: number;
  evidence: string[];
}

@injectable()
export class CodebaseAnalysisService {
  private readonly defaultIgnorePatterns = [
    'node_modules',
    '.git',
    'dist',
    'build',
    'coverage',
    '.next',
    '.nuxt',
    '__pycache__',
    '.pytest_cache',
    'target',
    'bin',
    'obj'
  ];

  constructor(
    @inject(TYPES.FileSystemPort) private readonly fileSystem: FileSystemPort,
    @inject(TYPES.LoggerPort) private readonly logger: LoggerPort,
    @inject(TYPES.ValidationPort) private readonly validation: ValidationPort
  ) {}

  async analyzeCodebase(
    projectPath: string, 
    options: AnalysisOptions = {}
  ): Promise<CodebaseAnalysis> {
    const correlationId = uuidv4();
    
    this.logger.info('Starting codebase analysis', {
      correlationId,
      projectPath,
      options
    });

    try {
      const startTime = Date.now();

      // Analyze file structure
      const structure = await this.analyzeFileStructure(projectPath, options);
      
      // Detect technology stack
      const technologyStack = await this.detectTechnologyStack(structure);
      
      // Analyze dependencies
      const dependencies = await this.analyzeDependencies(projectPath, structure);
      
      // Detect architecture patterns
      const patterns = await this.detectArchitecturePatterns(structure, technologyStack);
      
      // Calculate code metrics
      const metrics = await this.calculateCodeMetrics(structure, projectPath);
      
      // Identify complexity hotspots
      const hotspots = await this.identifyComplexityHotspots(structure, projectPath);

      const analysisTime = Date.now() - startTime;

      this.logger.info('Codebase analysis completed', {
        correlationId,
        analysisTime,
        fileCount: structure.totalFiles,
        directoryCount: structure.totalDirectories,
        technologyCount: technologyStack.primary.length,
        patternCount: patterns.length,
        hotspotCount: hotspots.length
      });

      return {
        structure,
        dependencies,
        patterns,
        metrics,
        hotspots,
        lastAnalyzed: new Date()
      };

    } catch (error) {
      this.logger.error('Codebase analysis failed', error as Error, {
        correlationId,
        projectPath
      });

      // Return minimal analysis on failure
      return {
        structure: {
          root: projectPath,
          directories: [],
          files: [],
          totalFiles: 0,
          totalDirectories: 0,
          gitIgnored: []
        },
        dependencies: {
          external: [],
          internal: [],
          devDependencies: [],
          peerDependencies: [],
          graph: { nodes: [], edges: [], cycles: [], orphans: [] }
        },
        patterns: [],
        metrics: {
          linesOfCode: 0,
          complexity: {
            cyclomatic: 0,
            cognitive: 0,
            halstead: {
              vocabulary: 0,
              length: 0,
              difficulty: 0,
              effort: 0,
              timeToCode: 0,
              bugsDelivered: 0
            },
            nesting: { average: 0, maximum: 0, violationsOver3: 0 }
          },
          maintainability: {
            index: 0,
            duplication: 0,
            cohesion: 0,
            coupling: 0,
            debtRatio: 0
          },
          qualityScore: 0
        },
        hotspots: [],
        lastAnalyzed: new Date()
      };
    }
  }

  private async analyzeFileStructure(
    projectPath: string, 
    options: AnalysisOptions
  ): Promise<FileTreeStructure> {
    const directories: DirectoryNode[] = [];
    const files: FileNode[] = [];
    const gitIgnored: string[] = [];
    let totalFiles = 0;
    let totalDirectories = 0;

    const ignorePatterns = [
      ...this.defaultIgnorePatterns,
      ...(options.skipPatterns || [])
    ];

    await this.traverseDirectory(
      projectPath,
      projectPath,
      directories,
      files,
      ignorePatterns,
      options.maxDepth || 10,
      0
    );

    totalFiles = files.length;
    totalDirectories = directories.length;

    // Read .gitignore if exists
    const gitignorePath = path.join(projectPath, '.gitignore');
    if (await this.fileSystem.exists(gitignorePath)) {
      try {
        const gitignoreContent = await this.fileSystem.readFile(gitignorePath);
        gitIgnored.push(...gitignoreContent.split('\n').filter(line => 
          line.trim() && !line.startsWith('#')
        ));
      } catch (error) {
        this.logger.warn('Failed to read .gitignore', { projectPath });
      }
    }

    return {
      root: projectPath,
      directories,
      files,
      totalFiles,
      totalDirectories,
      gitIgnored
    };
  }

  private async traverseDirectory(
    basePath: string,
    currentPath: string,
    directories: DirectoryNode[],
    files: FileNode[],
    ignorePatterns: string[],
    maxDepth: number,
    currentDepth: number
  ): Promise<void> {
    if (currentDepth >= maxDepth) return;

    try {
      const items = await this.fileSystem.readdir(currentPath);
      const children: string[] = [];
      let fileCount = 0;

      for (const item of items) {
        const itemPath = path.join(currentPath, item);
        const relativePath = path.relative(basePath, itemPath);

        // Skip ignored patterns
        if (ignorePatterns.some(pattern => relativePath.includes(pattern))) {
          continue;
        }

        try {
          const stat = await this.fileSystem.stat(itemPath);

          if (stat.isDirectory()) {
            children.push(item);
            
            // Recursively analyze subdirectory
            await this.traverseDirectory(
              basePath,
              itemPath,
              directories,
              files,
              ignorePatterns,
              maxDepth,
              currentDepth + 1
            );
            
            fileCount += await this.countFilesInDirectory(itemPath, ignorePatterns);
          } else if (stat.isFile()) {
            const fileNode = await this.analyzeFile(basePath, itemPath);
            files.push(fileNode);
            children.push(item);
            fileCount++;
          }
        } catch (error) {
          this.logger.debug('Failed to analyze item', { itemPath });
        }
      }

      // Create directory node
      const directoryNode: DirectoryNode = {
        path: relativePath || '.',
        name: path.basename(currentPath),
        children,
        fileCount,
        purpose: this.determineDirectoryPurpose(currentPath, children)
      };

      directories.push(directoryNode);

    } catch (error) {
      this.logger.debug('Failed to read directory', { currentPath });
    }
  }

  private async analyzeFile(basePath: string, filePath: string): Promise<FileNode> {
    const relativePath = path.relative(basePath, filePath);
    const fileName = path.basename(filePath);
    const extension = path.extname(filePath).toLowerCase();
    
    let size = 0;
    let lastModified = new Date();
    
    try {
      const stat = await this.fileSystem.stat(filePath);
      size = (stat as any).size || 0;
      lastModified = (stat as any).mtime || new Date();
    } catch (error) {
      this.logger.debug('Failed to get file stats', { filePath });
    }

    const language = this.detectFileLanguage(extension, fileName);
    const type = this.determineFileType(relativePath, fileName, extension);
    const dependencies = await this.extractFileDependencies(filePath, language);
    const complexity = await this.calculateFileComplexity(filePath, language);

    return {
      path: relativePath,
      name: fileName,
      extension,
      size,
      language,
      type,
      complexity,
      dependencies,
      lastModified
    };
  }

  private detectFileLanguage(extension: string, fileName: string): ProgrammingLanguage {
    const languageMap: Record<string, ProgrammingLanguage> = {
      '.ts': ProgrammingLanguage.TYPESCRIPT,
      '.tsx': ProgrammingLanguage.TYPESCRIPT,
      '.js': ProgrammingLanguage.JAVASCRIPT,
      '.jsx': ProgrammingLanguage.JAVASCRIPT,
      '.mjs': ProgrammingLanguage.JAVASCRIPT,
      '.py': ProgrammingLanguage.PYTHON,
      '.java': ProgrammingLanguage.JAVA,
      '.go': ProgrammingLanguage.GO,
      '.rs': ProgrammingLanguage.RUST,
      '.cpp': ProgrammingLanguage.CPP,
      '.cc': ProgrammingLanguage.CPP,
      '.cxx': ProgrammingLanguage.CPP,
      '.cs': ProgrammingLanguage.CSHARP,
      '.php': ProgrammingLanguage.PHP,
      '.rb': ProgrammingLanguage.RUBY,
      '.swift': ProgrammingLanguage.SWIFT,
      '.kt': ProgrammingLanguage.KOTLIN,
      '.dart': ProgrammingLanguage.DART
    };

    return languageMap[extension] || ProgrammingLanguage.UNKNOWN;
  }

  private determineFileType(
    relativePath: string, 
    fileName: string, 
    extension: string
  ): FileType {
    // Configuration files
    if (fileName.includes('config') || 
        ['package.json', 'tsconfig.json', '.eslintrc', 'webpack.config'].some(config => fileName.includes(config))) {
      return FileType.CONFIG;
    }

    // Test files
    if (fileName.includes('.test.') || 
        fileName.includes('.spec.') || 
        relativePath.includes('test') || 
        relativePath.includes('__tests__')) {
      return FileType.TEST;
    }

    // Documentation
    if (['.md', '.txt', '.rst', '.adoc'].includes(extension) || 
        fileName.toLowerCase().includes('readme') || 
        relativePath.includes('docs')) {
      return FileType.DOCUMENTATION;
    }

    // Build outputs
    if (relativePath.includes('dist') || 
        relativePath.includes('build') || 
        relativePath.includes('target')) {
      return FileType.BUILD;
    }

    // Source files
    if (['.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.go', '.rs', '.cpp', '.cs'].includes(extension)) {
      return FileType.SOURCE;
    }

    // Assets
    if (['.png', '.jpg', '.jpeg', '.gif', '.svg', '.css', '.scss', '.less'].includes(extension)) {
      return FileType.ASSET;
    }

    return FileType.UNKNOWN;
  }

  private determineDirectoryPurpose(dirPath: string, children: string[]): DirectoryPurpose {
    const dirName = path.basename(dirPath).toLowerCase();
    
    // Source directories
    if (['src', 'source', 'lib', 'app'].includes(dirName)) {
      return DirectoryPurpose.SOURCE;
    }

    // Test directories
    if (['test', 'tests', '__tests__', 'spec', 'specs'].includes(dirName)) {
      return DirectoryPurpose.TEST;
    }

    // Configuration directories
    if (['config', 'configuration', '.vscode', '.github'].includes(dirName)) {
      return DirectoryPurpose.CONFIG;
    }

    // Documentation directories
    if (['docs', 'doc', 'documentation'].includes(dirName)) {
      return DirectoryPurpose.DOCS;
    }

    // Build directories
    if (['dist', 'build', 'target', 'bin', 'out'].includes(dirName)) {
      return DirectoryPurpose.BUILD;
    }

    // Asset directories
    if (['assets', 'static', 'public', 'resources'].includes(dirName)) {
      return DirectoryPurpose.ASSETS;
    }

    // Vendor directories
    if (['vendor', 'third_party', 'external'].includes(dirName)) {
      return DirectoryPurpose.VENDOR;
    }

    return DirectoryPurpose.UNKNOWN;
  }

  private async extractFileDependencies(
    filePath: string, 
    language: ProgrammingLanguage
  ): Promise<string[]> {
    try {
      const content = await this.fileSystem.readFile(filePath);
      const dependencies: string[] = [];

      switch (language) {
        case ProgrammingLanguage.TYPESCRIPT:
        case ProgrammingLanguage.JAVASCRIPT:
          // Extract import/require statements
          const importRegex = /(?:import.*from\s+['"`]([^'"`]+)['"`]|require\(['"`]([^'"`]+)['"`]\))/g;
          let match;
          while ((match = importRegex.exec(content)) !== null) {
            const dep = match[1] || match[2];
            if (dep && !dep.startsWith('.')) {
              dependencies.push(dep.split('/')[0]); // Get package name
            }
          }
          break;

        case ProgrammingLanguage.PYTHON:
          // Extract import statements
          const pythonImportRegex = /(?:^|\n)\s*(?:import\s+([a-zA-Z_][a-zA-Z0-9_.]*)|from\s+([a-zA-Z_][a-zA-Z0-9_.]*)\s+import)/gm;
          let pythonMatch;
          while ((pythonMatch = pythonImportRegex.exec(content)) !== null) {
            const dep = pythonMatch[1] || pythonMatch[2];
            if (dep && !dep.startsWith('.')) {
              dependencies.push(dep.split('.')[0]);
            }
          }
          break;

        case ProgrammingLanguage.JAVA:
          // Extract import statements
          const javaImportRegex = /import\s+([a-zA-Z_][a-zA-Z0-9_.]*)/g;
          let javaMatch;
          while ((javaMatch = javaImportRegex.exec(content)) !== null) {
            const dep = javaMatch[1];
            if (dep && !dep.startsWith('java.') && !dep.startsWith('javax.')) {
              dependencies.push(dep.split('.')[0]);
            }
          }
          break;
      }

      return [...new Set(dependencies)]; // Remove duplicates
    } catch (error) {
      return [];
    }
  }

  private async calculateFileComplexity(
    filePath: string, 
    language: ProgrammingLanguage
  ): Promise<number> {
    try {
      const content = await this.fileSystem.readFile(filePath);
      
      // Simple cyclomatic complexity calculation
      const complexityKeywords: Record<ProgrammingLanguage, string[]> = {
        [ProgrammingLanguage.TYPESCRIPT]: ['if', 'else', 'while', 'for', 'switch', 'case', 'catch', '&&', '||'],
        [ProgrammingLanguage.JAVASCRIPT]: ['if', 'else', 'while', 'for', 'switch', 'case', 'catch', '&&', '||'],
        [ProgrammingLanguage.PYTHON]: ['if', 'elif', 'else', 'while', 'for', 'try', 'except', 'and', 'or'],
        [ProgrammingLanguage.JAVA]: ['if', 'else', 'while', 'for', 'switch', 'case', 'catch', '&&', '||'],
        [ProgrammingLanguage.GO]: ['if', 'else', 'for', 'switch', 'case', '&&', '||'],
        [ProgrammingLanguage.RUST]: ['if', 'else', 'while', 'for', 'match', '&&', '||'],
        [ProgrammingLanguage.UNKNOWN]: []
      };

      const keywords = complexityKeywords[language] || [];
      let complexity = 1; // Base complexity

      for (const keyword of keywords) {
        const regex = new RegExp(`\\b${keyword}\\b`, 'g');
        const matches = content.match(regex);
        if (matches) {
          complexity += matches.length;
        }
      }

      return complexity;
    } catch (error) {
      return 1;
    }
  }

  private async detectTechnologyStack(structure: FileTreeStructure): Promise<TechnologyStack> {
    const technologies: Technology[] = [];

    // Language detection based on file extensions
    const languageCount = new Map<ProgrammingLanguage, number>();
    
    for (const file of structure.files) {
      if (file.language !== ProgrammingLanguage.UNKNOWN) {
        languageCount.set(file.language, (languageCount.get(file.language) || 0) + 1);
      }
    }

    // Convert to technologies
    const totalFiles = structure.files.length;
    for (const [lang, count] of languageCount.entries()) {
      const confidence = count / totalFiles;
      if (confidence > 0.1) { // At least 10% of files
        technologies.push({
          name: lang,
          category: TechnologyCategory.LANGUAGE,
          confidence,
          evidence: [`${count} files use ${lang}`]
        });
      }
    }

    // Framework detection based on package.json or specific files
    const frameworks = await this.detectFrameworks(structure);
    technologies.push(...frameworks);

    // Sort by confidence
    technologies.sort((a, b) => b.confidence - a.confidence);

    return {
      primary: technologies.filter(t => t.category === TechnologyCategory.LANGUAGE),
      frameworks: technologies.filter(t => t.category === TechnologyCategory.FRAMEWORK),
      tools: technologies.filter(t => t.category === TechnologyCategory.TOOL),
      runtime: technologies.filter(t => t.category === TechnologyCategory.RUNTIME)
    };
  }

  private async detectFrameworks(structure: FileTreeStructure): Promise<Technology[]> {
    const frameworks: Technology[] = [];

    // Look for framework-specific files
    const frameworkIndicators: Record<string, { name: string; category: TechnologyCategory; evidence: string }> = {
      'package.json': { name: 'Node.js', category: TechnologyCategory.RUNTIME, evidence: 'package.json found' },
      'requirements.txt': { name: 'Python', category: TechnologyCategory.RUNTIME, evidence: 'requirements.txt found' },
      'pom.xml': { name: 'Maven', category: TechnologyCategory.TOOL, evidence: 'pom.xml found' },
      'build.gradle': { name: 'Gradle', category: TechnologyCategory.TOOL, evidence: 'build.gradle found' },
      'Cargo.toml': { name: 'Cargo', category: TechnologyCategory.TOOL, evidence: 'Cargo.toml found' },
      'go.mod': { name: 'Go Modules', category: TechnologyCategory.TOOL, evidence: 'go.mod found' },
      'tsconfig.json': { name: 'TypeScript', category: TechnologyCategory.LANGUAGE, evidence: 'tsconfig.json found' },
      'webpack.config.js': { name: 'Webpack', category: TechnologyCategory.TOOL, evidence: 'webpack.config.js found' },
      'next.config.js': { name: 'Next.js', category: TechnologyCategory.FRAMEWORK, evidence: 'next.config.js found' },
      'nuxt.config.js': { name: 'Nuxt.js', category: TechnologyCategory.FRAMEWORK, evidence: 'nuxt.config.js found' },
      'angular.json': { name: 'Angular', category: TechnologyCategory.FRAMEWORK, evidence: 'angular.json found' },
      'vue.config.js': { name: 'Vue.js', category: TechnologyCategory.FRAMEWORK, evidence: 'vue.config.js found' }
    };

    for (const file of structure.files) {
      const indicator = frameworkIndicators[file.name];
      if (indicator) {
        frameworks.push({
          name: indicator.name,
          category: indicator.category,
          confidence: 0.9,
          evidence: [indicator.evidence]
        });
      }
    }

    return frameworks;
  }

  private async detectArchitecturePatterns(
    structure: FileTreeStructure, 
    technologyStack: TechnologyStack
  ): Promise<ArchitecturePattern[]> {
    const patterns: ArchitecturePattern[] = [];

    // Detect Clean Architecture
    const hasLayers = ['domain', 'application', 'infrastructure'].every(layer =>
      structure.directories.some(dir => dir.name.toLowerCase().includes(layer))
    );

    if (hasLayers) {
      patterns.push({
        name: ArchitecturePatternType.CLEAN,
        confidence: 0.8,
        evidence: [
          { description: 'Domain layer found', location: 'src/domain', strength: 'strong' },
          { description: 'Application layer found', location: 'src/application', strength: 'strong' },
          { description: 'Infrastructure layer found', location: 'src/infrastructure', strength: 'strong' }
        ],
        violations: []
      });
    }

    // Detect MVC pattern
    const hasMVC = ['models', 'views', 'controllers'].every(component =>
      structure.directories.some(dir => dir.name.toLowerCase().includes(component)) ||
      structure.files.some(file => file.name.toLowerCase().includes(component))
    );

    if (hasMVC) {
      patterns.push({
        name: ArchitecturePatternType.MVC,
        confidence: 0.7,
        evidence: [
          { description: 'MVC structure detected', location: 'project root', strength: 'medium' }
        ],
        violations: []
      });
    }

    // Detect Microservices (based on multiple service directories or docker-compose)
    const hasServices = structure.directories.filter(dir => 
      dir.name.includes('service') || dir.name.includes('microservice')
    ).length > 1;

    const hasDockerCompose = structure.files.some(file => 
      file.name === 'docker-compose.yml' || file.name === 'docker-compose.yaml'
    );

    if (hasServices || hasDockerCompose) {
      patterns.push({
        name: ArchitecturePatternType.MICROSERVICES,
        confidence: hasServices ? 0.8 : 0.6,
        evidence: [
          { description: 'Multiple services detected', location: 'project structure', strength: 'medium' }
        ],
        violations: []
      });
    }

    return patterns;
  }

  private async analyzeDependencies(
    projectPath: string, 
    structure: FileTreeStructure
  ): Promise<DependencyMap> {
    const external: ExternalDependency[] = [];
    const devDependencies: ExternalDependency[] = [];
    const peerDependencies: ExternalDependency[] = [];
    const internal: InternalDependency[] = [];

    // Analyze package.json if it exists
    const packageJsonPath = path.join(projectPath, 'package.json');
    if (await this.fileSystem.exists(packageJsonPath)) {
      try {
        const packageContent = await this.fileSystem.readFile(packageJsonPath);
        const packageJson = JSON.parse(packageContent);

        // External dependencies
        if (packageJson.dependencies) {
          for (const [name, version] of Object.entries(packageJson.dependencies)) {
            external.push({
              name,
              version: version as string,
              type: DependencyType.RUNTIME,
              purpose: 'Runtime dependency'
            });
          }
        }

        // Dev dependencies
        if (packageJson.devDependencies) {
          for (const [name, version] of Object.entries(packageJson.devDependencies)) {
            devDependencies.push({
              name,
              version: version as string,
              type: DependencyType.DEVELOPMENT,
              purpose: 'Development dependency'
            });
          }
        }

        // Peer dependencies
        if (packageJson.peerDependencies) {
          for (const [name, version] of Object.entries(packageJson.peerDependencies)) {
            peerDependencies.push({
              name,
              version: version as string,
              type: DependencyType.PEER,
              purpose: 'Peer dependency'
            });
          }
        }
      } catch (error) {
        this.logger.debug('Failed to parse package.json', { packageJsonPath });
      }
    }

    // Build dependency graph
    const graph = this.buildDependencyGraph(structure, internal);

    return {
      external,
      internal,
      devDependencies,
      peerDependencies,
      graph
    };
  }

  private buildDependencyGraph(
    structure: FileTreeStructure, 
    internal: InternalDependency[]
  ): DependencyGraph {
    const nodes: string[] = [];
    const edges: { from: string; to: string; weight: number }[] = [];

    // Add all source files as nodes
    for (const file of structure.files) {
      if (file.type === FileType.SOURCE) {
        nodes.push(file.path);
      }
    }

    // Build edges from file dependencies
    for (const file of structure.files) {
      if (file.type === FileType.SOURCE && file.dependencies.length > 0) {
        for (const dep of file.dependencies) {
          const depFile = structure.files.find(f => 
            f.name.includes(dep) || f.path.includes(dep)
          );
          if (depFile) {
            edges.push({
              from: file.path,
              to: depFile.path,
              weight: 1
            });

            internal.push({
              from: file.path,
              to: depFile.path,
              type: 'import',
              strength: 'medium'
            });
          }
        }
      }
    }

    // Detect cycles (simplified)
    const cycles: string[][] = [];
    // TODO: Implement proper cycle detection algorithm

    // Find orphan nodes (no dependencies)
    const orphans = nodes.filter(node => 
      !edges.some(edge => edge.from === node || edge.to === node)
    );

    return {
      nodes,
      edges,
      cycles,
      orphans
    };
  }

  private async calculateCodeMetrics(
    structure: FileTreeStructure, 
    projectPath: string
  ): Promise<CodeMetrics> {
    let totalLines = 0;
    let totalComplexity = 0;
    let sourceFiles = 0;

    for (const file of structure.files) {
      if (file.type === FileType.SOURCE) {
        try {
          const filePath = path.join(projectPath, file.path);
          const content = await this.fileSystem.readFile(filePath);
          const lines = content.split('\n').length;
          
          totalLines += lines;
          totalComplexity += file.complexity || 1;
          sourceFiles++;
        } catch (error) {
          this.logger.debug('Failed to read file for metrics', { filePath: file.path });
        }
      }
    }

    const averageComplexity = sourceFiles > 0 ? totalComplexity / sourceFiles : 0;
    
    // Calculate quality score (simplified)
    const qualityScore = Math.max(0, Math.min(100, 100 - (averageComplexity - 10) * 5));

    return {
      linesOfCode: totalLines,
      complexity: {
        cyclomatic: totalComplexity,
        cognitive: totalComplexity * 0.8, // Approximation
        halstead: {
          vocabulary: sourceFiles * 10, // Approximation
          length: totalLines,
          difficulty: averageComplexity,
          effort: totalLines * averageComplexity,
          timeToCode: (totalLines * averageComplexity) / 100,
          bugsDelivered: totalLines / 3000 // Approximation
        },
        nesting: {
          average: 2, // Default approximation
          maximum: Math.ceil(averageComplexity / 2),
          violationsOver3: Math.max(0, Math.ceil(averageComplexity - 10))
        }
      },
      maintainability: {
        index: qualityScore,
        duplication: Math.min(20, sourceFiles * 0.1), // Approximation
        cohesion: Math.max(0.3, 1 - (averageComplexity / 20)),
        coupling: Math.min(0.8, averageComplexity / 20),
        debtRatio: Math.min(0.3, (averageComplexity - 5) / 20)
      },
      qualityScore
    };
  }

  private async identifyComplexityHotspots(
    structure: FileTreeStructure, 
    projectPath: string
  ): Promise<ComplexityHotspot[]> {
    const hotspots: ComplexityHotspot[] = [];

    for (const file of structure.files) {
      if (file.type === FileType.SOURCE && (file.complexity || 0) > 10) {
        hotspots.push({
          file: file.path,
          line: 1,
          type: ComplexityType.CYCLOMATIC,
          score: file.complexity || 0,
          reason: `High cyclomatic complexity: ${file.complexity}`,
          suggestion: 'Consider breaking this file into smaller, focused modules'
        });
      }
    }

    return hotspots.sort((a, b) => b.score - a.score);
  }

  private async countFilesInDirectory(
    dirPath: string, 
    ignorePatterns: string[]
  ): Promise<number> {
    try {
      const items = await this.fileSystem.readdir(dirPath);
      let count = 0;

      for (const item of items) {
        const itemPath = path.join(dirPath, item);
        
        if (ignorePatterns.some(pattern => itemPath.includes(pattern))) {
          continue;
        }

        try {
          const stat = await this.fileSystem.stat(itemPath);
          if (stat.isFile()) {
            count++;
          } else if (stat.isDirectory()) {
            count += await this.countFilesInDirectory(itemPath, ignorePatterns);
          }
        } catch (error) {
          // Skip items that can't be accessed
        }
      }

      return count;
    } catch (error) {
      return 0;
    }
  }
}