# User Impersonation for Tableau Search MCP Server

This document describes the user impersonation feature that allows the Tableau Search MCP Server to authenticate as different users when searching across Tableau instances.

## Overview

User impersonation enables the MCP Server to:
- **Search content as specific users** - See what content different users have access to
- **Test access controls** - Verify permissions and content visibility
- **Perform searches on behalf of users** - Search content that specific users can access
- **Audit user access** - Track what content specific users can see

## How It Works

### Direct Trust Authentication
The MCP Server uses **Direct Trust Connected Apps** with JWT tokens to authenticate as different users:

1. **User specifies email** - When calling the search tool, provide a `userEmail` parameter
2. **JWT generation** - Server generates a JWT token with the specified user as the `sub` claim
3. **Tableau authentication** - Server authenticates to Tableau as that user
4. **Content search** - Server searches content that the user has access to
5. **Results returned** - Results are filtered by the user's permissions

### Security Features

#### User Validation
- **Email format validation** - Ensures valid email addresses
- **Domain allowlisting** - Restrict impersonation to specific domains
- **User allowlisting** - Restrict impersonation to specific users
- **Domain/user blocking** - Block specific domains or users
- **Rate limiting** - Limit impersonation attempts per user per hour

#### Audit Logging
- **All impersonation activities logged** - Track who is being impersonated
- **Search requests logged** - Monitor what searches are performed
- **Authentication events logged** - Track successful/failed authentications
- **Configurable log levels** - Control logging verbosity
- **Sensitive data protection** - Option to mask sensitive information

## Configuration

### Environment Variables

```bash
# User Impersonation Settings
ENABLE_USER_IMPERSONATION=true
ALLOWED_USERS=john.doe@company.com,jane.smith@company.com
ALLOWED_DOMAINS=company.com,example.org
BLOCKED_USERS=blocked.user@company.com
BLOCKED_DOMAINS=blocked.com
MAX_IMPERSONATION_ATTEMPTS=10

# Audit Logging Settings
ENABLE_AUDIT_LOGGING=true
AUDIT_LOG_LEVEL=info
INCLUDE_SENSITIVE_DATA_IN_AUDIT=false
MAX_AUDIT_LOG_ENTRIES=1000
```

### Configuration File (JSON)

```json
{
  "name": "production",
  "server": "https://tableau.company.com",
  "siteName": "",
  "auth": "direct-trust",
  "jwtSubClaim": "claude-search@company.com",
  "connectedAppClientId": "your-client-id",
  "connectedAppSecretId": "your-secret-id",
  "connectedAppSecretValue": "your-secret-value",
  "jwtAdditionalPayload": "{\"groups\":[\"tableau-search-users\"]}",
  "enabled": true
}
```

## Usage

### Search with User Impersonation

```typescript
// Search as a specific user
{
  "query": "sales dashboard",
  "contentTypes": ["workbooks", "views"],
  "userEmail": "john.doe@company.com"
}

// Search as current user (no userEmail specified)
{
  "query": "my reports",
  "contentTypes": ["workbooks"]
}
```

### Manage User Impersonation Settings

Use the `manage-user-impersonation` tool to configure settings:

```typescript
// Get current settings
{
  "operation": "get-settings"
}

// Allow specific users
{
  "operation": "update-user-validation",
  "userValidationConfig": {
    "allowedUsers": ["john.doe@company.com", "jane.smith@company.com"]
  }
}

// Allow domain
{
  "operation": "update-user-validation",
  "userValidationConfig": {
    "allowedDomains": ["company.com"]
  }
}

// Block user
{
  "operation": "update-user-validation",
  "userValidationConfig": {
    "blockedUsers": ["blocked.user@company.com"]
  }
}

// Update audit settings
{
  "operation": "update-audit-logging",
  "auditLoggingConfig": {
    "logLevel": "warn",
    "includeSensitiveData": false
  }
}

// Get statistics
{
  "operation": "get-stats"
}

// Clear statistics
{
  "operation": "clear-stats"
}
```

## Security Considerations

### Best Practices

1. **Use least-privilege principle** - Only allow necessary users/domains
2. **Monitor audit logs** - Regularly review impersonation activities
3. **Set appropriate rate limits** - Prevent abuse of impersonation
4. **Use dedicated service accounts** - Don't use admin accounts for impersonation
5. **Regular security reviews** - Audit who can be impersonated

### Connected App Configuration

Ensure your Connected App is configured to:
- **Trust the users** you want to impersonate
- **Have appropriate scopes** for the content you need to access
- **Use secure secret management** for client credentials

### User Permissions

Users being impersonated must:
- **Exist in Tableau** - The user must be a valid Tableau user
- **Have appropriate permissions** - Access to the content you want to search
- **Be trusted by the Connected App** - The Connected App must allow impersonation

## Examples

### Search as Different Users

```typescript
// Search as sales team member
{
  "query": "sales performance",
  "userEmail": "sales.team@company.com"
}

// Search as finance team member
{
  "query": "revenue dashboard",
  "userEmail": "finance.team@company.com"
}

// Search as specific user
{
  "query": "my dashboards",
  "userEmail": "john.doe@company.com"
}
```

### Test Access Controls

```typescript
// Test what a new user can see
{
  "query": "dashboard",
  "userEmail": "new.user@company.com"
}

// Test what a restricted user can see
{
  "query": "sensitive data",
  "userEmail": "restricted.user@company.com"
}
```

### Audit User Access

```typescript
// See what content a user has access to
{
  "query": "",
  "contentTypes": ["workbooks", "views", "datasources"],
  "userEmail": "audit.user@company.com"
}
```

## Troubleshooting

### Common Issues

1. **User validation failed** - Check if user is in allowed list and not blocked
2. **Authentication failed** - Verify user exists in Tableau and Connected App trusts them
3. **No results returned** - User may not have access to the content being searched
4. **Rate limit exceeded** - Too many impersonation attempts for the user

### Debugging

1. **Check audit logs** - Review what impersonation activities are being logged
2. **Verify user permissions** - Ensure the user has access to the content
3. **Test with different users** - Try with users you know have access
4. **Check Connected App configuration** - Verify the app trusts the users

### Log Messages

Look for these log messages:
- `User validation passed for: user@company.com`
- `Impersonating user user@company.com on instance instance-name`
- `User validation failed: reason`
- `Failed to generate JWT for user user@company.com`

## API Reference

### Search Content Tool

**Tool Name:** `search-content`

**Parameters:**
- `query` (string, required): Search query
- `contentTypes` (array, optional): Content types to search
- `maxResults` (number, optional): Maximum results to return
- `filters` (string, optional): Additional filters
- `includeMetadata` (boolean, optional): Include detailed metadata
- `searchTimeout` (number, optional): Search timeout in milliseconds
- `userEmail` (string, optional): User to impersonate

### Manage User Impersonation Tool

**Tool Name:** `manage-user-impersonation`

**Parameters:**
- `operation` (string, required): Operation to perform
- `userValidationConfig` (object, optional): User validation configuration
- `auditLoggingConfig` (object, optional): Audit logging configuration

**Operations:**
- `get-settings`: Get current settings
- `update-user-validation`: Update user validation configuration
- `update-audit-logging`: Update audit logging configuration
- `get-stats`: Get validation and audit statistics
- `clear-stats`: Clear validation and audit statistics

## Conclusion

User impersonation provides powerful capabilities for searching Tableau content as different users while maintaining security through validation, audit logging, and access controls. Use this feature responsibly and follow security best practices to ensure safe and effective content discovery across your Tableau estate.
