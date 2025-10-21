# Quick Start: Tableau Pulse OpenAI App

Get the Pulse widget running in ChatGPT in 5 minutes.

## Prerequisites

✅ Tableau Server/Cloud with Pulse enabled
✅ Connected Apps (Direct Trust) configured
✅ Node.js 18+ and pnpm installed

## Step 1: Configure Connected Apps

In Tableau Server/Cloud:

1. **Create Connected App** (Direct Trust)
   - Settings → Connected Apps → New Connected App
   - Copy: Client ID, Secret ID, Secret Value

2. **Domain Allowlist**
   - Add: `https://chat.openai.com`
   - Add: Any other domains where widget will run

3. **Site Embedding**
   - Settings → Site Settings → Embedding
   - Enable: "Allow embedding"
   - Add ChatGPT origins if using restricted allowlist

## Step 2: Environment Setup

```bash
# Copy environment template
cp ops/dev.env.example ops/dev.env

# Edit with your credentials
nano ops/dev.env
```

Required variables:
```bash
CONNECTED_APP_CLIENT_ID=your-client-id
CONNECTED_APP_SECRET_ID=your-secret-id
CONNECTED_APP_SECRET_VALUE=your-secret-value
TABLEAU_HOST=https://online.tableau.com
SITE_NAME=your-site-name
```

## Step 3: Build & Run

```bash
# Install dependencies
pnpm install

# Build everything (widget + server)
pnpm build

# Start server in HTTP mode
TRANSPORT=http pnpm start:http
```

Server runs on `http://localhost:3927`

## Step 4: Test with MCP Inspector

```bash
# In another terminal
pnpm inspect:http
```

Test the tool:
```json
{
  "name": "embed-pulse-metric",
  "arguments": {
    "metricId": "your-metric-id"
  }
}
```

## Step 5: Deploy for ChatGPT

### Option A: Local Testing with ngrok

```bash
# Install ngrok
brew install ngrok  # or npm install -g ngrok

# Start tunnel
ngrok http 3927

# Use the HTTPS URL in ChatGPT connector settings
```

### Option B: Production Deployment

Deploy to your preferred hosting platform:
- **Railway**: `railway up`
- **Fly.io**: `fly deploy`
- **Vercel**: Configure for Node.js
- **AWS/GCP/Azure**: Use container or Node.js runtime

Set environment variables in your hosting platform.

## Step 6: Link to ChatGPT

1. Open [ChatGPT](https://chat.openai.com/)
2. Settings → Connectors → Create
3. Enter:
   - **Name**: Tableau Pulse
   - **URL**: `https://your-server.com/mcp`
   - **Description**: Interactive Tableau Pulse metrics

4. Toggle on in a new chat
5. Test: "Show me the Revenue metric"

## Troubleshooting

### Build Fails

```bash
# Clean everything
rm -rf build apps-pulse/web/dist apps-pulse/mcp/dist node_modules
pnpm install
pnpm build
```

### Widget Doesn't Load

**Check domain allowlist** in Connected Apps
**Check site embedding** is enabled
**Check browser console** for CORS errors

### Token Generation Fails

```bash
# Verify environment variables
echo $CONNECTED_APP_CLIENT_ID
echo $CONNECTED_APP_SECRET_ID
echo $CONNECTED_APP_SECRET_VALUE

# Check server logs
tail -f server.log | grep "Connected Apps"
```

### Metric Not Found

```bash
# List available metrics
curl http://localhost:3927/api/tools/list_pulse_metrics \
  -H "Content-Type: application/json" \
  -d '{}'
```

## Usage Examples

In ChatGPT:

**Load a specific metric:**
```
Show me the Revenue metric as an interactive widget
```

**Load by definition:**
```
Display the Customer Acquisition Cost metric definition
```

**With custom user:**
```
Show the Sales metric for user john.doe@example.com
```

## Widget Features

- 📊 **Interactive KPIs** - Real-time metric values
- 📈 **Insights** - AI-generated analysis from Tableau
- ⏱️ **Time Controls** - 7/30/90 days, YTD
- 🎯 **Filters** - Dynamic metric filtering
- ⛶ **Fullscreen** - Expand to full canvas
- 💬 **Summarize** - Send insights to chat

## Next Steps

- Read [INTEGRATION.md](INTEGRATION.md) for architecture details
- See [apps-pulse/ops/docs/link-chatgpt.md](ops/docs/link-chatgpt.md) for advanced setup
- Explore widget source in [apps-pulse/web/src/](web/src/)

## Support

**Issues**: Report at [github.com/tableau/mcp-server/issues](https://github.com/tableau/mcp-server/issues)
**Docs**: [docs.claude.com](https://docs.claude.com)
**Community**: [Tableau Developer Program](https://www.tableau.com/developer)
