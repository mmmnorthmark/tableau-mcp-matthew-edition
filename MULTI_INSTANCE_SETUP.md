# Multi-Instance Tableau Search MCP Server

This MCP Server has been enhanced to support searching across multiple Tableau instances simultaneously, providing enterprise-wide analytical search capabilities.

## 🚀 Features

- **Multi-Instance Search**: Search across multiple Tableau Server and Tableau Cloud instances
- **Live Federation**: Real-time search with no data staleness
- **Intelligent Ranking**: Results ranked by relevance, freshness, and usage patterns
- **Request Caching**: Configurable caching for improved performance
- **Health Monitoring**: Automatic health checks and failover
- **Backward Compatibility**: Works with existing single-instance configurations

## 📋 Quick Start

### 1. Configuration

Set the `TABLEAU_INSTANCES` environment variable with a JSON array of your Tableau instances:

```bash
export TABLEAU_INSTANCES='[
  {
    "name": "production",
    "server": "https://tableau.company.com",
    "auth": "pat",
    "patName": "search-service",
    "patValue": "your-pat-token",
    "enabled": true,
    "priority": 10
  },
  {
    "name": "staging", 
    "server": "https://tableau-staging.company.com",
    "auth": "pat",
    "patName": "search-service",
    "patValue": "your-staging-pat-token",
    "enabled": true,
    "priority": 5
  }
]'
```

### 2. Search Content

Use the new `search-content` tool to search across all instances:

```json
{
  "query": "sales performance",
  "contentTypes": ["workbooks", "views", "datasources"],
  "maxResults": 20
}
```

## 🔧 Configuration Options

### Instance Configuration

Each Tableau instance requires:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | ✅ | Unique identifier for the instance |
| `server` | string | ✅ | Tableau server URL (must start with https://) |
| `auth` | string | ✅ | Authentication method: `pat` or `direct-trust` |
| `siteName` | string | ❌ | Tableau site name (empty for default site) |
| `enabled` | boolean | ❌ | Whether instance is enabled (default: true) |
| `priority` | number | ❌ | Priority 1-10, higher = more important (default: 5) |
| `maxConcurrentRequests` | number | ❌ | Max concurrent requests (default: 10) |
| `requestTimeout` | number | ❌ | Request timeout in ms (default: 30000) |

### Authentication

#### Personal Access Token (PAT)
```json
{
  "auth": "pat",
  "patName": "your-pat-name",
  "patValue": "your-pat-token"
}
```

#### Direct Trust (Connected App)
```json
{
  "auth": "direct-trust",
  "jwtSubClaim": "service-account@company.com",
  "connectedAppClientId": "your-client-id",
  "connectedAppSecretId": "your-secret-id", 
  "connectedAppSecretValue": "your-secret-value",
  "jwtAdditionalPayload": "{\"groups\":[\"tableau-users\"]}"
}
```

### Search Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `SEARCH_CACHE_TTL` | 300000 | Cache TTL in milliseconds (5 minutes) |
| `MAX_CONCURRENT_SEARCHES` | 10 | Max concurrent searches across instances |
| `SEARCH_TIMEOUT` | 30000 | Search timeout in milliseconds |
| `ENABLE_REQUEST_CACHING` | true | Enable request-level caching |
| `SYSTEM_PROMPT` | (default) | Custom system prompt for result prioritization |

## 🛠️ Deployment Examples

### Docker Compose

```yaml
version: '3.8'
services:
  tableau-search-mcp:
    build: .
    ports:
      - "3927:3927"
    environment:
      - TRANSPORT=http
      - TABLEAU_INSTANCES=${TABLEAU_INSTANCES}
      - SEARCH_CACHE_TTL=300000
      - MAX_CONCURRENT_SEARCHES=15
      - SEARCH_TIMEOUT=45000
      - ENABLE_REQUEST_CACHING=true
      - DEFAULT_LOG_LEVEL=info
    restart: unless-stopped
```

### Claude Desktop

```json
{
  "mcpServers": {
    "tableau-search": {
      "command": "node",
      "args": ["/path/to/tableau-search-mcp/dist/index.js"],
      "env": {
        "TRANSPORT": "stdio",
        "TABLEAU_INSTANCES": "[{\"name\":\"prod\",\"server\":\"https://tableau.company.com\",\"auth\":\"pat\",\"patName\":\"search\",\"patValue\":\"your-token\"}]"
      }
    }
  }
}
```

## 🔍 Search Tool Usage

### Basic Search
```json
{
  "query": "sales performance dashboard"
}
```

### Filtered Search
```json
{
  "query": "revenue analytics",
  "contentTypes": ["workbooks"],
  "filters": "projectName:eq:Finance,createdAt:gt:2023-01-01T00:00:00Z",
  "maxResults": 50
}
```

### Detailed Results
```json
{
  "query": "customer insights",
  "includeMetadata": true,
  "searchTimeout": 60000
}
```

## 📊 Result Ranking

Results are ranked by:

1. **Text Relevance**: How well the content matches your query
2. **Content Freshness**: Recently updated content ranks higher
3. **Usage Popularity**: Frequently accessed content ranks higher
4. **Quality Indicators**: Certified datasources, etc.
5. **Instance Priority**: Higher priority instances weighted more

## 🏥 Health Monitoring

- **Automatic Health Checks**: Every minute
- **Failover**: Continues with healthy instances if some fail
- **Request Tracking**: Monitors response times and success rates
- **Error Logging**: Detailed error messages for troubleshooting

## 🔧 Troubleshooting

### Common Issues

**No healthy instances available**
- Check instance URLs and authentication credentials
- Verify network connectivity to Tableau servers
- Ensure PAT tokens or Connected App credentials are valid

**Timeout errors**
- Increase `SEARCH_TIMEOUT` environment variable
- Reduce `MAX_CONCURRENT_SEARCHES` for large instances
- Check network latency to Tableau servers

**Cache issues**
- Disable `ENABLE_REQUEST_CACHING` if experiencing stale data
- Reduce `SEARCH_CACHE_TTL` for more frequent updates

### Monitoring

Check instance health and performance:
- Health checks run every minute
- Request counts and response times tracked per instance
- Failed operations logged with detailed error messages

## 🔄 Migration from Single-Instance

The server maintains full backward compatibility. To migrate:

1. **Keep existing configuration**: All existing environment variables continue to work
2. **Add multi-instance support**: Set `TABLEAU_INSTANCES` to enable multi-instance mode
3. **Gradual migration**: Start with one instance, add more as needed

### Legacy Mode
If `TABLEAU_INSTANCES` is not set, the server operates in legacy single-instance mode using the original configuration variables.

## 🚀 Future Enhancements

- **Tableau Next Support**: Planned for future releases
- **CRM Analytics Integration**: Salesforce Analytics Cloud support
- **Advanced Semantic Search**: NLP-powered content discovery
- **Content Indexing**: Optional background indexing for faster searches
- **Usage Analytics**: Track search patterns and popular content

## 📝 Examples

See `config.multi-instance.example.json` and `env.multi-instance.example` for complete configuration examples.

## Live integration tests

For validating PAT and connected-app authentication against real Tableau servers, see [INTEGRATION_TESTS.md](INTEGRATION_TESTS.md).
