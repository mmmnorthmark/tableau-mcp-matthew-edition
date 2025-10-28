import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Ok } from 'ts-results-es';
import * as vega from 'vega';
import * as vegaLite from 'vega-lite';
import z from 'zod';

import { getConfig } from '../../../config.js';
import { log } from '../../../logging/log.js';
import { useRestApi } from '../../../restApiInstance.js';
import { Server } from '../../../server.js';
import { Tool } from '../../tool.js';
import { getPulseDisabledError } from '../getPulseDisabledError.js';

const paramsSchema = {
  metricId: z.string().describe('The ID of the Pulse metric to render'),
  definitionId: z
    .string()
    .optional()
    .describe('The ID of the Pulse metric definition (optional, will be fetched if not provided)'),
  insightType: z
    .enum(['popc', 'currenttrend', 'unusualchange', 'topcontributor', 'all'])
    .optional()
    .default('all')
    .describe(
      'The type of insight visualization to render: popc (period-over-period comparison/BAN), currenttrend (time series), unusualchange (anomaly detection), topcontributor (breakdown), or all (default: all)',
    ),
  width: z
    .number()
    .optional()
    .default(800)
    .describe('Width of the SVG output in pixels (default: 800)'),
  height: z
    .number()
    .optional()
    .default(400)
    .describe('Height of the SVG output in pixels (default: 400)'),
};

/**
 * Transform Vega-Lite spec to fix custom formatter issues for headless rendering.
 * Converts customFormatterMaps to Vega-native labelExpr.
 */
function transformVegaLiteSpec(spec: any): any {
  const transformed = JSON.parse(JSON.stringify(spec)); // Deep clone
  const formatterMaps = transformed.customFormatterMaps || {};

  // Helper to create a labelExpr from a formatter map
  function createLabelExpr(mapName: string): string {
    const map = formatterMaps[mapName];
    if (!map) return 'datum.value';

    // Build a JavaScript expression that does the lookup
    const entries = Object.entries(map);
    let expr = 'datum.value';

    // Build the conditional chain in reverse
    for (let i = entries.length - 1; i >= 0; i--) {
      const [key, value] = entries[i];
      // Escape single quotes in the value
      const escapedValue = (value as string).replace(/'/g, "\\'");
      expr = `datum.value === '${key}' ? '${escapedValue}' : ${expr}`;
    }

    return expr;
  }

  // Helper function to recursively transform layers
  function transformLayer(layer: any) {
    if (!layer) return;

    // Fix x-axis formatting - replace custom format with labelExpr
    if (layer.encoding?.x?.axis?.format?.custom) {
      const xAxis = layer.encoding.x.axis;
      const mapName = xAxis.format.mapName;

      // Replace custom format with labelExpr
      delete xAxis.format;
      xAxis.labelExpr = createLabelExpr(mapName);
    }

    // Fix y-axis formatting - replace custom format with labelExpr
    if (layer.encoding?.y?.axis?.format?.custom) {
      const yAxis = layer.encoding.y.axis;
      const mapName = yAxis.format.mapName;

      // Replace custom format with labelExpr
      delete yAxis.format;
      yAxis.labelExpr = createLabelExpr(mapName);
    }

    // Recursively transform child layers
    if (layer.layer && Array.isArray(layer.layer)) {
      layer.layer.forEach(transformLayer);
    }
  }

  // Transform top-level encoding first (this is where x/y axes are defined)
  transformLayer(transformed);

  // Then transform all child layers
  if (transformed.layer && Array.isArray(transformed.layer)) {
    transformed.layer.forEach(transformLayer);
  }

  // Remove customFormatterMaps from the final spec (no longer needed)
  delete transformed.customFormatterMaps;

  return transformed;
}

/**
 * Render a Vega-Lite spec to SVG using headless canvas rendering.
 */
async function renderVegaLiteToSvg(
  vegaLiteSpec: any,
  width: number,
  height: number,
): Promise<string> {
  // Transform the spec to replace custom formatters
  const transformedSpec = transformVegaLiteSpec(vegaLiteSpec);

  // Override width/height (replace "container" with actual pixel values)
  transformedSpec.width = width;
  transformedSpec.height = height;

  // Add autosize configuration to fit content properly with padding
  if (!transformedSpec.autosize) {
    transformedSpec.autosize = {
      type: 'fit',
      contains: 'padding',
    };
  }

  // Ensure padding is set to prevent label cropping
  if (!transformedSpec.padding) {
    transformedSpec.padding = { left: 10, right: 10, top: 10, bottom: 10 };
  }

  // Compile Vega-Lite to Vega
  const vegaSpec = vegaLite.compile(transformedSpec).spec;

  // Create a new Vega view with canvas renderer
  const view = new vega.View(vega.parse(vegaSpec), {
    renderer: 'none', // We'll use toSVG() instead of canvas
    logLevel: vega.Warn,
  });

  // Run the view to generate the visualization
  await view.runAsync();

  // Generate SVG string
  const svg = await view.toSVG();

  return svg;
}

export const getRenderPulseSvgTool = (server: Server): Tool<typeof paramsSchema> => {
  const renderPulseSvgTool = new Tool({
    server,
    name: 'render-pulse-svg',
    description: `
Render Tableau Pulse metric visualizations to SVG format.

This tool fetches a Pulse metric's insight bundle and renders the specified visualization type(s)
to SVG. It automatically handles Tableau Pulse's custom formatters and returns one or more SVG strings.

**Parameters:**
- \`metricId\` (required): The ID of the Pulse metric to render
- \`definitionId\` (optional): The ID of the Pulse metric definition
- \`insightType\` (optional): Type of visualization to render (default: 'all')
  - \`popc\`: Period-over-period comparison (BAN chart)
  - \`currenttrend\`: Time series chart
  - \`unusualchange\`: Anomaly detection chart
  - \`topcontributor\`: Breakdown/contributor chart
  - \`all\`: All available visualizations
- \`width\` (optional): Width of the SVG output in pixels (default: 800)
- \`height\` (optional): Height of the SVG output in pixels (default: 400)

**Example Usage:**
\`\`\`json
{
  "metricId": "CF32DDCC-362B-4869-9487-37DA4D152552",
  "insightType": "currenttrend",
  "width": 1200,
  "height": 600
}
\`\`\`

**Returns:**
A JSON object with an array of SVG strings, each labeled with its insight type.

**Note:**
- Automatically transforms customFormatterMaps to Vega-native labelExpr
- Renders headlessly (no browser required)
- Returns multiple SVGs if insightType is 'all' or if multiple insights of the same type exist
`,
    paramsSchema,
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
    },
    callback: async (
      { metricId, definitionId, insightType, width, height },
      { requestId },
    ): Promise<CallToolResult> => {
      const config = getConfig();
      return await renderPulseSvgTool.logAndExecute({
        requestId,
        args: { metricId, definitionId, insightType, width, height },
        getSuccessResult: (result) => ({
          isError: false,
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        }),
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

              // Build insight bundle request (same as renderPulseMetric)
              const representation_options = {
                ...definition.representation_options,
                sentiment_type:
                  definition.representation_options.sentiment_type || 'SENTIMENT_TYPE_UNSPECIFIED',
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

              // Generate insight bundle with Vega-Lite specs
              const bundleResult = await restApi.pulseMethods.generatePulseMetricValueInsightBundle(
                bundleRequest,
                'detail',
              );

              if (bundleResult.isErr()) {
                throw new Error(`Failed to generate insight bundle: ${bundleResult.error}`);
              }

              const insightBundle = bundleResult.value;

              if (!insightBundle.bundle_response) {
                throw new Error('Invalid response from Pulse API: missing bundle_response');
              }

              // Log insight groups for debugging
              log.info(
                server,
                `[renderPulseSvg] Processing ${insightBundle.bundle_response.result.insight_groups.length} insight groups`,
                { requestId },
              );

              // Extract insights with visualizations
              const allInsights: Array<{ type: string; groupType: string; viz: any }> = [];
              insightBundle.bundle_response.result.insight_groups.forEach((group, groupIdx) => {
                log.info(
                  server,
                  `[renderPulseSvg] Group ${groupIdx}: type="${group.type}", insights=${group.insights?.length || 0}`,
                  { requestId },
                );

                if (group.insights) {
                  group.insights.forEach((insight, insightIdx) => {
                    const hasViz = !!insight.result?.viz;
                    const vizIsObject = hasViz && typeof insight.result.viz === 'object' && insight.result.viz !== null;
                    const vizKeys = vizIsObject ? Object.keys(insight.result.viz).length : 0;

                    log.info(
                      server,
                      `[renderPulseSvg] Group ${groupIdx} Insight ${insightIdx}: type="${insight.insight_type}", result.type="${insight.result?.type}", hasViz=${hasViz}, vizIsObject=${vizIsObject}, vizKeys=${vizKeys}`,
                      { requestId },
                    );

                    // Only include insights with non-empty viz objects
                    if (insight.result?.viz && insight.insight_type && vizIsObject && vizKeys > 0) {
                      allInsights.push({
                        type: insight.insight_type,
                        groupType: group.type,
                        viz: insight.result.viz,
                      });
                    }
                  });
                }
              });

              log.info(
                server,
                `[renderPulseSvg] Found ${allInsights.length} insights with visualizations: ${allInsights.map(i => `${i.type}(${i.groupType})`).join(', ')}`,
                { requestId },
              );

              // Filter by insight type
              const insightsToRender =
                insightType === 'all'
                  ? allInsights
                  : allInsights.filter((insight) => insight.type === insightType);

              if (insightsToRender.length === 0) {
                throw new Error(
                  `No visualizations found for insight type: ${insightType}. Available types: ${[...new Set(allInsights.map((i) => i.type))].join(', ')}`,
                );
              }

              // Render each visualization to SVG
              const svgs = await Promise.all(
                insightsToRender.map(async (insight) => {
                  const svg = await renderVegaLiteToSvg(insight.viz, width || 800, height || 400);
                  return {
                    insightType: insight.type,
                    svg,
                  };
                }),
              );

              return new Ok({
                metricId: metric.id,
                metricName: definition.metadata?.name,
                visualizations: svgs,
              });
            },
          });
        },
        getErrorText: getPulseDisabledError,
      });
    },
  });

  return renderPulseSvgTool;
};
