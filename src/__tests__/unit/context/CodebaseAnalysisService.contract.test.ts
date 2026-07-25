import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CodebaseAnalysisService } from '../../../application/services/CodebaseAnalysisService';
import type { LoggerPort } from '../../../domain/ports';
import { NodeFileSystemAdapter } from '../../../infrastructure/adapters/NodeFileSystemAdapter';

const logger: LoggerPort = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

describe('CodebaseAnalysisService contract', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'codebase-analysis-'));
    for (const directory of [
      'src/domain',
      'src/application',
      'src/infrastructure',
      'models',
      'views',
      'controllers',
      'service-orders',
      'service-payments',
      'tests',
      'config',
      'docs',
      'assets',
      'vendor',
    ]) {
      await mkdir(path.join(root, directory), { recursive: true });
    }
    await writeFile(path.join(root, 'package.json'), JSON.stringify({
      dependencies: { express: '^5.0.0', zod: '^4.0.0' },
      devDependencies: { jest: '^29.0.0' },
      peerDependencies: { typescript: '^5.0.0' },
    }));
    await writeFile(path.join(root, '.gitignore'), '# generated\ncoverage\n*.log\n');
    await writeFile(path.join(root, 'tsconfig.json'), '{}');
    await writeFile(path.join(root, 'requirements.txt'), 'fastapi');
    await writeFile(path.join(root, 'pom.xml'), '<project/>');
    await writeFile(path.join(root, 'build.gradle'), 'plugins {}');
    await writeFile(path.join(root, 'Cargo.toml'), '[package]');
    await writeFile(path.join(root, 'go.mod'), 'module example.test/app');
    await writeFile(path.join(root, 'webpack.config.js'), 'module.exports = {};');
    await writeFile(path.join(root, 'next.config.js'), 'export default {};');
    await writeFile(path.join(root, 'nuxt.config.js'), 'export default {};');
    await writeFile(path.join(root, 'angular.json'), '{}');
    await writeFile(path.join(root, 'vue.config.js'), 'module.exports = {};');
    await writeFile(path.join(root, 'docker-compose.yml'), 'services: {}');
    await writeFile(path.join(root, 'README.md'), '# Fixture');
    await writeFile(path.join(root, 'assets', 'logo.svg'), '<svg/>');
    await writeFile(path.join(root, 'config', 'app.config.json'), '{}');
    await writeFile(path.join(root, 'tests', 'checkout.test.ts'), 'if (true) { expect(true).toBe(true); }');
    await writeFile(path.join(root, 'src', 'index.ts'), "import express from 'express';\nimport { z } from 'zod';\nif (z) { console.log(express); }");
    await writeFile(path.join(root, 'src', 'worker.js'), "const fs = require('fs');\nif (fs) console.log(fs);");
    await writeFile(path.join(root, 'src', 'worker.py'), 'import fastapi\nfrom os import path\nif fastapi:\n  pass');
    await writeFile(path.join(root, 'src', 'Worker.java'), 'import org.springframework.App; class Worker { void run() { if (true) {} } }');
    await writeFile(path.join(root, 'src', 'worker.go'), 'package main\nfunc main() { if true {} }');
    await writeFile(path.join(root, 'src', 'worker.rs'), 'fn main() { if true {} }');
    await writeFile(path.join(root, 'src', 'worker.cpp'), 'int main() { if (true) return 0; }');
    await writeFile(path.join(root, 'src', 'Worker.cs'), 'class Worker { void Run() { if (true) {} } }');
    await writeFile(path.join(root, 'src', 'worker.php'), '<?php if (true) {}');
    await writeFile(path.join(root, 'src', 'worker.rb'), 'if true\nend');
    await writeFile(path.join(root, 'src', 'worker.swift'), 'if true {}');
    await writeFile(path.join(root, 'src', 'worker.kt'), 'fun main() { if (true) {} }');
    await writeFile(path.join(root, 'src', 'worker.dart'), 'void main() { if (true) {} }');
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('discovers structure, dependencies, technologies, architecture, and hotspots', async () => {
    const service = new CodebaseAnalysisService(new NodeFileSystemAdapter(), logger, {} as never);

    const result = await service.analyzeCodebase(root, { maxDepth: 10, skipPatterns: ['ignored-fixture'] });

    expect(result.structure.totalFiles).toBeGreaterThan(20);
    expect(result.structure.totalDirectories).toBeGreaterThan(10);
    expect(result.structure.gitIgnored).toEqual(['coverage', '*.log']);
    expect(result.dependencies.external.map(({ name }) => name)).toEqual(expect.arrayContaining(['express', 'zod']));
    expect(result.dependencies.devDependencies.map(({ name }) => name)).toContain('jest');
    expect(result.dependencies.peerDependencies.map(({ name }) => name)).toContain('typescript');
    expect(result.patterns.map(({ name }) => name)).toEqual(expect.arrayContaining([
      'clean',
      'mvc',
      'microservices',
    ]));
    expect(result.metrics.linesOfCode).toBeGreaterThan(0);
    expect(result.hotspots.length).toBeGreaterThan(0);
  });
});
