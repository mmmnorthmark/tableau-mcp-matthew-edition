import { makeApi, makeEndpoint, ZodiosEndpointDefinitions } from '@zodios/core';
import { z } from 'zod';

// Search result item schema based on actual Tableau Content Exploration API response
const searchResultItemSchema = z.object({
  uri: z.string(),
  score: z.number(),
  content: z.object({
    id: z.number(),
    title: z.string(),
    type: z.string(), // workbook, view, datasource, etc.
    description: z.string().optional(),
    containerName: z.string().optional(), // project name
    ownerName: z.string().optional(),
    ownerEmail: z.string().optional(),
    tags: z.array(z.string()).optional(),
    createdTime: z.string().optional(),
    modifiedTime: z.string().optional(),
    luid: z.string().optional(),
    // Additional fields that might be returned
    defaultViewUrl: z.string().optional(),
    repositoryUrl: z.string().optional(),
    webpageUrl: z.string().optional(),
    contentUrl: z.string().optional(),
    workbookId: z.number().optional(),
    projectId: z.number().optional(),
    siteId: z.number().optional(),
    // For views
    workbookDescription: z.string().optional(),
    path: z.string().optional(),
    sheetType: z.string().optional(),
    // For workbooks
    datasourceIds: z.array(z.number()).optional(),
    sheetCount: z.number().optional(),
    // For datasources
    connectionType: z.string().optional(),
    isCertified: z.boolean().optional(),
    isPublished: z.boolean().optional(),
  }),
});

// Search results response schema based on actual API response
const searchResultsSchema = z.object({
  hits: z.object({
    items: z.array(searchResultItemSchema),
    total: z.number(),
    pageIndex: z.number(),
    startIndex: z.number(),
    limit: z.number(),
    next: z.string().optional(),
  }),
  personalized: z.boolean(),
  drafts: z.array(z.object({
    luid: z.string(),
    parentLuid: z.string(),
    contentType: z.string(),
    isPublished: z.boolean(),
  })).optional(),
});

// Get search results endpoint
const getSearchEndpoint = makeEndpoint({
  method: 'get',
  path: '/search',
  alias: 'getSearch',
  description: 'Gets content search results from the Content Exploration Service.',
  parameters: [
    {
      name: 'term',
      type: 'Query',
      schema: z.string(),
      description: 'Search term to look for in content names, descriptions, and tags',
    },
    {
      name: 'contentType',
      type: 'Query',
      schema: z.string().optional(),
      description: 'Filter by content type (workbook, view, datasource, etc.)',
    },
    {
      name: 'projectId',
      type: 'Query',
      schema: z.string().optional(),
      description: 'Filter by project ID',
    },
    {
      name: 'tags',
      type: 'Query',
      schema: z.string().optional(),
      description: 'Filter by tags (comma-separated)',
    },
    {
      name: 'pageSize',
      type: 'Query',
      schema: z.number().optional(),
      description: 'Number of items to return per page (1-1000, default 100)',
    },
    {
      name: 'pageNumber',
      type: 'Query',
      schema: z.number().optional(),
      description: 'Page number to return (1-based, default 1)',
    },
  ],
  response: searchResultsSchema,
});

const contentExplorationApi = makeApi([getSearchEndpoint]);
export const contentExplorationApis = [...contentExplorationApi] as const satisfies ZodiosEndpointDefinitions;

// Export types
export type SearchResultItem = z.infer<typeof searchResultItemSchema>;
export type SearchResults = z.infer<typeof searchResultsSchema>;
