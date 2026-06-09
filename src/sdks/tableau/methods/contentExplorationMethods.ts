import { Zodios } from '@zodios/core';

import { contentExplorationApis, SearchResults, SearchResultItem } from '../apis/contentExplorationApi.js';
import { Credentials } from '../types/credentials.js';
import AuthenticatedMethods from './authenticatedMethods.js';

/**
 * Content Exploration methods of the Tableau Server REST API
 *
 * @export
 * @class ContentExplorationMethods
 * @link https://help.tableau.com/current/api/rest_api/en-us/REST/TAG/index.html#operation/ContentExplorationService_getSearch
 */
export default class ContentExplorationMethods extends AuthenticatedMethods<typeof contentExplorationApis> {
  constructor(baseUrl: string, creds: Credentials) {
    super(new Zodios(baseUrl, contentExplorationApis), creds);
  }

  /**
   * Gets content search results from the Content Exploration Service.
   *
   * Required scopes: `tableau:content:read`
   *
   * @param term - Search term to look for in content names, descriptions, and tags
   * @param contentType - Optional filter by content type (workbook, view, datasource, etc.)
   * @param projectId - Optional filter by project ID
   * @param tags - Optional filter by tags (comma-separated)
   * @param pageSize - Number of items to return per page (1-1000, default 100)
   * @param pageNumber - Page number to return (1-based, default 1)
   * @link https://help.tableau.com/current/api/rest_api/en-us/REST/TAG/index.html#operation/ContentExplorationService_getSearch
   */
  getSearch = async ({
    term,
    contentType,
    projectId,
    tags,
    pageSize,
    pageNumber,
  }: {
    term: string;
    contentType?: string;
    projectId?: string;
    tags?: string;
    pageSize?: number;
    pageNumber?: number;
  }): Promise<SearchResults> => {
    // Build query parameters, omitting undefined values
    const queryParams = {
      term,
      ...(contentType && { contentType }),
      ...(projectId && { projectId }),
      ...(tags && { tags }),
      ...(pageSize && { pageSize }),
      ...(pageNumber && { pageNumber }),
    };
    
    const response = await this._apiClient.getSearch({
      queries: queryParams,
      ...this.authHeader,
    });
    
    return response;
  };
}

// Export types
export type { SearchResultItem, SearchResults };
