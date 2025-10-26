import { useEffect, useState } from 'react';
import vegaEmbed from 'vega-embed';
import type { PulseMetricData, Insight } from './types';

/**
 * Transform Pulse viz spec to fix formatting issues:
 * 1. Convert custom axis formatters to labelExpr (Vega-Lite native)
 * 2. Simplify tooltip to show only formatted text
 */
function transformVizSpec(vizSpec: any): any {
  const transformed = JSON.parse(JSON.stringify(vizSpec)); // Deep clone
  const formatterMaps = transformed.customFormatterMaps || {};

  // Helper to create a labelExpr from a formatter map
  function createLabelExpr(mapName: string): string {
    const map = formatterMaps[mapName];
    if (!map) return 'datum.value';

    // Build a JavaScript expression that does the lookup
    // Format: datum.value === 'key1' ? 'value1' : datum.value === 'key2' ? 'value2' : datum.value
    const entries = Object.entries(map);
    let expr = 'datum.value';

    // Build the conditional chain in reverse
    for (let i = entries.length - 1; i >= 0; i--) {
      const [key, value] = entries[i];
      // Escape single quotes in the value
      const escapedValue = (value as string).replace(/'/g, "\\'");
      expr = `datum.value === '${key}' ? '${escapedValue}' : ${expr}`;
    }

    return expr;
  }

  // Helper function to recursively transform layers
  function transformLayer(layer: any) {
    if (!layer) return;

    // Fix tooltip encoding - show only tooltipText without field name
    if (layer.encoding?.tooltip && Array.isArray(layer.encoding.tooltip)) {
      // Use object format instead of array to hide field name
      layer.encoding.tooltip = {
        field: 'tooltipText',
        type: 'nominal',
      };
    }

    // Fix x-axis formatting - replace custom format with labelExpr
    if (layer.encoding?.x?.axis?.format?.custom) {
      const xAxis = layer.encoding.x.axis;
      const mapName = xAxis.format.mapName;

      // Replace custom format with labelExpr
      delete xAxis.format;
      xAxis.labelExpr = createLabelExpr(mapName);
    }

    // Fix y-axis formatting - replace custom format with labelExpr
    if (layer.encoding?.y?.axis?.format?.custom) {
      const yAxis = layer.encoding.y.axis;
      const mapName = yAxis.format.mapName;

      // Replace custom format with labelExpr
      delete yAxis.format;
      yAxis.labelExpr = createLabelExpr(mapName);
    }

    // Recursively transform child layers
    if (layer.layer && Array.isArray(layer.layer)) {
      layer.layer.forEach(transformLayer);
    }
  }

  // Transform all layers in the spec
  if (transformed.layer && Array.isArray(transformed.layer)) {
    transformed.layer.forEach(transformLayer);
  } else {
    transformLayer(transformed);
  }

  return transformed;
}

export default function App() {
  const [data, setData] = useState<PulseMetricData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    // Load data from OpenAI toolOutput (direct property access)
    const loadData = () => {
      console.log('[Pulse Widget] window.openai:', window.openai);

      if (!window.openai) {
        console.log('[Pulse Widget] window.openai not available yet');
        return;
      }

      // Access toolOutput directly from window.openai (not a method call)
      const toolOutput: any = window.openai.toolOutput;
      console.log('[Pulse Widget] toolOutput:', toolOutput);

      if (!toolOutput) {
        console.log('[Pulse Widget] No toolOutput available yet');
        return;
      }

      try {
        // toolOutput contains the MCP response - extract structuredContent
        let pulseData: PulseMetricData | null = null;

        console.log('[Pulse Widget] toolOutput type:', typeof toolOutput);
        console.log('[Pulse Widget] toolOutput keys:', Object.keys(toolOutput));

        // OpenAI wraps the MCP response in {text: '...'} where text is a JSON string
        if (toolOutput.text && typeof toolOutput.text === 'string') {
          console.log('[Pulse Widget] Parsing MCP response from text property');
          const mcpResponse = JSON.parse(toolOutput.text);
          console.log('[Pulse Widget] Parsed MCP response:', mcpResponse);
          console.log('[Pulse Widget] MCP response keys:', Object.keys(mcpResponse));

          // Extract structuredContent from the MCP response
          if (mcpResponse.structuredContent) {
            pulseData = mcpResponse.structuredContent;
            console.log('[Pulse Widget] Found structuredContent:', pulseData);
          } else {
            console.error('[Pulse Widget] No structuredContent in MCP response');
            console.error('[Pulse Widget] Available keys:', Object.keys(mcpResponse));
            setError('No metric data in response');
            return;
          }
        } else if (toolOutput.insightBundle) {
          // Already the right format (structuredContent directly)
          console.log('[Pulse Widget] Using toolOutput directly as PulseMetricData');
          pulseData = toolOutput as PulseMetricData;
        } else {
          console.error('[Pulse Widget] Unexpected toolOutput format');
          console.error('[Pulse Widget] toolOutput:', toolOutput);
          setError('Unexpected data format');
          return;
        }

        if (!pulseData) {
          setError('No metric data provided');
          return;
        }

        setData(pulseData);
        console.log('[Pulse Widget] Data loaded successfully:', pulseData);
      } catch (error) {
        console.error('[Pulse Widget] Failed to load data:', error);
        setError(`Failed to load metric data: ${error}`);
      }
    };

    // Load initial data
    loadData();

    // Apply theme (force light mode temporarily)
    setTheme('light');
    document.body.classList.toggle('dark-mode', false);

    // Listen for global updates (including toolOutput)
    const handleSetGlobals = ((event: CustomEvent) => {
      console.log('[Pulse Widget] set_globals event:', event.detail);

      // Reload data when toolOutput changes
      if (event.detail?.globals?.toolOutput !== undefined) {
        console.log('[Pulse Widget] toolOutput updated, reloading...');
        loadData();
      }

      // Ignore theme changes for now (forcing light mode)
      // if (event.detail?.globals?.theme) {
      //   const newTheme = event.detail.globals.theme;
      //   setTheme(newTheme);
      //   document.body.classList.toggle('dark-mode', newTheme === 'dark');
      // }
    }) as EventListener;

    window.addEventListener('openai:set_globals', handleSetGlobals);
    return () => window.removeEventListener('openai:set_globals', handleSetGlobals);
  }, []);

  useEffect(() => {
    if (!data) return;

    console.log('[Pulse Widget] Rendering visualization, data:', data);

    // Find visualization insight
    const allInsights: Insight[] = [];
    data.insightBundle.result.insight_groups.forEach((group) => {
      if (group.insights) {
        allInsights.push(...group.insights);
      }
    });

    console.log('[Pulse Widget] All insights:', allInsights);

    // Log all insights with viz to help identify the time series one
    const allVizInsights = allInsights.filter((insight) => insight.result?.viz);
    console.log('[Pulse Widget] All insights with viz:', allVizInsights.map(i => ({
      insight_type: i.insight_type,
      result_type: i.result?.type,
      has_viz: !!i.result?.viz
    })));

    // Look for 'currenttrend' insight which contains the time series visualization
    const vizInsight = allVizInsights.find((insight) =>
      insight.insight_type === 'currenttrend'
    ) || allVizInsights[0];

    console.log('[Pulse Widget] Selected viz insight:', vizInsight);

    if (vizInsight?.result?.viz) {
      const originalViz = vizInsight.result.viz;
      console.log('[Pulse Widget] Original viz spec:', originalViz);

      // Transform the viz spec to fix formatting issues
      const transformedViz = transformVizSpec(originalViz);
      console.log('[Pulse Widget] Transformed viz spec:', transformedViz);

      // Render Vega-Lite visualization
      vegaEmbed('#visualization', transformedViz, {
        actions: false,
        renderer: 'svg',
      })
        .then((result) => {
          console.log('[Pulse Widget] Vega embed success:', result);
        })
        .catch((err) => {
          console.error('[Pulse Widget] Vega embed error:', err);
          setError(`Failed to render visualization: ${err.message}`);
        });
    } else {
      console.warn('[Pulse Widget] No visualization found in insights');
    }
  }, [data, theme]);

  if (error) {
    return (
      <div style={styles.error}>
        <strong>Error:</strong> {error}
      </div>
    );
  }

  if (!data) {
    return <div style={styles.loading}>Loading metric data...</div>;
  }

  // Extract insights
  const allInsights: Insight[] = [];
  data.insightBundle.result.insight_groups.forEach((group) => {
    if (group.insights) {
      allInsights.push(...group.insights);
    }
  });

  const textInsights = allInsights.filter((insight) => insight.result?.markup);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>{data.metric.name || 'Pulse Metric'}</h1>
        {data.metric.description && <p style={styles.description}>{data.metric.description}</p>}
      </div>

      <div id="visualization" style={styles.visualization} />

      {textInsights.length > 0 && (
        <div style={styles.insights}>
          {textInsights.map((insight, index) => (
            <div
              key={index}
              style={styles.insightItem}
              dangerouslySetInnerHTML={{ __html: insight.result.markup || '' }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: '800px',
    margin: '0 auto',
    padding: '16px',
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  },
  header: {
    marginBottom: '16px',
  },
  title: {
    fontSize: '24px',
    fontWeight: 600,
    marginBottom: '8px',
    color: 'var(--text-primary, #1a1a1a)',
  },
  description: {
    fontSize: '14px',
    color: 'var(--text-secondary, #666)',
    marginBottom: '16px',
  },
  visualization: {
    margin: '24px 0',
    borderRadius: '8px',
    overflow: 'hidden',
    height: '300px', // Fixed height to prevent infinite growth
    width: '100%',
    background: 'var(--bg-secondary, #f3f4f6)',
  },
  insights: {
    marginTop: '24px',
  },
  insightItem: {
    padding: '12px',
    marginBottom: '8px',
    background: 'var(--bg-secondary, #f3f4f6)',
    borderRadius: '6px',
    fontSize: '14px',
    lineHeight: 1.5,
  },
  loading: {
    textAlign: 'center',
    padding: '40px',
    color: 'var(--text-secondary, #666)',
  },
  error: {
    padding: '16px',
    background: '#fee2e2',
    border: '1px solid #ef4444',
    borderRadius: '6px',
    color: '#991b1b',
    margin: '16px',
  },
};
