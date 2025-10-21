# Linking Tableau Pulse Connector to ChatGPT

This guide walks you through connecting your Tableau Pulse MCP server to ChatGPT using Developer mode.

## Prerequisites

1. **Tableau Setup Complete**:
   - Connected Apps (Direct Trust) configured
   - Domain allowlist includes `https://chat.openai.com`
   - Site embedding allowlist enabled
   - At least one Pulse metric created

2. **Environment Configured**:
   - `ops/dev.env` file created with your credentials
   - ngrok account with authtoken

3. **Servers Running**:
   ```bash
   # Terminal 1: Start dev servers
   cd apps-pulse
   pnpm dev

   # Terminal 2: Start ngrok
   ngrok http 3000 --config ops/ngrok.yml
   ```

## Step-by-Step Setup

### 1. Get Your HTTPS URL

After starting ngrok, you'll see output like:

```
Forwarding  https://abc123def456.ngrok-free.app -> http://localhost:3000
```

Copy the HTTPS URL (e.g., `https://abc123def456.ngrok-free.app`).

### 2. Create Connector in ChatGPT

1. Open [ChatGPT](https://chat.openai.com/)
2. Click **Settings** (bottom left) → **Connectors**
3. Click **Create Connector**
4. Fill in the form:
   - **Name**: Tableau Pulse
   - **URL**: `https://abc123def456.ngrok-free.app/mcp` (your ngrok URL + `/mcp`)
   - **Description**: Access Tableau Pulse metrics with secure Connected Apps auth
5. Click **Create**

### 3. Enable in a Chat

1. Start a new chat
2. Click the **+** icon or **Tools** menu
3. Toggle on **Tableau Pulse**
4. You should see three available tools:
   - `get_pulse_token`
   - `list_pulse_metrics`
   - `get_metric_insight`

## Testing the Connector

### Example 1: List Available Metrics

```
Show me all available Pulse metrics
```

Expected response: A list of metrics with IDs, names, and URLs.

### Example 2: Load a Metric

```
Use the Pulse connector to show the 'Revenue' metric for last 30 days
```

This will:
1. Call `list_pulse_metrics` to find the metric
2. Call `get_pulse_token` with your metric URL
3. Render the interactive `<tableau-pulse>` widget

### Example 3: Change Time Range

In the widget controls, change the time range dropdown from "Last 30 days" to "Last 90 days". The widget will update automatically.

### Example 4: Fullscreen & Summarize

```
Fullscreen the Pulse view and summarize the main drivers
```

This will:
1. Expand the widget to fullscreen
2. Call `get_metric_insight` to generate a summary
3. Post the summary back to chat

## Troubleshooting

### Widget doesn't load

**Check Connected Apps domain allowlist**:
- Must include `https://chat.openai.com`
- Verify in Tableau Server/Cloud: Settings → Connected Apps → [Your App] → Domain Allowlist

**Check site embedding policy**:
- Settings → Site Settings → Embedding
- Ensure "Allow embedding" is enabled
- Add ChatGPT origins if restricted

### Token generation fails

**Verify environment variables**:
```bash
cd mcp
cat ../ops/dev.env
```

Ensure all required variables are set:
- `CONNECTED_APP_CLIENT_ID`
- `CONNECTED_APP_SECRET_ID`
- `CONNECTED_APP_SECRET_VALUE`
- `TABLEAU_HOST`
- `SITE_NAME`

**Check metric URL matches configured host**:
The server validates that metric URLs match the `TABLEAU_HOST` in your env. If you're using a different Tableau instance, update `TABLEAU_HOST`.

### Rate limiting errors

The server has rate limiting (30 requests/minute for token generation). If you hit the limit:
- Wait 60 seconds
- Or increase the limit in `mcp/src/server.ts` (search for `rateLimit`)

## Production Deployment

For production use:

1. **Deploy MCP server** to a cloud provider (Vercel, Railway, Fly.io, etc.)
2. **Use permanent domain** instead of ngrok
3. **Update Connected Apps allowlist** with your production domain
4. **Set environment variables** in your hosting platform
5. **Enable HTTPS** (required by ChatGPT)
6. **Add authentication** if exposing to multiple users

## Security Checklist

- ✅ All secrets in environment variables (never in code)
- ✅ Token TTL ≤ 600 seconds
- ✅ Rate limiting enabled
- ✅ Metric URL host validation
- ✅ HTTPS only
- ✅ No secrets in logs or tool outputs
- ✅ Widget state < 4KB
- ✅ Connected Apps domain allowlist configured

## Next Steps

- Customize the mock data in `list_pulse_metrics.ts` with real API calls
- Implement actual Tableau REST API integration for insights
- Add support for custom filters and parameters
- Enhance error handling and user feedback
- Add unit tests and E2E tests

## Resources

- [OpenAI Apps SDK Documentation](https://platform.openai.com/docs/apps)
- [Tableau Embedding API v3](https://help.tableau.com/current/api/embedding_api/en-us/index.html)
- [Tableau Connected Apps](https://help.tableau.com/current/server/en-us/connected_apps.htm)
- [Tableau REST API](https://help.tableau.com/current/api/rest_api/en-us/REST/rest_api.htm)
