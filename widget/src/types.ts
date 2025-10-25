// OpenAI Apps SDK types
export interface OpenAIGlobals {
  theme?: 'light' | 'dark';
  locale?: string;
  displayMode?: 'inline' | 'fullscreen';

  // Direct properties (available immediately)
  toolInput?: any;
  toolOutput?: any;

  // Async methods to get tool data
  getToolInput?: () => Promise<any>;
  getToolOutput?: () => Promise<any>;
  getStructuredContent?: () => Promise<PulseMetricData>;
  getWidgetState?: () => Promise<any>;
  setWidgetState?: (state: any) => Promise<void>;
}

// Pulse metric data structure (matches what the MCP tool returns)
export interface PulseMetricData {
  metricId: string;
  definitionId: string;
  metric: {
    name?: string;
    description?: string;
    specification: any;
  };
  definition: {
    representation_options: any;
  };
  insightBundle: {
    result: {
      insight_groups: InsightGroup[];
      has_errors: boolean;
      characterization: string;
    };
  };
}

export interface InsightGroup {
  type: string;
  insights: Insight[];
  summaries?: Summary[];
}

export interface Insight {
  result: {
    type: string;
    version: number;
    content?: string;
    markup?: string;
    viz?: any; // Vega-Lite specification
    facts?: any;
    characterization?: string;
    question: string;
    score: number;
  };
  insight_type: string;
}

export interface Summary {
  result: {
    id: string;
    markup?: string;
    viz?: any;
    generation_id: string;
    timestamp?: string;
    last_attempted_timestamp?: string;
  };
}

declare global {
  interface Window {
    openai?: OpenAIGlobals;
  }
}
