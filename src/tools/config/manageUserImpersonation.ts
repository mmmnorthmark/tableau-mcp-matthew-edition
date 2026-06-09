import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Ok, Err } from 'ts-results-es';
import { z } from 'zod';

import { Server } from '../../server.js';
import { Tool } from '../tool.js';
import { getUserValidator, UserValidationConfig } from '../../utils/userValidation.js';
import { getAuditLogger, AuditLoggerConfig } from '../../utils/auditLogger.js';

const paramsSchema = {
  operation: z.enum(['get-settings', 'update-user-validation', 'update-audit-logging', 'get-stats', 'clear-stats']),
  userValidationConfig: z.object({
    allowedUsers: z.array(z.string()).optional(),
    allowedDomains: z.array(z.string()).optional(),
    blockedUsers: z.array(z.string()).optional(),
    blockedDomains: z.array(z.string()).optional(),
    requireEmailValidation: z.boolean().optional(),
    maxImpersonationAttempts: z.number().min(1).max(100).optional(),
  }).optional(),
  auditLoggingConfig: z.object({
    enableAuditLogging: z.boolean().optional(),
    logLevel: z.enum(['info', 'warn', 'error']).optional(),
    includeSensitiveData: z.boolean().optional(),
    maxLogEntries: z.number().min(100).max(10000).optional(),
  }).optional(),
};

export const getManageUserImpersonationTool = (server: Server): Tool<typeof paramsSchema> => {
  return new Tool({
    server,
    name: 'manage-user-impersonation',
    description: `**USER IMPERSONATION MANAGEMENT**

Manage user impersonation settings, validation rules, and audit logging for the Tableau Search MCP Server.

**Operations:**
- \`get-settings\`: Get current user impersonation and audit logging settings
- \`update-user-validation\`: Update user validation configuration
- \`update-audit-logging\`: Update audit logging configuration
- \`get-stats\`: Get validation and audit statistics
- \`clear-stats\`: Clear validation and audit statistics

**User Validation Configuration:**
- \`allowedUsers\`: Array of specific users allowed for impersonation
- \`allowedDomains\`: Array of email domains allowed for impersonation
- \`blockedUsers\`: Array of specific users blocked from impersonation
- \`blockedDomains\`: Array of email domains blocked from impersonation
- \`requireEmailValidation\`: Require valid email format (default: true)
- \`maxImpersonationAttempts\`: Maximum impersonation attempts per user per hour (default: 10)

**Audit Logging Configuration:**
- \`enableAuditLogging\`: Enable/disable audit logging (default: true)
- \`logLevel\`: Audit log level - info, warn, or error (default: info)
- \`includeSensitiveData\`: Include sensitive data in audit logs (default: false)
- \`maxLogEntries\`: Maximum number of audit log entries to keep (default: 1000)

**Security Notes:**
- User impersonation allows the MCP Server to authenticate as different users
- Validation rules help control who can be impersonated
- Audit logging tracks all impersonation activities for security monitoring
- Use least-privilege principle when configuring allowed users/domains

**Example Usage:**
- Get current settings: operation: "get-settings"
- Allow specific users: operation: "update-user-validation", userValidationConfig: { allowedUsers: ["john.doe@company.com", "jane.smith@company.com"] }
- Allow domain: operation: "update-user-validation", userValidationConfig: { allowedDomains: ["company.com"] }
- Block user: operation: "update-user-validation", userValidationConfig: { blockedUsers: ["blocked.user@company.com"] }
- Update audit settings: operation: "update-audit-logging", auditLoggingConfig: { logLevel: "warn", includeSensitiveData: false }
- Get statistics: operation: "get-stats"
- Clear statistics: operation: "clear-stats"
`,
    paramsSchema,
    annotations: {
      title: 'Manage User Impersonation',
      readOnlyHint: false,
      openWorldHint: false,
    },
    callback: async ({ operation, userValidationConfig, auditLoggingConfig }, { requestId }): Promise<CallToolResult> => {
      const userValidator = getUserValidator();
      const auditLogger = getAuditLogger(server);

      try {
        switch (operation) {
          case 'get-settings': {
            const userValidationStats = userValidator.getValidationStats();
            const auditStats = auditLogger.getAuditStats();
            
            return new Ok({
              userValidation: {
                stats: userValidationStats,
                config: {
                  // Note: Current config is not exposed, only stats
                  maxImpersonationAttempts: 10, // Default value
                }
              },
              auditLogging: {
                stats: auditStats,
                config: {
                  // Note: Current config is not exposed, only stats
                  maxLogEntries: 1000, // Default value
                }
              }
            });
          }

          case 'update-user-validation': {
            if (!userValidationConfig) {
              return new Err({
                type: 'validation',
                message: 'userValidationConfig is required for update-user-validation operation',
              });
            }

            const config: UserValidationConfig = {};
            
            if (userValidationConfig.allowedUsers) {
              config.allowedUsers = userValidationConfig.allowedUsers;
            }
            if (userValidationConfig.allowedDomains) {
              config.allowedDomains = userValidationConfig.allowedDomains;
            }
            if (userValidationConfig.blockedUsers) {
              config.blockedUsers = userValidationConfig.blockedUsers;
            }
            if (userValidationConfig.blockedDomains) {
              config.blockedDomains = userValidationConfig.blockedDomains;
            }
            if (userValidationConfig.requireEmailValidation !== undefined) {
              config.requireEmailValidation = userValidationConfig.requireEmailValidation;
            }
            if (userValidationConfig.maxImpersonationAttempts) {
              config.maxImpersonationAttempts = userValidationConfig.maxImpersonationAttempts;
            }

            userValidator.updateConfig(config);
            
            // Log configuration change
            auditLogger.logConfigurationChange(
              'update_user_validation',
              { userValidationConfig: config },
              requestId
            );

            return new Ok({
              message: 'User validation configuration updated successfully',
              config: config
            });
          }

          case 'update-audit-logging': {
            if (!auditLoggingConfig) {
              return new Err({
                type: 'validation',
                message: 'auditLoggingConfig is required for update-audit-logging operation',
              });
            }

            const config: AuditLoggerConfig = {};
            
            if (auditLoggingConfig.enableAuditLogging !== undefined) {
              config.enableAuditLogging = auditLoggingConfig.enableAuditLogging;
            }
            if (auditLoggingConfig.logLevel) {
              config.logLevel = auditLoggingConfig.logLevel;
            }
            if (auditLoggingConfig.includeSensitiveData !== undefined) {
              config.includeSensitiveData = auditLoggingConfig.includeSensitiveData;
            }
            if (auditLoggingConfig.maxLogEntries) {
              config.maxLogEntries = auditLoggingConfig.maxLogEntries;
            }

            auditLogger.updateConfig(config);
            
            // Log configuration change
            auditLogger.logConfigurationChange(
              'update_audit_logging',
              { auditLoggingConfig: config },
              requestId
            );

            return new Ok({
              message: 'Audit logging configuration updated successfully',
              config: config
            });
          }

          case 'get-stats': {
            const userValidationStats = userValidator.getValidationStats();
            const auditStats = auditLogger.getAuditStats();
            
            return new Ok({
              userValidation: userValidationStats,
              auditLogging: auditStats
            });
          }

          case 'clear-stats': {
            userValidator.clearStats();
            auditLogger.clearAuditEvents();
            
            // Log configuration change
            auditLogger.logConfigurationChange(
              'clear_stats',
              {},
              requestId
            );

            return new Ok({
              message: 'Statistics cleared successfully'
            });
          }

          default:
            return new Err({
              type: 'validation',
              message: `Unknown operation: ${operation}`,
            });
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        // Log error
        auditLogger.logConfigurationChange(
          'error',
          { operation, error: errorMessage },
          requestId
        );

        return new Err({
          type: 'error',
          message: `Failed to ${operation}: ${errorMessage}`,
        });
      }
    },
  });
};
