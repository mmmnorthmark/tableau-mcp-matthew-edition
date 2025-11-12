import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Ok } from 'ts-results-es';
import z from 'zod';

import { getConfig } from '../../../config.js';
import { useRestApi } from '../../../restApiInstance.js';
import { Server } from '../../../server.js';
import { Tool } from '../../tool.js';
import { getPulseDisabledError } from '../getPulseDisabledError.js';

const paramsSchema = {
  returnGroups: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      'If true, returns metrics grouped by their group metadata. If false, returns a flat list of all followed metrics.',
    ),
};

export const getFollowedPulseMetricsTool = (server: Server): Tool<typeof paramsSchema> => {
  const getFollowedPulseMetricsTool = new Tool({
    server,
    name: 'get-followed-pulse-metrics',
    description: `
Get Pulse metrics that the current user is following.

**What are followed metrics?**
Users can "follow" Pulse metrics to receive notifications and updates about them.
This tool returns only the metrics the authenticated user has chosen to follow, making it ideal for:
- "Show me my metrics"
- "What metrics am I tracking?"
- Finding metrics the user cares about for use with Pulse Discover

**Parameters:**
- \`returnGroups\` (optional): If true, returns metrics grouped by their group metadata. If false (default), returns a flat list.

**Example Usage:**

Get a flat list of all followed metrics:
\`\`\`json
{
  "returnGroups": false
}
\`\`\`

Get followed metrics with their group structure:
\`\`\`json
{
  "returnGroups": true
}
\`\`\`

**Returns:**
Depending on \`returnGroups\`:
- **false** (default): Array of metric objects with their IDs, specifications, and metadata
- **true**: Array of metric groups, each containing group metadata and an array of metrics

**Use Cases:**
- Finding metrics for Pulse Discover questions: "What caused changes in my followed metrics?"
- Showing personalized metric dashboards
- Filtering metrics by user interest
- Understanding which metrics a user is actively tracking

**Required Scopes:**
- \`tableau:insight_metrics:read\`

**Note:**
This is different from \`list-all-pulse-metric-definitions\` which returns ALL metrics on the site.
This tool only returns metrics the user is following (where \`is_followed=true\`).
`,
    paramsSchema,
    annotations: {
      title: 'Get Followed Pulse Metrics',
      readOnlyHint: true,
      openWorldHint: false,
    },
    callback: async ({ returnGroups }, { requestId }): Promise<CallToolResult> => {
      const config = getConfig();
      return await getFollowedPulseMetricsTool.logAndExecute({
        requestId,
        args: { returnGroups },
        callback: async () => {
          return await useRestApi({
            config,
            requestId,
            server,
            jwtScopes: ['tableau:insight_metrics:read'],
            callback: async (restApi) => {
              if (returnGroups) {
                // Return grouped structure
                const groupsResult = await restApi.pulseMethods.getFollowedPulseMetricsGroups();

                if (groupsResult.isErr()) {
                  throw new Error(`Failed to get followed metrics: ${groupsResult.error}`);
                }

                const groups = groupsResult.value.metric_groups;

                return new Ok({
                  content: [
                    {
                      type: 'text',
                      text: `Found ${groups.length} metric group(s) with ${groups.reduce((sum, g) => sum + g.metrics.length, 0)} total followed metrics.`,
                    },
                  ],
                  structuredContent: {
                    metric_groups: groups,
                    total_groups: groups.length,
                    total_metrics: groups.reduce((sum, g) => sum + g.metrics.length, 0),
                  },
                });
              } else {
                // Return flat list
                const metricsResult = await restApi.pulseMethods.getFollowedPulseMetrics();

                if (metricsResult.isErr()) {
                  throw new Error(`Failed to get followed metrics: ${metricsResult.error}`);
                }

                const metrics = metricsResult.value;

                return new Ok({
                  content: [
                    {
                      type: 'text',
                      text: `Found ${metrics.length} followed metric(s).`,
                    },
                  ],
                  structuredContent: {
                    metrics,
                    total_metrics: metrics.length,
                    metric_ids: metrics.map((m) => m.id),
                  },
                });
              }
            },
          });
        },
        getErrorText: getPulseDisabledError,
      });
    },
  });

  return getFollowedPulseMetricsTool;
};
