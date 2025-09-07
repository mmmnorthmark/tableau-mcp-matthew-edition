import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Ok, Err } from 'ts-results-es';
import { z } from 'zod';

import { getConfigManager, initializeConfigManager } from '../../configManager.js';
import { getConfig } from '../../config.js';
import { TableauInstance } from '../../config.js';
import { Server } from '../../server.js';
import { Tool } from '../tool.js';

const paramsSchema = {};

export type ListTableauInstancesError = {
  type: 'config-error';
  message: string;
  details?: Record<string, any>;
};

// Sanitize instance data to only include safe, non-sensitive information
function sanitizeInstanceForListing(instance: TableauInstance): {
  name: string;
  server: string;
  siteName?: string;
  sitePrompt?: string;
  auth: string;
  enabled: boolean;
  priority: number;
} {
  return {
    name: instance.name,
    server: instance.server,
    siteName: instance.siteName,
    sitePrompt: instance.sitePrompt,
    auth: instance.auth,
    enabled: instance.enabled,
    priority: instance.priority,
  };
}

export const getListTableauInstancesTool = (server: Server): Tool<typeof paramsSchema> => {
  const listTableauInstancesTool = new Tool({
    server,
    name: 'list-tableau-instances',
    description: `
**LIST TABLEAU INSTANCES**

Get a list of all configured Tableau instances with their basic information and site prompts.

This tool returns safe, non-sensitive information about each Tableau instance including:
- Instance name and server URL
- Site name (if configured)
- Site prompt (describes what kind of content to expect from this site)
- Authentication method
- Status (enabled/disabled)
- Priority level

**No sensitive credentials or secrets are returned.**

**Example Response:**
\`\`\`json
{
  "instances": [
    {
      "name": "Production Finance",
      "server": "https://tableau.company.com",
      "siteName": "Finance",
      "sitePrompt": "Contains financial reports, budget dashboards, and accounting data",
      "auth": "direct-trust",
      "enabled": true,
      "priority": 10
    }
  ],
  "status": {
    "totalInstances": 1,
    "enabledInstances": 1,
    "instanceNames": ["Production Finance"]
  }
}
\`\`\`

**Site Prompt Usage:**
The \`sitePrompt\` field helps guide the MCP client about what kind of content to expect from each Tableau site. This can be used to:
- Provide context about the site's purpose
- Guide search strategies
- Help users understand what they'll find
- Improve result relevance and recommendations

**No Parameters Required:**
This tool requires no parameters and can be called directly to get the current list of instances.
`,
    paramsSchema,
    annotations: {
      title: 'List Tableau Instances',
      readOnlyHint: true,
      openWorldHint: false,
    },
    callback: async (params, context): Promise<CallToolResult> => {
      return await listTableauInstancesTool.logAndExecute<any, ListTableauInstancesError>({
        requestId: context?.requestId,
        args: params,
        callback: async () => {
          try {
            // Ensure ConfigManager is initialized with instances from config
            let configManager;
            try {
              configManager = getConfigManager(server);
              // Check if ConfigManager has instances, if not, reinitialize
              if (configManager.getAllInstances().length === 0) {
                const config = getConfig();
                configManager = initializeConfigManager(server, config.instances);
              }
            } catch {
              // ConfigManager not initialized, initialize it with config instances
              const config = getConfig();
              configManager = initializeConfigManager(server, config.instances);
            }
            
            const allInstances = configManager.getAllInstances();
            const status = configManager.getStatus();
            const sanitizedInstances = allInstances.map(sanitizeInstanceForListing);
            
            return new Ok({
              instances: sanitizedInstances,
              status: {
                totalInstances: status.totalInstances,
                enabledInstances: status.enabledInstances,
                instanceNames: status.instanceNames,
              },
              message: `Found ${allInstances.length} Tableau instances (${status.enabledInstances} enabled)`
            });
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return new Err({
              type: 'config-error',
              message: `Failed to list Tableau instances: ${errorMessage}`,
              details: { error: errorMessage }
            });
          }
        },
      });
    },
  });
  
  return listTableauInstancesTool;
};