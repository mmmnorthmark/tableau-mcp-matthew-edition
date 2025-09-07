import { CorsOptions } from 'cors';
import { z } from 'zod';
import { readFileSync } from 'fs';
import { resolve } from 'path';

import { isToolName, ToolName } from './tools/toolName.js';
import { isTransport, TransportName } from './transports.js';
import invariant from './utils/invariant.js';
import { log } from './logging/log.js';

const authTypes = ['pat', 'direct-trust'] as const;
type AuthType = (typeof authTypes)[number];

// Multi-instance configuration schema
const tableauInstanceSchema = z.object({
  name: z.string().min(1, 'Instance name is required'),
  server: z.string().url('Server URL must be a valid URL'),
  siteName: z.string().optional(),
  sitePrompt: z.string().optional(),
  auth: z.enum(['pat', 'direct-trust']),
  patName: z.string().optional(),
  patValue: z.string().optional(),
  jwtSubClaim: z.string().optional(),
  connectedAppClientId: z.string().optional(),
  connectedAppSecretId: z.string().optional(),
  connectedAppSecretValue: z.string().optional(),
  jwtAdditionalPayload: z.string().optional(),
  enabled: z.boolean().default(true),
  priority: z.number().min(1).max(10).default(5),
  maxConcurrentRequests: z.number().min(1).max(50).default(10),
  requestTimeout: z.number().min(1000).max(60000).default(30000),
});

export type TableauInstance = z.infer<typeof tableauInstanceSchema>;

export class Config {
  // Transport and server configuration
  transport: TransportName;
  sslKey: string;
  sslCert: string;
  httpPort: number;
  corsOriginConfig: CorsOptions['origin'];
  defaultLogLevel: string;
  disableLogMasking: boolean;
  includeTools: Array<ToolName>;
  excludeTools: Array<ToolName>;
  maxResultLimit: number | null;
  disableQueryDatasourceFilterValidation: boolean;
  
  // Multi-instance configuration
  instances: TableauInstance[];
  
  // Search configuration
  searchCacheTtl: number;
  maxConcurrentSearches: number;
  searchTimeout: number;
  enableRequestCaching: boolean;
  systemPrompt: string;
  
  // Configuration file watching
  configFilePath: string;
  enableConfigWatching: boolean;
  
  // User impersonation settings
  enableUserImpersonation: boolean;
  allowedUsers: string[];
  allowedDomains: string[];
  blockedUsers: string[];
  blockedDomains: string[];
  maxImpersonationAttempts: number;
  
  // Audit logging settings
  enableAuditLogging: boolean;
  auditLogLevel: string;
  includeSensitiveDataInAudit: boolean;
  maxAuditLogEntries: number;

  constructor() {
    const cleansedVars = removeClaudeDesktopExtensionUserConfigTemplates(process.env);
    
    // Require Tableau instance configuration (either TABLEAU_INSTANCES or CONFIG_FILE_PATH)
    const tableauInstances = cleansedVars.TABLEAU_INSTANCES;
    const configFilePathEnv = cleansedVars.CONFIG_FILE_PATH;
    
    if (!tableauInstances && !configFilePathEnv) {
      throw new Error('Tableau instance configuration required. Set either TABLEAU_INSTANCES or CONFIG_FILE_PATH environment variable.');
    }
    
    if (tableauInstances) {
      // Parse TABLEAU_INSTANCES environment variable
      try {
        const instancesData = JSON.parse(tableauInstances);
        this.instances = instancesData.map((instance: any, index: number) => {
          const result = tableauInstanceSchema.safeParse(instance);
          if (!result.success) {
            throw new Error(`Invalid instance configuration at index ${index}: ${result.error.message}`);
          }
          return result.data;
        });
      } catch (error) {
        throw new Error(`Failed to parse TABLEAU_INSTANCES: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else {
      // CONFIG_FILE_PATH mode - load instances from file
      try {
        const configFile = resolve(configFilePathEnv!);
        const configData = readFileSync(configFile, 'utf8');
        const instancesData = JSON.parse(configData);
        
        this.instances = instancesData.map((instance: any, index: number) => {
          const result = tableauInstanceSchema.safeParse(instance);
          if (!result.success) {
            throw new Error(`Invalid instance configuration at index ${index}: ${result.error.message}`);
          }
          return result.data;
        });
      } catch (error) {
        throw new Error(`Failed to load configuration file '${configFilePathEnv}': ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    // Validate instances if we have them
    if (this.instances.length > 0) {
      this.instances.forEach((instance, index) => {
        validateTableauInstance(instance, index);
      });
      
      // Log instance loading summary (using proper logging, not console.log)
      const enabledCount = this.instances.filter(instance => instance.enabled).length;
      const instanceNames = this.instances.map(instance => instance.name).join(', ');
      // Note: We can't use log.info here because we don't have a server instance yet
      // The instances will be logged when the server starts
    }
    
    const {
      TRANSPORT: transport,
      SSL_KEY: sslKey,
      SSL_CERT: sslCert,
      HTTP_PORT_ENV_VAR_NAME: httpPortEnvVarName,
      CORS_ORIGIN_CONFIG: corsOriginConfig,
      DEFAULT_LOG_LEVEL: defaultLogLevel,
      DISABLE_LOG_MASKING: disableLogMasking,
      INCLUDE_TOOLS: includeTools,
      EXCLUDE_TOOLS: excludeTools,
      MAX_RESULT_LIMIT: maxResultLimit,
      DISABLE_QUERY_DATASOURCE_FILTER_VALIDATION: disableQueryDatasourceFilterValidation,
      SEARCH_CACHE_TTL: searchCacheTtl,
      MAX_CONCURRENT_SEARCHES: maxConcurrentSearches,
      SEARCH_TIMEOUT: searchTimeout,
      ENABLE_REQUEST_CACHING: enableRequestCaching,
      SYSTEM_PROMPT: systemPrompt,
      CONFIG_FILE_PATH: configFilePath,
      ENABLE_CONFIG_WATCHING: enableConfigWatching,
      ENABLE_USER_IMPERSONATION: enableUserImpersonation,
      ALLOWED_USERS: allowedUsers,
      ALLOWED_DOMAINS: allowedDomains,
      BLOCKED_USERS: blockedUsers,
      BLOCKED_DOMAINS: blockedDomains,
      MAX_IMPERSONATION_ATTEMPTS: maxImpersonationAttempts,
      ENABLE_AUDIT_LOGGING: enableAuditLogging,
      AUDIT_LOG_LEVEL: auditLogLevel,
      INCLUDE_SENSITIVE_DATA_IN_AUDIT: includeSensitiveDataInAudit,
      MAX_AUDIT_LOG_ENTRIES: maxAuditLogEntries,
    } = cleansedVars;

    const defaultPort = 3927;
    const httpPort = cleansedVars[httpPortEnvVarName?.trim() || 'PORT'] || defaultPort.toString();
    const httpPortNumber = parseInt(httpPort, 10);

    this.transport = isTransport(transport) ? transport : 'stdio';
    this.sslKey = sslKey?.trim() ?? '';
    this.sslCert = sslCert?.trim() ?? '';
    this.httpPort = isNaN(httpPortNumber) ? defaultPort : httpPortNumber;
    this.corsOriginConfig = getCorsOriginConfig(corsOriginConfig?.trim() ?? '');
    this.defaultLogLevel = defaultLogLevel ?? 'debug';
    this.disableLogMasking = disableLogMasking === 'true';
    this.disableQueryDatasourceFilterValidation = disableQueryDatasourceFilterValidation === 'true';

    const maxResultLimitNumber = maxResultLimit ? parseInt(maxResultLimit) : NaN;
    this.maxResultLimit =
      isNaN(maxResultLimitNumber) || maxResultLimitNumber <= 0 ? null : maxResultLimitNumber;

    this.includeTools = includeTools
      ? includeTools
          .split(',')
          .map((s) => s.trim())
          .filter(isToolName)
      : [];

    this.excludeTools = excludeTools
      ? excludeTools
          .split(',')
          .map((s) => s.trim())
          .filter(isToolName)
      : [];

    if (this.includeTools.length > 0 && this.excludeTools.length > 0) {
      throw new Error('Cannot specify both INCLUDE_TOOLS and EXCLUDE_TOOLS');
    }

    // Legacy single-instance properties are kept for compatibility but not validated
    // since we always use multi-instance configuration

    
    // Search configuration
    this.searchCacheTtl = searchCacheTtl ? parseInt(searchCacheTtl) : 300000; // 5 minutes default
    this.maxConcurrentSearches = maxConcurrentSearches ? parseInt(maxConcurrentSearches) : 10;
    this.searchTimeout = searchTimeout ? parseInt(searchTimeout) : 30000;
    this.enableRequestCaching = enableRequestCaching !== 'false';
    this.systemPrompt = systemPrompt || 'Prioritize results based on relevance to the user query, content freshness, and usage popularity.';
    
    // Configuration file watching
    this.configFilePath = configFilePath || '';
    this.enableConfigWatching = enableConfigWatching === 'true';
    
    // User impersonation settings
    this.enableUserImpersonation = enableUserImpersonation !== 'false';
    this.allowedUsers = allowedUsers ? allowedUsers.split(',').map(u => u.trim()).filter(u => u.length > 0) : [];
    this.allowedDomains = allowedDomains ? allowedDomains.split(',').map(d => d.trim()).filter(d => d.length > 0) : [];
    this.blockedUsers = blockedUsers ? blockedUsers.split(',').map(u => u.trim()).filter(u => u.length > 0) : [];
    this.blockedDomains = blockedDomains ? blockedDomains.split(',').map(d => d.trim()).filter(d => d.length > 0) : [];
    this.maxImpersonationAttempts = maxImpersonationAttempts ? parseInt(maxImpersonationAttempts) : 10;
    
    // Audit logging settings
    this.enableAuditLogging = enableAuditLogging !== 'false';
    this.auditLogLevel = auditLogLevel || 'info';
    this.includeSensitiveDataInAudit = includeSensitiveDataInAudit === 'true';
    this.maxAuditLogEntries = maxAuditLogEntries ? parseInt(maxAuditLogEntries) : 1000;
  }
}

function validateTableauInstance(instance: TableauInstance, index: number): void {
  if (!instance.server.startsWith('https://')) {
    throw new Error(`Instance ${index} (${instance.name}): Server URL must start with "https://": ${instance.server}`);
  }

  try {
    const _ = new URL(instance.server);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Instance ${index} (${instance.name}): Server URL is not valid: ${instance.server} -- ${errorMessage}`,
    );
  }
  
  // Validate authentication configuration
  if (instance.auth === 'pat') {
    if (!instance.patName || !instance.patValue) {
      throw new Error(`Instance ${index} (${instance.name}): PAT authentication requires both patName and patValue`);
    }
  } else if (instance.auth === 'direct-trust') {
    if (!instance.jwtSubClaim || !instance.connectedAppClientId || !instance.connectedAppSecretId || !instance.connectedAppSecretValue) {
      throw new Error(`Instance ${index} (${instance.name}): Direct-trust authentication requires jwtSubClaim, connectedAppClientId, connectedAppSecretId, and connectedAppSecretValue`);
    }
  }
}

function validateServer(server: string): void {
  if (!server.startsWith('https://')) {
    throw new Error(`The environment variable SERVER must start with "https://": ${server}`);
  }

  try {
    const _ = new URL(server);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(
      `The environment variable SERVER is not a valid URL: ${server} -- ${errorMessage}`,
    );
  }
}

function getCorsOriginConfig(corsOriginConfig: string): CorsOptions['origin'] {
  if (!corsOriginConfig) {
    return true;
  }

  if (corsOriginConfig.match(/^true|false$/i)) {
    return corsOriginConfig.toLowerCase() === 'true';
  }

  if (corsOriginConfig === '*') {
    return '*';
  }

  if (corsOriginConfig.startsWith('[') && corsOriginConfig.endsWith(']')) {
    try {
      const origins = JSON.parse(corsOriginConfig) as Array<string>;
      return origins.map((origin) => new URL(origin).origin);
    } catch {
      throw new Error(
        `The environment variable CORS_ORIGIN_CONFIG is not a valid array of URLs: ${corsOriginConfig}`,
      );
    }
  }

  try {
    return new URL(corsOriginConfig).origin;
  } catch {
    throw new Error(
      `The environment variable CORS_ORIGIN_CONFIG is not a valid URL: ${corsOriginConfig}`,
    );
  }
}

// When the user does not provide a site name in the Claude Desktop Extension configuration,
// Claude doesn't replace its value and sets the site name to "${user_config.site_name}".
function removeClaudeDesktopExtensionUserConfigTemplates(
  envVars: Record<string, string | undefined>,
): Record<string, string | undefined> {
  return Object.entries(envVars).reduce<Record<string, string | undefined>>((acc, [key, value]) => {
    if (value?.startsWith('${user_config.')) {
      acc[key] = '';
    } else {
      acc[key] = value;
    }
    return acc;
  }, {});
}

export const getConfig = (): Config => new Config();

export { validateTableauInstance };

export const exportedForTesting = {
  Config,
  validateTableauInstance,
};
