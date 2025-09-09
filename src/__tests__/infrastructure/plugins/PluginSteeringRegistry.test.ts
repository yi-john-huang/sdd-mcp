// Unit tests for PluginSteeringRegistry implementation

import 'reflect-metadata';
import { PluginSteeringRegistry } from '../../../infrastructure/plugins/PluginSteeringRegistry.js';
import { 
  SteeringDocumentType, 
  SteeringMode,
  SteeringVariable 
} from '../../../domain/plugins/index.js';
import { LoggerPort, FileSystemPort } from '../../../domain/ports.js';

describe('PluginSteeringRegistry', () => {
  let steeringRegistry: PluginSteeringRegistry;
  let mockLogger: jest.Mocked<LoggerPort>;
  let mockFileSystem: jest.Mocked<FileSystemPort>;

  beforeEach(() => {
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    mockFileSystem = {
      readFile: jest.fn(),
      writeFile: jest.fn(),
      exists: jest.fn(),
      mkdir: jest.fn(),
      readdir: jest.fn(),
      stat: jest.fn(),
      join: jest.fn((...args) => args.join('/')),
      basename: jest.fn((path) => path.split('/').pop() || ''),
      dirname: jest.fn((path) => path.split('/').slice(0, -1).join('/'))
    };

    steeringRegistry = new PluginSteeringRegistry(mockLogger, mockFileSystem);
  });

  describe('registerSteeringDocument', () => {
    it('should register steering document successfully', async () => {
      const declaration = {
        name: 'test-steering',
        type: SteeringDocumentType.CUSTOM,
        mode: SteeringMode.ALWAYS,
        priority: 100,
        patterns: ['*.ts'],
        template: 'Test steering content: {{projectName}}',
        variables: [{
          name: 'projectName',
          type: 'string',
          description: 'The project name',
          required: true
        }]
      };

      await steeringRegistry.registerSteeringDocument('test-plugin', declaration);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Steering document registered successfully',
        expect.objectContaining({
          documentId: 'test-plugin:test-steering',
          pluginId: 'test-plugin',
          type: SteeringDocumentType.CUSTOM,
          mode: SteeringMode.ALWAYS,
          priority: 100
        })
      );

      const documents = await steeringRegistry.getSteeringDocumentsByPlugin('test-plugin');
      expect(documents).toHaveLength(1);
      expect(documents[0].name).toBe('test-steering');
    });

    it('should replace existing document from same plugin', async () => {
      const declaration1 = {
        name: 'test-steering',
        type: SteeringDocumentType.CUSTOM,
        mode: SteeringMode.ALWAYS,
        priority: 100,
        patterns: [],
        template: 'Original content',
        variables: []
      };

      const declaration2 = {
        name: 'test-steering',
        type: SteeringDocumentType.TECHNICAL,
        mode: SteeringMode.CONDITIONAL,
        priority: 200,
        patterns: ['*.test.ts'],
        template: 'Updated content',
        variables: []
      };

      await steeringRegistry.registerSteeringDocument('test-plugin', declaration1);
      await steeringRegistry.registerSteeringDocument('test-plugin', declaration2);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Steering document already registered, replacing',
        expect.objectContaining({
          documentId: 'test-plugin:test-steering',
          pluginId: 'test-plugin'
        })
      );

      const documents = await steeringRegistry.getSteeringDocumentsByPlugin('test-plugin');
      expect(documents).toHaveLength(1);
      expect(documents[0].type).toBe(SteeringDocumentType.TECHNICAL);
      expect(documents[0].priority).toBe(200);
    });

    it('should validate declaration', async () => {
      const invalidDeclaration = {
        name: '', // Invalid: empty name
        type: SteeringDocumentType.CUSTOM,
        mode: SteeringMode.ALWAYS,
        priority: 1500, // Invalid: priority too high
        patterns: [],
        template: 'content',
        variables: []
      };

      await expect(
        steeringRegistry.registerSteeringDocument('test-plugin', invalidDeclaration)
      ).rejects.toThrow('Steering document name is required');
    });

    it('should validate conditional documents have patterns', async () => {
      const conditionalWithoutPatterns = {
        name: 'conditional-steering',
        type: SteeringDocumentType.CUSTOM,
        mode: SteeringMode.CONDITIONAL,
        priority: 100,
        patterns: [], // Invalid: conditional must have patterns
        template: 'content',
        variables: []
      };

      await expect(
        steeringRegistry.registerSteeringDocument('test-plugin', conditionalWithoutPatterns)
      ).rejects.toThrow('Conditional steering documents must specify at least one pattern');
    });

    it('should validate pattern syntax', async () => {
      const invalidPattern = {
        name: 'test-steering',
        type: SteeringDocumentType.CUSTOM,
        mode: SteeringMode.CONDITIONAL,
        priority: 100,
        patterns: ['[invalid-regex'], // Invalid regex pattern
        template: 'content',
        variables: []
      };

      await expect(
        steeringRegistry.registerSteeringDocument('test-plugin', invalidPattern)
      ).rejects.toThrow('Invalid pattern');
    });
  });

  describe('unregisterSteeringDocument', () => {
    it('should unregister steering document successfully', async () => {
      const declaration = {
        name: 'test-steering',
        type: SteeringDocumentType.CUSTOM,
        mode: SteeringMode.ALWAYS,
        priority: 100,
        patterns: [],
        template: 'content',
        variables: []
      };

      await steeringRegistry.registerSteeringDocument('test-plugin', declaration);
      await steeringRegistry.unregisterSteeringDocument('test-plugin', 'test-steering');

      const documents = await steeringRegistry.getSteeringDocumentsByPlugin('test-plugin');
      expect(documents).toHaveLength(0);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Steering document unregistered successfully',
        expect.objectContaining({
          documentId: 'test-plugin:test-steering',
          pluginId: 'test-plugin'
        })
      );
    });

    it('should warn when document not found', async () => {
      await steeringRegistry.unregisterSteeringDocument('test-plugin', 'non-existent');

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Steering document not found for unregistration',
        {
          documentId: 'test-plugin:non-existent',
          pluginId: 'test-plugin',
          documentName: 'non-existent'
        }
      );
    });
  });

  describe('getApplicableSteeringDocuments', () => {
    beforeEach(async () => {
      // Register test documents
      const alwaysDocument = {
        name: 'always-steering',
        type: SteeringDocumentType.PRODUCT,
        mode: SteeringMode.ALWAYS,
        priority: 200,
        patterns: [],
        template: 'Always active: {{projectName}}',
        variables: [{ name: 'projectName', type: 'string', description: 'Project', required: true }]
      };

      const conditionalDocument = {
        name: 'test-steering',
        type: SteeringDocumentType.TECHNICAL,
        mode: SteeringMode.CONDITIONAL,
        priority: 100,
        patterns: ['.*\\.test\\.ts$'],
        template: 'Test-specific guidance',
        variables: []
      };

      const manualDocument = {
        name: 'manual-steering',
        type: SteeringDocumentType.CUSTOM,
        mode: SteeringMode.MANUAL,
        priority: 50,
        patterns: [],
        template: 'Manual guidance',
        variables: []
      };

      await steeringRegistry.registerSteeringDocument('plugin-1', alwaysDocument);
      await steeringRegistry.registerSteeringDocument('plugin-2', conditionalDocument);
      await steeringRegistry.registerSteeringDocument('plugin-3', manualDocument);
    });

    it('should return always applicable documents', async () => {
      const context = {
        currentFile: 'src/index.ts',
        projectPath: '/project',
        workingDirectory: '/project',
        variables: { projectName: 'TestProject' },
        metadata: {}
      };

      const results = await steeringRegistry.getApplicableSteeringDocuments(context);

      expect(results).toHaveLength(1);
      expect(results[0].applicable).toBe(true);
      expect(results[0].content).toBe('Always active: TestProject');
      expect(results[0].priority).toBe(200);
    });

    it('should return conditional documents when patterns match', async () => {
      const context = {
        currentFile: 'src/component.test.ts',
        projectPath: '/project',
        workingDirectory: '/project',
        variables: { projectName: 'TestProject' },
        metadata: {}
      };

      const results = await steeringRegistry.getApplicableSteeringDocuments(context);

      expect(results).toHaveLength(2); // Always + Conditional
      const conditionalResult = results.find(r => r.priority === 100);
      expect(conditionalResult).toBeDefined();
      expect(conditionalResult!.applicable).toBe(true);
      expect(conditionalResult!.content).toBe('Test-specific guidance');
    });

    it('should not return conditional documents when patterns do not match', async () => {
      const context = {
        currentFile: 'src/index.ts', // Does not match test pattern
        projectPath: '/project',
        workingDirectory: '/project',
        variables: { projectName: 'TestProject' },
        metadata: {}
      };

      const results = await steeringRegistry.getApplicableSteeringDocuments(context);

      expect(results).toHaveLength(1); // Only Always
      expect(results[0].priority).toBe(200); // Always document
    });

    it('should not return manual documents automatically', async () => {
      const context = {
        currentFile: 'src/index.ts',
        projectPath: '/project',
        workingDirectory: '/project',
        variables: { projectName: 'TestProject' },
        metadata: {}
      };

      const results = await steeringRegistry.getApplicableSteeringDocuments(context);

      expect(results.every(r => r.priority !== 50)).toBe(true); // Manual document priority
    });

    it('should sort results by priority', async () => {
      // Register additional documents with different priorities
      const highPriorityDocument = {
        name: 'high-priority',
        type: SteeringDocumentType.QUALITY,
        mode: SteeringMode.ALWAYS,
        priority: 300,
        patterns: [],
        template: 'High priority content',
        variables: []
      };

      await steeringRegistry.registerSteeringDocument('plugin-4', highPriorityDocument);

      const context = {
        currentFile: 'src/index.ts',
        projectPath: '/project',
        workingDirectory: '/project',
        variables: { projectName: 'TestProject' },
        metadata: {}
      };

      const results = await steeringRegistry.getApplicableSteeringDocuments(context);

      expect(results).toHaveLength(2);
      expect(results[0].priority).toBe(300); // Highest priority first
      expect(results[1].priority).toBe(200);
    });

    it('should handle template rendering errors gracefully', async () => {
      const badTemplateDocument = {
        name: 'bad-template',
        type: SteeringDocumentType.CUSTOM,
        mode: SteeringMode.ALWAYS,
        priority: 100,
        patterns: [],
        template: 'Bad template: {{undefined.property}}',
        variables: []
      };

      await steeringRegistry.registerSteeringDocument('plugin-error', badTemplateDocument);

      const context = {
        currentFile: 'src/index.ts',
        projectPath: '/project',
        workingDirectory: '/project',
        variables: {},
        metadata: {}
      };

      const results = await steeringRegistry.getApplicableSteeringDocuments(context);

      // Should not include the errored document
      expect(results.every(r => r.priority !== 100)).toBe(true);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to render steering template',
        expect.objectContaining({
          documentId: 'plugin-error:bad-template'
        })
      );
    });
  });

  describe('getSteeringDocumentsByMode', () => {
    beforeEach(async () => {
      const documents = [
        {
          name: 'always-1',
          type: SteeringDocumentType.PRODUCT,
          mode: SteeringMode.ALWAYS,
          priority: 200,
          patterns: [],
          template: 'Always 1',
          variables: []
        },
        {
          name: 'always-2',
          type: SteeringDocumentType.TECHNICAL,
          mode: SteeringMode.ALWAYS,
          priority: 100,
          patterns: [],
          template: 'Always 2',
          variables: []
        },
        {
          name: 'conditional-1',
          type: SteeringDocumentType.CUSTOM,
          mode: SteeringMode.CONDITIONAL,
          priority: 150,
          patterns: ['*.ts'],
          template: 'Conditional',
          variables: []
        },
        {
          name: 'manual-1',
          type: SteeringDocumentType.QUALITY,
          mode: SteeringMode.MANUAL,
          priority: 50,
          patterns: [],
          template: 'Manual',
          variables: []
        }
      ];

      for (let i = 0; i < documents.length; i++) {
        await steeringRegistry.registerSteeringDocument(`plugin-${i + 1}`, documents[i]);
      }
    });

    it('should return documents filtered by mode', async () => {
      const alwaysDocuments = await steeringRegistry.getSteeringDocumentsByMode(SteeringMode.ALWAYS);
      const conditionalDocuments = await steeringRegistry.getSteeringDocumentsByMode(SteeringMode.CONDITIONAL);
      const manualDocuments = await steeringRegistry.getSteeringDocumentsByMode(SteeringMode.MANUAL);

      expect(alwaysDocuments).toHaveLength(2);
      expect(conditionalDocuments).toHaveLength(1);
      expect(manualDocuments).toHaveLength(1);

      expect(alwaysDocuments[0].priority).toBe(200); // Sorted by priority
      expect(alwaysDocuments[1].priority).toBe(100);
    });
  });

  describe('getSteeringStatistics', () => {
    beforeEach(async () => {
      const documents = [
        {
          name: 'product-doc',
          type: SteeringDocumentType.PRODUCT,
          mode: SteeringMode.ALWAYS,
          priority: 200,
          patterns: [],
          template: 'Product',
          variables: []
        },
        {
          name: 'tech-doc',
          type: SteeringDocumentType.TECHNICAL,
          mode: SteeringMode.CONDITIONAL,
          priority: 150,
          patterns: ['*.ts'],
          template: 'Technical',
          variables: []
        },
        {
          name: 'custom-doc',
          type: SteeringDocumentType.CUSTOM,
          mode: SteeringMode.MANUAL,
          priority: 100,
          patterns: [],
          template: 'Custom',
          variables: []
        }
      ];

      await steeringRegistry.registerSteeringDocument('plugin-1', documents[0]);
      await steeringRegistry.registerSteeringDocument('plugin-1', documents[1]);
      await steeringRegistry.registerSteeringDocument('plugin-2', documents[2]);
    });

    it('should return accurate statistics', async () => {
      const stats = await steeringRegistry.getSteeringStatistics();

      expect(stats.totalDocuments).toBe(3);
      expect(stats.documentsByMode[SteeringMode.ALWAYS]).toBe(1);
      expect(stats.documentsByMode[SteeringMode.CONDITIONAL]).toBe(1);
      expect(stats.documentsByMode[SteeringMode.MANUAL]).toBe(1);
      expect(stats.documentsByType[SteeringDocumentType.PRODUCT]).toBe(1);
      expect(stats.documentsByType[SteeringDocumentType.TECHNICAL]).toBe(1);
      expect(stats.documentsByType[SteeringDocumentType.CUSTOM]).toBe(1);
      expect(stats.documentsByPlugin['plugin-1']).toBe(2);
      expect(stats.documentsByPlugin['plugin-2']).toBe(1);
    });
  });

  describe('clearSteeringDocuments', () => {
    beforeEach(async () => {
      const documents = [
        {
          name: 'doc-1',
          type: SteeringDocumentType.CUSTOM,
          mode: SteeringMode.ALWAYS,
          priority: 100,
          patterns: [],
          template: 'Doc 1',
          variables: []
        },
        {
          name: 'doc-2',
          type: SteeringDocumentType.CUSTOM,
          mode: SteeringMode.ALWAYS,
          priority: 100,
          patterns: [],
          template: 'Doc 2',
          variables: []
        }
      ];

      await steeringRegistry.registerSteeringDocument('plugin-1', documents[0]);
      await steeringRegistry.registerSteeringDocument('plugin-2', documents[1]);
    });

    it('should clear documents for specific plugin', async () => {
      await steeringRegistry.clearSteeringDocuments('plugin-1');

      const plugin1Docs = await steeringRegistry.getSteeringDocumentsByPlugin('plugin-1');
      const plugin2Docs = await steeringRegistry.getSteeringDocumentsByPlugin('plugin-2');

      expect(plugin1Docs).toHaveLength(0);
      expect(plugin2Docs).toHaveLength(1);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Plugin steering documents cleared',
        { pluginId: 'plugin-1', documentsCleared: 1 }
      );
    });

    it('should clear all documents when no plugin specified', async () => {
      await steeringRegistry.clearSteeringDocuments();

      const stats = await steeringRegistry.getSteeringStatistics();
      expect(stats.totalDocuments).toBe(0);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'All steering documents cleared',
        { documentsCleared: 2 }
      );
    });
  });
});