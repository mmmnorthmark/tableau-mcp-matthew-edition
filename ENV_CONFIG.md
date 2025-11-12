# Environment Configuration Guide

## Quick Start

This project uses **ONE environment file**: `.env` in the project root.

### Setup

1. Copy the example file:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and add your credentials:
   ```bash
   nano .env  # or use your preferred editor
   ```

3. Configure required variables (see sections below)

## Environment Files

| File | Purpose | Git Status |
|------|---------|------------|
| `.env` | **Your active configuration** | ❌ Ignored (never commit!) |
| `.env.example` | Template with documentation | ✅ Committed to repo |

**Note**: All other `.env*` files are ignored by git to prevent credential leaks.

## Required Configuration

### For All Transports

```bash
# Tableau Server
SERVER=https://your-tableau-server.com
SITE_NAME=your-site-name

# Choose auth method: 'pat' or 'direct-trust'
AUTH=pat

# For PAT authentication:
PAT_NAME=your-pat-name
PAT_VALUE=your-pat-value

# OR for Direct Trust (Connected Apps):
CONNECTED_APP_CLIENT_ID=your-client-id
CONNECTED_APP_SECRET_ID=your-secret-id
CONNECTED_APP_SECRET_VALUE=your-secret-value
JWT_SUB_CLAIM=your-email@example.com
```

### For HTTP Transport (Additional Requirements)

```bash
TRANSPORT=http

# CORS configuration
CORS_ORIGIN_CONFIG=https://claude.ai

# Asset serving (REQUIRED for HTTP)
MCP_ASSET_SECRET_KEY=your-high-entropy-secret-min-32-chars
MCP_ASSET_CORS_ORIGINS=https://claude.ai,https://chatgpt.com
```

### For STDIO Transport

```bash
TRANSPORT=stdio
```

## Asset Serving Configuration

**New in Phase 1**: Secure asset serving for images and visualizations.

### Strategy Selection

Asset serving is **disabled by default**. Choose your strategy:

```bash
# Asset serving strategy (default: disabled)
MCP_ASSET_STRATEGY=disabled  # Tools return base64 data inline
# MCP_ASSET_STRATEGY=local   # Phase 1: Local filesystem with signed URLs
# MCP_ASSET_STRATEGY=s3      # Phase 2: S3 storage (not yet implemented)
```

### Required Variables (when `MCP_ASSET_STRATEGY ≠ disabled`)

```bash
# Secret key for signing URLs (REQUIRED)
# Generate a strong random string (32+ characters)
MCP_ASSET_SECRET_KEY=your-secret-key-here

# Origins allowed to load assets (REQUIRED)
# Comma-separated list
MCP_ASSET_CORS_ORIGINS=https://claude.ai,https://chatgpt.com
```

### Optional Variables

```bash
# Storage directory (default: ./assets, used when strategy=local)
MCP_ASSET_STORAGE_PATH=./assets

# Link expiration in hours (default: 24)
MCP_ASSET_EXPIRATION_HOURS=24
```

### Generating a Secure Secret Key

Use one of these methods to generate a strong secret key:

```bash
# Method 1: OpenSSL (macOS/Linux)
openssl rand -base64 48

# Method 2: Node.js
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"

# Method 3: Manual (not recommended)
# Create a random string of at least 32 characters
```

## Optional Configuration

```bash
# Logging
DEFAULT_LOG_LEVEL=debug
DEBUG=*
ENABLE_SERVER_LOGGING=true
SERVER_LOG_DIRECTORY=./logs

# Data source credentials (JSON format)
DATASOURCE_CREDENTIALS={"datasource-id": {"username": "user", "password": "pass"}}

# Tool filtering
INCLUDE_TOOLS=tool-name-1,tool-name-2
EXCLUDE_TOOLS=tool-name-3,tool-name-4

# Limits and validation
MAX_RESULT_LIMIT=1000
DISABLE_QUERY_DATASOURCE_FILTER_VALIDATION=false
DISABLE_METADATA_API_REQUESTS=false
```

## Security Best Practices

### ✅ Do

- Keep `.env` in `.gitignore` (already configured)
- Use different secrets for dev/staging/production
- Rotate secrets regularly
- Use strong, random secrets (32+ characters)
- Set strict CORS origins

### ❌ Don't

- Never commit `.env` to git
- Never share your `.env` file
- Never use weak or predictable secrets
- Never use `*` for CORS origins in production
- Never reuse secrets across environments

## Troubleshooting

### "MCP_ASSET_SECRET_KEY is required"

**Problem**: Server fails to start in HTTP mode.

**Solution**: Add `MCP_ASSET_SECRET_KEY` to your `.env` file:
```bash
MCP_ASSET_SECRET_KEY=$(openssl rand -base64 48)
```

### "MCP_ASSET_CORS_ORIGINS is required"

**Problem**: Server fails to start in HTTP mode.

**Solution**: Add allowed origins to your `.env`:
```bash
MCP_ASSET_CORS_ORIGINS=https://claude.ai
```

### Assets Not Loading in Browser

**Problem**: Images show as broken or CORS errors in console.

**Solutions**:
1. Check `MCP_ASSET_CORS_ORIGINS` matches the client origin exactly
2. Verify secret key hasn't changed (invalidates old URLs)
3. Check asset storage directory exists and is writable

## Migration from Multiple Env Files

**Old structure** (before cleanup):
- `.env` - Active config
- `env.list` - Docker format
- `env.example.list` - Docker template
- `apps-pulse/ops/dev.env` - Legacy app

**New structure** (current):
- `.env` - **Single source of truth**
- `.env.example` - Template

If you have local changes in old files, merge them into `.env` manually.

## Docker Usage

The server reads from `.env` automatically via `dotenv.config()`.

If you need Docker-specific format, generate `env.list` from `.env`:

```bash
# Convert .env to env.list format (if needed)
grep -v '^#' .env | grep -v '^$' > env.list
```

Then use:
```bash
docker run --env-file env.list tableau-mcp
```

## Related Documentation

- [ASSET_SERVING.md](ASSET_SERVING.md) - Detailed asset serving documentation
- [.env.example](.env.example) - Complete template with all options
- [README.md](README.md) - Project overview and setup
