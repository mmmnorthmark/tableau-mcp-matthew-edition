import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { getConfig } from '../../../config.js';
import { useRestApi } from '../../../restApiInstance.js';
import { Server } from '../../../server.js';
import { Tool } from '../../tool.js';
import { getPulseDisabledError } from '../getPulseDisabledError.js';

const paramsSchema = {};

export const getListAllPulseMetricDefinitionsWithMetricsTool = (
  server: Server,
): Tool<typeof paramsSchema> => {
  const listAllPulseMetricDefinitionsWithMetricsTool = new Tool({
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
      openWorldHint: false,
    },
    callback: async (_, { requestId }): Promise<CallToolResult> => {
      const config = getConfig();
      return await listAllPulseMetricDefinitionsWithMetricsTool.logAndExecute({
        requestId,
        args: {},
        callback: async () => {
          return await useRestApi({
            config,
            requestId,
            server,
            jwtScopes: ['tableau:insight_definitions_metrics:read'],
            callback: async (restApi) => {
              // First, get all metric definitions with basic info
              const definitionsResult =
                await restApi.pulseMethods.listAllPulseMetricDefinitions('DEFINITION_VIEW_BASIC');

              if (definitionsResult.isErr()) {
                return definitionsResult;
              }

              const definitions = definitionsResult.value;

              // Then, for each definition, fetch all its metrics
              const definitionsWithMetrics = await Promise.all(
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

              return definitionsResult.map(() => definitionsWithMetrics);
            },
          });
        },
        getErrorText: getPulseDisabledError,
      });
    },
  });

  return listAllPulseMetricDefinitionsWithMetricsTool;
};
