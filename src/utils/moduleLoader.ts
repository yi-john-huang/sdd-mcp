/**
 * Unified Module Loader
 *
 * Provides cross-context compatible module loading for documentGenerator and specGenerator.
 * This loader tries multiple import paths in sequence to handle different execution contexts:
 * - npx execution (root-level modules)
 * - Built distribution (dist/utils/)
 * - Development mode (src/utils/)
 * - Alternative paths (parent directory)
 *
 * @module moduleLoader
 */

/**
 * Interface for the documentGenerator module
 */
export interface DocumentGeneratorModule {
  analyzeProject(projectPath: string): Promise<ProjectAnalysis>;
  generateProductDocument(analysis: ProjectAnalysis): string;
  generateTechDocument(analysis: ProjectAnalysis): string;
  generateStructureDocument(analysis: ProjectAnalysis): string;
}

/**
 * Interface for the specGenerator module
 */
export interface SpecGeneratorModule {
  generateRequirementsDocument(projectPath: string, featureName: string): Promise<string>;
  generateDesignDocument(projectPath: string, featureName: string): Promise<string>;
  generateTasksDocument(projectPath: string, featureName: string): Promise<string>;
}

/**
 * Project analysis structure (from documentGenerator)
 */
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
 * Load the documentGenerator module using fallback path resolution
 *
 * Attempts to load the module from multiple paths in priority order:
 * 1. ./utils/documentGenerator.js - Compiled TypeScript in dist/utils/
 * 2. ../utils/documentGenerator.js - From subdirectory (e.g., dist/tools/)
 * 3. ./documentGenerator.js - Root-level published package
 * 4. ../documentGenerator.js - Alternative root-level
 *
 * @returns The documentGenerator module with all export functions
 * @throws Error if all import paths fail, with details of all attempts
 */
export async function loadDocumentGenerator(): Promise<DocumentGeneratorModule> {
  const paths = [
    './utils/documentGenerator.js',    // Priority 1: Compiled TS in dist/utils/
    '../utils/documentGenerator.js',   // Priority 2: From subdirectory
    './documentGenerator.js',          // Priority 3: Root-level package
    '../documentGenerator.js'          // Priority 4: Alternative root
  ];

  const errors: string[] = [];

  for (const path of paths) {
    try {
      const module = await import(path);
      console.error(`[SDD-DEBUG] ✅ Loaded documentGenerator from: ${path}`);
      return module as DocumentGeneratorModule;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      errors.push(`${path}: ${errorMessage}`);
    }
  }

  // All paths failed
  throw new Error(
    `Failed to load documentGenerator. Attempted paths:\n${errors.map(e => `  - ${e}`).join('\n')}`
  );
}

/**
 * Load the specGenerator module using fallback path resolution
 *
 * Attempts to load the module from multiple paths in priority order:
 * 1. ./utils/specGenerator.js - Compiled TypeScript in dist/utils/
 * 2. ../utils/specGenerator.js - From subdirectory
 * 3. ./specGenerator.js - Root-level published package
 * 4. ../specGenerator.js - Alternative root-level
 *
 * @returns The specGenerator module with all export functions
 * @throws Error if all import paths fail, with details of all attempts
 */
export async function loadSpecGenerator(): Promise<SpecGeneratorModule> {
  const paths = [
    './utils/specGenerator.js',        // Priority 1: Compiled TS in dist/utils/
    '../utils/specGenerator.js',       // Priority 2: From subdirectory
    './specGenerator.js',              // Priority 3: Root-level package
    '../specGenerator.js'              // Priority 4: Alternative root
  ];

  const errors: string[] = [];

  for (const path of paths) {
    try {
      const module = await import(path);
      console.error(`[SDD-DEBUG] ✅ Loaded specGenerator from: ${path}`);
      return module as SpecGeneratorModule;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      errors.push(`${path}: ${errorMessage}`);
    }
  }

  // All paths failed
  throw new Error(
    `Failed to load specGenerator. Attempted paths:\n${errors.map(e => `  - ${e}`).join('\n')}`
  );
}
