import { RequestId } from '@modelcontextprotocol/sdk/types.js';
import { log } from './logging/log.js';
import { Server } from './server.js';
import RestApi from './sdks/tableau/restApi.js';
import { TableauInstance } from './config.js';
import { getRequestInterceptor, getRequestErrorInterceptor, getResponseInterceptor, getResponseErrorInterceptor } from './restApiInstance.js';
import { ConfigManager } from './configManager.js';
import { getJwtForUser, ConnectedAppConfig } from './utils/getJwt.js';
import { getAuditLogger } from './utils/auditLogger.js';

export interface InstanceHealth {
  instanceName: string;
  healthy: boolean;
  lastCheck: Date;
  responseTime: number;
  error?: string;
}

export interface InstanceConnection {
  instance: TableauInstance;
  restApi: RestApi;
  health: InstanceHealth;
  lastUsed: Date;
  requestCount: number;
}

export class InstanceManager {
  private instances: Map<string, InstanceConnection> = new Map();
  private configManager: ConfigManager;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private readonly server: Server;
  private readonly requestId: RequestId;
  private lastConfigVersion: number = 0;
  private currentUser: string | null = null;

  constructor(server: Server, requestId: RequestId, configManager: ConfigManager, userEmail?: string) {
    this.server = server;
    this.requestId = requestId;
    this.configManager = configManager;
    this.currentUser = userEmail || null;
  }

  // Set the current user for impersonation
  setCurrentUser(userEmail: string): void {
    this.currentUser = userEmail;
    log.info(this.server, `User impersonation set to: ${userEmail}`);
  }

  // Get the current user
  getCurrentUser(): string | null {
    return this.currentUser;
  }

  // Re-authenticate all instances with the current user
  async reauthenticateAllInstances(): Promise<void> {
    log.info(this.server, `Re-authenticating all instances for user: ${this.currentUser || 'default'}`);
    
    for (const [name, connection] of this.instances) {
      try {
        // Sign out from current session
        await connection.restApi.signOut();
        
        // Re-authenticate with current user
        await this.authenticateInstance(connection.restApi, connection.instance);
        
        // Update health status
        connection.health.healthy = true;
        connection.health.lastCheck = new Date();
        connection.health.error = undefined;
        
        log.info(this.server, `Re-authenticated instance: ${name}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        log.error(this.server, `Failed to re-authenticate instance ${name}: ${errorMessage}`);
        
        // Mark as unhealthy
        connection.health.healthy = false;
        connection.health.error = errorMessage;
      }
    }
  }

  // Initialize from ConfigManager
  async initializeFromConfigManager(): Promise<void> {
    const instances = this.configManager.getEnabledInstances();
    await this.initializeInstances(instances);
    this.lastConfigVersion = this.configManager.getStatus().version;
  }

  async initializeInstances(tableauInstances: TableauInstance[]): Promise<void> {
    log.info(this.server, `Initializing ${tableauInstances.length} Tableau instances`);
    
    for (const instance of tableauInstances) {
      if (!instance.enabled) {
        log.info(this.server, `Skipping disabled instance: ${instance.name}`);
        continue;
      }
      
      try {
        await this.addInstance(instance);
      } catch (error) {
        log.error(this.server, `Failed to initialize instance ${instance.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    // Start health check interval
    this.startHealthChecks();
  }

  // Hot-reload instances when configuration changes
  async reloadInstances(): Promise<void> {
    log.info(this.server, 'Reloading instances due to configuration change');
    
    // Get current instances from ConfigManager
    const currentInstances = this.configManager.getEnabledInstances();
    const currentInstanceNames = new Set(currentInstances.map(i => i.name));
    const existingInstanceNames = new Set(this.instances.keys());
    
    // Remove instances that are no longer in config
    for (const existingName of existingInstanceNames) {
      if (!currentInstanceNames.has(existingName)) {
        await this.removeInstance(existingName);
      }
    }
    
    // Add or update instances
    for (const instance of currentInstances) {
      if (existingInstanceNames.has(instance.name)) {
        // Update existing instance
        await this.updateInstance(instance);
      } else {
        // Add new instance
        await this.addInstance(instance);
      }
    }
    
    this.lastConfigVersion = this.configManager.getStatus().version;
  }

  // Check if configuration has changed and reload if necessary
  async checkAndReloadIfNeeded(): Promise<void> {
    if (this.configManager.hasChanged(this.lastConfigVersion)) {
      await this.reloadInstances();
    }
  }

  private async addInstance(instance: TableauInstance): Promise<void> {
    log.info(this.server, `Adding instance: ${instance.name} (${instance.server})`);
    
    const restApi = new RestApi(instance.server, {
      requestInterceptor: [
        getRequestInterceptor(this.server, this.requestId),
        getRequestErrorInterceptor(this.server, this.requestId),
      ],
      responseInterceptor: [
        getResponseInterceptor(this.server, this.requestId),
        getResponseErrorInterceptor(this.server, this.requestId),
      ],
    });

    // Authenticate the instance
    await this.authenticateInstance(restApi, instance);
    
    // Create connection object
    const connection: InstanceConnection = {
      instance,
      restApi,
      health: {
        instanceName: instance.name,
        healthy: true,
        lastCheck: new Date(),
        responseTime: 0,
      },
      lastUsed: new Date(),
      requestCount: 0,
    };
    
    this.instances.set(instance.name, connection);
    log.info(this.server, `Successfully added instance: ${instance.name}`);
  }

  private async removeInstance(instanceName: string): Promise<void> {
    const connection = this.instances.get(instanceName);
    if (connection) {
      try {
        await connection.restApi.signOut();
        this.instances.delete(instanceName);
        log.info(this.server, `Removed instance: ${instanceName}`);
      } catch (error) {
        log.error(this.server, `Error removing instance ${instanceName}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  private async updateInstance(instance: TableauInstance): Promise<void> {
    const existingConnection = this.instances.get(instance.name);
    if (existingConnection) {
      // Sign out from old connection
      try {
        await existingConnection.restApi.signOut();
      } catch (error) {
        log.warn(this.server, `Error signing out from old connection for ${instance.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    // Create new connection
    await this.addInstance(instance);
  }

  private async authenticateInstance(restApi: RestApi, instance: TableauInstance): Promise<void> {
    const auditLogger = getAuditLogger(this.server);
    
    try {
      if (instance.auth === 'pat') {
        await restApi.signIn({
          type: 'pat',
          patName: instance.patName!,
          patValue: instance.patValue!,
          siteName: instance.siteName,
        });
        
        // Log PAT authentication
        auditLogger.logAuthentication(
          instance.name,
          instance.patName!,
          'pat',
          true,
          undefined,
          { siteName: instance.siteName }
        );
      } else if (instance.auth === 'direct-trust') {
        // Use current user for impersonation, fallback to configured user
        const username = this.currentUser || instance.jwtSubClaim!;
        
        // Log impersonation if different from configured user
        if (this.currentUser && this.currentUser !== instance.jwtSubClaim) {
          log.info(this.server, `Impersonating user ${this.currentUser} on instance ${instance.name} (configured: ${instance.jwtSubClaim})`);
          
          // Log user impersonation
          auditLogger.logUserImpersonation(
            this.currentUser,
            'authenticate_instance',
            this.requestId,
            true,
            undefined,
            { 
              instanceName: instance.name,
              configuredUser: instance.jwtSubClaim,
              server: instance.server
            }
          );
        }
        
        await restApi.signIn({
          type: 'direct-trust',
          siteName: instance.siteName,
          username,
          clientId: instance.connectedAppClientId!,
          secretId: instance.connectedAppSecretId!,
          secretValue: instance.connectedAppSecretValue!,
          scopes: new Set(['tableau:content:read', 'tableau:viz_data_service:read']),
          additionalPayload: JSON.parse(instance.jwtAdditionalPayload || '{}'),
        });
        
        // Log direct-trust authentication
        auditLogger.logAuthentication(
          instance.name,
          username,
          'direct-trust',
          true,
          undefined,
          { 
            siteName: instance.siteName,
            clientId: instance.connectedAppClientId,
            isImpersonation: this.currentUser !== instance.jwtSubClaim
          }
        );
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Log failed authentication
      const username = this.currentUser || instance.jwtSubClaim || 'unknown';
      auditLogger.logAuthentication(
        instance.name,
        username,
        instance.auth,
        false,
        errorMessage,
        { siteName: instance.siteName }
      );
      
      throw error;
    }
  }

  async getHealthyInstances(): Promise<InstanceConnection[]> {
    const healthyConnections: InstanceConnection[] = [];
    
    for (const [name, connection] of this.instances) {
      if (connection.health.healthy) {
        healthyConnections.push(connection);
      }
    }
    
    // Sort by priority (higher priority first), then by last used time
    healthyConnections.sort((a, b) => {
      if (a.instance.priority !== b.instance.priority) {
        return b.instance.priority - a.instance.priority;
      }
      return a.lastUsed.getTime() - b.lastUsed.getTime();
    });
    
    return healthyConnections;
  }

  async executeOnAllInstances<T>(
    operation: (connection: InstanceConnection) => Promise<T>,
    options: {
      timeout?: number;
      maxConcurrent?: number;
      continueOnError?: boolean;
    } = {}
  ): Promise<Array<{ instanceName: string; result: T | null; error?: string }>> {
    const { timeout = 30000, maxConcurrent = 5, continueOnError = true } = options;
    
    const healthyInstances = await this.getHealthyInstances();
    if (healthyInstances.length === 0) {
      throw new Error('No healthy Tableau instances available');
    }
    
    const results: Array<{ instanceName: string; result: T | null; error?: string }> = [];
    const semaphore = new Semaphore(maxConcurrent);
    
    const promises = healthyInstances.map(async (connection) => {
      return semaphore.acquire().then(async (release) => {
        try {
          const startTime = Date.now();
          const result = await Promise.race([
            operation(connection),
            new Promise<never>((_, reject) => 
              setTimeout(() => reject(new Error('Operation timeout')), timeout)
            )
          ]);
          
          // Update connection stats
          connection.lastUsed = new Date();
          connection.requestCount++;
          connection.health.responseTime = Date.now() - startTime;
          
          release();
          return { instanceName: connection.instance.name, result, error: undefined };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          log.error(this.server, `Error executing operation on instance ${connection.instance.name}: ${errorMessage}`);
          
          // Mark instance as unhealthy
          connection.health.healthy = false;
          connection.health.error = errorMessage;
          
          release();
          return { instanceName: connection.instance.name, result: null, error: errorMessage };
        }
      });
    });
    
    const operationResults = await Promise.all(promises);
    results.push(...operationResults);
    
    // Check if we have any successful results
    const successfulResults = results.filter(r => r.result !== null);
    if (successfulResults.length === 0 && !continueOnError) {
      throw new Error('All instances failed to execute the operation');
    }
    
    return results;
  }

  private startHealthChecks(): void {
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthChecks();
    }, 60000); // Check every minute
  }

  private async performHealthChecks(): Promise<void> {
    log.debug(this.server, 'Performing health checks on all instances');
    
    for (const [name, connection] of this.instances) {
      try {
        const startTime = Date.now();
        
        // Simple health check - try to get current user
        await connection.restApi.authenticationMethods.getCurrentUser();
        
        const responseTime = Date.now() - startTime;
        
        // Update health status
        connection.health.healthy = true;
        connection.health.lastCheck = new Date();
        connection.health.responseTime = responseTime;
        connection.health.error = undefined;
        
        log.debug(this.server, `Health check passed for ${name} (${responseTime}ms)`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        connection.health.healthy = false;
        connection.health.lastCheck = new Date();
        connection.health.error = errorMessage;
        
        log.warn(this.server, `Health check failed for ${name}: ${errorMessage}`);
      }
    }
  }

  async shutdown(): Promise<void> {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    
    // Sign out from all instances
    for (const [name, connection] of this.instances) {
      try {
        await connection.restApi.signOut();
        log.info(this.server, `Signed out from instance: ${name}`);
      } catch (error) {
        log.error(this.server, `Error signing out from instance ${name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    this.instances.clear();
  }

  getInstanceStats(): Array<{ name: string; health: InstanceHealth; requestCount: number }> {
    return Array.from(this.instances.entries()).map(([name, connection]) => ({
      name,
      health: connection.health,
      requestCount: connection.requestCount,
    }));
  }
}

// Simple semaphore implementation for limiting concurrent operations
class Semaphore {
  private permits: number;
  private waitQueue: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<() => void> {
    return new Promise((resolve) => {
      if (this.permits > 0) {
        this.permits--;
        resolve(() => this.release());
      } else {
        this.waitQueue.push(() => {
          this.permits--;
          resolve(() => this.release());
        });
      }
    });
  }

  private release(): void {
    this.permits++;
    if (this.waitQueue.length > 0) {
      const next = this.waitQueue.shift();
      if (next) next();
    }
  }
}
