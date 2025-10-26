export declare const listPulseMetricsTool: {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            q: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
                default: number;
            };
        };
    };
    _meta: {
        "openai/componentInitiable": boolean;
    };
};
export declare function listPulseMetrics(args: unknown): Promise<{
    content: {
        type: string;
        text: string;
    }[];
}>;
//# sourceMappingURL=list_pulse_metrics.d.ts.map