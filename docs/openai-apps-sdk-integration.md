# OpenAI Apps SDK Integration

This document describes how to use the Tableau MCP Server with OpenAI's Apps SDK to render Tableau Pulse metrics framelessly.

## Overview

The `render-pulse-metric` tool generates a self-contained HTML widget that can be embedded in OpenAI Apps SDK environments. Unlike traditional iframe-based embedding, this approach:

1. Uses `window.openai.callTool()` to fetch metric data via other MCP tools
2. Retrieves Vega-Lite specifications from Tableau's Pulse API
3. Renders visualizations client-side using vega-embed
4. Displays insights and metric information without requiring iframes

## Architecture

```
OpenAI Apps SDK Environment
│
├── Widget HTML (returned by render-pulse-metric tool)
│   │
│   ├── Calls window.openai.callTool()
│   │   ├── list-pulse-metrics-from-metric-ids
│   │   ├── list-pulse-metric-definitions-from-definition-ids
│   │   └── generate-pulse-metric-value-insight-bundle
│   │
│   ├── Receives Vega-Lite specifications
│   │
│   └── Renders using vega-embed library
│
└── Tableau MCP Server (handles all MCP tool calls)
    └── Communicates with Tableau REST APIs
```

## Usage

### 1. Call the render-pulse-metric Tool

```typescript
// In your OpenAI App
const result = await window.openai.callTool('render-pulse-metric', {
  metricId: 'CF32DDCC-362B-4869-9487-37DA4D152552'
});

// The result contains HTML that can be embedded
const html = result.result;
```

### 2. Embed the HTML Widget

The returned HTML is a complete, self-contained widget that includes:

- CSS styling with light/dark theme support
- JavaScript to fetch data via `window.openai.callTool()`
- Vega-Lite rendering logic
- Insight display and formatting

### 3. How It Works

The widget performs the following steps automatically:

1. **Fetch Metric Data**: Calls `list-pulse-metrics-from-metric-ids` to get the metric
2. **Fetch Definition**: Calls `list-pulse-metric-definitions-from-definition-ids` to get the metric definition
3. **Generate Insights**: Calls `generate-pulse-metric-value-insight-bundle` to get Vega-Lite specs and insights
4. **Render Visualization**: Uses vega-embed to render the Vega-Lite specification
5. **Display Insights**: Shows formatted insight text alongside the visualization

## Features

### Theme Support

The widget automatically adapts to the OpenAI Apps SDK theme:

```javascript
// Automatically detects theme
window.openai.theme // 'light' | 'dark'

// Listens for theme changes
window.addEventListener('openai:set_globals', (event) => {
  if (event.detail?.globals?.theme) {
    applyTheme();
  }
});
```

### Locale Support

The widget respects the user's locale for timezone and formatting:

```javascript
time_zone: window.openai?.locale?.includes('US') ? 'America/New_York' : 'UTC'
```

### Error Handling

The widget gracefully handles errors:

- Missing metrics
- API failures
- Missing window.openai (non-Apps SDK environments)

## Example: Complete Integration

```typescript
// In your OpenAI App component
import { useEffect, useState } from 'react';

function PulseMetricWidget({ metricId }: { metricId: string }) {
  const [html, setHtml] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadMetric() {
      try {
        const result = await window.openai.callTool('render-pulse-metric', {
          metricId
        });
        setHtml(result.result);
      } catch (error) {
        console.error('Failed to load metric:', error);
      } finally {
        setLoading(false);
      }
    }

    loadMetric();
  }, [metricId]);

  if (loading) {
    return <div>Loading metric...</div>;
  }

  return (
    <div
      dangerouslySetInnerHTML={{ __html: html }}
      style={{ width: '100%', height: '100%' }}
    />
  );
}
```

## Advantages Over Iframe Embedding

1. **No Sandboxing Issues**: Works within OpenAI Apps SDK's security model
2. **Native Theme Integration**: Automatically adapts to light/dark themes
3. **Direct MCP Integration**: Leverages existing MCP tools for data fetching
4. **Smaller Payload**: Only includes necessary rendering code, not Tableau's full React bundle
5. **Customizable**: HTML/CSS can be modified to match your app's design

## Limitations

1. **Requires OpenAI Apps SDK**: Will not work in standard iframe-based environments
2. **Client-Side Rendering**: Vega-Lite specs are rendered in the browser
3. **CDN Dependencies**: Requires access to CDN for vega, vega-lite, and vega-embed libraries

## Dependencies

The widget uses the following CDN-hosted libraries:

- `vega@5` - Vega visualization grammar
- `vega-lite@5` - Higher-level Vega-Lite specification
- `vega-embed@6` - Embedding and rendering utilities

These are loaded from `cdn.jsdelivr.net` in the widget HTML.

## Technical Details

### Vega-Lite Rendering

The Pulse API returns Vega-Lite specifications like:

```json
{
  "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
  "layer": [{
    "mark": {
      "type": "bar",
      "height": 24.0
    },
    "encoding": {
      "color": {...},
      "stroke": {...}
    }
  }],
  "data": {...},
  "encoding": {...}
}
```

These are rendered using:

```javascript
await vegaEmbed('#visualization', vegaSpec, {
  actions: false,
  theme: window.openai?.theme === 'dark' ? 'dark' : 'default'
});
```

### MCP Tool Call Pattern

All data fetching uses the same pattern:

```javascript
async function callMcpTool(toolName, args) {
  const result = await window.openai.callTool(toolName, args);
  return JSON.parse(result.result);
}
```

This ensures consistent error handling and response parsing.

## Future Enhancements

Potential improvements for future versions:

1. **Interactive Filtering**: Allow users to filter metrics directly in the widget
2. **Drill-Down Support**: Enable clicking on insights to see more details
3. **Export Functionality**: Add buttons to export data or images
4. **Real-Time Updates**: Poll for metric updates and refresh automatically
5. **Offline Support**: Cache data and specs for offline viewing
