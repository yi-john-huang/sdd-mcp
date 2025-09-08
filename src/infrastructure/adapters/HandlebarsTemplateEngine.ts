import Handlebars from 'handlebars';
import { injectable } from 'inversify';
import { TemplateEngine, TemplateFunction } from '../../domain/ports.js';

@injectable()
export class HandlebarsTemplateEngine implements TemplateEngine {
  constructor() {
    this.registerDefaultHelpers();
  }

  async compile(template: string): Promise<TemplateFunction> {
    return Handlebars.compile(template);
  }

  async render(template: string, data: Record<string, unknown>): Promise<string> {
    const compiledTemplate = await this.compile(template);
    return compiledTemplate(data);
  }

  registerHelper(name: string, helper: (...args: unknown[]) => string): void {
    Handlebars.registerHelper(name, helper);
  }

  private registerDefaultHelpers(): void {
    this.registerHelper('json', (context: unknown) => JSON.stringify(context, null, 2));
    this.registerHelper('date', (date: Date) => date.toISOString());
    this.registerHelper('uppercase', (str: string) => str.toUpperCase());
    this.registerHelper('lowercase', (str: string) => str.toLowerCase());
  }
}