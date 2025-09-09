import { injectable, inject } from 'inversify';
import { ServerCapabilities, ClientCapabilities } from '@modelcontextprotocol/sdk/types.js';
import { LoggerPort } from '../../domain/ports.js';
import { TYPES } from '../di/types.js';

export interface NegotiatedCapabilities {
  server: ServerCapabilities;
  client: ClientCapabilities;
  features: {
    tools: boolean;
    resources: boolean;
    prompts: boolean;
    logging: boolean;
    roots: boolean;
  };
}

@injectable()
export class CapabilityNegotiator {
  constructor(
    @inject(TYPES.LoggerPort) private readonly logger: LoggerPort
  ) {}

  negotiate(clientCapabilities?: ClientCapabilities): NegotiatedCapabilities {
    const serverCapabilities: ServerCapabilities = {
      tools: {
        listChanged: true
      },
      resources: {
        subscribe: true,
        listChanged: true
      },
      prompts: {
        listChanged: true
      },
      logging: {}
    };

    const features = {
      tools: true, // Always support tools for SDD workflow
      resources: clientCapabilities?.resources !== undefined,
      prompts: clientCapabilities?.prompts !== undefined,
      logging: clientCapabilities?.logging !== undefined,
      roots: clientCapabilities?.roots !== undefined
    };

    this.logger.info('Capability negotiation completed', {
      serverCapabilities,
      clientCapabilities,
      negotiatedFeatures: features
    });

    return {
      server: serverCapabilities,
      client: clientCapabilities || {},
      features
    };
  }

  getToolCapabilities(): NonNullable<ServerCapabilities['tools']> {
    return {
      listChanged: true
    };
  }

  getResourceCapabilities(): NonNullable<ServerCapabilities['resources']> {
    return {
      subscribe: true,
      listChanged: true
    };
  }

  getPromptCapabilities(): NonNullable<ServerCapabilities['prompts']> {
    return {
      listChanged: true
    };
  }
}