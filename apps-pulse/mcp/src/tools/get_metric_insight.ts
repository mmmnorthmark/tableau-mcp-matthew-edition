import { z } from "zod";

const GetMetricInsightSchema = z.object({
  metricId: z.string(),
  period: z.enum(["last7days", "last30days", "last90days"]).default("last30days"),
});

export const getMetricInsightTool = {
  name: "get_metric_insight",
  description:
    "Get a brief textual summary/insight for a Tableau Pulse metric over a specified time period. " +
    "Useful for generating follow-up messages in chat without rendering the full visualization.",
  inputSchema: {
    type: "object",
    properties: {
      metricId: {
        type: "string",
        description: "The Pulse metric ID to get insights for",
      },
      period: {
        type: "string",
        enum: ["last7days", "last30days", "last90days"],
        description: "Time period for the insight (default: last30days)",
        default: "last30days",
      },
    },
    required: ["metricId"],
  },
};

export async function getMetricInsight(args: unknown) {
  const parsed = GetMetricInsightSchema.parse(args);
  const { metricId, period } = parsed;

  // Validate environment
  const tableauHost = process.env.TABLEAU_HOST;
  const siteName = process.env.SITE_NAME;

  if (!tableauHost || !siteName) {
    throw new Error("Missing required environment variables: TABLEAU_HOST, SITE_NAME");
  }

  // TODO: Implement actual Tableau REST API call to Pulse insights
  // Real implementation would:
  // 1. Authenticate
  // 2. GET /api/3.x/sites/{site-id}/pulse/metrics/{metric-id}/insights
  // 3. Filter by time period
  // 4. Extract key insight text or generate summary
  //
  // Alternative if API blocked: return deep link for user to open

  console.log(`[get_metric_insight] Fetching insight for metric=${metricId}, period=${period}`);

  // Mock insight - replace with actual API call
  const mockInsights: Record<string, string> = {
    "metric-001": `Revenue ${period === "last7days" ? "increased 12%" : period === "last30days" ? "grew 8.5%" : "showed steady growth of 15%"} compared to the previous period. Key driver: enterprise sales in Q4.`,
    "metric-002": `Customer Acquisition Cost ${period === "last7days" ? "dropped 5%" : period === "last30days" ? "decreased 3.2%" : "remained stable"} over the ${period}. Marketing efficiency improvements are paying off.`,
    "metric-003": `Monthly Active Users ${period === "last7days" ? "up 2%" : period === "last30days" ? "increased 7%" : "grew 18%"} in the ${period}. Mobile app launch driving engagement.`,
  };

  const insight = mockInsights[metricId] || `No insights available for metric ${metricId}.`;
  const metricUrl = `${tableauHost}/#/site/${siteName}/pulse/metrics/${metricId}`;

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            metricId,
            period,
            insight,
            deepLink: metricUrl,
          },
          null,
          2
        ),
      },
    ],
  };
}
