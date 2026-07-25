import { mkdtemp, mkdir, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SteeringDocumentService } from '../../../application/services/SteeringDocumentService';
import {
  SteeringDocumentType,
  SteeringMode,
} from '../../../domain/context/ProjectContext';
import type { LoggerPort } from '../../../domain/ports';
import { NodeFileSystemAdapter } from '../../../infrastructure/adapters/NodeFileSystemAdapter';

const logger: LoggerPort = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

const pluginRegistry = {
  getSteeringDocumentsByMode: jest.fn(),
  getApplicableSteeringDocuments: jest.fn(),
};

describe('SteeringDocumentService contracts', () => {
  let root: string;
  let service: SteeringDocumentService;

  beforeEach(async () => {
    jest.clearAllMocks();
    root = await mkdtemp(path.join(tmpdir(), 'steering-service-'));
    await mkdir(path.join(root, '.spec'), { recursive: true });
    pluginRegistry.getSteeringDocumentsByMode.mockResolvedValue([]);
    pluginRegistry.getApplicableSteeringDocuments.mockResolvedValue([]);
    service = new SteeringDocumentService(
      new NodeFileSystemAdapter(),
      logger,
      {} as never,
      pluginRegistry as never,
    );
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('creates, loads, applies, refreshes, and summarizes every document type', async () => {
    for (const [name, type, mode] of [
      ['product.md', SteeringDocumentType.PRODUCT, SteeringMode.ALWAYS],
      ['tech.md', SteeringDocumentType.TECHNICAL, SteeringMode.ALWAYS],
      ['structure.md', SteeringDocumentType.STRUCTURE, SteeringMode.ALWAYS],
      ['linus-review.md', SteeringDocumentType.LINUS_REVIEW, SteeringMode.ALWAYS],
      ['api-test.md', SteeringDocumentType.CUSTOM, SteeringMode.CONDITIONAL],
    ] as const) {
      const created = await service.createSteeringDocument(root, {
        name,
        type,
        mode,
        patterns: name === 'api-test.md' ? ['src/api/*.ts'] : undefined,
      });
      expect(created.content.length).toBeGreaterThan(50);
    }

    await service.createSteeringDocument(root, {
      name: 'manual.md',
      type: SteeringDocumentType.CUSTOM,
      mode: SteeringMode.MANUAL,
      content: '# Manual guidance\n\nMode: Manual\n\nReference with @manual when a maintainer explicitly requests this document.',
    });
    await writeFile(path.join(root, '.spec', 'steering', 'invalid.md'), 'short');
    await writeFile(path.join(root, '.spec', 'steering', 'notes.txt'), 'ignored');

    pluginRegistry.getSteeringDocumentsByMode
      .mockResolvedValueOnce([{
        id: 'plugin-product', pluginId: 'sample', name: 'product', type: 'product', mode: SteeringMode.ALWAYS,
        content: '# Plugin product\n\n- Keep user workflows explicit and bounded.', patterns: [], priority: 95, lastUpdated: new Date(),
      }])
      .mockResolvedValueOnce([{
        id: 'plugin-quality', pluginId: 'sample', name: 'quality', type: 'quality', mode: SteeringMode.CONDITIONAL,
        template: '# Plugin quality\n\n- Prefer simple code without special cases.', patterns: ['*.ts'], priority: 75, lastUpdated: new Date(),
      }])
      .mockResolvedValueOnce([{
        id: 'plugin-custom', pluginId: 'sample', name: 'custom', type: 'custom', mode: SteeringMode.MANUAL,
        content: '# Plugin manual\n\n- Apply only on request.', patterns: [], priority: 25, lastUpdated: new Date(),
      }]);

    const context = await service.loadSteeringContext(root);
    expect(context.documents.length).toBe(10);
    expect(context.activeDocuments).toEqual(expect.arrayContaining(['product.md', 'tech.md', 'structure.md']));
    expect(context.activeDocuments).not.toContain('manual.md');
    expect(context.documents.find(({ name }) => name === 'invalid.md')?.isValid).toBe(false);

    pluginRegistry.getApplicableSteeringDocuments.mockResolvedValue([
      { applicable: true, content: 'Plugin applied', priority: 90, conflictsWith: [] },
      { applicable: false, content: 'Plugin skipped', priority: 10, conflictsWith: [] },
    ]);
    const applied = await service.applySteeringContext(context, {
      fileName: 'checkout.ts',
      filePath: 'src/api/checkout.ts',
      operation: 'review',
      language: 'typescript',
    });
    expect(applied.appliedDocuments).toEqual(expect.arrayContaining(['product.md', 'plugin:90']));
    expect(applied.skippedDocuments).toEqual(expect.arrayContaining(['manual.md', 'invalid.md']));
    expect(applied.context).toContain('Plugin applied');

    const unchanged = await service.refreshSteeringContext(root, context);
    expect(unchanged.documents).toHaveLength(7);

    await unlink(path.join(root, '.spec', 'steering', 'manual.md'));
    await writeFile(path.join(root, '.spec', 'steering', 'new-custom.md'), '# New custom guidance\n\nMode: Conditional\nPattern: *.ts\n\n- Keep the new path explicit and testable.');
    const refreshed = await service.refreshSteeringContext(root, context);
    expect(refreshed.documents.some(({ name }) => name === 'manual.md')).toBe(false);
    expect(refreshed.documents.some(({ name }) => name === 'new-custom.md')).toBe(true);

    const stats = await service.getSteeringStats(refreshed);
    expect(stats.totalDocuments).toBe(refreshed.documents.length);
    expect(stats.validDocuments).toBeGreaterThan(0);
  });

  it('returns an empty manual context when storage or plugins fail', async () => {
    const broken = new SteeringDocumentService(
      { exists: jest.fn().mockRejectedValue(new Error('offline')) } as never,
      logger,
      {} as never,
      pluginRegistry as never,
    );

    await expect(broken.loadSteeringContext(root)).resolves.toMatchObject({
      documents: [],
      activeDocuments: [],
      mode: SteeringMode.MANUAL,
    });
  });
});
