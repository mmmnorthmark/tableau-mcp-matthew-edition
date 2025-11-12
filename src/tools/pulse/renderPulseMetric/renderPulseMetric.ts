import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Ok } from 'ts-results-es';
import z from 'zod';

import { getConfig } from '../../../config.js';
import { log } from '../../../logging/log.js';
import { useRestApi } from '../../../restApiInstance.js';
import { Server } from '../../../server.js';
import { AssetManager } from '../../../services/AssetManager.js';
import {
  getAvailableInsightTypes,
  getCurrentMetricValue,
  getInsightsByType,
  getInsightsWithVisualizations,
  getMetricDifference,
  getPeriodOverPeriodComparison,
} from '../../../utils/pulseInsightHelpers.js';
import { Tool } from '../../tool.js';
import { getPulseDisabledError } from '../getPulseDisabledError.js';
import { renderVegaLiteToSvg } from '../renderPulseSvg/renderPulseSvg.js';
import { createPulseWidgetMeta, PULSE_WIDGET_URI } from './widgetMeta.js';

const paramsSchema = {
  metricId: z.string().describe('The ID of the Pulse metric to render'),
  definitionId: z
    .string()
    .optional()
    .describe('The ID of the Pulse metric definition (optional, will be fetched if not provided)'),
  bundleType: z
    .enum(['ban', 'springboard', 'basic', 'detail'])
    .optional()
    .default('detail')
    .describe(
      'The type of insight bundle to generate. Options: ban (current value only), springboard (current value + top insight), basic (low-bandwidth dimensions), detail (comprehensive insights with time series and breakdowns). Default: detail',
    ),
  includeInsightTypes: z
    .array(
      z.enum([
        'popc',
        'currenttrend',
        'newtrend',
        'tcbd',
        'riskmo',
        'tdbcmv',
        'topcontributor',
        'top-contributors',
        'top-detractors',
        'bottom-contributors',
        'all',
      ]),
    )
    .optional()
    .describe(
      'Array of insight types to include in visualizations. Use "all" to include all available types. If not specified, all insights from the bundle will be included. Common types: popc (BAN), currenttrend (time series), topcontributor (breakdowns)',
    ),
  width: z
    .number()
    .optional()
    .default(800)
    .describe('Width in pixels for SVG visualizations (default: 800)'),
  height: z
    .number()
    .optional()
    .default(400)
    .describe('Height in pixels for SVG visualizations (default: 400)'),
  includeMetricSummary: z
    .boolean()
    .optional()
    .default(true)
    .describe('Include a text summary with current value and period-over-period comparison'),
};

export const getRenderPulseMetricTool = (server: Server): Tool<typeof paramsSchema> => {
  const renderPulseMetricTool = new Tool({
    server,
    name: 'render-pulse-metric',
    description: `
Render a Tableau Pulse metric as an interactive visualization for OpenAI Apps SDK with comprehensive customization options.

This tool fetches metric data and generates a widget that displays:
1. Metric name, description, and current value (BAN)
2. Period-over-period comparison with absolute/relative changes
3. Interactive Vega-Lite visualizations (time series, breakdowns, trends)
4. AI-generated insights about the metric
5. SVG visualization URLs (when asset strategy is 'local' or 's3')

**Parameters:**
- \`metricId\` (required): The ID of the Pulse metric to render
- \`definitionId\` (optional): The ID of the Pulse metric definition
- \`bundleType\` (optional): Type of insight bundle - ban, springboard, basic, or detail (default: detail)
- \`includeInsightTypes\` (optional): Array of specific insight types to visualize (e.g., ['popc', 'currenttrend', 'topcontributor'])
- \`width\` (optional): Width in pixels for SVG visualizations (default: 800)
- \`height\` (optional): Height in pixels for SVG visualizations (default: 400)
- \`includeMetricSummary\` (optional): Include text summary with current value and comparison (default: true)

**Insight Types:**
- \`popc\`: Period-over-period comparison (BAN chart)
- \`currenttrend\`: Time series chart showing metric over time
- \`newtrend\`: New trend detection
- \`tcbd\`: Time comparison breakdown
- \`topcontributor\`, \`top-contributors\`: Top contributors by dimension
- \`top-detractors\`: Top detractors
- \`bottom-contributors\`: Bottom contributors
- \`all\`: Include all available insight types

**Example Usage:**

Render with all default options (comprehensive detail bundle):
\`\`\`json
{
  "metricId": "CF32DDCC-362B-4869-9487-37DA4D152552"
}
\`\`\`

Render only BAN and time series:
\`\`\`json
{
  "metricId": "CF32DDCC-362B-4869-9487-37DA4D152552",
  "includeInsightTypes": ["popc", "currenttrend"]
}
\`\`\`

Render with custom dimensions:
\`\`\`json
{
  "metricId": "CF32DDCC-362B-4869-9487-37DA4D152552",
  "bundleType": "detail",
  "width": 1200,
  "height": 600,
  "includeMetricSummary": true
}
\`\`\`

Render only current value (BAN):
\`\`\`json
{
  "metricId": "CF32DDCC-362B-4869-9487-37DA4D152552",
  "bundleType": "ban",
  "includeInsightTypes": ["popc"]
}
\`\`\`

**Returns:**
A widget with:
- Optional text summary (current value, change from previous period)
- Structured metric data (name, description, specification)
- Complete insight bundle with all insights
- Array of visualization URLs (one per insight type)
- Available insight types list

**Note:**
This tool is designed specifically for OpenAI Apps SDK integration and provides an interactive widget experience.
Asset URLs are signed and will expire based on MCP_ASSET_EXPIRATION_HOURS configuration.
`,
    paramsSchema,
    title: 'Render Pulse Metric for OpenAI Apps',
    _meta: createPulseWidgetMeta(),
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
    },
    callback: async (
      { metricId, definitionId, bundleType, includeInsightTypes, width, height, includeMetricSummary },
      { requestId },
    ): Promise<CallToolResult> => {
      const config = getConfig();
      return await renderPulseMetricTool.logAndExecute({
        requestId,
        args: { metricId, definitionId, bundleType, includeInsightTypes, width, height, includeMetricSummary },
        getSuccessResult: (result) => result,
        callback: async () => {
          return await useRestApi({
            config,
            requestId,
            server,
            jwtScopes: [
              'tableau:insight_metrics:read',
              'tableau:insight_definitions_metrics:read',
              'tableau:insights:read',
            ],
            callback: async (restApi) => {
              // Fetch metric data
              const metricsResult = await restApi.pulseMethods.listPulseMetricsFromMetricIds([
                metricId,
              ]);

              if (metricsResult.isErr() || metricsResult.value.length === 0) {
                throw new Error(`Metric not found: ${metricId}`);
              }

              const metric = metricsResult.value[0];
              const defId = definitionId || metric.definition_id;

              // Fetch metric definition
              const definitionsResult =
                await restApi.pulseMethods.listPulseMetricDefinitionsFromMetricDefinitionIds([
                  defId,
                ]);

              if (definitionsResult.isErr() || definitionsResult.value.length === 0) {
                throw new Error(`Metric definition not found: ${defId}`);
              }

              const definition = definitionsResult.value[0];

              log.info(server, `[renderPulseMetric] Using definition_id: ${defId}`, { requestId });

              // Validate required fields before building bundle request
              if (!definition.extension_options) {
                throw new Error('Metric definition is missing extension_options');
              }
              if (!definition.representation_options) {
                throw new Error('Metric definition is missing representation_options');
              }
              if (!definition.specification.datasource) {
                throw new Error('Metric definition is missing specification.datasource');
              }
              if (!definition.specification.basic_specification) {
                throw new Error('Metric definition is missing specification.basic_specification');
              }
              if (!metric.specification) {
                throw new Error('Metric is missing specification');
              }

              // Build insight bundle request
              // Ensure representation_options has all required fields
              const representation_options = {
                ...definition.representation_options,
                sentiment_type: definition.representation_options.sentiment_type || 'SENTIMENT_TYPE_UNSPECIFIED',
              };

              const bundleRequest = {
                bundle_request: {
                  version: 1,
                  options: {
                    output_format: 'OUTPUT_FORMAT_HTML' as const,
                    time_zone: 'UTC',
                    language: 'LANGUAGE_EN_US' as const,
                    locale: 'LOCALE_EN_US' as const,
                  },
                  input: {
                    metadata: {
                      name: definition.metadata?.name || 'Pulse Metric',
                      metric_id: metric.id,
                      definition_id: defId,
                    },
                    metric: {
                      definition: {
                        datasource: definition.specification.datasource,
                        basic_specification: definition.specification.basic_specification,
                        is_running_total: definition.specification.is_running_total,
                      },
                      metric_specification: metric.specification,
                      extension_options: definition.extension_options,
                      representation_options,
                      insights_options: definition.insights_options || {
                        show_insights: true,
                        settings: [],
                      },
                      goals: metric.goals || {},
                    },
                  },
                },
              };

              log.info(
                server,
                `[renderPulseMetric] Bundle request metadata: ${JSON.stringify(bundleRequest.bundle_request.input.metadata)}`,
                { requestId },
              );

              // Debug: Log the full bundleRequest structure
              log.info(
                server,
                `[renderPulseMetric] Full bundleRequest keys: ${JSON.stringify(Object.keys(bundleRequest))}`,
                { requestId },
              );
              log.info(
                server,
                `[renderPulseMetric] bundleRequest.bundle_request exists: ${!!bundleRequest.bundle_request}`,
                { requestId },
              );

              // Generate insight bundle with Vega-Lite specs
              log.info(
                server,
                `[renderPulseMetric] Calling generatePulseMetricValueInsightBundle with bundleType: ${bundleType}`,
                { requestId },
              );

              const bundleResult = await restApi.pulseMethods.generatePulseMetricValueInsightBundle(
                bundleRequest,
                bundleType || 'detail',
              );

              if (bundleResult.isErr()) {
                const errorType = bundleResult.error;
                log.error(
                  server,
                  `[renderPulseMetric] Failed to generate insight bundle: ${errorType}`,
                  { requestId },
                );
                throw new Error(`Failed to generate insight bundle: ${errorType}`);
              }

              log.info(
                server,
                `[renderPulseMetric] Successfully generated insight bundle`,
                { requestId },
              );

              const insightBundle = bundleResult.value;

              // Check if the API returned a validation error instead of a proper response
              if (!insightBundle.bundle_response) {
                // The API may return the request with a warning field on validation errors
                const errorResponse = insightBundle as any;
                if (errorResponse.warning) {
                  throw new Error(`Pulse API validation error: ${errorResponse.warning}`);
                }
                throw new Error('Invalid response from Pulse API: missing bundle_response');
              }

              // Extract insights with visualizations using helper function
              const allInsightsWithViz = getInsightsWithVisualizations(insightBundle);

              // Get available insight types for logging
              const availableTypes = getAvailableInsightTypes(insightBundle);
              log.info(
                server,
                `[renderPulseMetric] Available insight types: ${availableTypes.join(', ')}`,
                { requestId },
              );

              // Filter insights based on includeInsightTypes parameter
              let insightsToRender = allInsightsWithViz;
              if (includeInsightTypes && includeInsightTypes.length > 0) {
                const includeAll = includeInsightTypes.includes('all');
                if (!includeAll) {
                  insightsToRender = allInsightsWithViz.filter((insight) =>
                    includeInsightTypes.includes(insight.type as any),
                  );
                  log.info(
                    server,
                    `[renderPulseMetric] Filtered to ${insightsToRender.length} insights matching types: ${includeInsightTypes.join(', ')}`,
                    { requestId },
                  );
                }
              }

              log.info(
                server,
                `[renderPulseMetric] Found ${insightsToRender.length} insights to render`,
                { requestId },
              );

              // Render SVG visualizations unless asset strategy is 'disabled' or 'inline'
              let visualizationUrls: Array<{ insightType: string; url: string }> = [];

              if (config.assetStrategy !== 'disabled' && config.assetStrategy !== 'inline') {
                log.info(
                  server,
                  `[renderPulseMetric] Rendering SVG visualizations with asset strategy: ${config.assetStrategy}`,
                  { requestId },
                );

                // Render each visualization to SVG and store
                const assetManager = new AssetManager(config, server);
                visualizationUrls = await Promise.all(
                  insightsToRender.map(async (insight, index) => {
                    const svg = await renderVegaLiteToSvg(insight.viz, width || 800, height || 400);
                    const svgBuffer = Buffer.from(svg, 'utf-8');
                    const filename = `${definition.metadata?.name || 'pulse-metric'}-${insight.type}-${index + 1}.svg`;

                    const { url } = await assetManager.store(svgBuffer, 'svg', {
                      imageFilename: filename,
                      metricId: metric.id,
                      metricName: definition.metadata?.name,
                      insightType: insight.type,
                    });

                    return {
                      insightType: insight.type,
                      url,
                    };
                  }),
                );

                log.info(
                  server,
                  `[renderPulseMetric] Generated ${visualizationUrls.length} SVG visualization URLs`,
                  { requestId },
                );
              }

              // Build response text with optional metric summary and SVG URLs
              let responseText = `# ${definition.metadata?.name || 'Pulse Metric'}\n\n`;

              // Add metric summary if requested
              if (includeMetricSummary) {
                const currentValue = getCurrentMetricValue(insightBundle);
                const difference = getMetricDifference(insightBundle);

                if (currentValue) {
                  responseText += `**Current Value:** ${currentValue.formatted}\n\n`;
                }

                if (difference) {
                  responseText += `**Change:** ${difference.absolute.formatted} (${difference.relative.formatted})\n\n`;
                }
              }

              if (definition.metadata?.description) {
                responseText += `${definition.metadata.description}\n\n`;
              }

              responseText += `**Bundle Type:** ${bundleType || 'detail'}\n`;
              responseText += `**Available Insights:** ${availableTypes.join(', ')}\n`;

              if (includeInsightTypes && includeInsightTypes.length > 0) {
                responseText += `**Rendered Insights:** ${includeInsightTypes.join(', ')}\n`;
              }

              if (visualizationUrls.length > 0) {
                responseText += `\n## Visualizations (${visualizationUrls.length})\n\n`;
                visualizationUrls.forEach((viz, index) => {
                  responseText += `${index + 1}. **${viz.insightType}**: ${viz.url}\n`;
                });
                responseText += `\n*You can embed these in markdown using: \`![${definition.metadata?.name}](${visualizationUrls[0].url})\`*\n`;
              }

              // Return response with _meta and structuredContent
              return new Ok({
                content: [
                  {
                    type: 'text',
                    text: responseText,
                  },
                ],
                structuredContent: {
                  metricId: metric.id,
                  definitionId: definition.id,
                  metric: {
                    name: definition.metadata?.name,
                    description: definition.metadata?.description,
                    specification: metric.specification,
                    currentValue: getCurrentMetricValue(insightBundle),
                    difference: getMetricDifference(insightBundle),
                  },
                  definition: {
                    representation_options: definition.representation_options,
                  },
                  bundleType: bundleType || 'detail',
                  availableInsightTypes: availableTypes,
                  renderedInsightTypes: insightsToRender.map((i) => i.type),
                  insightBundle: insightBundle.bundle_response,
                  ...(visualizationUrls.length > 0 && { visualizationUrls }),
                },
                _meta: createPulseWidgetMeta(),
              });
            },
          });
        },
        getErrorText: getPulseDisabledError,
      });
    },
  });

  return renderPulseMetricTool;
};
