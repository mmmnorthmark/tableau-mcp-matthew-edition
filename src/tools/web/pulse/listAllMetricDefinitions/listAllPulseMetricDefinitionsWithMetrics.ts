import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Ok } from 'ts-results-es';

import { useRestApi } from '../../../../restApiInstance.js';
import { PulseMetric, PulseMetricDefinition } from '../../../../sdks/tableau/types/pulse.js';
import { WebMcpServer } from '../../../../server.web.js';
import { pulsePaginate } from '../../../../utils/paginate.js';
import { WebTool } from '../../tool.js';

const paramsSchema = {};

type PulseMetricDefinitionWithMetrics = PulseMetricDefinition & {
  metrics: Array<PulseMetric>;
  total_metrics: number;
};

export const getListAllPulseMetricDefinitionsWithMetricsTool = (
  server: WebMcpServer,
): WebTool<typeof paramsSchema> => {
  const listAllPulseMetricDefinitionsWithMetricsTool = new WebTool({
    server,
    name: 'list-all-pulse-metric-definitions-with-metrics',
    description: `
Retrieves a list of all published Pulse Metric Definitions with ALL their metrics (including submetrics) using the Tableau REST API. This tool automatically fetches all metrics for each definition, not just the first 5.

**Use this tool when:**
- User asks if a specific metric or submetric exists (e.g., "do you have the backyard pine tree metric?")
- User wants to search for any metric by name, including submetrics
- User asks to list all Pulse metrics with their submetrics
- User wants to see the complete list of all available metrics
- User wants to know which metrics they are following

**What this returns:**
- All metric definitions on the site
- For each definition, ALL metrics (not limited to 5) with their full details including:
  - Metric ID, definition ID
  - Whether it's the default metric
  - **is_followed: boolean indicating if the current user is following this metric**
  - Filters, measurement period, comparison settings
  - Goals (if configured)

**Important guidance for responding:**
- When presenting metrics to the user, **prioritize showing metrics where is_followed=true** first
- If the user asks "what metrics do I have" or "show my metrics", filter to only metrics with is_followed=true
- Clearly indicate which metrics the user is already following vs. available metrics they are not following

**Note:** This tool makes multiple API calls to fetch all metrics for each definition, so it may take longer than the basic list tool but provides complete coverage of all metrics with accurate follow status.
`,
    paramsSchema,
    annotations: {
      title: 'List All Pulse Metric Definitions with All Metrics',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    callback: async (_, extra): Promise<CallToolResult> => {
      return await listAllPulseMetricDefinitionsWithMetricsTool.logAndExecute({
        extra,
        args: {},
        callback: async () => {
          return await useRestApi({
            ...extra,
            jwtScopes: listAllPulseMetricDefinitionsWithMetricsTool.requiredApiScopes,
            callback: async (restApi) => {
              // First, get all metric definitions with basic info
              const definitionsResult = await pulsePaginate({
                config: {},
                getDataFn: async (pageToken, pageSize) => {
                  const apiResult = await restApi.pulseMethods.listAllPulseMetricDefinitions(
                    'DEFINITION_VIEW_BASIC',
                    pageToken,
                    pageSize,
                  );

                  if (apiResult.isOk()) {
                    return new Ok({
                      pagination: apiResult.value.pagination,
                      data: apiResult.value.definitions,
                    });
                  }

                  return apiResult;
                },
              });

              if (definitionsResult.isErr()) {
                return definitionsResult;
              }

              const definitions = definitionsResult.value;

              // Then, for each definition, fetch all its metrics
              const definitionsWithMetrics: Array<PulseMetricDefinitionWithMetrics> =
                await Promise.all(
                  definitions.map(async (definition) => {
                    const metricsResult =
                      await restApi.pulseMethods.listPulseMetricsFromMetricDefinitionId(
                        definition.metadata.id,
                      );

                    if (metricsResult.isErr()) {
                      // If we can't fetch metrics for this definition, return it with empty metrics array
                      return {
                        ...definition,
                        metrics: [],
                        total_metrics: 0,
                      };
                    }

                    return {
                      ...definition,
                      metrics: metricsResult.value,
                      total_metrics: metricsResult.value.length,
                    };
                  }),
                );

              return new Ok(definitionsWithMetrics);
            },
          });
        },
        constrainSuccessResult: (definitionsWithMetrics) => ({
          type: 'success',
          result: definitionsWithMetrics,
        }),
      });
    },
  });

  return listAllPulseMetricDefinitionsWithMetricsTool;
};
