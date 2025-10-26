import { z } from "zod";
const ListPulseMetricsSchema = z.object({
    q: z.string().optional(),
    limit: z.number().min(1).max(100).default(20),
});
export const listPulseMetricsTool = {
    name: "list_pulse_metrics",
    description: "List Tableau Pulse metrics visible to the user. Optionally filter by search query. " +
        "Returns metric ID, name, and URL for embedding.",
    inputSchema: {
        type: "object",
        properties: {
            q: {
                type: "string",
                description: "Optional search query to filter metrics by name",
            },
            limit: {
                type: "number",
                description: "Maximum number of metrics to return (default: 20, max: 100)",
                default: 20,
            },
        },
    },
    _meta: {
        "openai/componentInitiable": true,
    },
};
export async function listPulseMetrics(args) {
    const parsed = ListPulseMetricsSchema.parse(args);
    const { q, limit } = parsed;
    // Validate environment
    const tableauHost = process.env.TABLEAU_HOST;
    const siteName = process.env.SITE_NAME;
    const apiToken = process.env.TABLEAU_API_TOKEN; // Personal Access Token for REST API
    if (!tableauHost || !siteName) {
        throw new Error("Missing required environment variables: TABLEAU_HOST, SITE_NAME");
    }
    // TODO: Implement actual Tableau REST API call to Pulse endpoints
    // For now, return mock data structure
    // Real implementation would:
    // 1. Authenticate with PAT or sign-in
    // 2. GET /api/3.x/sites/{site-id}/pulse/metrics
    // 3. Filter by q if provided
    // 4. Map to PulseMetric[]
    console.log(`[list_pulse_metrics] Listing metrics (q="${q || ""}", limit=${limit})`);
    // Mock data - replace with actual API call
    const mockMetrics = [
        {
            id: "metric-001",
            name: "Revenue",
            url: `${tableauHost}/#/site/${siteName}/pulse/metrics/metric-001`,
        },
        {
            id: "metric-002",
            name: "Customer Acquisition Cost",
            url: `${tableauHost}/#/site/${siteName}/pulse/metrics/metric-002`,
        },
        {
            id: "metric-003",
            name: "Monthly Active Users",
            url: `${tableauHost}/#/site/${siteName}/pulse/metrics/metric-003`,
        },
    ];
    let metrics = mockMetrics;
    if (q) {
        const query = q.toLowerCase();
        metrics = metrics.filter((m) => m.name.toLowerCase().includes(query));
    }
    metrics = metrics.slice(0, limit);
    return {
        content: [
            {
                type: "text",
                text: JSON.stringify({
                    metrics,
                    total: metrics.length,
                    query: q || null,
                }, null, 2),
            },
        ],
    };
}
//# sourceMappingURL=list_pulse_metrics.js.map