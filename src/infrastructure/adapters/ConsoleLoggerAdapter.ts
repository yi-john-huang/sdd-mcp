import { injectable } from 'inversify';
import { LoggerPort } from '../../domain/ports.js';

@injectable()
export class ConsoleLoggerAdapter implements LoggerPort {
  info(message: string, meta?: Record<string, unknown>): void {
    console.info(`[INFO] ${message}`, meta ? JSON.stringify(meta) : '');
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    console.warn(`[WARN] ${message}`, meta ? JSON.stringify(meta) : '');
  }

  error(message: string, error?: Error, meta?: Record<string, unknown>): void {
    console.error(`[ERROR] ${message}`, error?.stack ?? '', meta ? JSON.stringify(meta) : '');
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    if (process.env.NODE_ENV === 'development') {
      console.debug(`[DEBUG] ${message}`, meta ? JSON.stringify(meta) : '');
    }
  }
}