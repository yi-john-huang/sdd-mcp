import path from 'node:path';
import type { FileSystemPort, GitPort } from '../../domain/ports.js';
import type { JevCheckResult } from './JevCheckTypes.js';
import { buildStagedManifest } from './JevChangeManifest.js';
import { renderCommitWarning } from './JevReport.js';
import { skippedResult } from './JevResults.js';
import type { JevSidecarStore } from './JevSidecarStore.js';
import { validateFeatureName } from './SpecPathResolver.js';

const MAX_FEATURES_SCANNED = 200;
const SERIOUS = new Set(['high', 'critical']);

/**
 * Read-only: shows one warning when a saved code review of exactly the staged change holds a
 * confirmed high or critical finding. It never contacts JEV, needs no key, and writes nothing.
 */
export class JevCommitLookup {
  constructor(
    private readonly fileSystem: FileSystemPort,
    private readonly git: GitPort,
    private readonly store: JevSidecarStore,
  ) {}

  async run(projectRoot: string): Promise<JevCheckResult> {
    // Cheap local scan first: with no review sidecar there is nothing to match, so skip git entirely.
    const locations = await this.locationsWithSidecars(projectRoot);
    if (locations.length === 0) return skippedResult('commit', 'not-ready');
    const staged = await buildStagedManifest(this.git, projectRoot);
    if (staged.status !== 'ok') return skippedResult('commit', 'not-ready');

    const flagged: string[] = [];
    for (const featureName of locations) {
      const sidecar = await this.store.findByDiff(projectRoot, featureName, 'security', staged.diffSha256);
      for (const item of sidecar?.items ?? []) {
        if (item.classification === 'confirmed' && SERIOUS.has(item.jevSeverity ?? '')) flagged.push(item.id);
      }
    }
    if (flagged.length === 0) return skippedResult('commit', 'not-ready');
    return {
      check: 'commit', status: 'answered', line: renderCommitWarning(flagged.length), flagged,
      details: flagged.map((id) => ({ id, flagged: true })), persisted: false, truncated: false, redactions: 0,
    };
  }

  /** `undefined` stands for the feature-less `.spec/reviews` location. */
  private async locationsWithSidecars(projectRoot: string): Promise<Array<string | undefined>> {
    const found: Array<string | undefined> = [];
    try {
      if ((await this.store.listReviewSidecars(projectRoot, undefined, 'security')).length > 0) found.push(undefined);
      const specsRoot = path.join(path.resolve(projectRoot), '.spec', 'specs');
      if (!(await this.fileSystem.exists(specsRoot))) return found;
      for (const name of (await this.fileSystem.readdir(specsRoot)).sort().slice(0, MAX_FEATURES_SCANNED)) {
        try {
          validateFeatureName(name);
        } catch {
          continue;
        }
        if ((await this.store.listReviewSidecars(projectRoot, name, 'security')).length > 0) found.push(name);
      }
    } catch {
      // A scan problem means no warning, never an error at commit time.
    }
    return found;
  }
}
