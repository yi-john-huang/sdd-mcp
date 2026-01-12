import { mkdtemp, readFile, rm, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ensureStaticSteeringDocuments } from '../../../application/services/staticSteering.ts';
import type { SteeringDocument } from '../../../domain/context/ProjectContext.js';

class StubSteeringDocumentService {
  async createSteeringDocument(
    projectPath: string,
    config: { name: string; type: string; mode: string; content: string }
  ): Promise<SteeringDocument> {
    const filePath = path.join(projectPath, '.spec', 'steering', config.name);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, config.content, 'utf8');

    return {
      name: config.name,
      path: filePath,
      type: config.type as any,
      mode: config.mode as any,
      content: config.content,
      patterns: [],
      priority: 50,
      lastModified: new Date(),
      isValid: true
    };
  }
}

describe('SDDToolAdapter static steering documents', () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await mkdtemp(path.join(os.tmpdir(), 'sdd-steering-'));
    await mkdir(path.join(projectRoot, '.spec', 'steering'), { recursive: true });
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('creates the full static steering set when missing', async () => {
    await ensureStaticSteeringDocuments(projectRoot, new StubSteeringDocumentService() as any);

    const steeringDir = path.join(projectRoot, '.spec', 'steering');

    const files = await Promise.all([
      readFile(path.join(steeringDir, 'security-check.md'), 'utf8'),
      readFile(path.join(steeringDir, 'tdd-guideline.md'), 'utf8'),
      readFile(path.join(steeringDir, 'principles.md'), 'utf8')
    ]);

    expect(files[0]).toContain('OWASP Top 10');
    expect(files[1]).toContain('Test-Driven Development');
    expect(files[2]).toContain('SOLID');
  });
});
