import { injectable } from 'inversify';
import { LoggerPort } from '../../domain/ports.js';

@injectable()
export class ConsoleLoggerAdapter implements LoggerPort {
  info(message: string, meta?: Record<string, unknown>): void {
    const timestamp = new Date().toISOString();
    const correlationId = meta?.correlationId ? `[${meta.correlationId}] ` : '';
    console.info(`${timestamp} [INFO] ${correlationId}${message}`, 
      meta ? this.formatMeta(meta) : '');
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    const timestamp = new Date().toISOString();
    const correlationId = meta?.correlationId ? `[${meta.correlationId}] ` : '';
    console.warn(`${timestamp} [WARN] ${correlationId}${message}`, 
      meta ? this.formatMeta(meta) : '');
  }

  error(message: string, error?: Error, meta?: Record<string, unknown>): void {
    const timestamp = new Date().toISOString();
    const correlationId = meta?.correlationId ? `[${meta.correlationId}] ` : '';
    console.error(`${timestamp} [ERROR] ${correlationId}${message}`, 
      error?.stack ?? '', meta ? this.formatMeta(meta) : '');
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    if (process.env.NODE_ENV === 'development') {
      const timestamp = new Date().toISOString();
      const correlationId = meta?.correlationId ? `[${meta.correlationId}] ` : '';
      console.debug(`${timestamp} [DEBUG] ${correlationId}${message}`, 
        meta ? this.formatMeta(meta) : '');
    }
  }

  private formatMeta(meta: Record<string, unknown>): string {
    const cleanMeta = { ...meta };
    delete cleanMeta.correlationId; // Already in log prefix
    return Object.keys(cleanMeta).length > 0 ? JSON.stringify(cleanMeta) : '';
  }
}