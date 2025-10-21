import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';

import { getConfig } from '../../../config.js';
import { generateConnectedAppsToken } from '../../../connectedApps/generateToken.js';
import { useRestApi } from '../../../restApiInstance.js';
import { Server } from '../../../server.js';
import { Tool } from '../../tool.js';
import { getPulseDisabledError } from '../getPulseDisabledError.js';

const paramsSchema = {
  metricId: z.optional(z.string()),
  metricDefinitionId: z.optional(z.string()),
  username: z.optional(z.string()),
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const getEmbedPulseMetricTool = (server: Server): Tool<typeof paramsSchema> => {
  const embedPulseMetricTool = new Tool({
    server,
    name: 'embed-pulse-metric',
    description: `
Generates an interactive embedded Tableau Pulse metric widget for ChatGPT.

This tool creates a secure, short-lived token and returns an embedded HTML widget that displays
a Tableau Pulse metric with full interactivity, including time range controls, filters, and insights.

**Parameters:**
- \`metricId\` (optional): The ID of a specific Pulse metric to embed
- \`metricDefinitionId\` (optional): The ID of a Pulse metric definition (will use default metric)
- \`username\` (optional): Tableau username for authentication (defaults to JWT_SUB_CLAIM)

**Note**: Provide either \`metricId\` or \`metricDefinitionId\`, not both.

**Example Usage:**
- Embed a specific metric by ID:
    metricId: "abc123"
- Embed the default metric from a definition:
    metricDefinitionId: "def456"
- Embed with a specific user context:
    metricId: "abc123"
    username: "john.doe@example.com"

**Features:**
- Interactive time range controls (7/30/90 days, YTD)
- KPI and insights views
- Fullscreen mode
- AI-powered summarization
- Secure Connected Apps authentication
`,
    paramsSchema,
    annotations: {
      title: 'Embed Pulse Metric Widget',
      readOnlyHint: true,
      openWorldHint: false,
    },
    callback: async (
      { metricId, metricDefinitionId, username },
      { requestId },
    ): Promise<CallToolResult> => {
      const config = getConfig();

      return await embedPulseMetricTool.logAndExecute({
        requestId,
        args: { metricId, metricDefinitionId, username },
        callback: async () => {
          // Validate input
          if (!metricId && !metricDefinitionId) {
            throw new Error('Either metricId or metricDefinitionId must be provided');
          }
          if (metricId && metricDefinitionId) {
            throw new Error('Provide either metricId or metricDefinitionId, not both');
          }

          // Get metric details to build URL
          return await useRestApi({
            config,
            requestId,
            server,
            jwtScopes: ['tableau:insight_definitions_metrics:read'],
            callback: async (restApi) => {
              let metricUrl: string;
              let metricName: string;

              if (metricId) {
                // Get metric details
                const metricResult = await restApi.pulseMethods.listPulseMetricsFromMetricIds([
                  metricId,
                ]);

                if (metricResult.err) {
                  throw new Error(`Failed to fetch metric: ${metricResult.val}`);
                }

                const metric = metricResult.val[0];
                if (!metric) {
                  throw new Error(`Metric not found: ${metricId}`);
                }

                metricName = metric.specification.basic_specification.name;
                metricUrl = `${config.server}/#/site/${config.siteName}/pulse/metrics/${metricId}`;
              } else {
                // Get metric definition details
                const definitionResult =
                  await restApi.pulseMethods.listPulseMetricDefinitionsFromMetricDefinitionIds(
                    [metricDefinitionId!],
                    'DEFINITION_VIEW_DEFAULT',
                  );

                if (definitionResult.err) {
                  throw new Error(`Failed to fetch metric definition: ${definitionResult.val}`);
                }

                const definition = definitionResult.val[0];
                if (!definition) {
                  throw new Error(`Metric definition not found: ${metricDefinitionId}`);
                }

                metricName = definition.specification.basic_specification.name;
                const defaultMetric = definition.default_metric;
                if (!defaultMetric) {
                  throw new Error('Metric definition has no default metric');
                }

                metricUrl = `${config.server}/#/site/${config.siteName}/pulse/metrics/${defaultMetric.id}`;
              }

              // Generate Connected Apps token
              const sub = username || config.jwtSubClaim;
              const { token, expiresAt } = generateConnectedAppsToken({
                sub,
                ttlSec: 600, // Max allowed: 10 minutes
                metricUrl,
              });

              // Load widget template
              const widgetPath = join(__dirname, 'widget.html');
              let widgetHtml = readFileSync(widgetPath, 'utf-8');

              // Inject metric data and token
              const widgetData = {
                token,
                expiresAt: expiresAt.toISOString(),
                metricUrl,
                metricName,
                tableauHost: config.server,
              };

              // Replace placeholder with actual data
              widgetHtml = widgetHtml.replace(
                '<!-- WIDGET_DATA -->',
                `<script>window.__PULSE_DATA__ = ${JSON.stringify(widgetData)};</script>`,
              );

              // Return result with embedded widget
              return {
                ok: true,
                val: {
                  content: [
                    {
                      type: 'text',
                      text: `Embedded Pulse metric: ${metricName}\nExpires: ${expiresAt.toISOString()}`,
                    },
                  ],
                  _meta: {
                    'tableau/embedded-widget': widgetHtml,
                  },
                },
              };
            },
          });
        },
        getErrorText: getPulseDisabledError,
      });
    },
  });

  return embedPulseMetricTool;
};
