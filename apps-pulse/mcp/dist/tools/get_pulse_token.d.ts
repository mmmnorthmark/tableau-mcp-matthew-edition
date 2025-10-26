export declare const getPulseTokenTool: {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            metricUrl: {
                type: string;
                description: string;
            };
            sub: {
                type: string;
                description: string;
            };
            ttlSec: {
                type: string;
                description: string;
                default: number;
            };
        };
        required: string[];
    };
    _meta: {
        "openai/outputTemplate": string;
        "openai/componentInitiable": boolean;
    };
};
export declare function getPulseToken(args: unknown): Promise<{
    content: {
        type: string;
        text: string;
    }[];
}>;
//# sourceMappingURL=get_pulse_token.d.ts.map