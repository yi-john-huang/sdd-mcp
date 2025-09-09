// Domain models and interfaces for plugin system and extensibility

export interface Plugin {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly author: string;
  readonly homepage?: string;
  readonly repository?: string;
  readonly license: string;
  readonly keywords: string[];
  readonly dependencies: PluginDependency[];
  readonly peerDependencies: PluginDependency[];
  readonly engines: EngineRequirement[];
  readonly capabilities: PluginCapability[];
  readonly hooks: HookDeclaration[];
  readonly tools: ToolDeclaration[];
  readonly steeringDocuments: SteeringDocumentDeclaration[];
  readonly configuration: PluginConfiguration;
  readonly metadata: PluginMetadata;
}

export interface PluginDependency {
  readonly name: string;
  readonly version: string;
  readonly optional: boolean;
  readonly reason: string;
}

export interface EngineRequirement {
  readonly name: string;
  readonly version: string;
}

export interface PluginCapability {
  readonly type: CapabilityType;
  readonly name: string;
  readonly description: string;
  readonly required: boolean;
  readonly configuration: Record<string, unknown>;
}

export interface HookDeclaration {
  readonly name: string;
  readonly type: HookType;
  readonly phase: HookPhase;
  readonly priority: number;
  readonly description: string;
  readonly parameters: HookParameter[];
  readonly returnType?: string;
}

export interface ToolDeclaration {
  readonly name: string;
  readonly description: string;
  readonly category: ToolCategory;
  readonly inputSchema: Record<string, unknown>;
  readonly outputSchema: Record<string, unknown>;
  readonly examples: ToolExample[];
  readonly permissions: ToolPermission[];
}

export interface SteeringDocumentDeclaration {
  readonly name: string;
  readonly type: SteeringDocumentType;
  readonly mode: SteeringMode;
  readonly priority: number;
  readonly patterns: string[];
  readonly template: string;
  readonly variables: SteeringVariable[];
}

export interface PluginConfiguration {
  readonly schema: Record<string, unknown>;
  readonly defaults: Record<string, unknown>;
  readonly required: string[];
  readonly validation: ConfigurationValidation[];
}

export interface PluginMetadata {
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly installedAt?: Date;
  readonly lastUsed?: Date;
  readonly usageCount: number;
  readonly ratings: PluginRating[];
  readonly tags: string[];
  readonly category: PluginCategory;
  readonly maturity: PluginMaturity;
  readonly supportedLanguages: string[];
}

export interface HookParameter {
  readonly name: string;
  readonly type: string;
  readonly required: boolean;
  readonly description: string;
  readonly defaultValue?: unknown;
}

export interface ToolExample {
  readonly name: string;
  readonly description: string;
  readonly input: Record<string, unknown>;
  readonly expectedOutput: Record<string, unknown>;
}

export interface ToolPermission {
  readonly type: PermissionType;
  readonly resource: string;
  readonly actions: string[];
  readonly conditions?: Record<string, unknown>;
}

export interface SteeringVariable {
  readonly name: string;
  readonly type: string;
  readonly description: string;
  readonly required: boolean;
  readonly defaultValue?: unknown;
}

export interface ConfigurationValidation {
  readonly field: string;
  readonly type: ValidationType;
  readonly rules: ValidationRule[];
  readonly message: string;
}

export interface ValidationRule {
  readonly type: string;
  readonly value: unknown;
  readonly message: string;
}

export interface PluginRating {
  readonly userId: string;
  readonly rating: number; // 1-5
  readonly comment?: string;
  readonly createdAt: Date;
}

export interface PluginManager {
  discover(directory?: string): Promise<PluginDescriptor[]>;
  install(pluginPath: string): Promise<PluginInstance>;
  uninstall(pluginId: string): Promise<void>;
  enable(pluginId: string): Promise<void>;
  disable(pluginId: string): Promise<void>;
  load(pluginId: string): Promise<PluginInstance>;
  unload(pluginId: string): Promise<void>;
  getPlugin(pluginId: string): Promise<PluginInstance | null>;
  getAllPlugins(): Promise<PluginInstance[]>;
  getEnabledPlugins(): Promise<PluginInstance[]>;
  validatePlugin(plugin: Plugin): Promise<PluginValidationResult>;
  resolveDependencies(plugin: Plugin): Promise<PluginDependency[]>;
}

export interface PluginDescriptor {
  readonly path: string;
  readonly manifest: Plugin;
  readonly valid: boolean;
  readonly errors: string[];
  readonly warnings: string[];
}

export interface PluginInstance {
  readonly plugin: Plugin;
  readonly instance: PluginImplementation;
  readonly state: PluginState;
  readonly loadedAt: Date;
  readonly lastError?: Error;
  readonly configuration: Record<string, unknown>;
  readonly hooks: HookRegistration[];
  readonly tools: ToolRegistration[];
}

export interface PluginImplementation {
  initialize(context: PluginContext): Promise<void>;
  activate(): Promise<void>;
  deactivate(): Promise<void>;
  dispose(): Promise<void>;
  getConfiguration(): Record<string, unknown>;
  setConfiguration(config: Record<string, unknown>): Promise<void>;
  executeHook(hookName: string, ...args: unknown[]): Promise<unknown>;
  executeTool(toolName: string, input: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export interface PluginContext {
  readonly pluginId: string;
  readonly workingDirectory: string;
  readonly configurationDirectory: string;
  readonly dataDirectory: string;
  readonly logger: PluginLogger;
  readonly services: PluginServices;
  readonly events: PluginEventEmitter;
}

export interface PluginServices {
  readonly fileSystem: PluginFileSystem;
  readonly http: PluginHttpClient;
  readonly crypto: PluginCrypto;
  readonly utils: PluginUtils;
}

export interface PluginLogger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, error?: Error, data?: Record<string, unknown>): void;
}

export interface PluginEventEmitter {
  on(event: string, listener: (...args: unknown[]) => void): void;
  off(event: string, listener: (...args: unknown[]) => void): void;
  emit(event: string, ...args: unknown[]): void;
}

export interface PluginFileSystem {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  mkdir(path: string): Promise<void>;
  readdir(path: string): Promise<string[]>;
  stat(path: string): Promise<{ size: number; mtime: Date; isFile(): boolean; isDirectory(): boolean }>;
}

export interface PluginHttpClient {
  get(url: string, options?: RequestOptions): Promise<HttpResponse>;
  post(url: string, data?: unknown, options?: RequestOptions): Promise<HttpResponse>;
  put(url: string, data?: unknown, options?: RequestOptions): Promise<HttpResponse>;
  delete(url: string, options?: RequestOptions): Promise<HttpResponse>;
}

export interface RequestOptions {
  readonly headers?: Record<string, string>;
  readonly timeout?: number;
  readonly retry?: number;
}

export interface HttpResponse {
  readonly status: number;
  readonly statusText: string;
  readonly headers: Record<string, string>;
  readonly data: unknown;
}

export interface PluginCrypto {
  hash(data: string, algorithm?: string): string;
  encrypt(data: string, key: string): string;
  decrypt(data: string, key: string): string;
  generateId(): string;
  generateSecret(length?: number): string;
}

export interface PluginUtils {
  validateSchema(data: unknown, schema: Record<string, unknown>): ValidationResult;
  formatDate(date: Date, format?: string): string;
  parseTemplate(template: string, data: Record<string, unknown>): string;
  debounce<T extends (...args: unknown[]) => unknown>(fn: T, delay: number): T;
  throttle<T extends (...args: unknown[]) => unknown>(fn: T, interval: number): T;
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: ValidationError[];
  readonly warnings: ValidationWarning[];
}

export interface ValidationError {
  readonly path: string;
  readonly message: string;
  readonly value?: unknown;
}

export interface ValidationWarning {
  readonly path: string;
  readonly message: string;
  readonly suggestion?: string;
}

export interface HookSystem {
  register(pluginId: string, hook: HookRegistration): Promise<void>;
  unregister(pluginId: string, hookName: string): Promise<void>;
  execute(hookName: string, context: HookExecutionContext): Promise<HookResult>;
  getHooks(hookName: string): Promise<HookRegistration[]>;
  getAllHooks(): Promise<Record<string, HookRegistration[]>>;
}

export interface HookRegistration {
  readonly pluginId: string;
  readonly name: string;
  readonly type: HookType;
  readonly phase: HookPhase;
  readonly priority: number;
  readonly handler: HookHandler;
  readonly conditions?: HookCondition[];
}

export interface HookExecutionContext {
  readonly hookName: string;
  readonly phase: HookPhase;
  readonly data: Record<string, unknown>;
  readonly metadata: Record<string, unknown>;
  readonly cancellationToken?: CancellationToken;
}

export interface HookResult {
  readonly success: boolean;
  readonly data?: Record<string, unknown>;
  readonly error?: Error;
  readonly metadata?: Record<string, unknown>;
  readonly stopPropagation?: boolean;
}

export interface HookHandler {
  (context: HookExecutionContext): Promise<HookResult>;
}

export interface HookCondition {
  readonly type: string;
  readonly value: unknown;
  readonly operator: ConditionOperator;
}

export interface CancellationToken {
  readonly isCancelled: boolean;
  cancel(): void;
  onCancelled(callback: () => void): void;
}

export interface ToolRegistry {
  register(pluginId: string, tool: ToolRegistration): Promise<void>;
  unregister(pluginId: string, toolName: string): Promise<void>;
  execute(toolName: string, input: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult>;
  getTool(toolName: string): Promise<ToolRegistration | null>;
  getAllTools(): Promise<Record<string, ToolRegistration>>;
  getToolsByCategory(category: ToolCategory): Promise<ToolRegistration[]>;
}

export interface ToolRegistration {
  readonly pluginId: string;
  readonly name: string;
  readonly description: string;
  readonly category: ToolCategory;
  readonly handler: ToolHandler;
  readonly inputSchema: Record<string, unknown>;
  readonly outputSchema: Record<string, unknown>;
  readonly permissions: ToolPermission[];
}

export interface ToolExecutionContext {
  readonly toolName: string;
  readonly pluginId: string;
  readonly user?: string;
  readonly session?: string;
  readonly metadata: Record<string, unknown>;
}

export interface ToolResult {
  readonly success: boolean;
  readonly data?: Record<string, unknown>;
  readonly error?: Error;
  readonly metadata?: Record<string, unknown>;
}

export interface ToolHandler {
  (input: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult>;
}

export interface PluginValidationResult {
  readonly valid: boolean;
  readonly errors: PluginValidationError[];
  readonly warnings: PluginValidationWarning[];
  readonly securityIssues: SecurityIssue[];
  readonly compatibilityIssues: CompatibilityIssue[];
}

export interface PluginValidationError {
  readonly type: string;
  readonly message: string;
  readonly field?: string;
  readonly severity: ValidationSeverity;
}

export interface PluginValidationWarning {
  readonly type: string;
  readonly message: string;
  readonly suggestion: string;
}

export interface SecurityIssue {
  readonly type: SecurityIssueType;
  readonly severity: SecuritySeverity;
  readonly message: string;
  readonly recommendation: string;
  readonly cve?: string;
}

export interface CompatibilityIssue {
  readonly type: string;
  readonly message: string;
  readonly affectedVersions: string[];
  readonly workaround?: string;
}

// Enums and types
export enum CapabilityType {
  HOOK = 'hook',
  TOOL = 'tool',
  STEERING = 'steering',
  TEMPLATE = 'template',
  QUALITY = 'quality',
  I18N = 'i18n',
  STORAGE = 'storage',
  NETWORK = 'network'
}

export enum HookType {
  FILTER = 'filter',
  ACTION = 'action',
  VALIDATOR = 'validator',
  TRANSFORMER = 'transformer',
  OBSERVER = 'observer'
}

export enum HookPhase {
  PRE_INIT = 'pre-init',
  POST_INIT = 'post-init',
  PRE_REQUIREMENTS = 'pre-requirements',
  POST_REQUIREMENTS = 'post-requirements',
  PRE_DESIGN = 'pre-design',
  POST_DESIGN = 'post-design',
  PRE_TASKS = 'pre-tasks',
  POST_TASKS = 'post-tasks',
  PRE_IMPLEMENTATION = 'pre-implementation',
  POST_IMPLEMENTATION = 'post-implementation',
  PRE_QUALITY_CHECK = 'pre-quality-check',
  POST_QUALITY_CHECK = 'post-quality-check',
  PRE_TEMPLATE_RENDER = 'pre-template-render',
  POST_TEMPLATE_RENDER = 'post-template-render',
  ERROR = 'error',
  SHUTDOWN = 'shutdown'
}

export enum ToolCategory {
  SDD = 'sdd',
  QUALITY = 'quality',
  TEMPLATE = 'template',
  FILE_SYSTEM = 'file-system',
  NETWORK = 'network',
  DATA = 'data',
  UTILITY = 'utility',
  INTEGRATION = 'integration'
}

export enum PermissionType {
  FILE_READ = 'file:read',
  FILE_WRITE = 'file:write',
  FILE_EXECUTE = 'file:execute',
  NETWORK_REQUEST = 'network:request',
  SYSTEM_INFO = 'system:info',
  ENVIRONMENT = 'environment',
  STORAGE = 'storage'
}

export enum SteeringDocumentType {
  PRODUCT = 'product',
  TECHNICAL = 'technical',
  STRUCTURE = 'structure',
  QUALITY = 'quality',
  PROCESS = 'process',
  CUSTOM = 'custom'
}

export enum SteeringMode {
  ALWAYS = 'always',
  CONDITIONAL = 'conditional',
  MANUAL = 'manual'
}

export enum ValidationType {
  REQUIRED = 'required',
  TYPE = 'type',
  RANGE = 'range',
  PATTERN = 'pattern',
  ENUM = 'enum',
  CUSTOM = 'custom'
}

export enum PluginCategory {
  SDD = 'sdd',
  QUALITY = 'quality',
  TEMPLATE = 'template',
  I18N = 'i18n',
  INTEGRATION = 'integration',
  UTILITY = 'utility',
  WORKFLOW = 'workflow',
  REPORTING = 'reporting'
}

export enum PluginMaturity {
  EXPERIMENTAL = 'experimental',
  ALPHA = 'alpha',
  BETA = 'beta',
  STABLE = 'stable',
  MATURE = 'mature',
  DEPRECATED = 'deprecated'
}

export enum PluginState {
  DISCOVERED = 'discovered',
  INSTALLING = 'installing',
  INSTALLED = 'installed',
  LOADING = 'loading',
  LOADED = 'loaded',
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  ERROR = 'error',
  UNINSTALLING = 'uninstalling'
}

export enum ValidationSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export enum SecurityIssueType {
  CODE_INJECTION = 'code-injection',
  PATH_TRAVERSAL = 'path-traversal',
  UNSAFE_DEPENDENCY = 'unsafe-dependency',
  PRIVILEGE_ESCALATION = 'privilege-escalation',
  DATA_EXPOSURE = 'data-exposure',
  MALICIOUS_CODE = 'malicious-code'
}

export enum SecuritySeverity {
  INFO = 'info',
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export enum ConditionOperator {
  EQUALS = 'eq',
  NOT_EQUALS = 'ne',
  GREATER_THAN = 'gt',
  GREATER_THAN_OR_EQUAL = 'gte',
  LESS_THAN = 'lt',
  LESS_THAN_OR_EQUAL = 'lte',
  CONTAINS = 'contains',
  STARTS_WITH = 'startsWith',
  ENDS_WITH = 'endsWith',
  MATCHES = 'matches',
  IN = 'in',
  NOT_IN = 'notIn'
}