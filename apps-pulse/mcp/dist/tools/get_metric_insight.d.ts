export declare const getMetricInsightTool: {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            metricId: {
                type: string;
                description: string;
            };
            period: {
                type: string;
                enum: string[];
                description: string;
                default: string;
            };
        };
        required: string[];
    };
};
export declare function getMetricInsight(args: unknown): Promise<{
    content: {
        type: string;
        text: string;
    }[];
}>;
//# sourceMappingURL=get_metric_insight.d.ts.map