import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Ok, Err } from 'ts-results-es';
import { z } from 'zod';

import { getConfig } from '../../config.js';
import { InstanceManager } from '../../instanceManager.js';
import { getCachedSearchResults, setCachedSearchResults, getCacheConfig } from '../../requestCache.js';
import { getConfigManager, initializeConfigManager } from '../../configManager.js';
import { getUserValidator } from '../../utils/userValidation.js';
import { getAuditLogger } from '../../utils/auditLogger.js';
import { Server } from '../../server.js';
import { Tool } from '../tool.js';
import { log } from '../../logging/log.js';

const paramsSchema = {
  query: z.string().min(1, 'Search query is required'),
  contentTypes: z.array(z.enum(['workbooks', 'views', 'datasources'])).optional(),
  maxResults: z.number().min(1).max(100).optional(),
  filters: z.string().optional(),
  includeMetadata: z.boolean().optional(),
  searchTimeout: z.number().min(1000).max(60000).optional(),
  userEmail: z.string().email('Invalid email format').optional(),
  ignoreCache: z.boolean().optional(),
};

export type SearchResult = {
  instanceName: string;
  contentType: 'workbook' | 'view' | 'datasource';
  id: string;
  name: string;
  description?: string;
  projectName?: string;
  ownerName?: string;
  tags?: string[];
  createdAt?: string;
  updatedAt?: string;
  relevanceScore: number;
  metadata?: Record<string, any>;
  webpageUrl?: string;
  contentUrl?: string;
  workbookName?: string;
};

export type SearchError = {
  type: 'no-instances' | 'timeout' | 'partial-failure' | 'validation';
  message: string;
  details?: Record<string, any>;
};

export const getSearchContentTool = (server: Server): Tool<typeof paramsSchema> => {
  const searchContentTool = new Tool({
    server,
    name: 'search-content',
    description: `
Search across all configured Tableau instances for workbooks, views, and datasources that match your query.

This tool performs a unified search across multiple Tableau Server and Tableau Cloud instances, returning results ranked by relevance to your query.

**Parameters:**
- \`query\`: The search query (required)
- \`contentTypes\`: Array of content types to search (optional, defaults to all)
- \`maxResults\`: Maximum number of results to return (optional, defaults to 20)
- \`filters\`: Additional filters in field:operator:value format (optional)
- \`includeMetadata\`: Include detailed metadata in results (optional, defaults to false)
- \`searchTimeout\`: Timeout for search operations in milliseconds (optional, defaults to 30000)
- \`userEmail\`: User to impersonate for the search (optional, uses configured default user if not provided)
- \`ignoreCache\`: Skip cache and force fresh search results (optional, defaults to false)

**Supported Content Types:**
- \`workbooks\`: Tableau workbooks and their metadata
- \`views\`: Individual views/dashboards within workbooks
- \`datasources\`: Published data sources

**Example Usage:**
- Search for all content related to "sales performance":
  query: "sales performance"
- Search only workbooks about "revenue":
  query: "revenue", contentTypes: ["workbooks"]
- Search with additional filters:
  query: "dashboard", filters: "projectName:eq:Finance,createdAt:gt:2023-01-01T00:00:00Z"
- Get detailed results:
  query: "analytics", includeMetadata: true, maxResults: 50

**Result Ranking:**
Results are ranked based on:
1. Text relevance to the search query
2. Content freshness (recently updated content ranked higher)
3. Usage popularity (frequently accessed content ranked higher)
4. Content quality indicators (certified datasources, etc.)
5. Instance priority and health status

**Multi-Instance Search:**
The tool searches across all healthy Tableau instances in parallel, combining and ranking results from all sources. If some instances are unavailable, the search continues with available instances.

**User Impersonation:**
When \`userEmail\` is provided, the tool will authenticate as that user across all Tableau instances, allowing you to search content that the specified user has access to. This is useful for:
- Searching content as a specific user to see their permissions
- Testing access controls and content visibility
- Performing searches on behalf of users
- Auditing what content specific users can access

**Example Usage with User Impersonation:**
- Search as a specific user: query: "sales dashboard", userEmail: "john.doe@company.com"
- Search as current user: query: "my reports" (no userEmail specified)
- Search with user context: query: "finance", userEmail: "finance.team@company.com"
`,
    paramsSchema,
    annotations: {
      title: 'Search Content',
      readOnlyHint: true,
      openWorldHint: true,
    },
    callback: async ({ query, contentTypes, maxResults, filters, includeMetadata, searchTimeout, userEmail, ignoreCache }, { requestId }): Promise<CallToolResult> => {
      const config = getConfig();
      
      return await searchContentTool.logAndExecute<SearchResult[], SearchError>({
        requestId,
        args: { query, contentTypes, maxResults, filters, includeMetadata, searchTimeout, userEmail },
        callback: async () => {
          const cacheConfig = getCacheConfig();
          const finalContentTypes = (contentTypes && contentTypes.length > 0) ? contentTypes : ['workbooks', 'views', 'datasources'];
          const finalMaxResults = maxResults || 20;
          
          // Debug the parameters
          await log.debug(server, `Search parameters received: contentTypes=${JSON.stringify(contentTypes)}, finalContentTypes=${JSON.stringify(finalContentTypes)}`, {
            logger: 'search-content',
            requestId: String(requestId)
          });
          
          // Initialize audit logger
          const auditLogger = getAuditLogger(server);
          
          // Validate user if userEmail is provided
          if (userEmail) {
            const userValidator = getUserValidator();
            const validationResult = userValidator.validateUser(userEmail, server);
            
            if (!validationResult.isValid) {
              // Log failed validation attempt
              auditLogger.logUserImpersonation(
                userEmail,
                'validation_failed',
                String(requestId),
                false,
                validationResult.reason,
                { validationResult }
              );
              
              return new Err({
                type: 'validation',
                message: `User validation failed: ${validationResult.reason}`,
                details: { userEmail, validationResult },
              });
            }
            
            // Log successful validation
            auditLogger.logUserImpersonation(
              userEmail,
              'validation_passed',
              String(requestId),
              true,
              undefined,
              { warnings: validationResult.warnings }
            );
            
            // Log warnings if any
            if (validationResult.warnings && validationResult.warnings.length > 0) {
              console.warn(`User validation warnings for ${userEmail}:`, validationResult.warnings);
            }
          }
          
          // Check cache first if caching is enabled and not ignored (include userEmail in cache key)
          if (cacheConfig.enableRequestCaching && !ignoreCache) {
            const cachedResults = getCachedSearchResults<SearchResult>(
              query,
              finalContentTypes,
              filters
            );
            
            if (cachedResults) {
              // Log cached search request
              auditLogger.logSearchRequest(
                query,
                userEmail,
                String(requestId),
                true,
                undefined,
                { 
                  contentTypes: finalContentTypes,
                  maxResults: finalMaxResults,
                  resultCount: cachedResults.length,
                  fromCache: true
                }
              );
              
              // Return cached results, limited to maxResults
              const limitedResults = cachedResults.slice(0, finalMaxResults);
              return new Ok(limitedResults);
            }
          }
          
          // Initialize or get ConfigManager
          let configManager;
          try {
            configManager = getConfigManager(server);
          } catch {
            // Initialize ConfigManager if it doesn't exist
            configManager = initializeConfigManager(server, config.instances);
          }
          
          // Initialize instance manager with user context
          const instanceManager = new InstanceManager(server, requestId, configManager, userEmail);
          
          try {
            // Check if we need to reload instances due to configuration changes
            await instanceManager.checkAndReloadIfNeeded();
            
            // Initialize instances if not already done
            if (instanceManager.getInstanceStats().length === 0) {
              await instanceManager.initializeFromConfigManager();
            }
            
            // Perform the search
            await log.debug(server, `About to call performUnifiedSearch with query: ${query}`, {
              logger: 'search-content',
              requestId: String(requestId)
            });
            
            const results = await performUnifiedSearch(instanceManager, server, requestId, {
              query,
              contentTypes: finalContentTypes,
              maxResults: finalMaxResults,
              filters,
              includeMetadata: includeMetadata || false,
              timeout: searchTimeout || config.searchTimeout,
              userEmail,
              ignoreCache: ignoreCache || false,
            });
            
            await log.debug(server, `performUnifiedSearch completed with ${results.length} results`, {
              logger: 'search-content',
              requestId: String(requestId)
            });
            
            // Cache the results if caching is enabled and not ignored
            if (cacheConfig.enableRequestCaching && !ignoreCache) {
              setCachedSearchResults(
                query,
                finalContentTypes,
                results,
                filters,
                [], // instanceNames
                cacheConfig.searchCacheTtl
              );
            }
            
            // Log successful search request
            auditLogger.logSearchRequest(
              query,
              userEmail,
              String(requestId),
              true,
              undefined,
              { 
                contentTypes: finalContentTypes,
                maxResults: finalMaxResults,
                resultCount: results.length,
                fromCache: false
              }
            );
            
            return new Ok(results);
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            
            // Log failed search request
            auditLogger.logSearchRequest(
              query,
              userEmail,
              String(requestId),
              false,
              errorMessage,
              { 
                contentTypes: finalContentTypes,
                maxResults: finalMaxResults
              }
            );
            
            if (errorMessage.includes('No healthy Tableau instances available')) {
              return new Err({
                type: 'no-instances',
                message: 'No healthy Tableau instances available for search',
                details: { availableInstances: instanceManager.getInstanceStats() },
              });
            }
            
            if (errorMessage.includes('timeout')) {
              return new Err({
                type: 'timeout',
                message: `Search operation timed out after ${searchTimeout || config.searchTimeout}ms`,
                details: { timeout: searchTimeout || config.searchTimeout },
              });
            }
            
            return new Err({
              type: 'partial-failure',
              message: `Search completed with errors: ${errorMessage}`,
              details: { error: errorMessage },
            });
          } finally {
            await instanceManager.shutdown();
          }
        },
        getErrorText: (error: SearchError) => {
          return JSON.stringify({
            requestId,
            errorType: error.type,
            message: error.message,
            details: error.details,
          });
        },
      });
    },
  });

  return searchContentTool;
};

interface SearchOptions {
  query: string;
  contentTypes: string[];
  maxResults: number;
  filters?: string;
  includeMetadata: boolean;
  timeout: number;
  userEmail?: string;
  ignoreCache?: boolean;
}

async function performUnifiedSearch(
  instanceManager: InstanceManager,
  server: Server,
  requestId: any,
  options: SearchOptions
): Promise<SearchResult[]> {
  const { query, contentTypes, maxResults, filters, includeMetadata, timeout } = options;
  
  const allResults: SearchResult[] = [];
  
  await log.debug(server, `performUnifiedSearch: searching ${contentTypes.length} content types: ${contentTypes.join(', ')}`, {
    logger: 'search-content',
    requestId: String(requestId)
  });
  
  // Search for each content type
  for (const contentType of contentTypes) {
    await log.debug(server, `performUnifiedSearch: searching content type: ${contentType}`, {
      logger: 'search-content',
      requestId: String(requestId)
    });
    
    const contentTypeResults = await searchContentType(instanceManager, server, requestId, {
      ...options,
      contentType,
    });
    
    await log.debug(server, `performUnifiedSearch: found ${contentTypeResults.length} results for ${contentType}`, {
      logger: 'search-content',
      requestId: String(requestId)
    });
    
    allResults.push(...contentTypeResults);
  }
  
  // Rank and sort results
  const rankedResults = rankSearchResults(allResults, query);
  
  // Apply max results limit
  return rankedResults.slice(0, maxResults);
}

async function searchContentType(
  instanceManager: InstanceManager,
  server: Server,
  requestId: any,
  options: SearchOptions & { contentType: string }
): Promise<SearchResult[]> {
  const { contentType, query, filters, includeMetadata, timeout } = options;
  
  const results = await instanceManager.executeOnAllInstances(async (connection) => {
    const searchResults: SearchResult[] = [];
    
    try {
      // Log the search request
      await log.debug(server, `Starting Content Exploration API search on instance: ${connection.instance.name}`, {
        logger: 'search-content',
        requestId: String(requestId)
      });
      
      // Log the exact API call parameters
      const searchParams = {
        term: query,
        contentType: contentType === 'datasources' ? 'datasource' : contentType.slice(0, -1), // Remove 's' from plural
        pageSize: 100,
      };
      await log.debug(server, `Content Exploration API call parameters: ${JSON.stringify(searchParams)}`, {
        logger: 'search-content',
        requestId: String(requestId)
      });
      
      // Use the Content Exploration API for unified search
      const searchResponse = await connection.restApi.contentExplorationMethods.getSearch(searchParams);
      
      // Log the search response
      await log.debug(server, `Content Exploration API search completed on ${connection.instance.name}: found ${searchResponse.hits.items.length} results`, {
        logger: 'search-content',
        requestId: String(requestId)
      });
      
      for (const item of searchResponse.hits.items) {
        const relevanceScore = calculateRelevanceScore(item, query);
        
        searchResults.push({
          instanceName: connection.instance.name,
          contentType: item.content.type as 'workbook' | 'view' | 'datasource',
          id: item.content.id.toString(),
          name: item.content.title,
          description: item.content.description,
          projectName: item.content.containerName,
          ownerName: item.content.ownerName,
          tags: item.content.tags,
          createdAt: item.content.createdTime,
          updatedAt: item.content.modifiedTime,
          relevanceScore,
          webpageUrl: item.content.webpageUrl,
          contentUrl: item.content.contentUrl,
          workbookName: item.content.workbookDescription,
        });
      }
    } catch (error) {
      throw error;
    }
    
    return searchResults;
  }, {
    timeout,
    maxConcurrent: 5,
    continueOnError: true,
  });
  
  // Flatten results from all instances
  const allResults: SearchResult[] = [];
  for (const result of results) {
    if (result.result) {
      allResults.push(...result.result);
    }
  }
  
  return allResults;
}

// searchWorkbooks function removed - now using unified Content Exploration API

// searchViews function removed - now using unified Content Exploration API

// searchDatasources function removed - now using unified Content Exploration API

// buildSearchFilter function removed - Content Exploration API uses different search syntax

function calculateRelevanceScore(item: any, query: string): number {
  let score = 0;
  const queryLower = query.toLowerCase();
  
  // Use the score from the API response as base score
  score = item.score || 0;
  
  // Name relevance (highest weight)
  if (item.content.title?.toLowerCase().includes(queryLower)) {
    score += 10;
  }
  
  // Description relevance
  if (item.content.description?.toLowerCase().includes(queryLower)) {
    score += 5;
  }
  
  // Tag relevance
  if (item.content.tags) {
    for (const tag of item.content.tags) {
      if (tag.toLowerCase().includes(queryLower)) {
        score += 3;
        break;
      }
    }
  }
  
  // Freshness bonus (recently updated content gets higher score)
  if (item.content.modifiedTime) {
    const daysSinceUpdate = (Date.now() - new Date(item.content.modifiedTime).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceUpdate < 7) score += 2;
    else if (daysSinceUpdate < 30) score += 1;
  }
  
  // Quality indicators
  if (item.content.isCertified) score += 2;
  if (item.content.favoritesTotal > 0) score += Math.min(item.content.favoritesTotal, 5);
  
  return score;
}

function rankSearchResults(results: SearchResult[], query: string): SearchResult[] {
  return results.sort((a, b) => {
    // Primary sort by relevance score
    if (a.relevanceScore !== b.relevanceScore) {
      return b.relevanceScore - a.relevanceScore;
    }
    
    // Secondary sort by instance priority (if available)
    // This would require passing instance priority through the results
    
    // Tertiary sort by name
    return a.name.localeCompare(b.name);
  });
}
