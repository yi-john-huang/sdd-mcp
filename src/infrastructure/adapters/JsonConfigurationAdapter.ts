import { injectable } from 'inversify';
import { ConfigurationPort } from '../../domain/ports.js';

@injectable()
export class JsonConfigurationAdapter implements ConfigurationPort {
  private readonly config = new Map<string, unknown>();

  get<T>(key: string): T | undefined {
    return this.config.get(key) as T | undefined;
  }

  set<T>(key: string, value: T): void {
    this.config.set(key, value);
  }

  has(key: string): boolean {
    return this.config.has(key);
  }
}