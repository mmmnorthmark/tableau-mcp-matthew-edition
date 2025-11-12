import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Ok } from 'ts-results-es';
import z from 'zod';

import { getConfig } from '../../../config.js';
import { log } from '../../../logging/log.js';
import { useRestApi } from '../../../restApiInstance.js';
import { Server } from '../../../server.js';
import { AssetManager } from '../../../services/AssetManager.js';
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
};

export const getRenderPulseMetricTool = (server: Server): Tool<typeof paramsSchema> => {
  const renderPulseMetricTool = new Tool({
    server,
    name: 'render-pulse-metric',
    description: `
Render a Tableau Pulse metric as an interactive visualization for OpenAI Apps SDK.

This tool fetches metric data and generates a widget that displays:
1. Metric name, description, and current value
2. Interactive Vega-Lite visualizations
3. AI-generated insights about the metric
4. SVG visualization URLs (when asset strategy is 'local' or 's3')

**Parameters:**
- \`metricId\` (required): The ID of the Pulse metric to render
- \`definitionId\` (optional): The ID of the Pulse metric definition. If not provided, it will be fetched from the metric.

**Example Usage:**
- Render a Pulse metric by ID:
    metricId: 'CF32DDCC-362B-4869-9487-37DA4D152552'

- Render a Pulse metric with a specific definition:
    metricId: 'CF32DDCC-362B-4869-9487-37DA4D152552',
    definitionId: 'BBC908D8-29ED-48AB-A78E-ACF8A424C8C3'

**Returns:**
A widget that displays the Pulse metric with visualizations and insights. The widget is optimized for OpenAI Apps SDK environments.

When MCP_ASSET_STRATEGY is 'local' or 's3', the response also includes:
- \`visualizationUrls\`: Array of signed URLs to SVG visualizations that can be embedded in markdown
- Example markdown: \`![Metric Visualization](https://mcp-server/tableau-mcp/assets?assetId=...)\`

**Note:**
This tool is designed specifically for OpenAI Apps SDK integration and provides an interactive widget experience.
`,
    paramsSchema,
    title: 'Render Pulse Metric for OpenAI Apps',
    _meta: createPulseWidgetMeta(),
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
    },
    callback: async ({ metricId, definitionId }, { requestId }): Promise<CallToolResult> => {
      const config = getConfig();
      return await renderPulseMetricTool.logAndExecute({
        requestId,
        args: { metricId, definitionId },
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
                `[renderPulseMetric] Calling generatePulseMetricValueInsightBundle with bundleType: detail`,
                { requestId },
              );

              const bundleResult = await restApi.pulseMethods.generatePulseMetricValueInsightBundle(
                bundleRequest,
                'detail',
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

              // Render SVG visualizations if asset strategy is 'local' or 's3'
              let visualizationUrls: Array<{ insightType: string; url: string }> = [];

              if (config.assetStrategy === 'local' || config.assetStrategy === 's3') {
                log.info(
                  server,
                  `[renderPulseMetric] Rendering SVG visualizations with asset strategy: ${config.assetStrategy}`,
                  { requestId },
                );

                // Extract insights with visualizations
                const allInsights: Array<{ type: string; viz: any }> = [];
                insightBundle.bundle_response.result.insight_groups.forEach((group) => {
                  if (group.insights) {
                    group.insights.forEach((insight) => {
                      if (insight.result?.viz && insight.insight_type) {
                        const vizIsObject = typeof insight.result.viz === 'object' && insight.result.viz !== null;
                        const vizKeys = vizIsObject ? Object.keys(insight.result.viz).length : 0;

                        if (vizIsObject && vizKeys > 0) {
                          allInsights.push({
                            type: insight.insight_type,
                            viz: insight.result.viz,
                          });
                        }
                      }
                    });
                  }
                });

                log.info(
                  server,
                  `[renderPulseMetric] Found ${allInsights.length} insights with visualizations`,
                  { requestId },
                );

                // Render each visualization to SVG and store
                const assetManager = new AssetManager(config, server);
                visualizationUrls = await Promise.all(
                  allInsights.map(async (insight, index) => {
                    const svg = await renderVegaLiteToSvg(insight.viz, 800, 400);
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

              // Build response text with optional SVG URLs
              let responseText = `Rendered Tableau Pulse metric: ${definition.metadata?.name || metricId}`;
              if (visualizationUrls.length > 0) {
                responseText += `\n\n**Visualization URLs:**\n`;
                visualizationUrls.forEach((viz) => {
                  responseText += `- ${viz.insightType}: ${viz.url}\n`;
                });
                responseText += `\nYou can embed these in markdown using: \`![${definition.metadata?.name}](${visualizationUrls[0].url})\``;
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
                  },
                  definition: {
                    representation_options: definition.representation_options,
                  },
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
