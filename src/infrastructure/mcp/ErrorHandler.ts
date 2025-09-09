import { injectable, inject } from 'inversify';
import { LoggerPort } from '../../domain/ports.js';
import { TYPES } from '../di/types.js';

export enum MCPErrorCode {
  PARSE_ERROR = -32700,
  INVALID_REQUEST = -32600,
  METHOD_NOT_FOUND = -32601,
  INVALID_PARAMS = -32602,
  INTERNAL_ERROR = -32603,
  SERVER_ERROR_START = -32099,
  SERVER_ERROR_END = -32000
}

export interface MCPError {
  code: MCPErrorCode;
  message: string;
  data?: unknown;
}

export class MCPProtocolError extends Error {
  public readonly code: MCPErrorCode;
  public readonly data?: unknown;

  constructor(code: MCPErrorCode, message: string, data?: unknown) {
    super(message);
    this.name = 'MCPProtocolError';
    this.code = code;
    this.data = data;
  }
}

@injectable()
export class MCPErrorHandler {
  constructor(
    @inject(TYPES.LoggerPort) private readonly logger: LoggerPort
  ) {}

  handleError(error: unknown, correlationId?: string): MCPError {
    const context = { correlationId };

    if (error instanceof MCPProtocolError) {
      this.logger.warn('MCP protocol error', context);
      return {
        code: error.code,
        message: error.message,
        data: error.data
      };
    }

    if (error instanceof SyntaxError) {
      this.logger.error('JSON parse error', error, context);
      return {
        code: MCPErrorCode.PARSE_ERROR,
        message: 'Parse error'
      };
    }

    if (error instanceof Error) {
      this.logger.error('Unexpected error', error, context);
      return {
        code: MCPErrorCode.INTERNAL_ERROR,
        message: error.message
      };
    }

    this.logger.error('Unknown error', new Error(String(error)), context);
    return {
      code: MCPErrorCode.INTERNAL_ERROR,
      message: 'Internal error'
    };
  }

  validateRequest(request: unknown): void {
    if (typeof request !== 'object' || request === null) {
      throw new MCPProtocolError(
        MCPErrorCode.INVALID_REQUEST,
        'Request must be an object'
      );
    }

    const req = request as Record<string, unknown>;

    if (!req.jsonrpc || req.jsonrpc !== '2.0') {
      throw new MCPProtocolError(
        MCPErrorCode.INVALID_REQUEST,
        'Invalid or missing jsonrpc version'
      );
    }

    if (!req.method || typeof req.method !== 'string') {
      throw new MCPProtocolError(
        MCPErrorCode.INVALID_REQUEST,
        'Invalid or missing method'
      );
    }
  }

  validateToolParameters(params: unknown, expectedSchema?: Record<string, unknown>): void {
    if (expectedSchema && typeof params !== 'object') {
      throw new MCPProtocolError(
        MCPErrorCode.INVALID_PARAMS,
        'Tool parameters must be an object'
      );
    }

    // TODO: Implement JSON schema validation (integrate with ValidationPort)
  }

  createToolNotFoundError(toolName: string): MCPProtocolError {
    return new MCPProtocolError(
      MCPErrorCode.METHOD_NOT_FOUND,
      `Tool '${toolName}' not found`
    );
  }

  createInvalidParamsError(message: string, data?: unknown): MCPProtocolError {
    return new MCPProtocolError(
      MCPErrorCode.INVALID_PARAMS,
      message,
      data
    );
  }
}