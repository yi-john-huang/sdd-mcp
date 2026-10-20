// Port interfaces for Clean Architecture

import { Project, QualityReport, Task } from './types.js';

export interface ProjectRepository {
  save(project: Project): Promise<void>;
  findById(id: string): Promise<Project | null>;
  findByPath(path: string): Promise<Project | null>;
  list(): Promise<Project[]>;
  delete(id: string): Promise<void>;
}

export interface FileSystemPort {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  /** Atomically replaces a destination; implementations serialize writes per path. */
  writeFileAtomic?(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  mkdir(path: string): Promise<void>;
  readdir(path: string): Promise<string[]>;
  stat(path: string): Promise<{ isFile(): boolean; isDirectory(): boolean; size?: number }>;
  realpath?(path: string): Promise<string>;
  unlink?(path: string): Promise<void>;
}

export interface TemplateEngine {
  compile(template: string): Promise<TemplateFunction>;
  render(template: string, data: Record<string, unknown>): Promise<string>;
  registerHelper(name: string, helper: (...args: unknown[]) => string): void;
}

export interface TemplateFunction {
  (data: Record<string, unknown>): string;
}

export interface ConfigurationPort {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T): void;
  has(key: string): boolean;
}

export interface LoggerPort {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, error?: Error, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
}

export interface ValidationPort {
  validate<T>(data: unknown, schema: object): Promise<T>;
  createSchema(schemaDefinition: object): object;
}

export interface QualityAnalyzer {
  analyzeCode(code: string, language: string): Promise<QualityReport>;
  analyzeDataStructure(structure: object): Promise<QualityReport>;
  checkComplexity(code: string): Promise<number>;
  detectSpecialCases(code: string): Promise<string[]>;
}

/** The only JEV endpoint. No setting, env var, or argument may change it. */
export const JEV_DECIDE_URL = 'https://jevtypesafeai.com/api/v1/decide';

export interface JevHttpRequest {
  url: string;
  body: string;
  headers: Readonly<Record<string, string>>;
  timeoutMs: number;
  maxResponseBytes: number;
}

export interface JevHttpResponse {
  status: number;
  body: string;
}

export type JevTransportErrorKind = 'network' | 'timeout' | 'too-large';

/** Carries only a kind; never the underlying message, which could echo request headers. */
export class JevTransportError extends Error {
  constructor(readonly kind: JevTransportErrorKind) {
    super(`JEV transport failure: ${kind}`);
    this.name = 'JevTransportError';
  }
}

export interface JevHttpPort {
  /** One POST, no retry, no redirect following. Rejects only with JevTransportError. */
  post(request: JevHttpRequest): Promise<JevHttpResponse>;
}

export type GitResult = { ok: true; stdout: Buffer } | { ok: false };

export interface GitPort {
  /** Runs one read-only git command without a shell, with optional stdin. Never rejects. */
  run(args: readonly string[], cwd: string, input?: Buffer): Promise<GitResult>;
}

export interface TaskTracker {
  getTasks(projectId: string): Promise<Task[]>;
  updateTask(projectId: string, taskId: string, completed: boolean): Promise<void>;
  addTask(projectId: string, task: Omit<Task, 'id'>): Promise<Task>;
  removeTask(projectId: string, taskId: string): Promise<void>;
}