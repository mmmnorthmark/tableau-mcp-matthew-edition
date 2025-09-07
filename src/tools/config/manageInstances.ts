import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Ok, Err } from 'ts-results-es';
import { z } from 'zod';

import { getConfigManager, initializeConfigManager } from '../../configManager.js';
import { getConfig } from '../../config.js';
import { TableauInstance } from '../../config.js';
import { Server } from '../../server.js';
import { Tool } from '../tool.js';

const tableauInstanceSchema = z.object({
  name: z.string().min(1, 'Instance name is required'),
  server: z.string().url('Server URL must be a valid URL'),
  siteName: z.string().optional(),
  auth: z.enum(['pat', 'direct-trust']),
  patName: z.string().optional(),
  patValue: z.string().optional(),
  jwtSubClaim: z.string().optional(),
  connectedAppClientId: z.string().optional(),
  connectedAppSecretId: z.string().optional(),
  connectedAppSecretValue: z.string().optional(),
  jwtAdditionalPayload: z.string().optional(),
  enabled: z.boolean().default(true),
  priority: z.number().min(1).max(10).default(5),
  maxConcurrentRequests: z.number().min(1).max(50).default(10),
  requestTimeout: z.number().min(1000).max(60000).default(30000),
});

const paramsSchema = {
  operation: z.enum(['add', 'update', 'remove', 'list', 'enable', 'disable', 'replace']),
  instanceName: z.string().optional(),
  instance: tableauInstanceSchema.optional(),
  instances: z.array(tableauInstanceSchema).optional(),
};

export type ManageInstancesError = {
  type: 'validation' | 'not-found' | 'config-error';
  message: string;
  details?: Record<string, any>;
};

// Sanitize instance data by removing sensitive credentials
function sanitizeInstance(instance: TableauInstance): Partial<TableauInstance> {
  return {
    name: instance.name,
    server: instance.server,
    siteName: instance.siteName,
    auth: instance.auth,
    patName: instance.patName, // Keep name but not value
    patValue: instance.patValue ? '[REDACTED]' : undefined,
    jwtSubClaim: instance.jwtSubClaim,
    connectedAppClientId: instance.connectedAppClientId,
    connectedAppSecretId: instance.connectedAppSecretId,
    connectedAppSecretValue: instance.connectedAppSecretValue ? '[REDACTED]' : undefined,
    jwtAdditionalPayload: instance.jwtAdditionalPayload,
    enabled: instance.enabled,
    priority: instance.priority,
    maxConcurrentRequests: instance.maxConcurrentRequests,
    requestTimeout: instance.requestTimeout,
  };
}

export const getManageInstancesTool = (server: Server): Tool<typeof paramsSchema> => {
  const manageInstancesTool = new Tool({
    server,
    name: 'manage-tableau-instances',
    description: `
**TABLEAU INSTANCE CONFIGURATION MANAGEMENT**

Manage Tableau instances dynamically without restarting the server. This tool allows you to add, update, remove, enable, disable, or replace Tableau instances in real-time.

**Operations:**
- \`add\`: Add a new Tableau instance to the search pool
- \`update\`: Update an existing instance configuration
- \`remove\`: Remove an instance from the search pool
- \`list\`: List all configured instances and their status
- \`enable\`: Enable a disabled instance
- \`disable\`: Disable an instance (temporarily remove from searches)
- \`replace\`: Replace all instances with a new configuration

**Instance Configuration Schema:**
- \`name\`: Unique identifier for the instance (required)
- \`server\`: Tableau server URL (required, must start with https://)
- \`siteName\`: Tableau site name (optional, empty for default site)
- \`auth\`: Authentication method: 'pat' or 'direct-trust' (required)
- \`patName\`: Personal Access Token name (required for pat auth)
- \`patValue\`: Personal Access Token value (required for pat auth)
- \`jwtSubClaim\`: JWT subject claim (required for direct-trust auth)
- \`connectedAppClientId\`: Connected App Client ID (required for direct-trust auth)
- \`connectedAppSecretId\`: Connected App Secret ID (required for direct-trust auth)
- \`connectedAppSecretValue\`: Connected App Secret Value (required for direct-trust auth)
- \`jwtAdditionalPayload\`: Additional JWT payload as JSON string (optional)
- \`enabled\`: Whether instance is enabled (default: true)
- \`priority\`: Instance priority 1-10, higher = more important (default: 5)
- \`maxConcurrentRequests\`: Max concurrent requests to this instance (default: 10)
- \`requestTimeout\`: Request timeout in milliseconds (default: 30000)

**Example Usage:**
- Add a new instance:
  operation: "add", instance: {...instance config...}
- Update existing instance:
  operation: "update", instanceName: "production", instance: {...updated config...}
- Remove instance:
  operation: "remove", instanceName: "staging"
- List all instances:
  operation: "list"
- Enable instance:
  operation: "enable", instanceName: "staging"
- Disable instance:
  operation: "disable", instanceName: "staging"
- Replace all instances:
  operation: "replace", instances: [...all instances...]

**Authentication Examples:**

**PAT Authentication:**
\`\`\`json
{
  "name": "production",
  "server": "https://tableau.company.com",
  "siteName": "",
  "auth": "pat",
  "patName": "claude-search",
  "patValue": "your-pat-token",
  "enabled": true,
  "priority": 10
}
\`\`\`

**Direct Trust (Connected App) Authentication:**
\`\`\`json
{
  "name": "cloud-prod",
  "server": "https://prod-ap-southeast-2a.online.tableau.com",
  "siteName": "",
  "auth": "direct-trust",
  "jwtSubClaim": "claude-search@company.com",
  "connectedAppClientId": "your-client-id",
  "connectedAppSecretId": "your-secret-id",
  "connectedAppSecretValue": "your-secret-value",
  "jwtAdditionalPayload": "{\\"groups\\":[\\"tableau-search-users\\"]}",
  "enabled": true,
  "priority": 8
}
\`\`\`

**Multi-Site Configuration:**
\`\`\`json
{
  "name": "prod-finance",
  "server": "https://tableau.company.com",
  "siteName": "Finance",
  "auth": "direct-trust",
  "jwtSubClaim": "claude-search@company.com",
  "connectedAppClientId": "finance-client-id",
  "connectedAppSecretId": "finance-secret-id",
  "connectedAppSecretValue": "finance-secret-value",
  "enabled": true,
  "priority": 9
}
\`\`\`
`,
    paramsSchema,
    annotations: {
      title: 'Manage Tableau Instances',
      readOnlyHint: false,
      openWorldHint: false,
    },
    callback: async (params, context): Promise<CallToolResult> => {
      const { operation, instanceName, instance, instances } = params || {};
      const { requestId } = context || {};
      
      return await manageInstancesTool.logAndExecute<any, ManageInstancesError>({
        requestId,
        args: { operation, instanceName, instance, instances },
        callback: async () => {
          try {
            // Ensure ConfigManager is initialized with instances from config
            let configManager;
            try {
              configManager = getConfigManager(server);
            } catch {
              // ConfigManager not initialized, initialize it with config instances
              const config = getConfig();
              configManager = initializeConfigManager(server, config.instances);
            }
            
            switch (operation) {
              case 'add': {
                if (!instance) {
                  throw new Error('Instance configuration required for add operation');
                }
                configManager.addOrUpdateInstance(instance);
                return new Ok({ 
                  message: `Added instance: ${instance.name}`,
                  instance: sanitizeInstance(instance),
                  status: configManager.getStatus()
                });
              }
              
              case 'update': {
                if (!instanceName || !instance) {
                  throw new Error('Instance name and configuration required for update operation');
                }
                configManager.addOrUpdateInstance(instance);
                return new Ok({ 
                  message: `Updated instance: ${instanceName}`,
                  instance: sanitizeInstance(instance),
                  status: configManager.getStatus()
                });
              }
              
              case 'remove': {
                if (!instanceName) {
                  throw new Error('Instance name required for remove operation');
                }
                const removed = configManager.removeInstance(instanceName);
                return new Ok({ 
                  message: removed ? `Removed instance: ${instanceName}` : `Instance not found: ${instanceName}`,
                  removed: removed,
                  status: configManager.getStatus()
                });
              }
              
              case 'list': {
                const allInstances = configManager.getAllInstances();
                const status = configManager.getStatus();
                const sanitizedInstances = allInstances.map(sanitizeInstance);
                return new Ok({ 
                  instances: sanitizedInstances,
                  status: status,
                  message: `Found ${allInstances.length} instances (${status.enabledInstances} enabled)`
                });
              }
              
              case 'enable': {
                if (!instanceName) {
                  throw new Error('Instance name required for enable operation');
                }
                const inst = configManager.getInstance(instanceName);
                if (!inst) {
                  throw new Error(`Instance not found: ${instanceName}`);
                }
                inst.enabled = true;
                configManager.addOrUpdateInstance(inst);
                return new Ok({ 
                  message: `Enabled instance: ${instanceName}`,
                  instance: sanitizeInstance(inst),
                  status: configManager.getStatus()
                });
              }
              
              case 'disable': {
                if (!instanceName) {
                  throw new Error('Instance name required for disable operation');
                }
                const inst2 = configManager.getInstance(instanceName);
                if (!inst2) {
                  throw new Error(`Instance not found: ${instanceName}`);
                }
                inst2.enabled = false;
                configManager.addOrUpdateInstance(inst2);
                return new Ok({ 
                  message: `Disabled instance: ${instanceName}`,
                  instance: sanitizeInstance(inst2),
                  status: configManager.getStatus()
                });
              }
              
              case 'replace': {
                if (!instances) {
                  throw new Error('Instances array required for replace operation');
                }
                configManager.updateInstances(instances);
                return new Ok({ 
                  message: `Replaced all instances with ${instances.length} new instances`,
                  instances: instances.map(sanitizeInstance),
                  status: configManager.getStatus()
                });
              }
              
              default: {
                throw new Error(`Unknown operation: ${operation}`);
              }
            }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            
            if (errorMessage.includes('not found')) {
              return new Err({
                type: 'not-found',
                message: errorMessage,
                details: { instanceName, operation },
              });
            }
            
            if (errorMessage.includes('validation') || errorMessage.includes('required')) {
              return new Err({
                type: 'validation',
                message: errorMessage,
                details: { instanceName, operation, instance },
              });
            }
            
            return new Err({
              type: 'config-error',
              message: `Configuration error: ${errorMessage}`,
              details: { instanceName, operation, error: errorMessage },
            });
          }
        },
        getErrorText: (error: ManageInstancesError) => {
          return JSON.stringify({
            requestId,
            errorType: error.type,
            message: error.message,
            details: error.details,
          });
        },
      });
    },
  });

  return manageInstancesTool;
};
