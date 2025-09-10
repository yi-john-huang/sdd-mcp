// Plugin manager implementation for discovery, loading, and lifecycle management

import { injectable, inject } from 'inversify';
import { promises as fs } from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import type { LoggerPort, FileSystemPort } from '../../domain/ports.js';
import {
  PluginManager as IPluginManager,
  Plugin,
  PluginDescriptor,
  PluginInstance,
  PluginImplementation,
  PluginContext,
  PluginState,
  PluginValidationResult,
  PluginDependency,
  PluginValidationError,
  PluginValidationWarning,
  SecurityIssue,
  CompatibilityIssue,
  ValidationSeverity,
  SecurityIssueType,
  SecuritySeverity,
  PluginServices,
  PluginLogger,
  PluginEventEmitter,
  PluginFileSystem,
  PluginHttpClient,
  PluginCrypto,
  PluginUtils,
  HookSystem,
  ToolRegistry,
  HookResult,
  ToolResult
} from '../../domain/plugins/index.js';
import { TYPES } from '../di/types.js';
import { createHash, randomBytes, createCipheriv, createDecipheriv, scryptSync } from 'crypto';
import type { PluginSteeringRegistry } from './PluginSteeringRegistry.js';

interface PluginManagerConfig {
  readonly pluginsDirectory: string;
  readonly dataDirectory: string;
  readonly maxPlugins: number;
  readonly securityEnabled: boolean;
  readonly autoDiscovery: boolean;
  readonly autoLoad: boolean;
  readonly isolationMode: 'sandbox' | 'process' | 'thread';
}

const DEFAULT_CONFIG: PluginManagerConfig = {
  pluginsDirectory: './plugins',
  dataDirectory: './data/plugins',
  maxPlugins: 100,
  securityEnabled: true,
  autoDiscovery: true,
  autoLoad: false,
  isolationMode: 'sandbox'
};

@injectable()
export class PluginManager implements IPluginManager {
  private readonly config: PluginManagerConfig;
  private readonly plugins = new Map<string, PluginInstance>();
  private readonly eventEmitter = new EventEmitter();
  private initialized = false;

  constructor(
    @inject(TYPES.LoggerPort) private readonly logger: LoggerPort,
    @inject(TYPES.FileSystemPort) private readonly fileSystem: FileSystemPort,
    @inject(TYPES.HookSystem) private readonly hookSystem: HookSystem,
    @inject(TYPES.PluginToolRegistry) private readonly toolRegistry: ToolRegistry,
    @inject(TYPES.PluginSteeringRegistry) private readonly steeringRegistry: PluginSteeringRegistry
  ) {
    this.config = { ...DEFAULT_CONFIG };
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Ensure plugin directories exist
      await this.ensureDirectories();

      // Auto-discovery if enabled
      if (this.config.autoDiscovery) {
        const discovered = await this.discover();
        this.logger.info('Auto-discovery completed', { 
          pluginsFound: discovered.length,
          validPlugins: discovered.filter(d => d.valid).length
        });

        // Auto-load valid plugins if enabled
        if (this.config.autoLoad) {
          for (const descriptor of discovered.filter(d => d.valid)) {
            try {
              await this.install(descriptor.path);
              await this.load(descriptor.manifest.id);
              await this.enable(descriptor.manifest.id);
            } catch (error) {
              this.logger.warn('Failed to auto-load plugin', {
                pluginId: descriptor.manifest.id,
                error: error instanceof Error ? error.message : String(error)
              });
            }
          }
        }
      }

      this.initialized = true;
      this.logger.info('Plugin manager initialized', {
        pluginsDirectory: this.config.pluginsDirectory,
        loadedPlugins: this.plugins.size
      });

    } catch (error) {
      this.logger.error('Plugin manager initialization failed', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  async discover(directory?: string): Promise<PluginDescriptor[]> {
    const searchDirectory = directory || this.config.pluginsDirectory;
    const descriptors: PluginDescriptor[] = [];

    try {
      await fs.mkdir(searchDirectory, { recursive: true });
      
      const entries = await fs.readdir(searchDirectory, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const pluginPath = path.join(searchDirectory, entry.name);
          const manifestPath = path.join(pluginPath, 'plugin.json');
          
          try {
            const manifestContent = await fs.readFile(manifestPath, 'utf-8');
            const manifest: Plugin = JSON.parse(manifestContent);
            
            const validation = await this.validatePlugin(manifest);
            
            descriptors.push({
              path: pluginPath,
              manifest,
              valid: validation.valid,
              errors: validation.errors.map(e => e.message),
              warnings: validation.warnings.map(w => w.message)
            });

            this.logger.debug('Plugin discovered', {
              id: manifest.id,
              name: manifest.name,
              valid: validation.valid,
              path: pluginPath
            });

          } catch (error) {
            descriptors.push({
              path: pluginPath,
              manifest: {} as Plugin,
              valid: false,
              errors: [`Failed to read manifest: ${error instanceof Error ? error.message : String(error)}`],
              warnings: []
            });
          }
        }
      }

      this.logger.info('Plugin discovery completed', {
        directory: searchDirectory,
        totalPlugins: descriptors.length,
        validPlugins: descriptors.filter(d => d.valid).length
      });

      return descriptors;
    } catch (error) {
      this.logger.error('Plugin discovery failed', error instanceof Error ? error : new Error(String(error)), {
        directory: searchDirectory
      });
      throw error;
    }
  }

  async install(pluginPath: string): Promise<PluginInstance> {
    const manifestPath = path.join(pluginPath, 'plugin.json');
    
    try {
      const manifestContent = await fs.readFile(manifestPath, 'utf-8');
      const manifest: Plugin = JSON.parse(manifestContent);
      
      // Validate plugin
      const validation = await this.validatePlugin(manifest);
      if (!validation.valid) {
        throw new Error(`Plugin validation failed: ${validation.errors.map(e => e.message).join(', ')}`);
      }

      // Check for conflicts
      if (this.plugins.has(manifest.id)) {
        throw new Error(`Plugin ${manifest.id} is already installed`);
      }

      // Check capacity
      if (this.plugins.size >= this.config.maxPlugins) {
        throw new Error(`Maximum number of plugins (${this.config.maxPlugins}) reached`);
      }

      // Resolve dependencies
      const dependencies = await this.resolveDependencies(manifest);
      this.logger.debug('Plugin dependencies resolved', {
        pluginId: manifest.id,
        dependencies: dependencies.length
      });

      // Create plugin context
      const context = await this.createPluginContext(manifest, pluginPath);
      
      // Load plugin implementation
      const implementation = await this.loadPluginImplementation(pluginPath, context);
      
      // Create plugin instance
      const instance: PluginInstance = {
        plugin: manifest,
        instance: implementation,
        state: PluginState.INSTALLED,
        loadedAt: new Date(),
        configuration: { ...manifest.configuration.defaults },
        hooks: [],
        tools: []
      };

      this.plugins.set(manifest.id, instance);
      
      this.eventEmitter.emit('plugin-installed', { pluginId: manifest.id, instance });
      
      this.logger.info('Plugin installed successfully', {
        id: manifest.id,
        name: manifest.name,
        version: manifest.version
      });

      return instance;
    } catch (error) {
      this.logger.error('Plugin installation failed', error instanceof Error ? error : new Error(String(error)), {
        pluginPath
      });
      throw error;
    }
  }

  async uninstall(pluginId: string): Promise<void> {
    const instance = this.plugins.get(pluginId);
    if (!instance) {
      throw new Error(`Plugin ${pluginId} is not installed`);
    }

    try {
      // Disable plugin if active
      if (instance.state === PluginState.ACTIVE) {
        await this.disable(pluginId);
      }

      // Unload plugin if loaded
      if (instance.state === PluginState.LOADED) {
        await this.unload(pluginId);
      }

      // Clear all plugin registrations (defensive cleanup)
      await this.hookSystem.clearHooks(pluginId);
      await this.toolRegistry.clearTools(pluginId);
      await this.steeringRegistry.clearSteeringDocuments(pluginId);

      // Dispose plugin resources
      await instance.instance.dispose();

      // Remove from registry
      this.plugins.delete(pluginId);

      this.eventEmitter.emit('plugin-uninstalled', { pluginId });

      this.logger.info('Plugin uninstalled successfully', { pluginId });
    } catch (error) {
      this.logger.error('Plugin uninstallation failed', error instanceof Error ? error : new Error(String(error)), {
        pluginId
      });
      throw error;
    }
  }

  async enable(pluginId: string): Promise<void> {
    const instance = this.plugins.get(pluginId);
    if (!instance) {
      throw new Error(`Plugin ${pluginId} is not installed`);
    }

    if (instance.state === PluginState.ACTIVE) {
      this.logger.debug('Plugin is already enabled', { pluginId });
      return;
    }

    try {
      // Create updated instance with LOADING state
      const loadingInstance = {
        ...instance,
        state: PluginState.LOADING
      };
      this.plugins.set(pluginId, loadingInstance);
      
      // Initialize plugin if not already done
      if (instance.state !== PluginState.LOADED) {
        await loadingInstance.instance.initialize(await this.createPluginContext(loadingInstance.plugin, ''));
      }

      // Register plugin hooks
      for (const hookDeclaration of instance.plugin.hooks) {
        const hookRegistration = {
          pluginId,
          name: hookDeclaration.name,
          type: hookDeclaration.type,
          phase: hookDeclaration.phase,
          priority: hookDeclaration.priority,
          handler: async (context: any): Promise<HookResult> => {
            const result = await instance.instance.executeHook(hookDeclaration.name, context);
            return {
              success: true,
              data: (typeof result === 'object' && result !== null && !Array.isArray(result)) 
                ? result as Record<string, unknown>
                : { result },
              metadata: { pluginId, hookName: hookDeclaration.name }
            };
          },
          conditions: []
        };
        await this.hookSystem.register(pluginId, hookRegistration);
      }

      // Register plugin tools
      for (const toolDeclaration of instance.plugin.tools) {
        const toolRegistration = {
          pluginId,
          name: toolDeclaration.name,
          description: toolDeclaration.description,
          category: toolDeclaration.category,
          handler: async (input: any, context: any): Promise<ToolResult> => {
            const result = await instance.instance.executeTool(toolDeclaration.name, input);
            return {
              success: true,
              data: (typeof result === 'object' && result !== null && !Array.isArray(result)) 
                ? result as Record<string, unknown>
                : { result },
              metadata: { pluginId, toolName: toolDeclaration.name }
            };
          },
          inputSchema: toolDeclaration.inputSchema,
          outputSchema: toolDeclaration.outputSchema,
          permissions: toolDeclaration.permissions
        };
        await this.toolRegistry.register(pluginId, toolRegistration);
      }

      // Register plugin steering documents
      for (const steeringDeclaration of instance.plugin.steeringDocuments) {
        await this.steeringRegistry.registerSteeringDocument(pluginId, steeringDeclaration);
      }

      // Activate plugin
      await loadingInstance.instance.activate();
      
      // Create final active instance
      const activeInstance = {
        ...loadingInstance,
        state: PluginState.ACTIVE
      };
      this.plugins.set(pluginId, activeInstance);
      
      this.eventEmitter.emit('plugin-enabled', { pluginId, instance: activeInstance });
      
      this.logger.info('Plugin enabled successfully', { 
        pluginId,
        hooks: instance.plugin.hooks.length,
        tools: instance.plugin.tools.length,
        steeringDocuments: instance.plugin.steeringDocuments.length
      });
    } catch (error) {
      // Create error instance
      const errorInstance = {
        ...instance,
        state: PluginState.ERROR,
        lastError: error instanceof Error ? error : new Error(String(error))
      };
      this.plugins.set(pluginId, errorInstance);
      
      this.logger.error('Plugin enable failed', error instanceof Error ? error : new Error(String(error)), {
        pluginId
      });
      throw error;
    }
  }

  async disable(pluginId: string): Promise<void> {
    const instance = this.plugins.get(pluginId);
    if (!instance) {
      throw new Error(`Plugin ${pluginId} is not installed`);
    }

    if (instance.state !== PluginState.ACTIVE) {
      this.logger.debug('Plugin is not active', { pluginId, state: instance.state });
      return;
    }

    try {
      // Deactivate plugin first
      await instance.instance.deactivate();

      // Unregister plugin hooks
      for (const hookDeclaration of instance.plugin.hooks) {
        await this.hookSystem.unregister(pluginId, hookDeclaration.name);
      }

      // Unregister plugin tools
      for (const toolDeclaration of instance.plugin.tools) {
        await this.toolRegistry.unregister(pluginId, toolDeclaration.name);
      }

      // Unregister plugin steering documents
      for (const steeringDeclaration of instance.plugin.steeringDocuments) {
        await this.steeringRegistry.unregisterSteeringDocument(pluginId, steeringDeclaration.name);
      }
      
      // Create inactive instance
      const inactiveInstance = {
        ...instance,
        state: PluginState.INACTIVE
      };
      this.plugins.set(pluginId, inactiveInstance);
      
      this.eventEmitter.emit('plugin-disabled', { pluginId, instance: inactiveInstance });
      
      this.logger.info('Plugin disabled successfully', { 
        pluginId,
        hooks: instance.plugin.hooks.length,
        tools: instance.plugin.tools.length,
        steeringDocuments: instance.plugin.steeringDocuments.length
      });
    } catch (error) {
      // Create error instance
      const errorInstance = {
        ...instance,
        state: PluginState.ERROR,
        lastError: error instanceof Error ? error : new Error(String(error))
      };
      this.plugins.set(pluginId, errorInstance);
      
      this.logger.error('Plugin disable failed', error instanceof Error ? error : new Error(String(error)), {
        pluginId
      });
      throw error;
    }
  }

  async load(pluginId: string): Promise<PluginInstance> {
    const instance = this.plugins.get(pluginId);
    if (!instance) {
      throw new Error(`Plugin ${pluginId} is not installed`);
    }

    if (instance.state === PluginState.LOADED || instance.state === PluginState.ACTIVE) {
      return instance;
    }

    try {
      // Create loading instance
      const loadingInstance = {
        ...instance,
        state: PluginState.LOADING
      };
      this.plugins.set(pluginId, loadingInstance);
      
      const context = await this.createPluginContext(loadingInstance.plugin, '');
      await loadingInstance.instance.initialize(context);
      
      // Create loaded instance
      const loadedInstance = {
        ...loadingInstance,
        state: PluginState.LOADED
      };
      this.plugins.set(pluginId, loadedInstance);
      
      this.eventEmitter.emit('plugin-loaded', { pluginId, instance: loadedInstance });
      
      this.logger.info('Plugin loaded successfully', { pluginId });
      
      return loadedInstance;
    } catch (error) {
      // Create error instance
      const errorInstance = {
        ...instance,
        state: PluginState.ERROR,
        lastError: error instanceof Error ? error : new Error(String(error))
      };
      this.plugins.set(pluginId, errorInstance);
      
      this.logger.error('Plugin load failed', error instanceof Error ? error : new Error(String(error)), {
        pluginId
      });
      throw error;
    }
  }

  async unload(pluginId: string): Promise<void> {
    const instance = this.plugins.get(pluginId);
    if (!instance) {
      throw new Error(`Plugin ${pluginId} is not installed`);
    }

    try {
      if (instance.state === PluginState.ACTIVE) {
        await this.disable(pluginId);
      }

      await instance.instance.dispose();
      
      // Create unloaded instance
      const unloadedInstance = {
        ...instance,
        state: PluginState.INSTALLED
      };
      this.plugins.set(pluginId, unloadedInstance);
      
      this.eventEmitter.emit('plugin-unloaded', { pluginId, instance: unloadedInstance });
      
      this.logger.info('Plugin unloaded successfully', { pluginId });
    } catch (error) {
      this.logger.error('Plugin unload failed', error instanceof Error ? error : new Error(String(error)), {
        pluginId
      });
      throw error;
    }
  }

  async getPlugin(pluginId: string): Promise<PluginInstance | null> {
    return this.plugins.get(pluginId) || null;
  }

  async getAllPlugins(): Promise<PluginInstance[]> {
    return Array.from(this.plugins.values());
  }

  async getEnabledPlugins(): Promise<PluginInstance[]> {
    return Array.from(this.plugins.values()).filter(p => p.state === PluginState.ACTIVE);
  }

  async validatePlugin(plugin: Plugin): Promise<PluginValidationResult> {
    const errors: PluginValidationError[] = [];
    const warnings: PluginValidationWarning[] = [];
    const securityIssues: SecurityIssue[] = [];
    const compatibilityIssues: CompatibilityIssue[] = [];

    // Basic validation
    if (!plugin.id) {
      errors.push({
        type: 'missing-field',
        message: 'Plugin ID is required',
        field: 'id',
        severity: ValidationSeverity.CRITICAL
      });
    }

    if (!plugin.name) {
      errors.push({
        type: 'missing-field',
        message: 'Plugin name is required',
        field: 'name',
        severity: ValidationSeverity.HIGH
      });
    }

    if (!plugin.version) {
      errors.push({
        type: 'missing-field',
        message: 'Plugin version is required',
        field: 'version',
        severity: ValidationSeverity.HIGH
      });
    }

    // Security validation
    if (this.config.securityEnabled) {
      const security = await this.performSecurityValidation(plugin);
      securityIssues.push(...security);
    }

    // Compatibility validation
    const compatibility = await this.performCompatibilityValidation(plugin);
    compatibilityIssues.push(...compatibility);

    return {
      valid: errors.filter(e => e.severity === ValidationSeverity.CRITICAL).length === 0,
      errors,
      warnings,
      securityIssues,
      compatibilityIssues
    };
  }

  async resolveDependencies(plugin: Plugin): Promise<PluginDependency[]> {
    const resolved: PluginDependency[] = [];
    
    for (const dep of plugin.dependencies) {
      // Check if dependency is already installed
      const installedPlugin = this.plugins.get(dep.name);
      if (installedPlugin) {
        // Version compatibility check would go here
        resolved.push(dep);
      } else if (!dep.optional) {
        throw new Error(`Required dependency ${dep.name} is not installed`);
      }
    }

    return resolved;
  }

  // Private helper methods
  private async ensureDirectories(): Promise<void> {
    await fs.mkdir(this.config.pluginsDirectory, { recursive: true });
    await fs.mkdir(this.config.dataDirectory, { recursive: true });
  }

  private async createPluginContext(plugin: Plugin, pluginPath: string): Promise<PluginContext> {
    const dataDirectory = path.join(this.config.dataDirectory, plugin.id);
    await fs.mkdir(dataDirectory, { recursive: true });

    return {
      pluginId: plugin.id,
      workingDirectory: pluginPath,
      configurationDirectory: path.join(dataDirectory, 'config'),
      dataDirectory,
      logger: this.createPluginLogger(plugin.id),
      services: this.createPluginServices(plugin.id),
      events: this.createPluginEventEmitter(plugin.id)
    };
  }

  private async loadPluginImplementation(pluginPath: string, context: PluginContext): Promise<PluginImplementation> {
    const indexPath = path.join(pluginPath, 'index.js');
    
    try {
      // In a production environment, this would use a more secure module loading system
      const pluginModule = await import(`file://${indexPath}`);
      
      if (!pluginModule.default) {
        throw new Error('Plugin must export a default class implementing PluginImplementation');
      }

      const PluginClass = pluginModule.default;
      return new PluginClass() as PluginImplementation;
    } catch (error) {
      throw new Error(`Failed to load plugin implementation: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private createPluginLogger(pluginId: string): PluginLogger {
    return {
      debug: (message: string, data?: Record<string, unknown>) => {
        this.logger.debug(`[${pluginId}] ${message}`, data);
      },
      info: (message: string, data?: Record<string, unknown>) => {
        this.logger.info(`[${pluginId}] ${message}`, data);
      },
      warn: (message: string, data?: Record<string, unknown>) => {
        this.logger.warn(`[${pluginId}] ${message}`, data);
      },
      error: (message: string, error?: Error, data?: Record<string, unknown>) => {
        this.logger.error(`[${pluginId}] ${message}`, error, data);
      }
    };
  }

  private createPluginServices(pluginId: string): PluginServices {
    return {
      fileSystem: this.createPluginFileSystem(pluginId),
      http: this.createPluginHttpClient(pluginId),
      crypto: this.createPluginCrypto(pluginId),
      utils: this.createPluginUtils(pluginId)
    };
  }

  private createPluginEventEmitter(pluginId: string): PluginEventEmitter {
    const emitter = new EventEmitter();
    return {
      on: (event: string, listener: (...args: unknown[]) => void) => {
        emitter.on(event, listener);
      },
      off: (event: string, listener: (...args: unknown[]) => void) => {
        emitter.off(event, listener);
      },
      emit: (event: string, ...args: unknown[]) => {
        emitter.emit(event, ...args);
      }
    };
  }

  private createPluginFileSystem(pluginId: string): PluginFileSystem {
    // This would include security restrictions for plugin file access
    return {
      readFile: async (path: string) => this.fileSystem.readFile(path),
      writeFile: async (path: string, content: string) => this.fileSystem.writeFile(path, content),
      exists: async (path: string) => this.fileSystem.exists(path),
      mkdir: async (path: string) => this.fileSystem.mkdir(path),
      readdir: async (path: string) => [], // Simplified
      stat: async (path: string) => ({ size: 0, mtime: new Date(), isFile: () => true, isDirectory: () => false })
    };
  }

  private createPluginHttpClient(pluginId: string): PluginHttpClient {
    // Simplified HTTP client implementation
    return {
      get: async () => ({ status: 200, statusText: 'OK', headers: {}, data: {} }),
      post: async () => ({ status: 200, statusText: 'OK', headers: {}, data: {} }),
      put: async () => ({ status: 200, statusText: 'OK', headers: {}, data: {} }),
      delete: async () => ({ status: 200, statusText: 'OK', headers: {}, data: {} })
    };
  }

  private createPluginCrypto(pluginId: string): PluginCrypto {
    return {
      hash: (data: string, algorithm = 'sha256') => createHash(algorithm).update(data).digest('hex'),
      encrypt: (data: string, key: string) => {
        const iv = randomBytes(16);
        const derivedKey = scryptSync(key, 'salt', 24);
        const cipher = createCipheriv('aes-192-cbc', derivedKey, iv);
        let encrypted = cipher.update(data, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return iv.toString('hex') + ':' + encrypted;
      },
      decrypt: (data: string, key: string) => {
        const parts = data.split(':');
        const iv = Buffer.from(parts[0], 'hex');
        const encryptedData = parts[1];
        const derivedKey = scryptSync(key, 'salt', 24);
        const decipher = createDecipheriv('aes-192-cbc', derivedKey, iv);
        let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
      },
      generateId: () => randomBytes(16).toString('hex'),
      generateSecret: (length = 32) => randomBytes(length).toString('hex')
    };
  }

  private createPluginUtils(pluginId: string): PluginUtils {
    return {
      validateSchema: () => ({ valid: true, errors: [], warnings: [] }),
      formatDate: (date: Date, format?: string) => date.toISOString(),
      parseTemplate: (template: string, data: Record<string, unknown>) => template,
      debounce: <T extends (...args: unknown[]) => unknown>(fn: T, delay: number): T => {
        let timeoutId: NodeJS.Timeout;
        return ((...args: unknown[]) => {
          clearTimeout(timeoutId);
          timeoutId = setTimeout(() => fn(...args), delay);
        }) as T;
      },
      throttle: <T extends (...args: unknown[]) => unknown>(fn: T, interval: number): T => {
        let lastCall = 0;
        return ((...args: unknown[]) => {
          const now = Date.now();
          if (now - lastCall >= interval) {
            lastCall = now;
            return fn(...args);
          }
        }) as T;
      }
    };
  }

  private async performSecurityValidation(plugin: Plugin): Promise<SecurityIssue[]> {
    const issues: SecurityIssue[] = [];

    // Check for dangerous permissions
    const dangerousPermissions = ['file:execute', 'system:info'];
    for (const tool of plugin.tools) {
      for (const permission of tool.permissions) {
        if (dangerousPermissions.includes(permission.type)) {
          issues.push({
            type: SecurityIssueType.PRIVILEGE_ESCALATION,
            severity: SecuritySeverity.HIGH,
            message: `Tool '${tool.name}' requests dangerous permission '${permission.type}'`,
            recommendation: 'Review if this permission is necessary and ensure proper validation'
          });
        }
      }
    }

    return issues;
  }

  private async performCompatibilityValidation(plugin: Plugin): Promise<CompatibilityIssue[]> {
    const issues: CompatibilityIssue[] = [];

    // Check engine requirements
    for (const engine of plugin.engines) {
      if (engine.name === 'node' && engine.version) {
        const currentNodeVersion = process.version;
        if (!this.isVersionCompatible(currentNodeVersion, engine.version)) {
          issues.push({
            type: 'engine-incompatible',
            message: `Plugin requires Node.js ${engine.version}, but current version is ${currentNodeVersion}`,
            affectedVersions: [currentNodeVersion],
            workaround: `Upgrade Node.js to ${engine.version} or later`
          });
        }
      }
    }

    return issues;
  }

  private isVersionCompatible(current: string, required: string): boolean {
    // Simplified version comparison - would use proper semver in production
    return current >= required;
  }
}