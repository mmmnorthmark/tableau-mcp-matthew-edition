import { describe, it, expect, beforeEach } from 'vitest';
import { getUserValidator, UserValidationConfig } from './utils/userValidation.js';
import { getAuditLogger, AuditLoggerConfig } from './utils/auditLogger.js';
import { Server } from './server.js';

// Mock server for testing
const mockServer = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  server: {
    notification: () => {},
  },
} as unknown as Server;

describe('User Impersonation', () => {
  beforeEach(() => {
    // Clear any existing state
    const userValidator = getUserValidator();
    const auditLogger = getAuditLogger(mockServer);
    userValidator.clearStats();
    auditLogger.clearAuditEvents();
  });

  describe('User Validation', () => {
    it('should validate valid email addresses', () => {
      const userValidator = getUserValidator();
      
      const result = userValidator.validateUser('john.doe@company.com', mockServer);
      
      expect(result.isValid).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should reject invalid email addresses', () => {
      const userValidator = getUserValidator();
      
      const result = userValidator.validateUser('invalid-email', mockServer);
      
      expect(result.isValid).toBe(false);
      expect(result.reason).toBe('Invalid email format');
    });

    it('should allow users in allowed domains', () => {
      const userValidator = getUserValidator();
      userValidator.updateConfig({
        allowedDomains: ['company.com', 'example.org'],
      });
      
      const result = userValidator.validateUser('user@company.com', mockServer);
      
      expect(result.isValid).toBe(true);
    });

    it('should block users in blocked domains', () => {
      const userValidator = getUserValidator();
      userValidator.updateConfig({
        blockedDomains: ['blocked.com'],
      });
      
      const result = userValidator.validateUser('user@blocked.com', mockServer);
      
      expect(result.isValid).toBe(false);
      expect(result.reason).toBe('Domain blocked.com is blocked from impersonation');
    });

    it('should track impersonation attempts', () => {
      const userValidator = getUserValidator();
      
      // First attempt
      const result1 = userValidator.validateUser('user@company.com', mockServer);
      expect(result1.isValid).toBe(true);
      
      // Check stats
      const stats = userValidator.getValidationStats();
      expect(stats.totalAttempts).toBe(1);
      expect(stats.activeUsers).toBe(1);
    });
  });

  describe('Audit Logging', () => {
    it('should log user impersonation events', () => {
      const auditLogger = getAuditLogger(mockServer);
      
      auditLogger.logUserImpersonation(
        'john.doe@company.com',
        'test_action',
        'test-request-123',
        true,
        undefined,
        { testData: 'value' }
      );
      
      const events = auditLogger.getAuditEvents('user_impersonation');
      expect(events).toHaveLength(1);
      expect(events[0].impersonatedUser).toBe('john.doe@company.com');
      expect(events[0].action).toBe('test_action');
      expect(events[0].success).toBe(true);
    });

    it('should log search request events', () => {
      const auditLogger = getAuditLogger(mockServer);
      
      auditLogger.logSearchRequest(
        'test query',
        'user@company.com',
        'test-request-123',
        true,
        undefined,
        { resultCount: 5 }
      );
      
      const events = auditLogger.getAuditEvents('search_request');
      expect(events).toHaveLength(1);
      expect(events[0].userId).toBe('user@company.com');
      expect(events[0].action).toBe('search_content');
      expect(events[0].success).toBe(true);
    });

    it('should log authentication events', () => {
      const auditLogger = getAuditLogger(mockServer);
      
      auditLogger.logAuthentication(
        'test-instance',
        'user@company.com',
        'direct-trust',
        true,
        undefined,
        { siteName: 'test-site' }
      );
      
      const events = auditLogger.getAuditEvents('authentication');
      expect(events).toHaveLength(1);
      expect(events[0].userId).toBe('user@company.com');
      expect(events[0].action).toBe('authenticate');
      expect(events[0].success).toBe(true);
    });

    it('should provide audit statistics', () => {
      const auditLogger = getAuditLogger(mockServer);
      
      // Log some events
      auditLogger.logUserImpersonation('user1@company.com', 'action1', 'req1', true);
      auditLogger.logUserImpersonation('user2@company.com', 'action2', 'req2', true);
      auditLogger.logSearchRequest('query', 'user1@company.com', 'req3', true);
      
      const stats = auditLogger.getAuditStats();
      expect(stats.totalEvents).toBe(3);
      expect(stats.eventsByType.user_impersonation).toBe(2);
      expect(stats.eventsByType.search_request).toBe(1);
      expect(stats.eventsByUser['user1@company.com']).toBe(2);
      expect(stats.eventsByUser['user2@company.com']).toBe(1);
    });

    it('should sanitize sensitive data when configured', () => {
      const auditLogger = getAuditLogger(mockServer);
      auditLogger.updateConfig({
        includeSensitiveData: false,
      });
      
      auditLogger.logUserImpersonation(
        'user@company.com',
        'test',
        'req1',
        true,
        undefined,
        { password: 'secret', token: 'abc123', userEmail: 'user@company.com' }
      );
      
      const events = auditLogger.getAuditEvents();
      const event = events[0];
      
      // Sensitive fields should be removed
      expect(event.details.password).toBeUndefined();
      expect(event.details.token).toBeUndefined();
      
      // Email should be masked
      expect(event.details.userEmail).toMatch(/\*.*@company\.com/);
    });
  });

  describe('Integration', () => {
    it('should work together for user impersonation flow', () => {
      const userValidator = getUserValidator();
      const auditLogger = getAuditLogger(mockServer);
      
      // Configure validation
      userValidator.updateConfig({
        allowedDomains: ['company.com'],
        maxImpersonationAttempts: 5,
      });
      
      // Validate user
      const validationResult = userValidator.validateUser('john.doe@company.com', mockServer);
      expect(validationResult.isValid).toBe(true);
      
      // Log impersonation
      auditLogger.logUserImpersonation(
        'john.doe@company.com',
        'search_content',
        'req-123',
        true,
        undefined,
        { query: 'test query' }
      );
      
      // Verify both systems recorded the activity
      const validationStats = userValidator.getValidationStats();
      const auditStats = auditLogger.getAuditStats();
      
      expect(validationStats.totalAttempts).toBe(1);
      expect(auditStats.totalEvents).toBe(1);
      expect(auditStats.eventsByType.user_impersonation).toBe(1);
    });
  });
});
