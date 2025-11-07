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
 * The loader supports both TypeScript (.ts) and JavaScript (.js, .mjs, .cjs) extensions
 * for cross-context compatibility.
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
  generateRequirementsDocument(
    projectPath: string,
    featureName: string,
  ): Promise<string>;
  generateDesignDocument(
    projectPath: string,
    featureName: string,
  ): Promise<string>;
  generateTasksDocument(
    projectPath: string,
    featureName: string,
  ): Promise<string>;
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
 * File extensions to try when loading modules
 * Order matters: .js first for production builds, .ts for development
 */
const EXTENSIONS = [".js", ".ts", ".mjs", ".cjs"] as const;

/**
 * Compute base paths for module resolution
 * Returns relative paths that work in both dev (tsx) and prod (node) contexts
 */
function computeBasePaths(target: string): string[] {
  return [
    `./utils/${target}`, // Same directory utils/ subfolder
    `./${target}`, // Same directory
    `../${target}`, // Parent directory (for root-level modules)
    `../utils/${target}`, // Parent utils/ (typical case from dist/X to dist/utils/)
  ];
}

/**
 * Generic module loader with cross-context support
 * Tries multiple paths with multiple extensions
 */
async function loadModule<T>(
  target: "documentGenerator" | "specGenerator",
): Promise<T> {
  const basePaths = computeBasePaths(target);
  const errors: string[] = [];

  for (const basePath of basePaths) {
    for (const ext of EXTENSIONS) {
      const fullPath = `${basePath}${ext}`;

      try {
        console.error(`[SDD-DEBUG] ModuleLoader attempting: ${fullPath}`);
        const module = await import(fullPath);
        console.error(`[SDD-DEBUG] ✅ Loaded ${target} from: ${fullPath}`);
        return module as T;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        errors.push(`${fullPath}: ${errorMessage}`);
      }
    }
  }

  // All paths failed
  throw new Error(
    `Failed to load ${target}. Attempted paths:\n${errors.map((e) => `  - ${e}`).join("\n")}`,
  );
}

/**
 * Load the documentGenerator module using cross-context path resolution
 *
 * Attempts to load the module from multiple paths with multiple extensions.
 * Supports both TypeScript (.ts) and JavaScript (.js, .mjs, .cjs) files.
 *
 * @returns The documentGenerator module with all export functions
 * @throws Error if all import paths fail, with details of all attempts
 */
export async function loadDocumentGenerator(): Promise<DocumentGeneratorModule> {
  return loadModule<DocumentGeneratorModule>("documentGenerator");
}

/**
 * Load the specGenerator module using cross-context path resolution
 *
 * Attempts to load the module from multiple paths with multiple extensions.
 * Supports both TypeScript (.ts) and JavaScript (.js, .mjs, .cjs) files.
 *
 * @returns The specGenerator module with all export functions
 * @throws Error if all import paths fail, with details of all attempts
 */
export async function loadSpecGenerator(): Promise<SpecGeneratorModule> {
  return loadModule<SpecGeneratorModule>("specGenerator");
}
