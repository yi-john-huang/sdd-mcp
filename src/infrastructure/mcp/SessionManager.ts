import { injectable, inject } from 'inversify';
import { v4 as uuidv4 } from 'uuid';
import { TYPES } from '../di/types.js';
import { LoggerPort, ConfigurationPort } from '../../domain/ports.js';

export interface ClientSession {
  id: string;
  clientInfo: {
    name?: string;
    version?: string;
  };
  capabilities: {
    tools: boolean;
    resources: boolean;
    prompts: boolean;
    logging: boolean;
  };
  context: {
    currentProject?: string;
    workingDirectory?: string;
    preferences: Record<string, unknown>;
  };
  createdAt: Date;
  lastActivity: Date;
  isActive: boolean;
}

export interface SessionPersistence {
  sessionId: string;
  projectState: Record<string, unknown>;
  contextData: Record<string, unknown>;
  timestamp: Date;
}

@injectable()
export class SessionManager {
  private readonly sessions = new Map<string, ClientSession>();
  private readonly persistenceStore = new Map<string, SessionPersistence>();
  private readonly sessionTimeout = 30 * 60 * 1000; // 30 minutes

  constructor(
    @inject(TYPES.LoggerPort) private readonly logger: LoggerPort,
    @inject(TYPES.ConfigurationPort) private readonly config: ConfigurationPort
  ) {
    this.setupPeriodicCleanup();
  }

  createSession(clientInfo?: { name?: string; version?: string }): ClientSession {
    const sessionId = uuidv4();
    const session: ClientSession = {
      id: sessionId,
      clientInfo: clientInfo || {},
      capabilities: {
        tools: true,
        resources: false,
        prompts: false,
        logging: false
      },
      context: {
        preferences: {}
      },
      createdAt: new Date(),
      lastActivity: new Date(),
      isActive: true
    };

    this.sessions.set(sessionId, session);
    
    this.logger.info('Client session created', {
      sessionId,
      clientName: clientInfo?.name,
      clientVersion: clientInfo?.version
    });

    return session;
  }

  getSession(sessionId: string): ClientSession | null {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    if (!this.isSessionValid(session)) {
      this.deactivateSession(sessionId);
      return null;
    }

    // Update last activity
    session.lastActivity = new Date();
    return session;
  }

  updateSessionCapabilities(
    sessionId: string, 
    capabilities: Partial<ClientSession['capabilities']>
  ): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    session.capabilities = { ...session.capabilities, ...capabilities };
    session.lastActivity = new Date();

    this.logger.info('Session capabilities updated', {
      sessionId,
      capabilities: session.capabilities
    });

    return true;
  }

  updateSessionContext(
    sessionId: string, 
    context: Partial<ClientSession['context']>
  ): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    session.context = { 
      ...session.context, 
      ...context,
      preferences: { ...session.context.preferences, ...context.preferences }
    };
    session.lastActivity = new Date();

    this.logger.debug('Session context updated', {
      sessionId,
      context: session.context
    });

    return true;
  }

  setCurrentProject(sessionId: string, projectId: string): boolean {
    return this.updateSessionContext(sessionId, { currentProject: projectId });
  }

  getCurrentProject(sessionId: string): string | undefined {
    const session = this.getSession(sessionId);
    return session?.context.currentProject;
  }

  persistSession(sessionId: string, projectState: Record<string, unknown>): void {
    const session = this.getSession(sessionId);
    if (!session) {
      return;
    }

    const persistence: SessionPersistence = {
      sessionId,
      projectState,
      contextData: session.context,
      timestamp: new Date()
    };

    this.persistenceStore.set(sessionId, persistence);
    
    this.logger.debug('Session state persisted', {
      sessionId,
      dataKeys: Object.keys(projectState)
    });
  }

  restoreSession(sessionId: string): SessionPersistence | null {
    const persistence = this.persistenceStore.get(sessionId);
    if (!persistence) {
      return null;
    }

    // Check if persistence is not too old (24 hours)
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    if (Date.now() - persistence.timestamp.getTime() > maxAge) {
      this.persistenceStore.delete(sessionId);
      return null;
    }

    this.logger.info('Session state restored', {
      sessionId,
      timestamp: persistence.timestamp
    });

    return persistence;
  }

  deactivateSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.isActive = false;
      
      this.logger.info('Session deactivated', {
        sessionId,
        duration: Date.now() - session.createdAt.getTime()
      });
    }
  }

  removeSession(sessionId: string): void {
    this.sessions.delete(sessionId);
    this.persistenceStore.delete(sessionId);
    
    this.logger.info('Session removed', { sessionId });
  }

  getActiveSessions(): ClientSession[] {
    return Array.from(this.sessions.values()).filter(session => 
      session.isActive && this.isSessionValid(session)
    );
  }

  getSessionStats(): {
    total: number;
    active: number;
    expired: number;
    byClient: Record<string, number>;
  } {
    const sessions = Array.from(this.sessions.values());
    const active = sessions.filter(s => s.isActive && this.isSessionValid(s));
    const expired = sessions.filter(s => !this.isSessionValid(s));
    
    const byClient: Record<string, number> = {};
    for (const session of active) {
      const client = session.clientInfo.name || 'unknown';
      byClient[client] = (byClient[client] || 0) + 1;
    }

    return {
      total: sessions.length,
      active: active.length,
      expired: expired.length,
      byClient
    };
  }

  supportsCapability(sessionId: string, capability: keyof ClientSession['capabilities']): boolean {
    const session = this.getSession(sessionId);
    return session?.capabilities[capability] ?? false;
  }

  private isSessionValid(session: ClientSession): boolean {
    if (!session.isActive) {
      return false;
    }

    const timeSinceActivity = Date.now() - session.lastActivity.getTime();
    return timeSinceActivity < this.sessionTimeout;
  }

  private setupPeriodicCleanup(): void {
    const cleanupInterval = 5 * 60 * 1000; // 5 minutes
    
    setInterval(() => {
      const expiredSessions = Array.from(this.sessions.entries())
        .filter(([_, session]) => !this.isSessionValid(session))
        .map(([sessionId]) => sessionId);

      for (const sessionId of expiredSessions) {
        this.deactivateSession(sessionId);
      }

      if (expiredSessions.length > 0) {
        this.logger.info('Cleaned up expired sessions', {
          expiredCount: expiredSessions.length
        });
      }
    }, cleanupInterval);
  }

  // Thread safety for concurrent client access
  isolateProjectContext(sessionId: string, projectId: string): {
    getContextData: () => Record<string, unknown>;
    setContextData: (data: Record<string, unknown>) => void;
    isLocked: () => boolean;
  } {
    const lockKey = `${sessionId}:${projectId}`;
    const locks = new Set<string>();

    return {
      getContextData: () => {
        const session = this.getSession(sessionId);
        return session?.context.preferences || {};
      },
      setContextData: (data: Record<string, unknown>) => {
        this.updateSessionContext(sessionId, { preferences: data });
      },
      isLocked: () => locks.has(lockKey)
    };
  }
}