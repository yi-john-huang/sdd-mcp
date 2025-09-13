import * as fs from 'fs';
import * as path from 'path';

export interface ProjectAnalysis {
  name: string;
  description: string;
  version: string;
  type: string;
  architecture: string;
  dependencies: string[];
  devDependencies: string[];
  scripts: Record<string, string>;
  directories: string[];
  files: string[];
  hasTests: boolean;
  hasDocker: boolean;
  hasCI: boolean;
  framework: string | null;
  language: string;
  testFramework: string | null;
  buildTool: string | null;
  packageManager: string;
}

/**
 * Analyzes the project structure and returns comprehensive project information
 */
export async function analyzeProject(projectPath: string): Promise<ProjectAnalysis> {
  const analysis: ProjectAnalysis = {
    name: 'Unknown Project',
    description: 'No description available',
    version: '0.0.0',
    type: 'unknown',
    architecture: 'unknown',
    dependencies: [],
    devDependencies: [],
    scripts: {},
    directories: [],
    files: [],
    hasTests: false,
    hasDocker: false,
    hasCI: false,
    framework: null,
    language: 'javascript',
    testFramework: null,
    buildTool: null,
    packageManager: 'npm'
  };

  try {
    // Check for package.json
    const packageJsonPath = path.join(projectPath, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      analysis.name = packageJson.name || analysis.name;
      analysis.description = packageJson.description || analysis.description;
      analysis.version = packageJson.version || analysis.version;
      analysis.type = packageJson.type === 'module' ? 'ES Module' : 'CommonJS';
      analysis.dependencies = Object.keys(packageJson.dependencies || {});
      analysis.devDependencies = Object.keys(packageJson.devDependencies || {});
      analysis.scripts = packageJson.scripts || {};

      // Detect framework
      if (analysis.dependencies.includes('express') || analysis.devDependencies.includes('express')) {
        analysis.framework = 'Express.js';
        analysis.architecture = 'REST API Server';
      } else if (analysis.dependencies.includes('fastify')) {
        analysis.framework = 'Fastify';
        analysis.architecture = 'High-performance REST API';
      } else if (analysis.dependencies.includes('react')) {
        analysis.framework = 'React';
        analysis.architecture = 'Frontend Application';
      } else if (analysis.dependencies.includes('vue')) {
        analysis.framework = 'Vue.js';
        analysis.architecture = 'Progressive Web Application';
      } else if (analysis.dependencies.includes('@angular/core')) {
        analysis.framework = 'Angular';
        analysis.architecture = 'Enterprise Frontend Application';
      } else if (analysis.dependencies.includes('next')) {
        analysis.framework = 'Next.js';
        analysis.architecture = 'Full-stack React Framework';
      } else if (analysis.dependencies.includes('@modelcontextprotocol/sdk')) {
        analysis.framework = 'MCP SDK';
        analysis.architecture = 'Model Context Protocol Server';
      }

      // Detect language
      if (analysis.devDependencies.includes('typescript') || fs.existsSync(path.join(projectPath, 'tsconfig.json'))) {
        analysis.language = 'typescript';
      }

      // Detect test framework
      if (analysis.devDependencies.includes('jest')) {
        analysis.testFramework = 'Jest';
      } else if (analysis.devDependencies.includes('mocha')) {
        analysis.testFramework = 'Mocha';
      } else if (analysis.devDependencies.includes('vitest')) {
        analysis.testFramework = 'Vitest';
      }

      // Detect build tool
      if (analysis.scripts.build?.includes('webpack')) {
        analysis.buildTool = 'Webpack';
      } else if (analysis.scripts.build?.includes('vite')) {
        analysis.buildTool = 'Vite';
      } else if (analysis.scripts.build?.includes('tsc')) {
        analysis.buildTool = 'TypeScript Compiler';
      } else if (analysis.scripts.build?.includes('rollup')) {
        analysis.buildTool = 'Rollup';
      }
    }

    // Check for Java/Maven/Gradle projects
    const pomPath = path.join(projectPath, 'pom.xml');
    const gradlePath = path.join(projectPath, 'build.gradle');
    const gradleKtsPath = path.join(projectPath, 'build.gradle.kts');
    if (fs.existsSync(pomPath) || fs.existsSync(gradlePath) || fs.existsSync(gradleKtsPath)) {
      analysis.language = 'java';
      if (fs.existsSync(pomPath)) {
        analysis.packageManager = 'maven';
        analysis.buildTool = 'Maven';
        try {
          const pom = fs.readFileSync(pomPath, 'utf8');
          if (/spring-boot/i.test(pom) || /org\.springframework\.boot/i.test(pom)) {
            analysis.framework = 'Spring Boot';
            analysis.architecture = 'Spring Boot Application';
          }
          const moduleMatches = pom.match(/<module>[^<]+<\/module>/g) || [];
          if (moduleMatches.length > 1) {
            analysis.architecture = 'Microservices (Spring Boot)';
          }
          if (/junit|jupiter/i.test(pom)) {
            analysis.testFramework = 'JUnit';
            analysis.hasTests = true;
          }
        } catch {}
      } else {
        analysis.packageManager = 'gradle';
        analysis.buildTool = 'Gradle';
        try {
          const gradle = fs.readFileSync(fs.existsSync(gradlePath) ? gradlePath : gradleKtsPath, 'utf8');
          if (/org\.springframework\.boot|spring-boot/i.test(gradle)) {
            analysis.framework = 'Spring Boot';
            analysis.architecture = 'Spring Boot Application';
          }
          if (/subprojects\s*\{|include\s+\(/i.test(gradle)) {
            analysis.architecture = 'Microservices (Spring Boot)';
          }
          if (/junit|jupiter|testImplementation\s+['"]org\.junit/i.test(gradle)) {
            analysis.testFramework = 'JUnit';
            analysis.hasTests = true;
          }
        } catch {}
      }
      if (fs.existsSync(path.join(projectPath, 'src', 'test', 'java'))) {
        analysis.hasTests = true;
        if (!analysis.testFramework) analysis.testFramework = 'JUnit';
      }
    }

    // Detect Python projects
    const pyproject = path.join(projectPath, 'pyproject.toml');
    const requirements = path.join(projectPath, 'requirements.txt');
    const pipfile = path.join(projectPath, 'Pipfile');
    const setupPy = path.join(projectPath, 'setup.py');
    if (fs.existsSync(pyproject) || fs.existsSync(requirements) || fs.existsSync(pipfile) || fs.existsSync(setupPy)) {
      analysis.language = 'python';
      analysis.packageManager = fs.existsSync(pyproject) ? 'poetry/pip' : (fs.existsSync(pipfile) ? 'pipenv' : 'pip');
      analysis.buildTool = fs.existsSync(pyproject) ? 'Poetry' : 'Pip';
      try {
        const req = fs.existsSync(pyproject) ? fs.readFileSync(pyproject, 'utf8') : (fs.existsSync(requirements) ? fs.readFileSync(requirements, 'utf8') : '');
        if (/django/i.test(req)) { analysis.framework = 'Django'; analysis.architecture = 'Django Web Application'; }
        else if (/fastapi/i.test(req)) { analysis.framework = 'FastAPI'; analysis.architecture = 'REST API Server'; }
        else if (/flask/i.test(req)) { analysis.framework = 'Flask'; analysis.architecture = 'REST API Server'; }
        if (/pytest/i.test(req)) { analysis.testFramework = 'pytest'; analysis.hasTests = true; }
      } catch {}
      if (fs.existsSync(path.join(projectPath, 'tests')) || fs.existsSync(path.join(projectPath, 'test'))) {
        analysis.hasTests = true;
        if (!analysis.testFramework) analysis.testFramework = 'pytest/unittest';
      }
    }

    // Detect Go projects
    const goMod = path.join(projectPath, 'go.mod');
    if (fs.existsSync(goMod)) {
      analysis.language = 'go';
      analysis.packageManager = 'go';
      analysis.buildTool = 'Go Toolchain';
      try {
        const gomod = fs.readFileSync(goMod, 'utf8');
        if (/github.com\/(gin-gonic\/gin)/i.test(gomod)) { analysis.framework = 'Gin'; analysis.architecture = 'REST API Server'; }
        else if (/github.com\/(labstack\/echo)/i.test(gomod)) { analysis.framework = 'Echo'; analysis.architecture = 'REST API Server'; }
        else { analysis.architecture = analysis.architecture === 'unknown' ? 'Go Application' : analysis.architecture; }
      } catch {}
      analysis.hasTests = analysis.hasTests || false;
      analysis.testFramework = analysis.testFramework || 'go test';
    }

    // Detect Ruby projects
    const gemfile = path.join(projectPath, 'Gemfile');
    if (fs.existsSync(gemfile)) {
      analysis.language = 'ruby';
      analysis.packageManager = 'bundler';
      analysis.buildTool = 'Rake';
      try {
        const gem = fs.readFileSync(gemfile, 'utf8');
        if (/rails/i.test(gem)) { analysis.framework = 'Rails'; analysis.architecture = 'Rails MVC Application'; }
        else if (/sinatra/i.test(gem)) { analysis.framework = 'Sinatra'; analysis.architecture = 'Web Application'; }
        if (/rspec/i.test(gem)) { analysis.testFramework = 'RSpec'; analysis.hasTests = true; }
      } catch {}
    }

    // Detect PHP projects
    const composerJsonPath = path.join(projectPath, 'composer.json');
    if (fs.existsSync(composerJsonPath)) {
      analysis.language = 'php';
      analysis.packageManager = 'composer';
      analysis.buildTool = 'Composer';
      try {
        const composer = JSON.parse(fs.readFileSync(composerJsonPath, 'utf8'));
        const require = composer.require || {};
        if (require['laravel/framework']) { analysis.framework = 'Laravel'; analysis.architecture = 'Laravel MVC Application'; }
        else if (require['symfony/symfony'] || require['symfony/framework-bundle']) { analysis.framework = 'Symfony'; analysis.architecture = 'Symfony Application'; }
        if (require['phpunit/phpunit']) { analysis.testFramework = 'PHPUnit'; analysis.hasTests = true; }
      } catch {}
    }

    // Detect Rust projects
    const cargoToml = path.join(projectPath, 'Cargo.toml');
    if (fs.existsSync(cargoToml)) {
      analysis.language = 'rust';
      analysis.packageManager = 'cargo';
      analysis.buildTool = 'Cargo';
      try {
        const cargo = fs.readFileSync(cargoToml, 'utf8');
        if (/actix-web/i.test(cargo)) { analysis.framework = 'Actix Web'; analysis.architecture = 'REST API Server'; }
        else if (/rocket =/i.test(cargo)) { analysis.framework = 'Rocket'; analysis.architecture = 'Web Application'; }
        else if (/axum/i.test(cargo)) { analysis.framework = 'Axum'; analysis.architecture = 'REST API Server'; }
      } catch {}
      analysis.testFramework = 'cargo test';
    }

    // Detect .NET projects
    const entries = fs.readdirSync(projectPath);
    const csproj = entries.find(f => f.endsWith('.csproj')) || null;
    const sln = entries.find(f => f.endsWith('.sln')) || null;
    if (csproj || sln) {
      analysis.language = 'csharp';
      analysis.packageManager = 'dotnet';
      analysis.buildTool = '.NET SDK';
      analysis.framework = 'ASP.NET Core';
      analysis.architecture = analysis.architecture === 'unknown' ? 'ASP.NET Application' : analysis.architecture;
      analysis.testFramework = analysis.testFramework || 'xUnit/NUnit/MSTest';
    }

    // Detect Scala projects
    const sbtBuild = path.join(projectPath, 'build.sbt');
    if (fs.existsSync(sbtBuild)) {
      analysis.language = 'scala';
      analysis.packageManager = 'sbt';
      analysis.buildTool = 'SBT';
      analysis.framework = analysis.framework || 'Play?/Akka?';
      analysis.architecture = analysis.architecture === 'unknown' ? 'Scala Application' : analysis.architecture;
      analysis.testFramework = analysis.testFramework || 'ScalaTest';
    }

    // Check for yarn or pnpm
    if (fs.existsSync(path.join(projectPath, 'yarn.lock'))) {
      analysis.packageManager = 'yarn';
    } else if (fs.existsSync(path.join(projectPath, 'pnpm-lock.yaml'))) {
      analysis.packageManager = 'pnpm';
    }

    // Scan directory structure
    const items = fs.readdirSync(projectPath, { withFileTypes: true });
    for (const item of items) {
      if (item.isDirectory() && !item.name.startsWith('.') && item.name !== 'node_modules') {
        analysis.directories.push(item.name);
        
        // Check for test directories
        if (item.name === 'test' || item.name === 'tests' || item.name === '__tests__' || item.name === 'spec') {
          analysis.hasTests = true;
        }
      } else if (item.isFile()) {
        analysis.files.push(item.name);
        
        // Check for Docker
        if (item.name === 'Dockerfile' || item.name === 'docker-compose.yml') {
          analysis.hasDocker = true;
        }
        
        // Check for CI/CD
        if (item.name === '.gitlab-ci.yml' || item.name === '.travis.yml' || item.name === 'Jenkinsfile') {
          analysis.hasCI = true;
        }
      }
    }

    // Check for GitHub Actions
    if (fs.existsSync(path.join(projectPath, '.github', 'workflows'))) {
      analysis.hasCI = true;
    }

    // Additional architecture detection based on directory structure
    if (analysis.directories.includes('src')) {
      const srcPath = path.join(projectPath, 'src');
      const srcItems = fs.readdirSync(srcPath, { withFileTypes: true });
      const srcDirs = srcItems.filter(item => item.isDirectory()).map(item => item.name);
      
      if (srcDirs.includes('domain') && srcDirs.includes('infrastructure')) {
        analysis.architecture = 'Domain-Driven Design (DDD)';
      } else if (srcDirs.includes('controllers') && srcDirs.includes('models')) {
        analysis.architecture = 'MVC Architecture';
      } else if (srcDirs.includes('components') && srcDirs.includes('pages')) {
        analysis.architecture = 'Component-Based Architecture';
      }
    }

  } catch (error) {
    console.error('Error analyzing project:', error);
  }

  return analysis;
}

/**
 * Generates dynamic product.md content based on project analysis
 */
export function generateProductDocument(analysis: ProjectAnalysis): string {
  const features = extractFeatures(analysis);
  const valueProps = generateValuePropositions(analysis);
  const targetUsers = identifyTargetUsers(analysis);
  
  return `# Product Overview

## Product Description
${analysis.description}

**Project**: ${analysis.name}  
**Version**: ${analysis.version}  
**Type**: ${analysis.architecture}

## Core Features
${features.map(f => `- ${f}`).join('\n')}

## Target Use Case
${generateUseCaseDescription(analysis)}

## Key Value Proposition
${valueProps.map(v => `- **${v.title}**: ${v.description}`).join('\n')}

## Target Users
${targetUsers.map(u => `- ${u}`).join('\n')}

## Success Metrics
${generateSuccessMetrics(analysis).map(m => `- ${m}`).join('\n')}

## Technical Advantages
${generateTechnicalAdvantages(analysis).map(a => `- ${a}`).join('\n')}
`;
}

/**
 * Generates dynamic tech.md content based on project analysis
 */
export function generateTechDocument(analysis: ProjectAnalysis): string {
  const techStack = buildTechStack(analysis);
  const devCommands = extractDevCommands(analysis);
  const architecture = describeArchitecture(analysis);
  
  return `# Technology Stack

## Architecture
**Type**: ${analysis.architecture}  
**Language**: ${analysis.language === 'typescript' ? 'TypeScript' : analysis.language === 'java' ? 'Java' : analysis.language === 'python' ? 'Python' : analysis.language === 'go' ? 'Go' : analysis.language === 'ruby' ? 'Ruby' : analysis.language === 'php' ? 'PHP' : analysis.language === 'rust' ? 'Rust' : analysis.language === 'csharp' ? 'C#' : analysis.language === 'scala' ? 'Scala' : 'JavaScript'}  
${(analysis.language === 'javascript' || analysis.language === 'typescript') ? `**Module System**: ${analysis.type}  ` : ''}
${analysis.framework ? `**Framework**: ${analysis.framework}` : ''}  
${analysis.buildTool ? `**Build Tool**: ${analysis.buildTool}` : ''}

${architecture}

## Technology Stack
${techStack.map(t => `- **${t.name}**: ${t.description}`).join('\n')}

## Development Environment
${analysis.language === 'java' ? `- **JDK**: ${getJavaVersion(projectPathFromCwd())}\n` : analysis.language === 'go' ? `- **Go**: ${getGoVersion(projectPathFromCwd())}\n` : analysis.language === 'python' ? `- **Python**: ${getPythonVersion(projectPathFromCwd())}\n` : analysis.language === 'ruby' ? `- **Ruby**: ${getRubyVersion(projectPathFromCwd())}\n` : analysis.language === 'php' ? `- **PHP**: ${getPhpVersion(projectPathFromCwd())}\n` : analysis.language === 'rust' ? `- **Rust**: ${getRustToolchain(projectPathFromCwd())}\n` : analysis.language === 'csharp' ? `- **.NET SDK**: ${getDotnetTarget(projectPathFromCwd())}\n` : `- **Node Version**: ${getNodeVersion()}\n`}- **Package Manager/Build**: ${analysis.packageManager}
- **Language**: ${analysis.language === 'typescript' ? 'TypeScript with type safety' : analysis.language ? analysis.language[0].toUpperCase() + analysis.language.slice(1) : 'JavaScript'}
${analysis.testFramework ? `- **Testing**: ${analysis.testFramework}` : ''}

## Dependencies Analysis
### Production Dependencies (${analysis.dependencies.length})
${analysis.dependencies.slice(0, 15).map(d => `- \`${d}\`: ${describeDependency(d)}`).join('\n')}
${analysis.dependencies.length > 15 ? `\n... and ${analysis.dependencies.length - 15} more` : ''}

### Development Dependencies (${analysis.devDependencies.length})
${analysis.devDependencies.slice(0, 10).map(d => `- \`${d}\`: ${describeDependency(d)}`).join('\n')}
${analysis.devDependencies.length > 10 ? `\n... and ${analysis.devDependencies.length - 10} more` : ''}

## Development Commands
${devCommands}

## Quality Assurance
${generateQualityAssurance(analysis)}

## Deployment Configuration
${generateDeploymentConfig(analysis)}
`;
}

/**
 * Generates dynamic structure.md content based on project analysis
 */
export function generateStructureDocument(analysis: ProjectAnalysis): string {
  const structure = buildDirectoryTree(analysis);
  const patterns = identifyPatterns(analysis);
  const conventions = extractConventions(analysis);
  
  return `# Project Structure

## Directory Organization
\`\`\`
${structure}
\`\`\`

## Key Directories
${describeKeyDirectories(analysis)}

## Code Organization Patterns
${patterns.map(p => `- **${p.pattern}**: ${p.description}`).join('\n')}

## File Naming Conventions
${conventions.naming.map(c => `- ${c}`).join('\n')}

## Module Organization
${describeModuleOrganization(analysis)}

## Architectural Principles
${generateArchitecturalPrinciples(analysis).map(p => `- **${p.principle}**: ${p.description}`).join('\n')}

## Development Patterns
${generateDevelopmentPatterns(analysis).map(p => `- ${p}`).join('\n')}

## Testing Structure
${describeTestingStructure(analysis)}

## Build Output
${describeBuildOutput(analysis)}
`;
}

// Helper functions for dynamic content generation

function extractFeatures(analysis: ProjectAnalysis): string[] {
  const features: string[] = [];
  
  // Based on scripts
  if (analysis.scripts.test) features.push('Automated testing framework');
  if (analysis.scripts.build) features.push('Build system for production deployment');
  if (analysis.scripts.dev || analysis.scripts.start) features.push('Development server with hot reload');
  if (analysis.scripts.lint) features.push('Code quality enforcement with linting');
  if (analysis.scripts.typecheck) features.push('Type safety validation');
  if (analysis.scripts.coverage) features.push('Code coverage analysis');
  
  // Based on dependencies
  if (analysis.framework) features.push(`${analysis.framework} framework integration`);
  if (analysis.hasDocker) features.push('Docker containerization support');
  if (analysis.hasCI) features.push('Continuous Integration/Deployment pipeline');
  if (analysis.testFramework) features.push(`${analysis.testFramework} testing suite`);
  if (analysis.language === 'typescript') features.push('TypeScript type safety');
  
  // MCP specific
  if (analysis.dependencies.includes('@modelcontextprotocol/sdk')) {
    features.push('Model Context Protocol (MCP) server capabilities');
    features.push('AI tool integration support');
    features.push('Spec-driven development workflow');
  }
  
  return features.length > 0 ? features : ['Core application functionality'];
}

function generateValuePropositions(analysis: ProjectAnalysis): Array<{title: string, description: string}> {
  const props = [];
  
  if (analysis.language === 'typescript') {
    props.push({
      title: 'Type Safety',
      description: 'Compile-time type checking reduces runtime errors'
    });
  }
  
  if (analysis.hasTests) {
    props.push({
      title: 'Quality Assurance',
      description: 'Comprehensive test coverage ensures reliability'
    });
  }
  
  if (analysis.framework === 'MCP SDK') {
    props.push({
      title: 'AI Integration',
      description: 'Seamless integration with AI development tools'
    });
  }
  
  if (analysis.hasDocker) {
    props.push({
      title: 'Deployment Flexibility',
      description: 'Container-based deployment for any environment'
    });
  }
  
  return props;
}

function identifyTargetUsers(analysis: ProjectAnalysis): string[] {
  const users = [];
  
  if (analysis.framework === 'MCP SDK' || analysis.dependencies.includes('@modelcontextprotocol/sdk')) {
    users.push('AI developers using Claude, Cursor, or similar tools');
    users.push('Development teams implementing spec-driven workflows');
  }
  
  if (analysis.architecture.includes('API')) {
    users.push('Backend developers building RESTful services');
    users.push('API consumers and third-party integrators');
  }
  
  if (analysis.framework?.includes('React') || analysis.framework?.includes('Vue') || analysis.framework?.includes('Angular')) {
    users.push('Frontend developers building web applications');
    users.push('End users accessing web interfaces');
  }
  
  if (users.length === 0) {
    users.push('Software developers');
    users.push('System administrators');
  }
  
  return users;
}

function generateUseCaseDescription(analysis: ProjectAnalysis): string {
  if (analysis.dependencies.includes('@modelcontextprotocol/sdk')) {
    return 'This product enables AI-powered development teams to follow structured, spec-driven development workflows with comprehensive phase management, quality gates, and AI tool integration.';
  }
  
  if (analysis.architecture.includes('API')) {
    return `This ${analysis.framework || 'application'} provides RESTful API services for client applications, enabling data exchange and business logic processing.`;
  }
  
  if (analysis.architecture.includes('Frontend')) {
    return `This ${analysis.framework || 'web'} application delivers interactive user interfaces for ${analysis.description || 'web-based services'}.`;
  }
  
  return analysis.description || 'General-purpose application for various use cases.';
}

function generateSuccessMetrics(analysis: ProjectAnalysis): string[] {
  const metrics = [];
  
  if (analysis.hasTests) metrics.push('Test coverage > 80%');
  if (analysis.scripts.lint) metrics.push('Zero linting errors in production code');
  if (analysis.language === 'typescript') metrics.push('Zero TypeScript compilation errors');
  if (analysis.architecture.includes('API')) metrics.push('API response time < 200ms for 95% of requests');
  if (analysis.hasCI) metrics.push('Successful CI/CD pipeline execution rate > 95%');
  
  return metrics.length > 0 ? metrics : ['Successful deployment and operation'];
}

function generateTechnicalAdvantages(analysis: ProjectAnalysis): string[] {
  const advantages = [];
  
  if (analysis.language === 'typescript') {
    advantages.push('Strong typing prevents common JavaScript errors');
  }
  
  if (analysis.buildTool) {
    advantages.push(`Optimized builds with ${analysis.buildTool}`);
  }
  
  if (analysis.architecture.includes('DDD')) {
    advantages.push('Domain-Driven Design ensures business alignment');
  }
  
  if (analysis.dependencies.includes('inversify')) {
    advantages.push('Dependency injection for loose coupling and testability');
  }
  
  return advantages;
}

function buildTechStack(analysis: ProjectAnalysis): Array<{name: string, description: string}> {
  const stack = [];
  
  // Core runtime
  if (analysis.language === 'java') {
    stack.push({ name: 'Java', description: 'JDK runtime for backend services' });
  } else if (analysis.language === 'python') {
    stack.push({ name: 'Python', description: 'Python runtime for applications and APIs' });
  } else if (analysis.language === 'go') {
    stack.push({ name: 'Go', description: 'Go toolchain for building static binaries' });
  } else if (analysis.language === 'ruby') {
    stack.push({ name: 'Ruby', description: 'Ruby runtime for web applications' });
  } else if (analysis.language === 'php') {
    stack.push({ name: 'PHP', description: 'PHP runtime for web applications' });
  } else if (analysis.language === 'rust') {
    stack.push({ name: 'Rust', description: 'Rust toolchain for systems and APIs' });
  } else if (analysis.language === 'csharp') {
    stack.push({ name: 'C#/.NET', description: '.NET runtime and SDK' });
  } else if (analysis.language === 'scala') {
    stack.push({ name: 'Scala', description: 'JVM language for backend systems' });
  } else {
    stack.push({ name: 'Node.js', description: 'JavaScript runtime for server-side execution' });
  }
  
  // Language
  if (analysis.language === 'typescript') {
    stack.push({
      name: 'TypeScript',
      description: 'Typed superset of JavaScript for enhanced developer experience'
    });
  } else if (analysis.language === 'java') {
    stack.push({ name: 'Spring Boot', description: 'Opinionated framework for building production-ready services' });
  }
  
  // Framework
  if (analysis.framework) {
    stack.push({
      name: analysis.framework,
      description: getFrameworkDescription(analysis.framework)
    });
  }
  
  // Testing
  if (analysis.testFramework) {
    stack.push({
      name: analysis.testFramework,
      description: 'Testing framework for unit and integration tests'
    });
  }
  
  // Build tool
  if (analysis.buildTool) {
    stack.push({
      name: analysis.buildTool,
      description: 'Build and bundling tool for production optimization'
    });
  }
  
  // Key dependencies
  for (const dep of analysis.dependencies.slice(0, 5)) {
    if (!['react', 'vue', 'express', 'fastify', 'next'].includes(dep)) {
      stack.push({
        name: dep,
        description: describeDependency(dep)
      });
    }
  }
  
  return stack;
}

export function extractDevCommands(analysis: ProjectAnalysis): string {
  let commands = '```bash\n';
  switch (analysis.language) {
    case 'java':
      if (analysis.packageManager === 'maven') {
        commands += 'mvn clean install   # Build project\n';
        commands += 'mvn test            # Run tests\n';
        if (analysis.framework === 'Spring Boot') commands += 'mvn spring-boot:run # Run application\n';
      } else {
        commands += 'gradle build        # Build project\n';
        commands += 'gradle test         # Run tests\n';
        if (analysis.framework === 'Spring Boot') commands += 'gradle bootRun      # Run application\n';
      }
      commands += '```';
      return commands;
    case 'python':
      commands += 'pip install -r requirements.txt   # Install deps\n';
      commands += (analysis.framework === 'Django') ? 'python manage.py runserver        # Run server\n' :
                   (analysis.framework === 'FastAPI' || analysis.framework === 'Flask') ? 'uvicorn app:app --reload         # Run dev server\n' : '';
      commands += 'pytest                           # Run tests\n';
      commands += '```';
      return commands;
    case 'go':
      commands += 'go build ./...        # Build\n';
      commands += 'go test ./...         # Tests\n';
      commands += 'go run ./cmd/...      # Run (example)\n';
      commands += '```';
      return commands;
    case 'ruby':
      commands += 'bundle install        # Install deps\n';
      commands += (analysis.framework === 'Rails') ? 'rails server           # Run server\n' : '';
      commands += (analysis.testFramework === 'RSpec') ? 'rspec                 # Run tests\n' : 'rake test             # Run tests\n';
      commands += '```';
      return commands;
    case 'php':
      commands += 'composer install      # Install deps\n';
      commands += (analysis.framework === 'Laravel') ? 'php artisan serve      # Run server\n' : '';
      commands += 'vendor/bin/phpunit    # Run tests\n';
      commands += '```';
      return commands;
    case 'rust':
      commands += 'cargo build           # Build\n';
      commands += 'cargo test            # Tests\n';
      commands += 'cargo run             # Run\n';
      commands += '```';
      return commands;
    case 'csharp':
      commands += 'dotnet build          # Build\n';
      commands += 'dotnet test           # Tests\n';
      commands += 'dotnet run            # Run\n';
      commands += '```';
      return commands;
    case 'scala':
      commands += 'sbt compile           # Build\n';
      commands += 'sbt test              # Tests\n';
      commands += 'sbt run               # Run\n';
      commands += '```';
      return commands;
    default:
      if (Object.keys(analysis.scripts).length === 0) {
        return 'No npm scripts defined';
      }
      const commandOrder = ['dev', 'start', 'build', 'test', 'lint', 'typecheck', 'coverage'];
      for (const cmd of commandOrder) {
        if ((analysis.scripts as any)[cmd]) {
          commands += `${analysis.packageManager} run ${cmd}  # ${describeCommand(cmd, (analysis.scripts as any)[cmd])}\n`;
        }
      }
      for (const [cmd, script] of Object.entries(analysis.scripts)) {
        if (!commandOrder.includes(cmd)) {
          commands += `${analysis.packageManager} run ${cmd}  # ${script.substring(0, 50)}${script.length > 50 ? '...' : ''}\n`;
        }
      }
      commands += '```';
      return commands;
  }
}

function describeArchitecture(analysis: ProjectAnalysis): string {
  if (analysis.architecture.includes('Spring Boot')) {
    return `
### Spring Boot Service Architecture
The project uses Spring Boot conventions:
- **Configuration**: application.yml/properties per service
- **Layers**: Controller → Service → Repository
- **Build**: ${analysis.buildTool || 'Maven/Gradle'} with ${analysis.testFramework || 'JUnit'} tests
${analysis.architecture.includes('Microservices') ? '- **Topology**: Multiple modules/services (microservices)\n' : ''}`;
  }
  if (analysis.framework === 'Django') {
    return `
### Django MVC Architecture
- **Apps**: Modular apps with models, views, templates
- **ORM**: Django ORM for database access
- **Routing**: URLconf-based routing`;
  }
  if (analysis.framework === 'FastAPI' || analysis.framework === 'Flask') {
    return `
### Python REST API Architecture
- **Routing**: Decorator-based route handlers
- **Middleware**: Request processing chain
- **Data**: Pydantic/Marshmallow schemas`;
  }
  if (analysis.framework === 'Rails') {
    return `
### Rails MVC Architecture
- **Models**: ActiveRecord ORM
- **Controllers/Views**: Conventional structure with routing
- **Tasks**: Rake-based automation`;
  }
  if (analysis.framework === 'Laravel' || analysis.framework === 'Symfony') {
    return `
### PHP Web Architecture
- **MVC**: Controllers, models, views
- **Routing**: Framework router
- **Artisan/Console**: CLI tooling`;
  }
  if (analysis.language === 'go') {
    return `
### Go Service Architecture
- **Handlers**: HTTP handlers with router (Gin/Echo/net/http)
- **Services**: Business logic in packages
- **Build**: Single binary via go build`;
  }
  if (analysis.language === 'rust') {
    return `
### Rust Web Service Architecture
- **Framework**: ${analysis.framework || 'Actix/Axum/Rocket'}
- **Async**: Tokio runtime
- **Testing**: cargo test`;
  }
  if (analysis.language === 'csharp') {
    return `
### ASP.NET Core Architecture
- **Controllers**: MVC/Web API controllers
- **Dependency Injection**: Built-in DI
- **Configuration**: appsettings.json per environment`;
  }
  if (analysis.architecture === 'Domain-Driven Design (DDD)') {
    return `
### Domain-Driven Design Architecture
The project follows DDD principles with clear separation between:
- **Domain Layer**: Business logic and domain models
- **Application Layer**: Use cases and application services  
- **Infrastructure Layer**: External dependencies and integrations
- **Presentation Layer**: API endpoints or UI components
`;
  }
  
  if (analysis.architecture === 'MVC Architecture') {
    return `
### MVC Architecture Pattern
The project implements Model-View-Controller pattern:
- **Models**: Data structures and business logic
- **Views**: Presentation layer and templates
- **Controllers**: Request handling and routing
`;
  }
  
  if (analysis.architecture.includes('API')) {
    return `
### RESTful API Architecture
The project provides REST API services with:
- **Endpoints**: Resource-based URL structure
- **Middleware**: Request processing pipeline
- **Services**: Business logic implementation
- **Data Access**: Database integration layer
`;
  }
  
  return '';
}

function describeDependency(dep: string): string {
  const descriptions: Record<string, string> = {
    '@modelcontextprotocol/sdk': 'MCP SDK for AI tool integration',
    'express': 'Web application framework',
    'fastify': 'High-performance web framework',
    'react': 'UI component library',
    'vue': 'Progressive JavaScript framework',
    'typescript': 'TypeScript language support',
    'inversify': 'Dependency injection container',
    'handlebars': 'Template engine',
    'i18next': 'Internationalization framework',
    'jest': 'JavaScript testing framework',
    'eslint': 'JavaScript linter',
    'prettier': 'Code formatter',
    'webpack': 'Module bundler',
    'vite': 'Fast build tool',
    'uuid': 'UUID generation library',
    'ajv': 'JSON schema validator',
    'axios': 'HTTP client library',
    'lodash': 'Utility library',
    'moment': 'Date manipulation library',
    'dotenv': 'Environment variable loader'
  };
  
  return descriptions[dep] || 'Project dependency';
}

function getFrameworkDescription(framework: string): string {
  const descriptions: Record<string, string> = {
    'Express.js': 'Minimal and flexible Node.js web application framework',
    'Fastify': 'Fast and low overhead web framework for Node.js',
    'React': 'JavaScript library for building user interfaces',
    'Vue.js': 'Progressive framework for building user interfaces',
    'Angular': 'Platform for building mobile and desktop web applications',
    'Next.js': 'React framework with server-side rendering and routing',
    'MCP SDK': 'Model Context Protocol SDK for AI agent integration'
  };
  
  return descriptions[framework] || 'Application framework';
}

function describeCommand(cmd: string, script: string): string {
  const descriptions: Record<string, string> = {
    'dev': 'Start development server with hot reload',
    'start': 'Start production server',
    'build': 'Build project for production',
    'test': 'Run test suite',
    'lint': 'Check code quality with linter',
    'typecheck': 'Validate TypeScript types',
    'coverage': 'Generate test coverage report'
  };
  
  return descriptions[cmd] || script.substring(0, 50);
}

function generateQualityAssurance(analysis: ProjectAnalysis): string {
  const qa = [];
  
  if (analysis.scripts.lint) {
    qa.push('- **Linting**: Automated code quality checks');
  }
  
  if (analysis.scripts.typecheck) {
    qa.push('- **Type Checking**: TypeScript compilation validation');
  }
  
  if (analysis.hasTests) {
    qa.push(`- **Testing**: ${analysis.testFramework || 'Test'} suite for unit and integration tests`);
  }
  
  if (analysis.scripts.coverage) {
    qa.push('- **Coverage**: Code coverage reporting and thresholds');
  }
  
  if (analysis.hasCI) {
    qa.push('- **CI/CD**: Automated quality gates in pipeline');
  }
  
  return qa.length > 0 ? qa.join('\n') : '- Quality assurance processes to be defined';
}

function generateDeploymentConfig(analysis: ProjectAnalysis): string {
  const config = [];
  
  if (analysis.hasDocker) {
    config.push('- **Containerization**: Docker support for consistent deployments');
  }
  
  if (analysis.scripts.build) {
    config.push(`- **Build Process**: \`${analysis.packageManager} run build\` for production artifacts`);
  }
  
  if (analysis.hasCI) {
    config.push('- **CI/CD Pipeline**: Automated deployment workflows');
  }
  
  if (analysis.type === 'ES Module') {
    config.push('- **Module System**: ES modules for modern JavaScript');
  }
  
  return config.length > 0 ? config.join('\n') : '- Deployment configuration to be defined';
}

function buildDirectoryTree(analysis: ProjectAnalysis): string {
  let tree = `├── .kiro/                    # SDD workflow files
│   ├── steering/            # Project steering documents
│   └── specs/              # Feature specifications\n`;
  
  for (const dir of analysis.directories.sort()) {
    tree += `├── ${dir}/                   # ${describeDirectory(dir)}\n`;
  }
  
  if (analysis.hasDocker) {
    tree += `├── Dockerfile              # Container configuration\n`;
  }
  
  if (analysis.language === 'java') {
    tree += `├── pom.xml or build.gradle # Build configuration\n`;
  } else {
    tree += `├── package.json            # Project configuration\n`;
  }
  
  if (analysis.language === 'java') {
    tree += `├── pom.xml or build.gradle # Build configuration\n`;
  } else if (analysis.language === 'python') {
    tree += `├── pyproject.toml / requirements.txt # Python config\n`;
  } else if (analysis.language === 'go') {
    tree += `├── go.mod                  # Go modules\n`;
  } else if (analysis.language === 'ruby') {
    tree += `├── Gemfile                 # Ruby dependencies\n`;
  } else if (analysis.language === 'php') {
    tree += `├── composer.json           # PHP dependencies\n`;
  } else if (analysis.language === 'rust') {
    tree += `├── Cargo.toml              # Rust package config\n`;
  } else if (analysis.language === 'csharp') {
    tree += `├── *.csproj                # .NET project file\n`;
  } else if (analysis.language === 'scala') {
    tree += `├── build.sbt               # SBT build\n`;
  } else {
    tree += `├── package.json            # Project configuration\n`;
  }
  
  if (analysis.language === 'typescript') {
    tree += `├── tsconfig.json           # TypeScript configuration\n`;
  }
  
  tree += `└── README.md               # Project documentation`;
  
  return tree;
}

function describeDirectory(dir: string): string {
  const descriptions: Record<string, string> = {
    'src': 'Source code',
    'dist': 'Build output',
    'build': 'Build artifacts',
    'test': 'Test files',
    'tests': 'Test suites',
    '__tests__': 'Jest test files',
    'spec': 'Test specifications',
    'docs': 'Documentation',
    'public': 'Static assets',
    'assets': 'Media and resources',
    'config': 'Configuration files',
    'scripts': 'Build and utility scripts',
    'lib': 'Library code',
    'bin': 'Executable scripts',
    'examples': 'Example code',
    'domain': 'Domain logic (DDD)',
    'infrastructure': 'External integrations',
    'application': 'Application services',
    'presentation': 'UI components',
    'controllers': 'Request handlers',
    'models': 'Data models',
    'views': 'View templates',
    'services': 'Business services',
    'utils': 'Utility functions',
    'helpers': 'Helper functions',
    'middleware': 'Express middleware',
    'routes': 'API routes',
    'api': 'API endpoints'
  };
  
  return descriptions[dir] || 'Project directory';
}

function identifyPatterns(analysis: ProjectAnalysis): Array<{pattern: string, description: string}> {
  const patterns = [];
  
  if (analysis.architecture.includes('DDD')) {
    patterns.push({
      pattern: 'Domain-Driven Design',
      description: 'Business logic isolated in domain layer'
    });
  }
  
  if (analysis.dependencies.includes('inversify')) {
    patterns.push({
      pattern: 'Dependency Injection',
      description: 'IoC container for managing dependencies'
    });
  }
  
  if (analysis.architecture.includes('MVC')) {
    patterns.push({
      pattern: 'Model-View-Controller',
      description: 'Separation of concerns between data, presentation, and control'
    });
  }
  
  if (analysis.directories.includes('middleware')) {
    patterns.push({
      pattern: 'Middleware Pipeline',
      description: 'Request processing through middleware chain'
    });
  }
  
  if (analysis.hasTests) {
    patterns.push({
      pattern: 'Test-Driven Development',
      description: 'Tests alongside implementation code'
    });
  }
  
  return patterns;
}

function extractConventions(analysis: ProjectAnalysis): {naming: string[]} {
  const naming = [];
  
  if (analysis.language === 'typescript') {
    naming.push('TypeScript files: `.ts` extension');
    naming.push('Type definition files: `.d.ts` extension');
  } else {
    naming.push('JavaScript files: `.js` extension');
  }
  
  naming.push('Test files: `.test.ts` or `.spec.ts` suffix');
  naming.push('Configuration files: `.json` or `.config.js` format');
  
  if (analysis.framework?.includes('React')) {
    naming.push('React components: PascalCase (e.g., `UserProfile.tsx`)');
  }
  
  naming.push('Directories: lowercase with hyphens (e.g., `user-service`)');
  naming.push('Constants: UPPER_SNAKE_CASE');
  naming.push('Functions/Variables: camelCase');
  naming.push('Classes/Types: PascalCase');
  
  return { naming };
}

function describeKeyDirectories(analysis: ProjectAnalysis): string {
  const descriptions = [];
  
  if (analysis.directories.includes('src')) {
    descriptions.push('- **src/**: Main source code directory containing application logic');
  }
  
  if (analysis.directories.includes('dist') || analysis.directories.includes('build')) {
    descriptions.push('- **dist/build/**: Compiled output for production deployment');
  }
  
  if (analysis.hasTests) {
    const testDir = analysis.directories.find(d => ['test', 'tests', '__tests__'].includes(d));
    if (testDir) {
      descriptions.push(`- **${testDir}/**: Test suites and test utilities`);
    }
  }
  
  if (analysis.directories.includes('domain')) {
    descriptions.push('- **domain/**: Core business logic and domain models');
  }
  
  if (analysis.directories.includes('infrastructure')) {
    descriptions.push('- **infrastructure/**: External service integrations and adapters');
  }
  
  return descriptions.join('\n');
}

function describeModuleOrganization(analysis: ProjectAnalysis): string {
  if (analysis.architecture.includes('DDD')) {
    return `### Domain-Driven Modules
- Each domain has its own module with models, services, and repositories
- Clear boundaries between different domains
- Dependency flow from infrastructure → application → domain`;
  }
  
  if (analysis.type === 'ES Module') {
    return `### ES Module Organization
- ES6 module syntax with import/export
- Barrel exports through index files
- Tree-shaking enabled for optimized bundles`;
  }
  
  return `### Module Structure
- Logical grouping of related functionality
- Clear import/export boundaries
- Minimal circular dependencies`;
}

function generateArchitecturalPrinciples(analysis: ProjectAnalysis): Array<{principle: string, description: string}> {
  const principles = [];
  
  principles.push({
    principle: 'Separation of Concerns',
    description: 'Each module handles a specific responsibility'
  });
  
  if (analysis.language === 'typescript') {
    principles.push({
      principle: 'Type Safety',
      description: 'Leverage TypeScript for compile-time type checking'
    });
  }
  
  if (analysis.hasTests) {
    principles.push({
      principle: 'Testability',
      description: 'Code designed for easy unit and integration testing'
    });
  }
  
  if (analysis.dependencies.includes('inversify')) {
    principles.push({
      principle: 'Dependency Inversion',
      description: 'Depend on abstractions, not concrete implementations'
    });
  }
  
  return principles;
}

function generateDevelopmentPatterns(analysis: ProjectAnalysis): string[] {
  const patterns = [];
  
  if (analysis.scripts.dev) {
    patterns.push('Hot module replacement for rapid development');
  }
  
  if (analysis.scripts.lint) {
    patterns.push('Automated code quality checks on commit');
  }
  
  if (analysis.language === 'typescript') {
    patterns.push('Strict TypeScript configuration for maximum safety');
  }
  
  if (analysis.hasTests) {
    patterns.push('Test files co-located with source code');
  }
  
  return patterns;
}

function describeTestingStructure(analysis: ProjectAnalysis): string {
  if (!analysis.hasTests) {
    return 'Testing structure to be implemented';
  }
  
  let structure = '';
  
  if (analysis.testFramework === 'Jest') {
    structure += `### Jest Testing Framework
- Unit tests: \`*.test.ts\` files alongside source code
- Integration tests: \`__tests__/integration\` directory
- Test configuration: \`jest.config.js\`
- Coverage reports: \`coverage/\` directory`;
  } else if (analysis.testFramework) {
    structure += `### ${analysis.testFramework} Testing
- Test files organized in test directory
- Unit and integration test separation
- Test utilities and fixtures`;
  } else {
    structure += `### Testing Structure
- Test files in dedicated test directory
- Separation between unit and integration tests`;
  }
  
  return structure;
}

function describeBuildOutput(analysis: ProjectAnalysis): string {
  if (!analysis.scripts.build) {
    return 'No build process configured';
  }
  
  let output = `### Build Process
- Command: \`${analysis.packageManager} run build\`\n`;
  
  if (analysis.directories.includes('dist')) {
    output += '- Output directory: `dist/`\n';
  } else if (analysis.directories.includes('build')) {
    output += '- Output directory: `build/`\n';
  }
  
  if (analysis.buildTool) {
    output += `- Build tool: ${analysis.buildTool}\n`;
  }
  
  if (analysis.language === 'typescript') {
    output += '- TypeScript compilation to JavaScript\n';
    output += '- Source maps for debugging\n';
  }
  
  return output;
}

function getNodeVersion(): string {
  try {
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      if (packageJson.engines?.node) {
        return packageJson.engines.node;
      }
    }
  } catch (error) {
    // Ignore
  }
  return '>= 18.0.0';
}

function projectPathFromCwd(): string {
  try { return process.cwd(); } catch { return '.'; }
}

function getGoVersion(projectPath: string): string {
  try {
    const gomod = path.join(projectPath, 'go.mod');
    if (fs.existsSync(gomod)) {
      const content = fs.readFileSync(gomod, 'utf8');
      const m = content.match(/^go\s+([0-9.]+)/m);
      if (m) return `Go ${m[1]}`;
    }
  } catch {}
  return 'Go (version unknown)';
}

function getPythonVersion(projectPath: string): string {
  try {
    const pyproject = path.join(projectPath, 'pyproject.toml');
    if (fs.existsSync(pyproject)) {
      const txt = fs.readFileSync(pyproject, 'utf8');
      const m = txt.match(/python\s*[=><~!]*\s*['"]([^'"]+)['"]/i);
      if (m) return `Python ${m[1]}`;
    }
    const vfile = path.join(projectPath, '.python-version');
    if (fs.existsSync(vfile)) {
      return `Python ${fs.readFileSync(vfile, 'utf8').trim()}`;
    }
  } catch {}
  return 'Python (version unknown)';
}

function getRubyVersion(projectPath: string): string {
  try {
    const rv = path.join(projectPath, '.ruby-version');
    if (fs.existsSync(rv)) return `Ruby ${fs.readFileSync(rv, 'utf8').trim()}`;
    const gem = path.join(projectPath, 'Gemfile');
    if (fs.existsSync(gem)) {
      const txt = fs.readFileSync(gem, 'utf8');
      const m = txt.match(/ruby\s+['"]([^'"]+)['"]/i);
      if (m) return `Ruby ${m[1]}`;
    }
  } catch {}
  return 'Ruby (version unknown)';
}

function getPhpVersion(projectPath: string): string {
  try {
    const composer = path.join(projectPath, 'composer.json');
    if (fs.existsSync(composer)) {
      const pkg = JSON.parse(fs.readFileSync(composer, 'utf8'));
      const req = pkg.require || {};
      if (req.php) return `PHP ${req.php}`;
    }
  } catch {}
  return 'PHP (version unknown)';
}

function getRustToolchain(projectPath: string): string {
  try {
    const tool = path.join(projectPath, 'rust-toolchain');
    if (fs.existsSync(tool)) return `Rust ${fs.readFileSync(tool, 'utf8').trim()}`;
    const cargo = path.join(projectPath, 'Cargo.toml');
    if (fs.existsSync(cargo)) {
      const txt = fs.readFileSync(cargo, 'utf8');
      const m = txt.match(/edition\s*=\s*"(\d{4})"/);
      if (m) return `Rust (edition ${m[1]})`;
    }
  } catch {}
  return 'Rust (toolchain unknown)';
}

function getDotnetTarget(projectPath: string): string {
  try {
    const files = fs.readdirSync(projectPath).filter(f => f.endsWith('.csproj'));
    for (const f of files) {
      const txt = fs.readFileSync(path.join(projectPath, f), 'utf8');
      const m = txt.match(/<TargetFramework>([^<]+)<\/TargetFramework>/);
      if (m) return m[1];
    }
  } catch {}
  return '.NET (target unknown)';
}

function getJavaVersion(projectPath: string): string {
  try {
    const pomPath = path.join(projectPath, 'pom.xml');
    if (fs.existsSync(pomPath)) {
      const pom = fs.readFileSync(pomPath, 'utf8');
      const m = pom.match(/<maven\.compiler\.source>([^<]+)<\/maven\.compiler\.source>/);
      const v = m?.[1] || (pom.match(/<java\.version>([^<]+)<\/java\.version>/)?.[1]);
      if (v) return `JDK ${v}`;
    }
    const gradlePath = fs.existsSync(path.join(projectPath, 'build.gradle.kts')) ? path.join(projectPath, 'build.gradle.kts') : path.join(projectPath, 'build.gradle');
    if (fs.existsSync(gradlePath)) {
      const gradle = fs.readFileSync(gradlePath, 'utf8');
      const m = gradle.match(/sourceCompatibility\s*=\s*['"]([^'"]+)['"]/i) || gradle.match(/sourceCompatibility\s+['"]([^'"]+)['"]/i);
      if (m?.[1]) return `JDK ${m[1]}`;
    }
  } catch {}
  return 'JDK (version unknown)';
}
