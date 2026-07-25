import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  analyzeProject,
  extractDevCommands,
  generateProductDocument,
  generateStructureDocument,
  generateTechDocument,
  type ProjectAnalysis,
} from '../../../utils/documentGenerator';

const baseAnalysis = (overrides: Partial<ProjectAnalysis> = {}): ProjectAnalysis => ({
  name: 'checkout-service',
  description: 'Processes customer checkout requests',
  version: '1.2.3',
  type: 'ES Module',
  architecture: 'Domain-Driven Design (DDD)',
  dependencies: ['express', '@modelcontextprotocol/sdk', 'react', 'zod', 'inversify'],
  devDependencies: ['typescript', 'jest', 'eslint'],
  scripts: {
    dev: 'tsx watch src/index.ts',
    build: 'tsc',
    test: 'jest',
    lint: 'eslint src',
    start: 'node dist/index.js',
    typecheck: 'tsc --noEmit',
    coverage: 'jest --coverage',
    release: 'node scripts/create-a-release-with-a-deliberately-long-command-name.js',
  },
  directories: ['src', 'tests', 'docs', 'dist', 'config', 'scripts', 'middleware', 'controllers', 'models', 'views', 'api', 'unknown'],
  files: ['package.json', 'Dockerfile', 'README.md', 'tsconfig.json'],
  hasTests: true,
  hasDocker: true,
  hasCI: true,
  framework: 'MCP SDK',
  language: 'typescript',
  testFramework: 'Jest',
  buildTool: 'TypeScript Compiler',
  packageManager: 'npm',
  ...overrides,
});

describe('documentGenerator contracts', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'document-generator-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('analyzes a polyglot repository without losing filesystem capabilities', async () => {
    await writeFile(path.join(root, 'package.json'), JSON.stringify({
      name: 'polyglot-service',
      description: 'Polyglot fixture',
      version: '2.0.0',
      type: 'module',
      dependencies: { '@modelcontextprotocol/sdk': '^1.0.0' },
      devDependencies: { typescript: '^5.0.0', jest: '^29.0.0' },
      scripts: { build: 'tsc', test: 'jest' },
    }));
    await writeFile(path.join(root, 'tsconfig.json'), '{}');
    await writeFile(path.join(root, 'pom.xml'), '<modules><module>a</module><module>b</module></modules><dependency>spring-boot junit</dependency>');
    await writeFile(path.join(root, 'pyproject.toml'), 'fastapi\npytest\n');
    await writeFile(path.join(root, 'go.mod'), 'require github.com/gin-gonic/gin v1.0.0');
    await writeFile(path.join(root, 'Gemfile'), "gem 'rails'\ngem 'rspec'");
    await writeFile(path.join(root, 'composer.json'), JSON.stringify({ require: { 'laravel/framework': '*', 'phpunit/phpunit': '*' } }));
    await writeFile(path.join(root, 'Cargo.toml'), '[dependencies]\nactix-web = "4"');
    await writeFile(path.join(root, 'service.csproj'), '<TargetFramework>net8.0</TargetFramework>');
    await writeFile(path.join(root, 'build.sbt'), 'scalaVersion := "3.3.0"');
    await writeFile(path.join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 9');
    await writeFile(path.join(root, 'Dockerfile'), 'FROM node:24');
    await writeFile(path.join(root, 'Jenkinsfile'), 'pipeline {}');
    await mkdir(path.join(root, '.github', 'workflows'), { recursive: true });
    await mkdir(path.join(root, 'tests'), { recursive: true });
    await mkdir(path.join(root, 'src', 'domain'), { recursive: true });
    await mkdir(path.join(root, 'src', 'infrastructure'), { recursive: true });

    const analysis = await analyzeProject(root);

    expect(analysis).toMatchObject({
      name: 'polyglot-service',
      version: '2.0.0',
      language: 'scala',
      packageManager: 'pnpm',
      architecture: 'Domain-Driven Design (DDD)',
      hasTests: true,
      hasDocker: true,
      hasCI: true,
    });
    expect(analysis.directories).toEqual(expect.arrayContaining(['src', 'tests']));
    expect(analysis.files).toEqual(expect.arrayContaining(['package.json', 'Dockerfile']));
  });

  it.each([
    ['fastify', 'Fastify', 'webpack', 'Webpack', 'mocha', 'Mocha'],
    ['react', 'React', 'vite build', 'Vite', 'vitest', 'Vitest'],
    ['vue', 'Vue.js', 'rollup -c', 'Rollup', 'jest', 'Jest'],
    ['@angular/core', 'Angular', 'tsc', 'TypeScript Compiler', 'jest', 'Jest'],
    ['next', 'Next.js', 'webpack', 'Webpack', 'mocha', 'Mocha'],
    ['@modelcontextprotocol/sdk', 'MCP SDK', 'vite build', 'Vite', 'vitest', 'Vitest'],
  ])('detects %s projects with their build and test toolchains', async (
    dependency,
    framework,
    build,
    buildTool,
    testDependency,
    testFramework,
  ) => {
    await writeFile(path.join(root, 'package.json'), JSON.stringify({
      name: 'detected-project',
      dependencies: { [dependency]: '1.0.0' },
      devDependencies: { [testDependency]: '1.0.0' },
      scripts: { build },
    }));
    const analysis = await analyzeProject(root);
    expect(analysis.framework).toBe(framework);
    expect(analysis.buildTool).toBe(buildTool);
    expect(analysis.testFramework).toBe(testFramework);
  });

  it.each([
    { marker: 'build.gradle', content: "plugins { id 'org.springframework.boot' }\nsubprojects { }\ntestImplementation 'org.junit.jupiter'", expected: 'Spring Boot' },
    { marker: 'requirements.txt', content: 'flask\npytest', expected: 'Flask' },
    { marker: 'go.mod', content: 'module example.test/app\nrequire github.com/labstack/echo v4.0.0', expected: 'Echo' },
    { marker: 'Gemfile', content: "gem 'sinatra'\ngem 'rspec'", expected: 'Sinatra' },
    { marker: 'composer.json', content: '{"require":{"symfony/framework-bundle":"^7","phpunit/phpunit":"^12"}}', expected: 'Symfony' },
    { marker: 'Cargo.toml', content: '[dependencies]\nrocket = "1"', expected: 'Rocket' },
    { marker: 'Cargo.toml', content: '[dependencies]\naxum = "1"', expected: 'Axum' },
    { marker: 'checkout.csproj', content: '<Project/>', expected: 'ASP.NET Core' },
    { marker: 'build.sbt', content: 'scalaVersion := "3"', expected: 'Play?/Akka?' },
  ])('detects alternate $expected project markers', async ({ marker, content, expected }) => {
    await writeFile(path.join(root, marker), content);
    expect((await analyzeProject(root)).framework).toBe(expected);
  });

  it.each([
    ['yarn.lock', 'yarn'],
    ['pnpm-lock.yaml', 'pnpm'],
  ])('detects the %s package manager lock', async (lockFile, packageManager) => {
    await writeFile(path.join(root, lockFile), '');
    expect((await analyzeProject(root)).packageManager).toBe(packageManager);
  });

  it.each([
    [['controllers', 'models'], 'MVC Architecture'],
    [['components', 'pages'], 'Component-Based Architecture'],
  ])('detects source layout architecture %s', async (directories, architecture) => {
    for (const directory of directories) {
      await mkdir(path.join(root, 'src', directory), { recursive: true });
    }
    expect((await analyzeProject(root)).architecture).toBe(architecture);
  });

  it('renders product, technology, structure, and command guidance from one analysis', () => {
    const analysis = baseAnalysis();

    const product = generateProductDocument(analysis);
    const technology = generateTechDocument(analysis);
    const structure = generateStructureDocument(analysis);
    const commands = extractDevCommands(analysis);

    expect(product).toContain('checkout-service');
    expect(product).toContain('Processes customer checkout requests');
    expect(technology).toContain('TypeScript');
    expect(technology).toContain('Jest');
    expect(structure).toContain('Domain-Driven Design');
    expect(structure).toContain('src');
    expect(commands).toContain('npm run build');
    expect(commands).toContain('npm run test');
  });

  it.each([
    ['javascript', 'Express.js', 'npm', 'Webpack'],
    ['python', 'Django', 'poetry/pip', 'Poetry'],
    ['java', 'Spring Boot', 'maven', 'Maven'],
    ['go', 'Gin', 'go', 'Go Toolchain'],
    ['ruby', 'Rails', 'bundler', 'Rake'],
    ['php', 'Laravel', 'composer', 'Composer'],
    ['rust', 'Actix Web', 'cargo', 'Cargo'],
    ['csharp', 'ASP.NET Core', 'dotnet', '.NET SDK'],
    ['scala', 'Play?/Akka?', 'sbt', 'SBT'],
  ])('renders actionable technology guidance for %s projects', (language, framework, packageManager, buildTool) => {
    const analysis = baseAnalysis({
      language,
      framework,
      packageManager,
      buildTool,
      testFramework: language === 'go' ? 'go test' : 'Jest',
    });

    const document = generateTechDocument(analysis);
    const commands = extractDevCommands(analysis);
    const product = generateProductDocument(analysis);
    const structure = generateStructureDocument(analysis);

    expect(document).toContain(framework);
    expect(document.length).toBeGreaterThan(500);
    expect(product.length).toBeGreaterThan(300);
    expect(structure.length).toBeGreaterThan(500);
    expect(commands).toMatch(/^```bash\n/);
  });
  it.each([
    ['Spring Boot Microservices', 'java', 'Spring Boot'],
    ['MVC Architecture', 'php', 'Symfony'],
    ['REST API Architecture', 'python', 'FastAPI'],
    ['Frontend Architecture', 'javascript', 'React'],
    ['Service Architecture', 'go', 'Gin'],
  ])('renders architecture-specific guidance for %s', (architecture, language, framework) => {
    const analysis = baseAnalysis({
      architecture,
      language,
      framework,
      dependencies: ['express', 'fastify', 'react', 'vue', 'typescript', 'inversify', 'handlebars', 'i18next', 'jest', 'eslint', 'prettier', 'webpack', 'vite', 'uuid', 'ajv', 'axios', 'lodash'],
      devDependencies: ['typescript', 'jest', 'eslint', 'prettier', 'webpack', 'vite', 'uuid', 'ajv', 'axios', 'lodash', 'moment'],
    });
    expect(generateProductDocument(analysis)).toContain('Product Overview');
    expect(generateTechDocument(analysis)).toContain('Architecture');
    expect(generateStructureDocument(analysis)).toContain('Project Structure');
  });

  it('renders conservative fallbacks when project metadata is absent', () => {
    const analysis = baseAnalysis({
      description: '',
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
      packageManager: 'npm',
    });
    expect(generateProductDocument(analysis)).toContain('Core application functionality');
    expect(generateTechDocument(analysis)).toContain('Quality assurance processes to be defined');
    expect(generateStructureDocument(analysis)).toContain('Project Structure');
    expect(extractDevCommands(analysis)).toBe('No npm scripts defined');
  });
});
