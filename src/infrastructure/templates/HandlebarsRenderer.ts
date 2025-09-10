// Handlebars template renderer implementation

import { injectable } from 'inversify';
import Handlebars from 'handlebars';
import type { 
  TemplateRendererPort, 
  CompiledTemplate, 
  TemplateData, 
  TemplateContext 
} from '../../domain/templates/index.js';
import type { LoggerPort } from '../../domain/ports.js';
import { inject } from 'inversify';
import { TYPES } from '../di/types.js';

class HandlebarsCompiledTemplate implements CompiledTemplate {
  constructor(
    public readonly name: string,
    public readonly template: string,
    public readonly compiledAt: Date,
    private readonly handlebarsTemplate: HandlebarsTemplateDelegate<TemplateData>
  ) {}

  render(data: TemplateData, context: TemplateContext): string {
    const combinedData = {
      ...data,
      context,
      helpers: {
        formatDate: (date: Date | string, format = 'YYYY-MM-DD') => {
          const d = typeof date === 'string' ? new Date(date) : date;
          return d.toISOString().split('T')[0];
        },
        uppercase: (str: string) => str?.toUpperCase() ?? '',
        lowercase: (str: string) => str?.toLowerCase() ?? '',
        capitalize: (str: string) => {
          if (!str) return '';
          return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
        },
        join: (array: unknown[], separator = ', ') => {
          if (!Array.isArray(array)) return '';
          return array.join(separator);
        },
        default: (value: unknown, defaultValue: unknown) => value ?? defaultValue
      }
    };

    return this.handlebarsTemplate(combinedData);
  }
}

@injectable()
export class HandlebarsRenderer implements TemplateRendererPort {
  private readonly templateCache = new Map<string, CompiledTemplate>();
  private readonly handlebarsInstance: typeof Handlebars;

  constructor(
    @inject(TYPES.LoggerPort) private readonly logger: LoggerPort
  ) {
    this.handlebarsInstance = Handlebars.create();
    this.registerBuiltInHelpers();
  }

  async compile(template: string, name?: string): Promise<CompiledTemplate> {
    try {
      const templateName = name ?? `template_${Date.now()}`;
      const handlebarsTemplate = this.handlebarsInstance.compile(template);
      
      const compiled = new HandlebarsCompiledTemplate(
        templateName,
        template,
        new Date(),
        handlebarsTemplate
      );

      if (name) {
        this.templateCache.set(name, compiled);
      }

      this.logger.debug('Template compiled successfully', { name: templateName });
      return compiled;
    } catch (error) {
      this.logger.error('Template compilation failed', error instanceof Error ? error : new Error(String(error)), { 
        name
      });
      throw new Error(`Template compilation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async render(templateName: string, data: TemplateData, context: TemplateContext): Promise<string> {
    const compiled = this.templateCache.get(templateName);
    if (!compiled) {
      throw new Error(`Template '${templateName}' not found in cache`);
    }

    try {
      const result = compiled.render(data, context);
      this.logger.debug('Template rendered successfully', { templateName });
      return result;
    } catch (error) {
      this.logger.error('Template rendering failed', error instanceof Error ? error : new Error(String(error)), { 
        templateName
      });
      throw new Error(`Template rendering failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async renderString(template: string, data: TemplateData, context: TemplateContext): Promise<string> {
    try {
      const compiled = await this.compile(template);
      return compiled.render(data, context);
    } catch (error) {
      this.logger.error('String template rendering failed', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  registerHelper(name: string, helper: (...args: unknown[]) => unknown): void {
    this.handlebarsInstance.registerHelper(name, helper);
    this.logger.debug('Template helper registered', { name });
  }

  async registerPartial(name: string, template: string): Promise<void> {
    try {
      this.handlebarsInstance.registerPartial(name, template);
      this.logger.debug('Template partial registered', { name });
    } catch (error) {
      this.logger.error('Template partial registration failed', error instanceof Error ? error : new Error(String(error)), { 
        name
      });
      throw new Error(`Partial registration failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  clearCache(): void {
    this.templateCache.clear();
    this.logger.debug('Template cache cleared');
  }

  private registerBuiltInHelpers(): void {
    // Date formatting helper
    this.registerHelper('formatDate', (date: Date | string, format = 'YYYY-MM-DD') => {
      if (!date) return '';
      const d = typeof date === 'string' ? new Date(date) : date;
      if (isNaN(d.getTime())) return '';
      
      switch (format) {
        case 'YYYY-MM-DD':
          return d.toISOString().split('T')[0];
        case 'MM/DD/YYYY':
          return `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')}/${d.getFullYear()}`;
        case 'DD/MM/YYYY':
          return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
        case 'relative':
          return this.getRelativeTime(d);
        default:
          return d.toLocaleDateString();
      }
    });

    // String manipulation helpers
    this.registerHelper('uppercase', (str: string) => str?.toUpperCase() ?? '');
    this.registerHelper('lowercase', (str: string) => str?.toLowerCase() ?? '');
    this.registerHelper('capitalize', (str: string) => {
      if (!str) return '';
      return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    });
    
    this.registerHelper('kebabCase', (str: string) => {
      if (!str) return '';
      return str.replace(/\s+/g, '-').toLowerCase();
    });
    
    this.registerHelper('camelCase', (str: string) => {
      if (!str) return '';
      return str.replace(/[-_\s]+(.)?/g, (_, char) => char ? char.toUpperCase() : '');
    });

    // Array and object helpers
    this.registerHelper('join', (array: unknown[], separator = ', ') => {
      if (!Array.isArray(array)) return '';
      return array.join(String(separator));
    });

    this.registerHelper('length', (value: unknown) => {
      if (Array.isArray(value)) return value.length;
      if (typeof value === 'string') return value.length;
      if (value && typeof value === 'object') return Object.keys(value).length;
      return 0;
    });

    // Conditional helpers
    this.registerHelper('default', (value: unknown, defaultValue: unknown) => {
      return value ?? defaultValue;
    });

    this.registerHelper('eq', (a: unknown, b: unknown) => a === b);
    this.registerHelper('ne', (a: unknown, b: unknown) => a !== b);
    this.registerHelper('gt', (a: number, b: number) => a > b);
    this.registerHelper('lt', (a: number, b: number) => a < b);
    this.registerHelper('gte', (a: number, b: number) => a >= b);
    this.registerHelper('lte', (a: number, b: number) => a <= b);

    // SDD-specific helpers
    this.registerHelper('taskStatus', (completed: boolean) => {
      return completed ? '[x]' : '[ ]';
    });

    this.registerHelper('phaseStatus', (phase: string, currentPhase: string) => {
      const phases = ['INIT', 'REQUIREMENTS', 'DESIGN', 'TASKS', 'IMPLEMENTATION'];
      const phaseIndex = phases.indexOf(phase);
      const currentIndex = phases.indexOf(currentPhase);
      
      if (phaseIndex < currentIndex) return 'completed';
      if (phaseIndex === currentIndex) return 'active';
      return 'pending';
    });

    this.registerHelper('generateId', () => {
      return Math.random().toString(36).substr(2, 9);
    });

    this.registerHelper('indent', (text: string, spaces = 2) => {
      if (!text) return '';
      const indent = ' '.repeat(Number(spaces));
      return text.split('\n').map(line => indent + line).join('\n');
    });

    this.logger.debug('Built-in template helpers registered');
  }

  private getRelativeTime(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSeconds < 60) return 'just now';
    if (diffMinutes < 60) return `${diffMinutes} minutes ago`;
    if (diffHours < 24) return `${diffHours} hours ago`;
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
    return `${Math.floor(diffDays / 365)} years ago`;
  }
}