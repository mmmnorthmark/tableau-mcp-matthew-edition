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
import { AppTool } from '../../tool.js';
import { getPulseDisabledError } from '../getPulseDisabledError.js';

const paramsSchema = {
  metricId: z.optional(z.string()),
  metricDefinitionId: z.optional(z.string()),
  username: z.optional(z.string()),
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Use a completely different resource name to bypass ChatGPT's aggressive caching
export const WIDGET_URI = `ui://tableau/pulse-widget-v2.html`;

// Export widget data for manual resource registration
// Called from Server.registerResources()
export function getPulseWidgetData() {
  const widgetPath = __dirname.includes('build')
    ? join(__dirname, 'widget-simple.html')
    : join(__dirname, 'widget-simple.html');

  let widgetHtml = readFileSync(widgetPath, 'utf-8');

  // Inject version for cache debugging
  widgetHtml = widgetHtml.replace('__WIDGET_VERSION__', 'v2');

  const config = getConfig();

  // Extract the base domain for wildcard matching (e.g., *.online.tableau.com)
  const serverUrl = new URL(config.server);
  const wildcardDomain = `https://*.${serverUrl.hostname.split('.').slice(-3).join('.')}`;

  // CSP configuration for widget
  const widgetCSP = {
    connect_domains: [config.server, wildcardDomain],
    resource_domains: [config.server, wildcardDomain, 'https://persistent.oaistatic.com'],
    script_src: ["'self'", "'unsafe-inline'", config.server, wildcardDomain],
    frame_src: [config.server, wildcardDomain],
    img_src: [config.server, wildcardDomain, 'data:', 'https:'],
    style_src: ["'self'", "'unsafe-inline'", config.server, wildcardDomain],
    font_src: ["'self'", config.server, wildcardDomain, 'data:'],
  };

  const widgetMeta = {
    'openai/widgetDescription': 'Interactive Tableau Pulse metric',
    'openai/widgetPrefersBorder': true,
    'openai/widgetCSP': widgetCSP,
    'openai/toolInvocation/invoking': 'loading Pulse metric…',
    'openai/toolInvocation/invoked': 'loaded Pulse metric',
    'openai/widgetAccessible': true,
    'openai/resultCanProduceWidget': true,
  };

  return {
    uri: WIDGET_URI,
    html: widgetHtml,
    meta: widgetMeta,
    csp: widgetCSP,
  };
}

export const getEmbedPulseMetricTool = (server: Server): AppTool<typeof paramsSchema> => {

  const embedPulseMetricTool = new AppTool({
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
    title: 'Embed Pulse Metric Widget',
    _meta: {
      'openai/outputTemplate': WIDGET_URI,
      'openai/toolInvocation/invoking': 'Loading Pulse metric…',
      'openai/toolInvocation/invoked': 'Metric ready',
      'openai/widgetAccessible': true,
      'openai/resultCanProduceWidget': true,
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
    },
    callback: async (
      { metricId, metricDefinitionId, username },
      { requestId },
    ): Promise<CallToolResult> => {
      const config = getConfig();

      try {
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
            jwtScopes: ['tableau:insight_definitions_metrics:read', 'tableau:insight_metrics:read'],
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

                // Metrics don't have names directly, we need to get it from the definition
                const definitionId = metric.definition_id;
                const definitionResult =
                  await restApi.pulseMethods.listPulseMetricDefinitionsFromMetricDefinitionIds(
                    [definitionId],
                    'DEFINITION_VIEW_BASIC',
                  );

                if (definitionResult.err || !definitionResult.value?.[0]) {
                  metricName = `Metric ${metricId.substring(0, 8)}`;
                } else {
                  metricName = definitionResult.value[0].metadata?.name || `Metric ${metricId.substring(0, 8)}`;
                }

                metricUrl = `${config.server}/pulse/site/${config.siteName}/metrics/${metricId}`;
              } else {
                // Get metric definition details
                const definitionResult =
                  await restApi.pulseMethods.listPulseMetricDefinitionsFromMetricDefinitionIds(
                    [metricDefinitionId!],
                    'DEFINITION_VIEW_FULL',
                  );

                if (definitionResult.err) {
                  throw new Error(`Failed to fetch metric definition: ${definitionResult.value}`);
                }

                if (!definitionResult.value) {
                  throw new Error(
                    `API returned undefined result for metricDefinitionId: ${metricDefinitionId}`,
                  );
                }

                if (!Array.isArray(definitionResult.value)) {
                  throw new Error(
                    `API returned non-array result: ${typeof definitionResult.value}`,
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

                // Try to get the default metric, or fall back to first metric
                let targetMetric = definition.default_metric;

                if (!targetMetric) {
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

                metricUrl = `${config.server}/pulse/site/${config.siteName}/metrics/${targetMetric.id}`;
              }

              // Generate Connected Apps token with all required scopes
              const sub = username || config.jwtSubClaim;
              const { token, expiresAt } = generateConnectedAppsToken({
                sub,
                ttlSec: 600, // Max allowed: 10 minutes
                metricUrl,
                // Scopes per Tableau Embedding API docs:
                // https://help.tableau.com/current/api/embedding_api/en-us/docs/embedding_api_auth.html
                scopes: [
                  'tableau:insights:embed', // Required for Pulse embedding (replaces tableau:metrics:embed)
                  'tableau:insight_definitions_metrics:read', // Read metric definitions
                  'tableau:insight_metrics:read', // Read metric data
                ],
              });

              // Debug: Decode JWT to inspect claims
              const [headerB64, payloadB64] = token.split('.');
              const header = JSON.parse(Buffer.from(headerB64, 'base64').toString());
              const payload = JSON.parse(Buffer.from(payloadB64, 'base64').toString());
              console.error('[JWT DEBUG] Token header:', JSON.stringify(header));
              console.error('[JWT DEBUG] Token payload:', JSON.stringify(payload));
              console.error('[JWT DEBUG] Sub:', sub);
              console.error('[JWT DEBUG] Metric URL:', metricUrl);

              // Get widget metadata (same as tool descriptor for consistency)
              const { meta } = getPulseWidgetData();

              // Widget data for OpenAI Apps SDK
              const widgetData = {
                token,
                expiresAt: expiresAt.toISOString(),
                metricUrl,
                metricName,
                tableauHost: config.server,
              };

              // Debug logging for OpenAI Apps
              console.error('[PULSE WIDGET DEBUG] Returning tool result:', JSON.stringify({
                hasContent: true,
                hasWidgetData: true,
                widgetDataKeys: Object.keys(widgetData),
                hasMeta: true,
                metricName,
              }));

              // ChatGPT maps structuredContent → window.openai.toolOutput
              // Following the pizzaz server pattern
              return {
                isError: false,
                content: [
                  {
                    type: 'text',
                    text: `Showing ${metricName} (Tableau Pulse)\n\nView metric: ${metricUrl}`,
                  },
                ],
                structuredContent: widgetData,
                _meta: {
                  'openai/outputTemplate': WIDGET_URI,
                  ...meta,
                },
              } as any;
            },
          });
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: error instanceof Error ? error.message : String(error),
            },
          ],
        };
      }
    },
  });

  return embedPulseMetricTool;
};
