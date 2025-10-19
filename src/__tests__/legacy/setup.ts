// Test setup and configuration for comprehensive testing framework

import 'reflect-metadata';

// Global test configuration
const TEST_TIMEOUT = 30000; // 30 seconds
const PERFORMANCE_THRESHOLD = 5000; // 5 seconds for performance tests

// Setup global test utilities
(globalThis as any).TEST_CONFIG = {
  timeout: TEST_TIMEOUT,
  performanceThreshold: PERFORMANCE_THRESHOLD,
  tempDir: process.env.TEST_TEMP_DIR || '/tmp/sdd-mcp-tests'
};

// Mock console methods for cleaner test output
const originalConsole = { ...console };

beforeAll(() => {
  // Silence console output during tests unless TEST_VERBOSE is set
  if (!process.env.TEST_VERBOSE) {
    console.log = jest.fn();
    console.debug = jest.fn();
    console.info = jest.fn();
  }
});

afterAll(() => {
  // Restore console methods
  if (!process.env.TEST_VERBOSE) {
    Object.assign(console, originalConsole);
  }
});

// Global error handling
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Setup test matchers
expect.extend({
  toBeWithinTimeThreshold(received: number, threshold: number = PERFORMANCE_THRESHOLD) {
    const pass = received <= threshold;
    if (pass) {
      return {
        message: () => `Expected ${received}ms to exceed ${threshold}ms`,
        pass: true,
      };
    } else {
      return {
        message: () => `Expected ${received}ms to be within ${threshold}ms threshold`,
        pass: false,
      };
    }
  },
  
  toHaveValidWorkflowState(received: any) {
    const requiredPhases = ['INIT', 'REQUIREMENTS', 'DESIGN', 'TASKS', 'IMPLEMENTATION'];
    const requiredProperties = ['currentPhase', 'state', 'phases'];
    
    const hasRequiredProperties = requiredProperties.every(prop => 
      received && typeof received === 'object' && prop in received
    );
    
    const hasAllPhases = requiredPhases.every(phase => 
      received.phases && phase in received.phases
    );
    
    const validCurrentPhase = requiredPhases.includes(received.currentPhase);
    
    const pass = hasRequiredProperties && hasAllPhases && validCurrentPhase;
    
    if (pass) {
      return {
        message: () => `Expected workflow state to be invalid`,
        pass: true,
      };
    } else {
      return {
        message: () => `Expected workflow state to have valid structure with all phases and properties`,
        pass: false,
      };
    }
  },
  
  toHaveValidPluginStructure(received: any) {
    const requiredProperties = ['id', 'name', 'version', 'capabilities'];
    const hasRequiredProperties = requiredProperties.every(prop => 
      received && typeof received === 'object' && prop in received
    );
    
    const hasValidCapabilities = Array.isArray(received.capabilities);
    
    const pass = hasRequiredProperties && hasValidCapabilities;
    
    if (pass) {
      return {
        message: () => `Expected plugin structure to be invalid`,
        pass: true,
      };
    } else {
      return {
        message: () => `Expected plugin to have valid structure with required properties`,
        pass: false,
      };
    }
  }
});

// Declare custom matchers for TypeScript
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeWithinTimeThreshold(threshold?: number): R;
      toHaveValidWorkflowState(): R;
      toHaveValidPluginStructure(): R;
    }
  }
  
  const TEST_CONFIG: {
    timeout: number;
    performanceThreshold: number;
    tempDir: string;
  };
}

// Test utilities
export const TestUtils = {
  // Create mock logger
  createMockLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }),
  
  // Create mock file system
  createMockFileSystem: () => ({
    readFile: jest.fn(),
    writeFile: jest.fn(),
    exists: jest.fn(),
    mkdir: jest.fn(),
    readdir: jest.fn(),
    stat: jest.fn(),
    join: jest.fn((...args: string[]) => args.join('/')),
    basename: jest.fn((path: string) => path.split('/').pop() || ''),
    dirname: jest.fn((path: string) => path.split('/').slice(0, -1).join('/'))
  }),
  
  // Create mock validation port
  createMockValidation: () => ({
    validate: jest.fn(),
    validateSchema: jest.fn(),
    createValidator: jest.fn()
  }),
  
  // Generate test workflow state
  createTestWorkflowState: (overrides: any = {}) => ({
    currentPhase: 'INIT',
    state: 'IN_PROGRESS',
    phases: {
      INIT: { status: 'IN_PROGRESS', startedAt: new Date() },
      REQUIREMENTS: { status: 'PENDING' },
      DESIGN: { status: 'PENDING' },
      TASKS: { status: 'PENDING' },
      IMPLEMENTATION: { status: 'PENDING' }
    },
    startedAt: new Date(),
    ...overrides
  }),
  
  // Generate test plugin
  createTestPlugin: (overrides: any = {}) => ({
    id: 'test-plugin',
    name: 'Test Plugin',
    version: '1.0.0',
    description: 'A test plugin',
    author: 'Test Author',
    license: 'MIT',
    keywords: ['test'],
    dependencies: [],
    peerDependencies: [],
    engines: [{ name: 'node', version: '>=18.0.0' }],
    capabilities: [],
    hooks: [],
    tools: [],
    steeringDocuments: [],
    configuration: {
      schema: {},
      defaults: {},
      required: [],
      validation: []
    },
    metadata: {
      createdAt: new Date(),
      updatedAt: new Date(),
      usageCount: 0,
      ratings: [],
      tags: [],
      category: 'UTILITY',
      maturity: 'STABLE',
      supportedLanguages: ['typescript']
    },
    ...overrides
  }),
  
  // Wait for promises to resolve
  waitFor: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),
  
  // Create temporary directory for tests
  createTempDir: async () => {
    const { promises: fs } = await import('fs');
    const os = await import('os');
    const path = await import('path');
    
    return await fs.mkdtemp(path.join(os.tmpdir(), 'sdd-mcp-test-'));
  },
  
  // Clean up temporary directory
  cleanupTempDir: async (dir: string) => {
    const { promises: fs } = await import('fs');
    await fs.rm(dir, { recursive: true, force: true });
  }
};