# Changelog

## [Unreleased] - 2025-10-21

### Added - OpenAI Apps SDK Integration

#### New Tool: `embed-pulse-metric`
- Interactive embedded Tableau Pulse widgets for ChatGPT
- Parameters: `metricId`, `metricDefinitionId`, `username`
- Returns: Embedded HTML widget with authenticated `<tableau-pulse>` component
- Features: Time controls, filters, fullscreen, AI summarization

#### Connected Apps Module
- Server-side JWT token generation using Direct Trust
- Location: `src/connectedApps/generateToken.ts`
- Configurable TTL (60-600 seconds, default 600)
- URL validation to prevent cross-server token misuse
- Required environment variables:
  - `CONNECTED_APP_CLIENT_ID`
  - `CONNECTED_APP_SECRET_ID`
  - `CONNECTED_APP_SECRET_VALUE`

#### React Widget (`apps-pulse/`)
- Interactive Pulse metric viewer
- Built with React, TypeScript, Vite
- Embedding API v3 integration
- Supports both OpenAI Apps and standalone modes
- Components:
  - `PulseCard`: Main `<tableau-pulse>` renderer
  - `Controls`: Time range, layout, action buttons
  - `useOpenAI`: Hook for OpenAI Apps SDK integration

#### Build System
- Automated widget bundling into MCP server
- Script: `scripts/build-pulse-widget.mjs`
- Workflow:
  1. Build React widget (`apps-pulse/web`)
  2. Bundle into HTML (`apps-pulse/mcp`)
  3. Copy to main server
  4. Embed in server build
- Single command: `pnpm build`

#### Documentation
- `apps-pulse/INTEGRATION.md`: Architecture and implementation details
- `apps-pulse/QUICKSTART.md`: 5-minute setup guide
- `apps-pulse/ops/docs/link-chatgpt.md`: ChatGPT connector setup
- `apps-pulse/README.md`: Project overview

### Changed

- Updated `package.json` scripts to include widget build step
- Registered new tool in `src/tools/toolName.ts`
- Added tool factory in `src/tools/tools.ts`
- Added `jsonwebtoken` dependency for JWT signing

### Security

- JWT tokens generated server-side only
- No secrets exposed in tool responses
- Tokens embedded in HTML only (not in text content)
- URL validation prevents token misuse
- Short-lived tokens (max 10 minutes)
- Connected Apps domain allowlist required

## Previous Versions

See git history for previous changes.
