// OpenAI Apps SDK types (based on official SDK examples)
export interface OpenAIGlobals {
  // Visuals
  theme: 'light' | 'dark';
  locale: string;

  // Layout
  maxHeight: number;
  displayMode: 'pip' | 'inline' | 'fullscreen';

  // State - direct properties (NOT methods)
  toolInput: any;
  toolOutput: PulseMetricData | null;
  toolResponseMetadata: any | null;
  widgetState: any | null;
  setWidgetState: (state: any) => Promise<void>;

  // API methods
  callTool?: (name: string, args: Record<string, unknown>) => Promise<{ result: string }>;
  sendFollowUpMessage?: (args: { prompt: string }) => Promise<void>;
  openExternal?: (payload: { href: string }) => void;
  requestDisplayMode?: (args: { mode: 'pip' | 'inline' | 'fullscreen' }) => Promise<{ mode: 'pip' | 'inline' | 'fullscreen' }>;
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
