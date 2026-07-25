import path from 'node:path';
import { FileSystemPort } from '../../domain/ports.js';

export class InvalidFeatureNameError extends Error {
  readonly code = 'InvalidFeatureName';

  constructor(featureName: string) {
    super(`Invalid feature name: ${featureName}`);
    this.name = 'InvalidFeatureNameError';
  }
}

export class SpecPathEscapeError extends Error {
  readonly code = 'SpecPathEscape';

  constructor(candidate: string) {
    super(`Spec path escapes the project specification root: ${candidate}`);
    this.name = 'SpecPathEscapeError';
  }
}

export interface ResolvedSpecPaths {
  readonly projectRoot: string;
  readonly specsRoot: string;
  readonly featureRoot: string;
}

export function validateFeatureName(featureName: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(featureName) || featureName === '.' || featureName === '..') {
    throw new InvalidFeatureNameError(featureName);
  }
}

/** Resolves feature paths and rejects lexical and symlink escapes before I/O. */
export class SpecPathResolver {
  constructor(private readonly fileSystem: FileSystemPort) {}

  async resolve(projectRoot: string, featureName: string): Promise<ResolvedSpecPaths> {
    validateFeatureName(featureName);

    const absoluteProject = path.resolve(projectRoot);
    const specsRoot = path.join(absoluteProject, '.spec', 'specs');
    const featureRoot = path.join(specsRoot, featureName);
    if (!this.isContained(specsRoot, featureRoot)) {
      throw new SpecPathEscapeError(featureRoot);
    }

    const canonicalProject = await this.canonicalExisting(absoluteProject);
    const canonicalSpecs = await this.canonicalExisting(specsRoot);
    if (!this.isContained(canonicalProject, canonicalSpecs)) {
      throw new SpecPathEscapeError(specsRoot);
    }
    if (await this.fileSystem.exists(featureRoot)) {
      const canonicalFeature = await this.canonicalExisting(featureRoot);
      if (!this.isContained(canonicalSpecs, canonicalFeature)) {
        throw new SpecPathEscapeError(featureRoot);
      }
    }

    return { projectRoot: canonicalProject, specsRoot: canonicalSpecs, featureRoot };
  }

  async assertContained(root: string, candidate: string): Promise<void> {
    if (!this.isContained(root, candidate)) {
      throw new SpecPathEscapeError(candidate);
    }
    if (await this.fileSystem.exists(candidate)) {
      const [canonicalRoot, canonicalCandidate] = await Promise.all([
        this.canonicalExisting(root),
        this.canonicalExisting(candidate),
      ]);
      if (!this.isContained(canonicalRoot, canonicalCandidate)) {
        throw new SpecPathEscapeError(candidate);
      }
    }
  }

  private async canonicalExisting(candidate: string): Promise<string> {
    return this.fileSystem.realpath ? this.fileSystem.realpath(candidate) : path.resolve(candidate);
  }

  private isContained(root: string, candidate: string): boolean {
    const relative = path.relative(path.resolve(root), path.resolve(candidate));
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
  }
}
