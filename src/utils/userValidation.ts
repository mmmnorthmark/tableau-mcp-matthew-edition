import { log } from '../logging/log.js';
import { Server } from '../server.js';

export interface UserValidationConfig {
  allowedUsers?: string[];
  allowedDomains?: string[];
  blockedUsers?: string[];
  blockedDomains?: string[];
  requireEmailValidation?: boolean;
  maxImpersonationAttempts?: number;
}

export interface UserValidationResult {
  isValid: boolean;
  reason?: string;
  warnings?: string[];
}

export class UserValidator {
  private config: UserValidationConfig;
  private impersonationAttempts: Map<string, { count: number; lastAttempt: Date }> = new Map();

  constructor(config: UserValidationConfig = {}) {
    this.config = {
      allowedUsers: config.allowedUsers || [],
      allowedDomains: config.allowedDomains || [],
      blockedUsers: config.blockedUsers || [],
      blockedDomains: config.blockedDomains || [],
      requireEmailValidation: config.requireEmailValidation ?? true,
      maxImpersonationAttempts: config.maxImpersonationAttempts || 10,
    };
  }

  /**
   * Validate if a user can be impersonated
   */
  validateUser(userEmail: string, server: Server): UserValidationResult {
    const warnings: string[] = [];
    
    // Basic email format validation
    if (this.config.requireEmailValidation && !this.isValidEmail(userEmail)) {
      return {
        isValid: false,
        reason: 'Invalid email format',
      };
    }

    // Check if user is explicitly blocked
    if (this.config.blockedUsers?.includes(userEmail)) {
      return {
        isValid: false,
        reason: 'User is explicitly blocked from impersonation',
      };
    }

    // Check if user's domain is blocked
    const domain = this.extractDomain(userEmail);
    if (domain && this.config.blockedDomains?.includes(domain)) {
      return {
        isValid: false,
        reason: `Domain ${domain} is blocked from impersonation`,
      };
    }

    // Check if user is explicitly allowed
    if (this.config.allowedUsers?.length > 0 && !this.config.allowedUsers.includes(userEmail)) {
      return {
        isValid: false,
        reason: 'User is not in the allowed users list',
      };
    }

    // Check if user's domain is allowed
    if (this.config.allowedDomains?.length > 0 && domain && !this.config.allowedDomains.includes(domain)) {
      return {
        isValid: false,
        reason: `Domain ${domain} is not in the allowed domains list`,
      };
    }

    // Check impersonation attempt limits
    const attemptResult = this.checkImpersonationAttempts(userEmail);
    if (!attemptResult.isValid) {
      return attemptResult;
    }

    // Log successful validation
    log.info(server, `User validation passed for: ${userEmail}`);

    return {
      isValid: true,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Check if email format is valid
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Extract domain from email
   */
  private extractDomain(email: string): string | null {
    const parts = email.split('@');
    return parts.length === 2 ? parts[1].toLowerCase() : null;
  }

  /**
   * Check impersonation attempt limits
   */
  private checkImpersonationAttempts(userEmail: string): UserValidationResult {
    const now = new Date();
    const attempts = this.impersonationAttempts.get(userEmail);

    if (!attempts) {
      // First attempt
      this.impersonationAttempts.set(userEmail, { count: 1, lastAttempt: now });
      return { isValid: true };
    }

    // Reset counter if last attempt was more than 1 hour ago
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    if (attempts.lastAttempt < oneHourAgo) {
      this.impersonationAttempts.set(userEmail, { count: 1, lastAttempt: now });
      return { isValid: true };
    }

    // Check if limit exceeded
    if (attempts.count >= this.config.maxImpersonationAttempts!) {
      return {
        isValid: false,
        reason: `Too many impersonation attempts for user ${userEmail}. Limit: ${this.config.maxImpersonationAttempts} per hour`,
      };
    }

    // Increment counter
    attempts.count++;
    attempts.lastAttempt = now;
    this.impersonationAttempts.set(userEmail, attempts);

    return { isValid: true };
  }

  /**
   * Get validation statistics
   */
  getValidationStats(): {
    totalAttempts: number;
    activeUsers: number;
    blockedUsers: string[];
  } {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    
    let totalAttempts = 0;
    let activeUsers = 0;
    const blockedUsers: string[] = [];

    for (const [userEmail, attempts] of this.impersonationAttempts) {
      totalAttempts += attempts.count;
      
      if (attempts.lastAttempt > oneHourAgo) {
        activeUsers++;
      }
      
      if (attempts.count >= this.config.maxImpersonationAttempts!) {
        blockedUsers.push(userEmail);
      }
    }

    return {
      totalAttempts,
      activeUsers,
      blockedUsers,
    };
  }

  /**
   * Clear validation statistics
   */
  clearStats(): void {
    this.impersonationAttempts.clear();
  }

  /**
   * Update validation configuration
   */
  updateConfig(newConfig: Partial<UserValidationConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
}

// Global user validator instance
let globalUserValidator: UserValidator | null = null;

export function getUserValidator(): UserValidator {
  if (!globalUserValidator) {
    globalUserValidator = new UserValidator();
  }
  return globalUserValidator;
}

export function initializeUserValidator(config: UserValidationConfig): UserValidator {
  globalUserValidator = new UserValidator(config);
  return globalUserValidator;
}
