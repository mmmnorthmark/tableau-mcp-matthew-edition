import { log } from '../logging/log.js';
import { Server } from '../server.js';

export interface AuditEvent {
  timestamp: Date;
  eventType: 'user_impersonation' | 'search_request' | 'authentication' | 'configuration_change';
  userId?: string;
  impersonatedUser?: string;
  action: string;
  details: Record<string, any>;
  requestId?: string;
  success: boolean;
  errorMessage?: string;
}

export interface AuditLoggerConfig {
  enableAuditLogging: boolean;
  logLevel: 'info' | 'warn' | 'error';
  includeSensitiveData: boolean;
  maxLogEntries: number;
}

export class AuditLogger {
  private config: AuditLoggerConfig;
  private auditEvents: AuditEvent[] = [];
  private server: Server;

  constructor(server: Server, config: AuditLoggerConfig) {
    this.server = server;
    this.config = {
      enableAuditLogging: config.enableAuditLogging ?? true,
      logLevel: config.logLevel ?? 'info',
      includeSensitiveData: config.includeSensitiveData ?? false,
      maxLogEntries: config.maxLogEntries ?? 1000,
    };
  }

  /**
   * Log an audit event
   */
  logEvent(event: Omit<AuditEvent, 'timestamp'>): void {
    if (!this.config.enableAuditLogging) {
      return;
    }

    const auditEvent: AuditEvent = {
      ...event,
      timestamp: new Date(),
    };

    // Add to in-memory store
    this.auditEvents.push(auditEvent);

    // Trim to max entries
    if (this.auditEvents.length > this.config.maxLogEntries) {
      this.auditEvents = this.auditEvents.slice(-this.config.maxLogEntries);
    }

    // Log to console/file based on level
    this.logToConsole(auditEvent);
  }

  /**
   * Log user impersonation event
   */
  logUserImpersonation(
    impersonatedUser: string,
    action: string,
    requestId?: string,
    success: boolean = true,
    errorMessage?: string,
    details: Record<string, any> = {}
  ): void {
    this.logEvent({
      eventType: 'user_impersonation',
      impersonatedUser,
      action,
      details: this.sanitizeDetails(details),
      requestId,
      success,
      errorMessage,
    });
  }

  /**
   * Log search request event
   */
  logSearchRequest(
    query: string,
    userEmail?: string,
    requestId?: string,
    success: boolean = true,
    errorMessage?: string,
    details: Record<string, any> = {}
  ): void {
    this.logEvent({
      eventType: 'search_request',
      userId: userEmail,
      action: 'search_content',
      details: this.sanitizeDetails({
        query: this.config.includeSensitiveData ? query : this.maskQuery(query),
        contentTypes: details.contentTypes,
        maxResults: details.maxResults,
        instanceCount: details.instanceCount,
        resultCount: details.resultCount,
        ...details,
      }),
      requestId,
      success,
      errorMessage,
    });
  }

  /**
   * Log authentication event
   */
  logAuthentication(
    instanceName: string,
    userEmail: string,
    authType: string,
    success: boolean = true,
    errorMessage?: string,
    details: Record<string, any> = {}
  ): void {
    this.logEvent({
      eventType: 'authentication',
      userId: userEmail,
      action: 'authenticate',
      details: this.sanitizeDetails({
        instanceName,
        authType,
        ...details,
      }),
      success,
      errorMessage,
    });
  }

  /**
   * Log configuration change event
   */
  logConfigurationChange(
    changeType: string,
    details: Record<string, any> = {},
    requestId?: string
  ): void {
    this.logEvent({
      eventType: 'configuration_change',
      action: changeType,
      details: this.sanitizeDetails(details),
      requestId,
      success: true,
    });
  }

  /**
   * Get audit events
   */
  getAuditEvents(
    eventType?: string,
    userId?: string,
    limit?: number
  ): AuditEvent[] {
    let filteredEvents = this.auditEvents;

    if (eventType) {
      filteredEvents = filteredEvents.filter(event => event.eventType === eventType);
    }

    if (userId) {
      filteredEvents = filteredEvents.filter(event => 
        event.userId === userId || event.impersonatedUser === userId
      );
    }

    if (limit) {
      filteredEvents = filteredEvents.slice(-limit);
    }

    return filteredEvents;
  }

  /**
   * Get audit statistics
   */
  getAuditStats(): {
    totalEvents: number;
    eventsByType: Record<string, number>;
    eventsByUser: Record<string, number>;
    recentEvents: AuditEvent[];
  } {
    const eventsByType: Record<string, number> = {};
    const eventsByUser: Record<string, number> = {};

    for (const event of this.auditEvents) {
      eventsByType[event.eventType] = (eventsByType[event.eventType] || 0) + 1;
      
      const user = event.userId || event.impersonatedUser;
      if (user) {
        eventsByUser[user] = (eventsByUser[user] || 0) + 1;
      }
    }

    return {
      totalEvents: this.auditEvents.length,
      eventsByType,
      eventsByUser,
      recentEvents: this.auditEvents.slice(-10),
    };
  }

  /**
   * Clear audit events
   */
  clearAuditEvents(): void {
    this.auditEvents = [];
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<AuditLoggerConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Log to console based on level
   */
  private logToConsole(event: AuditEvent): void {
    const logMessage = this.formatAuditEvent(event);
    
    switch (this.config.logLevel) {
      case 'error':
        if (!event.success) {
          log.error(this.server, logMessage);
        }
        break;
      case 'warn':
        if (!event.success || event.eventType === 'user_impersonation') {
          log.warn(this.server, logMessage);
        }
        break;
      case 'info':
      default:
        log.info(this.server, logMessage);
        break;
    }
  }

  /**
   * Format audit event for logging
   */
  private formatAuditEvent(event: AuditEvent): string {
    const parts = [
      `[AUDIT] ${event.eventType.toUpperCase()}`,
      `Action: ${event.action}`,
      `Success: ${event.success}`,
    ];

    if (event.userId) {
      parts.push(`User: ${event.userId}`);
    }

    if (event.impersonatedUser) {
      parts.push(`Impersonated: ${event.impersonatedUser}`);
    }

    if (event.requestId) {
      parts.push(`Request: ${event.requestId}`);
    }

    if (event.errorMessage) {
      parts.push(`Error: ${event.errorMessage}`);
    }

    if (Object.keys(event.details).length > 0) {
      parts.push(`Details: ${JSON.stringify(event.details)}`);
    }

    return parts.join(' | ');
  }

  /**
   * Sanitize details to remove sensitive information
   */
  private sanitizeDetails(details: Record<string, any>): Record<string, any> {
    if (this.config.includeSensitiveData) {
      return details;
    }

    const sanitized = { ...details };
    
    // Remove sensitive fields
    delete sanitized.password;
    delete sanitized.token;
    delete sanitized.secret;
    delete sanitized.key;
    delete sanitized.credential;
    
    // Mask email addresses
    if (sanitized.userEmail) {
      sanitized.userEmail = this.maskEmail(sanitized.userEmail);
    }
    
    if (sanitized.impersonatedUser) {
      sanitized.impersonatedUser = this.maskEmail(sanitized.impersonatedUser);
    }

    return sanitized;
  }

  /**
   * Mask email address
   */
  private maskEmail(email: string): string {
    const [localPart, domain] = email.split('@');
    if (localPart.length <= 2) {
      return `${localPart[0]}*@${domain}`;
    }
    return `${localPart[0]}${'*'.repeat(localPart.length - 2)}${localPart[localPart.length - 1]}@${domain}`;
  }

  /**
   * Mask search query
   */
  private maskQuery(query: string): string {
    if (query.length <= 10) {
      return query;
    }
    return `${query.substring(0, 5)}...${query.substring(query.length - 2)}`;
  }
}

// Global audit logger instance
let globalAuditLogger: AuditLogger | null = null;

export function getAuditLogger(server: Server): AuditLogger {
  if (!globalAuditLogger) {
    globalAuditLogger = new AuditLogger(server, {
      enableAuditLogging: true,
      logLevel: 'info',
      includeSensitiveData: false,
      maxLogEntries: 1000,
    });
  }
  return globalAuditLogger;
}

export function initializeAuditLogger(server: Server, config: AuditLoggerConfig): AuditLogger {
  globalAuditLogger = new AuditLogger(server, config);
  return globalAuditLogger;
}
