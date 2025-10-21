# Tableau Pulse for OpenAI Apps SDK

A secure, Pulse-first prototype that renders Tableau Pulse metrics inside ChatGPT with Connected Apps authentication.

## Architecture

- **MCP Server** (`mcp/`): Signs Connected Apps JWTs server-side, exposes Pulse tools
- **React Widget** (`web/`): Embeds `<tableau-pulse>` with filters, time ranges, and fullscreen support
- **Ops** (`ops/`): Dev scripts, ngrok config, environment templates

## Prerequisites

1. **Tableau Setup**:
   - Tableau Server or Cloud with Pulse enabled
   - Connected Apps (Direct Trust) configured with:
     - Client ID, Secret ID, Secret Value
     - Domain allowlist including `https://chat.openai.com`
   - Site embedding allowlist enabled for ChatGPT origins
   - At least one Pulse metric created

2. **Development Tools**:
   - Node.js 18+ and pnpm
   - ngrok account for HTTPS tunneling

## Quick Start

```bash
# Install dependencies
pnpm install

# Copy and configure environment
cp ops/dev.env.example ops/dev.env
# Edit ops/dev.env with your Tableau credentials

# Build all packages
pnpm build

# Start dev servers (MCP + web)
pnpm dev
```

In a separate terminal:
```bash
# Start ngrok tunnel
ngrok http 3000 --config ops/ngrok.yml
```

See [ops/docs/link-chatgpt.md](ops/docs/link-chatgpt.md) for linking the connector in ChatGPT.

## Project Structure

```
apps-pulse/
├── mcp/                    # MCP server
│   ├── src/
│   │   ├── server.ts       # Express server with MCP endpoint
│   │   ├── tools/          # Tool implementations
│   │   └── ui-template.html
│   └── package.json
├── web/                    # React widget
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── hooks/
│   │   └── components/
│   └── package.json
├── ops/                    # Operations
│   ├── dev.env.example
│   ├── ngrok.yml.example
│   ├── scripts/
│   └── docs/
└── package.json
```

## Security

- All Connected Apps secrets remain server-side
- JWT tokens have max 600s TTL
- Metric URL host validation prevents token misuse
- Rate limiting on token generation
- No secrets in tool outputs or logs

## Usage Examples

In ChatGPT:
- "Use the Pulse connector to show the 'Revenue' metric for last 30 days"
- "Fullscreen the Pulse view and summarize the main drivers"
- "Show me all available Pulse metrics"

## License

MIT
