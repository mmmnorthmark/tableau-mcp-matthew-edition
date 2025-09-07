# Hot-Swappable Multi-Site Configuration

This MCP Server now supports **hot-swappable** configuration management, allowing you to add, update, remove, enable, and disable Tableau instances without restarting the server.

## 🔥 **Key Features**

- **Runtime Configuration Management**: Add/remove/update instances without restart
- **Hot-Swappable Instances**: Enable/disable instances on the fly
- **File-Based Configuration**: Optional file watching for automatic reloading
- **Version Tracking**: Track configuration changes and reload when needed
- **Health Monitoring**: Automatic health checks with failover
- **Single MCP Server**: One server handles all Tableau environments

## 🚀 **Quick Start**

### **Claude Desktop Configuration**

```json
{
  "mcpServers": {
    "tableau-search": {
      "command": "node",
      "args": ["/path/to/your/tableau-search-mcp/build/index.js"],
      "env": {
        "TRANSPORT": "stdio",
        "TABLEAU_INSTANCES": "[{\"name\":\"production\",\"server\":\"https://tableau.company.com\",\"auth\":\"direct-trust\",\"jwtSubClaim\":\"claude-search@company.com\",\"connectedAppClientId\":\"prod-client-id\",\"connectedAppSecretId\":\"prod-secret-id\",\"connectedAppSecretValue\":\"prod-secret-value\",\"enabled\":true,\"priority\":10}]",
        "DEFAULT_LOG_LEVEL": "info"
      }
    }
  }
}
```

### **File-Based Configuration (Optional)**

```json
{
  "mcpServers": {
    "tableau-search": {
      "command": "node",
      "args": ["/path/to/your/tableau-search-mcp/build/index.js"],
      "env": {
        "TRANSPORT": "stdio",
        "CONFIG_FILE_PATH": "/path/to/tableau-instances.json",
        "ENABLE_CONFIG_WATCHING": "true",
        "DEFAULT_LOG_LEVEL": "info"
      }
    }
  }
}
```

## 🛠️ **Runtime Management**

### **Available Tools**

1. **`manage-tableau-instances`**: Manage instances dynamically
2. **`search-content`**: Search across all configured instances

### **Management Operations**

#### **Add New Instance**
```json
{
  "operation": "add",
  "instance": {
    "name": "new-instance",
    "server": "https://new-tableau.company.com",
    "auth": "direct-trust",
    "jwtSubClaim": "claude-search@company.com",
    "connectedAppClientId": "new-client-id",
    "connectedAppSecretId": "new-secret-id",
    "connectedAppSecretValue": "new-secret-value",
    "enabled": true,
    "priority": 7
  }
}
```

#### **Update Existing Instance**
```json
{
  "operation": "update",
  "instanceName": "production",
  "instance": {
    "name": "production",
    "server": "https://tableau.company.com",
    "auth": "direct-trust",
    "jwtSubClaim": "claude-search@company.com",
    "connectedAppClientId": "updated-client-id",
    "connectedAppSecretId": "updated-secret-id",
    "connectedAppSecretValue": "updated-secret-value",
    "enabled": true,
    "priority": 10
  }
}
```

#### **Remove Instance**
```json
{
  "operation": "remove",
  "instanceName": "staging"
}
```

#### **Enable/Disable Instance**
```json
{
  "operation": "disable",
  "instanceName": "staging"
}
```

```json
{
  "operation": "enable",
  "instanceName": "staging"
}
```

#### **List All Instances**
```json
{
  "operation": "list"
}
```

#### **Replace All Instances**
```json
{
  "operation": "replace",
  "instances": [
    {
      "name": "prod",
      "server": "https://tableau.company.com",
      "auth": "direct-trust",
      "jwtSubClaim": "claude-search@company.com",
      "connectedAppClientId": "prod-client-id",
      "connectedAppSecretId": "prod-secret-id",
      "connectedAppSecretValue": "prod-secret-value",
      "enabled": true,
      "priority": 10
    }
  ]
}
```

## 📁 **File-Based Configuration**

### **Configuration File Format**

Create a JSON file with your instances:

```json
[
  {
    "name": "production",
    "server": "https://tableau.company.com",
    "siteName": "",
    "auth": "direct-trust",
    "jwtSubClaim": "claude-search@company.com",
    "connectedAppClientId": "prod-client-id",
    "connectedAppSecretId": "prod-secret-id",
    "connectedAppSecretValue": "prod-secret-value",
    "jwtAdditionalPayload": "{\"groups\":[\"tableau-search-users\"]}",
    "enabled": true,
    "priority": 10,
    "maxConcurrentRequests": 15,
    "requestTimeout": 30000
  },
  {
    "name": "staging",
    "server": "https://tableau-staging.company.com",
    "siteName": "",
    "auth": "direct-trust",
    "jwtSubClaim": "claude-search@company.com",
    "connectedAppClientId": "staging-client-id",
    "connectedAppSecretId": "staging-secret-id",
    "connectedAppSecretValue": "staging-secret-value",
    "enabled": true,
    "priority": 5,
    "maxConcurrentRequests": 10,
    "requestTimeout": 30000
  }
]
```

### **Environment Variables for File Watching**

```bash
CONFIG_FILE_PATH=/path/to/tableau-instances.json
ENABLE_CONFIG_WATCHING=true
```

## 🔧 **Instance Configuration Schema**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | ✅ | Unique identifier for the instance |
| `server` | string | ✅ | Tableau server URL (must start with https://) |
| `siteName` | string | ❌ | Tableau site name (empty for default site) |
| `auth` | string | ✅ | Authentication method: `pat` or `direct-trust` |
| `patName` | string | ❌ | Personal Access Token name (required for pat auth) |
| `patValue` | string | ❌ | Personal Access Token value (required for pat auth) |
| `jwtSubClaim` | string | ❌ | JWT subject claim (required for direct-trust auth) |
| `connectedAppClientId` | string | ❌ | Connected App Client ID (required for direct-trust auth) |
| `connectedAppSecretId` | string | ❌ | Connected App Secret ID (required for direct-trust auth) |
| `connectedAppSecretValue` | string | ❌ | Connected App Secret Value (required for direct-trust auth) |
| `jwtAdditionalPayload` | string | ❌ | Additional JWT payload as JSON string |
| `enabled` | boolean | ❌ | Whether instance is enabled (default: true) |
| `priority` | number | ❌ | Instance priority 1-10, higher = more important (default: 5) |
| `maxConcurrentRequests` | number | ❌ | Max concurrent requests to this instance (default: 10) |
| `requestTimeout` | number | ❌ | Request timeout in milliseconds (default: 30000) |

## 🔐 **Authentication Examples**

### **Personal Access Token (PAT)**
```json
{
  "name": "production",
  "server": "https://tableau.company.com",
  "auth": "pat",
  "patName": "claude-search",
  "patValue": "your-pat-token",
  "enabled": true,
  "priority": 10
}
```

### **Direct Trust (Connected App)**
```json
{
  "name": "cloud-prod",
  "server": "https://prod-ap-southeast-2a.online.tableau.com",
  "auth": "direct-trust",
  "jwtSubClaim": "claude-search@company.com",
  "connectedAppClientId": "your-client-id",
  "connectedAppSecretId": "your-secret-id",
  "connectedAppSecretValue": "your-secret-value",
  "jwtAdditionalPayload": "{\"groups\":[\"tableau-search-users\"]}",
  "enabled": true,
  "priority": 8
}
```

### **Multi-Site Configuration**
```json
{
  "name": "prod-finance",
  "server": "https://tableau.company.com",
  "siteName": "Finance",
  "auth": "direct-trust",
  "jwtSubClaim": "claude-search@company.com",
  "connectedAppClientId": "finance-client-id",
  "connectedAppSecretId": "finance-secret-id",
  "connectedAppSecretValue": "finance-secret-value",
  "enabled": true,
  "priority": 9
}
```

## 🎯 **Usage Examples**

### **Add New Tableau Cloud Instance**
```
User: "Add a new Tableau Cloud instance for our European region"

Claude uses: manage-tableau-instances tool
Operation: add
Instance: {
  "name": "cloud-europe",
  "server": "https://eu-west-1a.online.tableau.com",
  "auth": "direct-trust",
  "jwtSubClaim": "claude-search@company.com",
  "connectedAppClientId": "eu-client-id",
  "connectedAppSecretId": "eu-secret-id",
  "connectedAppSecretValue": "eu-secret-value",
  "enabled": true,
  "priority": 7
}

Result: "Added instance: cloud-europe"
```

### **Temporarily Disable Staging**
```
User: "Temporarily disable the staging instance for maintenance"

Claude uses: manage-tableau-instances tool
Operation: disable
InstanceName: "staging"

Result: "Disabled instance: staging"
```

### **Search Across All Instances**
```
User: "Find all sales dashboards across our Tableau environments"

Claude uses: search-content tool
Query: "sales dashboard"
ContentTypes: ["workbooks", "views"]

Result: Results from all enabled instances, ranked by relevance
```

## 🔄 **Configuration Lifecycle**

1. **Initialization**: Server starts with initial configuration
2. **Runtime Changes**: Use `manage-tableau-instances` to modify configuration
3. **Automatic Reloading**: InstanceManager automatically reloads when configuration changes
4. **Health Monitoring**: Continuous health checks and failover
5. **File Watching**: Optional automatic reloading from configuration files

## 🏥 **Health Monitoring**

- **Automatic Health Checks**: Every minute
- **Configuration Change Detection**: Automatic reloading when configuration changes
- **Failover**: Continues with healthy instances if some fail
- **Request Tracking**: Monitors response times and success rates
- **Error Logging**: Detailed error messages for troubleshooting

## 🚀 **Benefits**

1. **No Restart Required**: Add/remove instances without server restart
2. **Dynamic Scaling**: Scale your Tableau estate without downtime
3. **Maintenance Mode**: Disable instances for maintenance
4. **A/B Testing**: Enable/disable instances for testing
5. **Emergency Response**: Quickly disable problematic instances
6. **Centralized Management**: Manage all instances from one place

## 📝 **Best Practices**

1. **Use Descriptive Names**: Use clear, descriptive names for instances
2. **Set Appropriate Priorities**: Higher priority for production instances
3. **Monitor Health**: Regularly check instance health and performance
4. **Backup Configuration**: Keep backups of your configuration
5. **Test Changes**: Test configuration changes in staging first
6. **Document Changes**: Keep track of configuration changes

This hot-swappable configuration system gives you the flexibility to manage your Tableau estate dynamically without any downtime! 🚀
