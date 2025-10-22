import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { Ok } from 'ts-results-es';
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
        getSuccessResult: (result) => result, // Return the CallToolResult as-is, don't stringify
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
                  throw new Error(`Failed to fetch metric: ${metricResult.value}`);
                }

                if (!metricResult.value) {
                  throw new Error(`API returned undefined result for metricId: ${metricId}`);
                }

                const metric = metricResult.value[0];
                if (!metric) {
                  throw new Error(`Metric not found: ${metricId}. API returned empty array.`);
                }

                metricName = metric.specification.basic_specification.name;
                metricUrl = `${config.server}/#/site/${config.siteName}/pulse/metrics/${metricId}`;
              } else {
                // Get metric definition details
                const definitionResult =
                  await restApi.pulseMethods.listPulseMetricDefinitionsFromMetricDefinitionIds(
                    [metricDefinitionId!],
                    'DEFINITION_VIEW_FULL', // Changed from DEFAULT to FULL to get metrics
                  );

                if (definitionResult.err) {
                  throw new Error(`Failed to fetch metric definition: ${definitionResult.value}`);
                }

                if (!definitionResult.value) {
                  throw new Error(
                    `API returned undefined result for metricDefinitionId: ${metricDefinitionId}. ` +
                      `Result object: ${JSON.stringify(definitionResult)}`,
                  );
                }

                if (!Array.isArray(definitionResult.value)) {
                  throw new Error(
                    `API returned non-array result: ${typeof definitionResult.value}. ` +
                      `Value: ${JSON.stringify(definitionResult.value)}`,
                  );
                }

                if (definitionResult.value.length === 0) {
                  throw new Error(
                    `Metric definition not found: ${metricDefinitionId}. API returned empty array.`,
                  );
                }

                const definition = definitionResult.value[0];
                if (!definition) {
                  throw new Error(
                    `Metric definition first element is undefined. Array length: ${definitionResult.value.length}`,
                  );
                }

                metricName = definition.metadata?.name || definition.specification?.basic_specification?.name || 'Unknown Metric';

                // Try to get the default metric, or fall back to first metric, or first in the list
                let targetMetric = definition.default_metric;

                if (!targetMetric) {
                  // No default_metric set, try to find one marked as default in the metrics array
                  const metrics = definition.metrics;
                  if (metrics && metrics.length > 0) {
                    targetMetric = metrics.find((m) => m.is_default) || metrics[0];
                  }
                }

                if (!targetMetric) {
                  throw new Error(
                    `Metric definition "${metricName}" (${metricDefinitionId}) has no metrics. ` +
                    `Please create at least one metric for this definition.`
                  );
                }

                metricUrl = `${config.server}/#/site/${config.siteName}/pulse/metrics/${targetMetric.id}`;
              }

              // Generate Connected Apps token
              const sub = username || config.jwtSubClaim;
              const { token, expiresAt } = generateConnectedAppsToken({
                sub,
                ttlSec: 600, // Max allowed: 10 minutes
                metricUrl,
              });

              // Load widget template
              // In bundled code, __dirname is 'build/', widget is at 'build/widget.html'
              // In source code, __dirname is 'src/tools/pulse/embedPulseMetric/', widget is './widget.html'
              const widgetPath = __dirname.includes('build')
                ? join(__dirname, 'widget.html')
                : join(__dirname, 'widget.html');
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

              // Return result with embedded widget wrapped in Ok() for Result type
              return new Ok({
                content: [
                  {
                    type: 'text',
                    text: `Embedded Pulse metric: ${metricName}\nExpires: ${expiresAt.toISOString()}`,
                  },
                ],
                _meta: {
                  'tableau/embedded-widget': widgetHtml,
                },
              });
            },
          });
        },
        getErrorText: getPulseDisabledError,
      });
    },
  });

  return embedPulseMetricTool;
};
