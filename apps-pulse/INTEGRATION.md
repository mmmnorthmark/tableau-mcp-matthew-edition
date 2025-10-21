# Tableau Pulse OpenAI App Integration

This document explains how the Pulse widget has been integrated into the main Tableau MCP server.

## Architecture

The integration uses a **unified MCP server** approach:

```
tableau-mcp-matthew-edition/
├── src/                           # Main MCP server
│   ├── tools/pulse/
│   │   └── embedPulseMetric/      # NEW: Widget-enabled tool
│   │       ├── embedPulseMetric.ts
│   │       └── widget.html        # Built React widget (copied from apps-pulse)
│   └── connectedApps/             # NEW: JWT signing module
│       └── generateToken.ts
├── apps-pulse/                    # Widget development workspace
│   ├── web/                       # React widget source
│   └── mcp/                       # Build scripts
└── scripts/
    └── build-pulse-widget.mjs     # Copies widget into main server
```

## How It Works

### 1. Widget Development (`apps-pulse/`)

The React widget is developed in `apps-pulse/web/`:
- Built with Vite
- Uses `<tableau-pulse>` embedding component
- Supports both OpenAI Apps SDK mode and standalone mode
- Reads data from `window.__PULSE_DATA__`

### 2. Widget Build Process

```bash
# 1. Build React widget
cd apps-pulse/web && pnpm build

# 2. Bundle into HTML (scripts/bundle-ui.js)
cd apps-pulse/mcp && pnpm build
# Output: apps-pulse/mcp/dist/ui-template.html

# 3. Copy to main server (scripts/build-pulse-widget.mjs)
cp apps-pulse/mcp/dist/ui-template.html → src/tools/pulse/embedPulseMetric/widget.html

# 4. Build main server (embeds widget.html into bundle)
pnpm build
```

The root `pnpm build` now runs all these steps automatically.

### 3. MCP Tool: `embed-pulse-metric`

Located in `src/tools/pulse/embedPulseMetric/embedPulseMetric.ts`:

**What it does:**
1. Takes `metricId` or `metricDefinitionId` as input
2. Fetches metric details via Tableau REST API
3. Generates a Connected Apps JWT token (server-side)
4. Loads `widget.html` template
5. Injects metric data and token via `window.__PULSE_DATA__`
6. Returns `CallToolResult` with embedded HTML widget

**Tool signature:**
```typescript
{
  name: "embed-pulse-metric",
  paramsSchema: {
    metricId?: string,
    metricDefinitionId?: string,
    username?: string,
  },
  callback: async () => CallToolResult
}
```

**Example usage in ChatGPT:**
```
User: "Show me the Revenue metric as an interactive widget"
ChatGPT: [calls embed-pulse-metric tool]
→ Widget renders inline with Pulse KPIs, insights, controls
```

### 4. Connected Apps Authentication

Module: `src/connectedApps/generateToken.ts`

**Features:**
- Generates JWT tokens using Direct Trust flow
- TTL: 60-600 seconds (configurable, defaults to 600)
- Validates metric URL matches configured Tableau host
- Scopes: `tableau:views:embed`, `tableau:metrics:embed`

**Environment variables required:**
```bash
CONNECTED_APP_CLIENT_ID=...
CONNECTED_APP_SECRET_ID=...
CONNECTED_APP_SECRET_VALUE=...
SERVER=https://your-tableau-server.com
SITE_NAME=your-site
JWT_SUB_CLAIM=default-username
```

### 5. Widget Data Flow

```javascript
// Server-side (embedPulseMetric.ts)
const widgetData = {
  token: "<generated-jwt>",
  expiresAt: "2025-10-21T12:00:00Z",
  metricUrl: "https://server/.../#/site/mysite/pulse/metrics/123",
  metricName: "Revenue",
  tableauHost: "https://server"
};

widgetHtml = widgetHtml.replace(
  '<!-- WIDGET_DATA -->',
  `<script>window.__PULSE_DATA__ = ${JSON.stringify(widgetData)};</script>`
);
```

```javascript
// Client-side (App.tsx)
useEffect(() => {
  if (window.__PULSE_DATA__) {
    setPulseData(window.__PULSE_DATA__);
  }
}, []);

// Render
<tableau-pulse
  src={pulseData.metricUrl}
  token={pulseData.token}
  layout="kpi-and-insights"
/>
```

## Deployment Modes

### Mode 1: Claude Desktop (Existing)

- Transport: `stdio`
- All existing tools work unchanged
- New `embed-pulse-metric` tool available but less useful (text-based UI)

### Mode 2: ChatGPT via OpenAI Apps (New)

- Transport: `http`
- Tool `embed-pulse-metric` returns embedded widget
- Widget renders inline in ChatGPT conversation
- Interactive: time ranges, filters, fullscreen, summarize

## Development Workflow

### Working on the Widget

```bash
# Start widget dev server
cd apps-pulse
pnpm dev

# Opens http://localhost:5173 for testing
```

### Testing the Full Integration

```bash
# Build everything
pnpm build

# Start MCP server in HTTP mode
TRANSPORT=http pnpm start:http

# Test with MCP Inspector
pnpm inspect:http

# Call embed-pulse-metric tool
{
  "name": "embed-pulse-metric",
  "arguments": {
    "metricId": "your-metric-id"
  }
}
```

## Security Considerations

✅ **JWT tokens generated server-side only**
- Never exposed to client until embedded in widget
- Short TTL (max 10 minutes)
- Scoped to specific permissions

✅ **Metric URL validation**
- Ensures metric belongs to configured Tableau instance
- Prevents token misuse across different servers

✅ **Connected Apps domain allowlist**
- Must include ChatGPT origins
- Configured in Tableau Server/Cloud settings

✅ **No secrets in tool responses**
- Tokens only in embedded HTML (not in text content)
- Logging redacts sensitive values

## Troubleshooting

### Widget doesn't load

**Check:** Connected Apps domain allowlist
```
Settings → Connected Apps → [Your App] → Domain Allowlist
Must include: https://chat.openai.com
```

**Check:** Site embedding policy
```
Settings → Site Settings → Embedding
Ensure "Allow embedding" is enabled
```

### Token generation fails

**Check environment variables:**
```bash
echo $CONNECTED_APP_CLIENT_ID
echo $CONNECTED_APP_SECRET_ID
echo $CONNECTED_APP_SECRET_VALUE
```

**Check logs:**
```bash
# Server logs will show validation errors
tail -f server.log | grep "Connected Apps"
```

### Build fails

**Clean and rebuild:**
```bash
# Clean all builds
rm -rf build apps-pulse/web/dist apps-pulse/mcp/dist

# Rebuild
pnpm install
pnpm build
```

## Future Enhancements

- [ ] Auto-refresh tokens before expiry
- [ ] Support for custom filters and parameters
- [ ] Multi-metric dashboard widgets
- [ ] Real-time metric updates via Pulse webhooks
- [ ] Offline mode with cached data
- [ ] A11y improvements for screen readers

## References

- [OpenAI Apps SDK](https://developers.openai.com/apps-sdk/)
- [Tableau Embedding API v3](https://help.tableau.com/current/api/embedding_api/en-us/index.html)
- [Connected Apps Direct Trust](https://help.tableau.com/current/server/en-us/connected_apps_direct.htm)
- [MCP Specification](https://modelcontextprotocol.io/)
