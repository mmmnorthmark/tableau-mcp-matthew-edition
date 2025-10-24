import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  SetLevelRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { zodToJsonSchema } from 'zod-to-json-schema';

import pkg from '../package.json' with { type: 'json' };
import { getConfig } from './config.js';
import { setLogLevel } from './logging/log.js';
import { Tool, AppTool } from './tools/tool.js';
import { toolNames } from './tools/toolName.js';
import { toolFactories } from './tools/tools.js';

export const serverName = 'mcp';
export const serverVersion = pkg.version;

export class Server extends McpServer {
  readonly name: string;
  readonly version: string;
  private appTools: AppTool<any>[] = [];

  constructor() {
    super(
      {
        name: serverName,
        version: serverVersion,
      },
      {
        capabilities: {
          logging: {},
          tools: {},
          resources: {},
        },
      },
    );

    this.name = serverName;
    this.version = serverVersion;
  }

  registerTools = (): void => {
    // Separate OpenAI Apps SDK tools from standard MCP tools
    const allTools = this._getToolsToRegister();

    for (const tool of allTools) {
      if (tool instanceof AppTool) {
        // Store AppTools for manual registration in registerRequestHandlers
        this.appTools.push(tool);
      } else {
        // Register standard MCP tools normally
        const { name, description, paramsSchema, annotations, callback } = tool;
        this.tool(name, description, paramsSchema, annotations, callback);
      }
    }
  };

  registerResources = (): void => {
    // Widget resources are registered via manual request handlers
    // See registerRequestHandlers() below
  };

  registerRequestHandlers = (): void => {
    this.server.setRequestHandler(SetLevelRequestSchema, async (request) => {
      setLogLevel(this, request.params.level);
      return {};
    });

    // Only set up OpenAI Apps SDK handlers if we have AppTools
    if (this.appTools.length > 0) {
      // Manual resource handlers for OpenAI Apps SDK widgets
      // Following the pattern from official OpenAI SDK examples (pizzaz_server_node)
      const { getPulseWidgetData, WIDGET_URI } = require('./tools/pulse/embedPulseMetric/embedPulseMetric.js');
      const widgetData = getPulseWidgetData();

      // List available resources
      this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
        resources: [
          {
            uri: WIDGET_URI,
            name: 'Tableau Pulse Widget',
            description: 'Interactive Tableau Pulse metric widget',
            mimeType: 'text/html+skybridge',
          },
        ],
      }));

      // Read resource content
      this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
        if (request.params.uri === WIDGET_URI) {
          return {
            contents: [
              {
                uri: WIDGET_URI,
                mimeType: 'text/html+skybridge',
                text: widgetData.html,
                _meta: widgetData.meta,
              },
            ],
          };
        }
        throw new Error(`Unknown resource: ${request.params.uri}`);
      });

      // Override tools/list to include AppTools with proper OpenAI structure
      // Call the parent class's tool handler setup first to get standard tools registered
      (this as any).setToolRequestHandlers();

      // Now override with our custom handler that includes both standard and AppTools
      this.server.setRequestHandler(ListToolsRequestSchema, async () => {
        // Build the standard tools list from _registeredTools
        // The SDK stores tool metadata in _registeredTools as {[name]: {description, inputSchema (Zod), etc}}
        const registeredTools = (this as any)._registeredTools || {};
        const standardTools = Object.entries(registeredTools)
          .filter(([_, toolInfo]: [string, any]) => toolInfo.enabled !== false)
          .map(([name, toolInfo]: [string, any]) => {
            // Convert Zod schema to JSON Schema
            let inputSchema;
            if (toolInfo.inputSchema) {
              try {
                inputSchema = zodToJsonSchema(toolInfo.inputSchema, {
                  $refStrategy: 'none',
                });
              } catch (err) {
                // Fallback to empty object schema if conversion fails
                inputSchema = {
                  type: 'object',
                  properties: {},
                  additionalProperties: false,
                };
              }
            } else {
              inputSchema = {
                type: 'object',
                properties: {},
                additionalProperties: false,
              };
            }

            return {
              name,
              description: toolInfo.description || '',
              inputSchema,
            };
          });

        // Add AppTools using their toOpenAIToolDescriptor() method
        const appToolDescriptors = this.appTools.map(appTool => appTool.toOpenAIToolDescriptor());

        return {
          tools: [...standardTools, ...appToolDescriptors],
        };
      });

      // Override tools/call to handle AppTool invocations
      this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
        // Check if this is an AppTool
        const appTool = this.appTools.find(tool => tool.name === request.params.name);
        if (appTool) {
          const result = await appTool.callback(request.params.arguments, { requestId: request.id });

          // Debug log for AppTools/OpenAI
          console.error('[TOOL RESULT DEBUG]', {
            toolName: request.params.name,
            isAppTool: true,
            resultKeys: Object.keys(result),
            hasStructuredContent: 'structuredContent' in result,
            structuredContentKeys: result.structuredContent ? Object.keys(result.structuredContent) : null,
          });

          return result;
        }

        // Handle standard MCP tools
        const standardTool = (this as any)._registeredTools[request.params.name];
        if (standardTool && standardTool.enabled !== false) {
          return await standardTool.callback(request.params.arguments, { requestId: request.id });
        }

        throw new Error(`Unknown tool: ${request.params.name}`);
      });
    }
  };

  private _getToolsToRegister = (): Array<Tool<any>> => {
    const { includeTools, excludeTools } = getConfig();

    const tools = toolFactories.map((tool) => tool(this));
    const toolsToRegister = tools.filter((tool) => {
      if (includeTools.length > 0) {
        return includeTools.includes(tool.name);
      }

      if (excludeTools.length > 0) {
        return !excludeTools.includes(tool.name);
      }

      return true;
    });

    if (toolsToRegister.length === 0) {
      throw new Error(`
          No tools to register.
          Tools available = [${toolNames.join(', ')}].
          EXCLUDE_TOOLS = [${excludeTools.join(', ')}].
          INCLUDE_TOOLS = [${includeTools.join(', ')}]
        `);
    }

    return toolsToRegister;
  };
}

export const exportedForTesting = {
  Server,
};
