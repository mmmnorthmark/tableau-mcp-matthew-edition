import { Zodios } from '@zodios/core';
import { Err, Ok, Result } from 'ts-results-es';
import z from 'zod';

import { AxiosRequestConfig, isAxiosError } from '../../../utils/axios.js';
import { pulseApis } from '../apis/pulseApi.js';
import { Credentials } from '../types/credentials.js';
import { PulsePagination } from '../types/pagination.js';
import {
  pulseBundleRequestSchema,
  pulseBundleResponseSchema,
  PulseBundleResponse,
  PulseDiscoverBrief,
  PulseFollowedMetricsGroupsResponse,
  pulseInsightBriefRequestSchema,
  PulseInsightBriefResponse,
  PulseInsightBundleType,
  PulseMetric,
  PulseMetricDefinition,
  PulseMetricDefinitionView,
  PulseMetricGroup,
  PulseMetricSubscription,
} from '../types/pulse.js';
import AuthenticatedMethods from './authenticatedMethods.js';

/**
 * Pulse methods of the Tableau Server REST API
 *
 * @export
 * @class PulseMethods
 * @link https://help.tableau.com/current/api/rest_api/en-us/REST/rest_api_ref_pulse.htm
 */
export default class PulseMethods extends AuthenticatedMethods<typeof pulseApis> {
  constructor(baseUrl: string, creds: Credentials, axiosConfig: AxiosRequestConfig) {
    super(new Zodios(baseUrl, pulseApis, { axiosConfig }), creds);
  }

  /**
   * Returns a list of all published Pulse Metric Definitions.
   *
   * Required scopes: `tableau:insight_definitions_metrics:read`
   *
   * @param view - The view of the definition to return. If not specified, the default view is returned.
   * @param pageToken - Token for retrieving the next page of results. Omit for the first page.
   * @param pageSize - Specifies the number of results in a paged response.
   * @link https://help.tableau.com/current/api/rest_api/en-us/REST/rest_api_ref_pulse.htm#MetricQueryService_ListDefinitions
   */
  listAllPulseMetricDefinitions = async (
    view?: PulseMetricDefinitionView,
    pageToken?: string,
    pageSize?: number,
  ): Promise<
    PulseResult<{
      pagination: PulsePagination;
      definitions: PulseMetricDefinition[];
    }>
  > => {
    return await guardAgainstPulseDisabled(async () => {
      const response = await this._apiClient.listAllPulseMetricDefinitions({
        queries: { view, page_token: pageToken, page_size: pageSize },
        ...this.authHeader,
      });
      return {
        pagination: {
          next_page_token: response.next_page_token,
          offset: response.offset,
          total_available: response.total_available,
        },
        definitions: response.definitions ?? [],
      };
    });
  };

  /**
   * Returns a list of published Pulse Metric Definitions from a list of metric definition IDs.
   *
   * Required scopes: `tableau:insight_definitions_metrics:read`
   *
   * @param metricDefinitionIds - The list of metric definition IDs to list metrics for.
   * @link https://help.tableau.com/current/api/rest_api/en-us/REST/rest_api_ref_pulse.htm#MetricQueryService_BatchGetDefinitionsByPost
   */
  listPulseMetricDefinitionsFromMetricDefinitionIds = async (
    metricDefinitionIds: string[],
    view?: PulseMetricDefinitionView,
  ): Promise<PulseResult<PulseMetricDefinition[]>> => {
    return await guardAgainstPulseDisabled(async () => {
      const response = await this._apiClient.listPulseMetricDefinitionsFromMetricDefinitionIds(
        { definition_ids: metricDefinitionIds },
        { queries: { view }, ...this.authHeader },
      );
      return response.definitions ?? [];
    });
  };

  /**
   * Returns a list of published Pulse Metrics.
   *
   * Required scopes: `tableau:insight_definitions_metrics:read`
   *
   * @param pulseMetricDefinitionID - The ID of the Pulse Metric Definition to list metrics for.
   * @link https://help.tableau.com/current/api/rest_api/en-us/REST/rest_api_ref_pulse.htm#MetricQueryService_ListMetrics
   */
  listPulseMetricsFromMetricDefinitionId = async (
    pulseMetricDefinitionID: string,
  ): Promise<PulseResult<PulseMetric[]>> => {
    return await guardAgainstPulseDisabled(async () => {
      const response = await this._apiClient.listPulseMetricsFromMetricDefinitionId({
        params: { pulseMetricDefinitionID },
        ...this.authHeader,
      });
      return response.metrics ?? [];
    });
  };

  /**
   * Returns a list of Pulse Metrics for a list of metric IDs.
   *
   * Required scopes: `tableau:insight_metrics:read`
   *
   * @param metricIds - The list of metric IDs to list metrics for.
   * @link https://help.tableau.com/current/api/rest_api/en-us/REST/rest_api_ref_pulse.htm#MetricQueryService_BatchGetMetrics
   */
  listPulseMetricsFromMetricIds = async (
    metricIds: string[],
  ): Promise<PulseResult<PulseMetric[]>> => {
    return await guardAgainstPulseDisabled(async () => {
      const response = await this._apiClient.listPulseMetricsFromMetricIds(
        { metric_ids: metricIds },
        { ...this.authHeader },
      );
      return response.metrics ?? [];
    });
  };

  /**
   * Returns a list of Pulse Metric Subscriptions for the current user.
   *
   * Required scopes: `tableau:metric_subscriptions:read`
   *
   * @link https://help.tableau.com/current/api/rest_api/en-us/REST/rest_api_ref_pulse.htm#PulseSubscriptionService_ListSubscriptions
   */
  listPulseMetricSubscriptionsForCurrentUser = async (): Promise<
    PulseResult<PulseMetricSubscription[]>
  > => {
    return await guardAgainstPulseDisabled(async () => {
      const response = await this._apiClient.listPulseMetricSubscriptionsForCurrentUser({
        queries: { user_id: this.userId },
        ...this.authHeader,
      });
      return response.subscriptions ?? [];
    });
  };

  /**
   * Generates an AI-powered insight brief for Pulse metrics based on natural language questions.
   *
   * Required scopes: `tableau:insight_brief:create`
   *
   * @param briefRequest - The request to generate an insight brief for.
   * @link https://help.tableau.com/current/api/rest_api/en-us/REST/rest_api_ref_pulse.htm#EmbeddingsService_GenerateInsightBrief
   */
  generatePulseInsightBrief = async (
    briefRequest: z.infer<typeof pulseInsightBriefRequestSchema>,
  ): Promise<PulseResult<PulseInsightBriefResponse>> => {
    return await guardAgainstPulseDisabled(async () => {
      const response = await this._apiClient.generatePulseInsightBrief(
        briefRequest,
        this.authHeader,
      );
      return response;
    });
  };

  /**
   * Returns the generated bundle of the current aggregate value for the Pulse metric.
   *
   * Required scopes: `tableau:insights:read`
   *
   * @param bundleRequest - The request to generate a bundle for.
   * @link https://help.tableau.com/current/api/rest_api/en-us/REST/rest_api_ref_pulse.htm#PulseInsightsService_GenerateInsightBundleBasic
   */
  generatePulseMetricValueInsightBundle = async (
    bundleRequest: z.infer<typeof pulseBundleRequestSchema>,
    bundleType: PulseInsightBundleType,
  ): Promise<PulseResult<PulseBundleResponse>> => {
    return await guardAgainstPulseDisabled(async () => {
      try {
        const response = await this._apiClient.generatePulseMetricValueInsightBundle(
          bundleRequest,
          { params: { bundle_type: bundleType }, ...this.authHeader },
        );
        return response ?? {};
      } catch (error) {
        // Re-throw with more context about the request
        if (isAxiosError(error) && error.response?.status === 400) {
          const errorData = error.response.data;
          throw new Error(
            `Pulse API 400 error: ${JSON.stringify(errorData)}. Request metadata: ${JSON.stringify(bundleRequest.bundle_request.input.metadata)}`,
          );
        }
        throw error;
      }
    });
  };

  /**
   * Returns groups of Pulse Metrics that the current user is following.
   *
   * Required scopes: `tableau:insight_metrics:read`
   *
   * @link https://help.tableau.com/current/api/rest_api/en-us/REST/rest_api_ref_pulse.htm#MetricQueryService_FollowedMetricsGroups
   */
  getFollowedPulseMetricsGroups = async (): Promise<
    PulseResult<PulseFollowedMetricsGroupsResponse>
  > => {
    return await guardAgainstPulseDisabled(async () => {
      const response = await this._apiClient.getFollowedPulseMetricsGroups({
        ...this.authHeader,
      });
      return response;
    });
  };

  /**
   * Returns a flat list of all Pulse Metrics that the current user is following.
   * This is a convenience wrapper around getFollowedPulseMetricsGroups that flattens the groups.
   *
   * Required scopes: `tableau:insight_metrics:read`
   */
  getFollowedPulseMetrics = async (): Promise<PulseResult<PulseMetric[]>> => {
    const groupsResult = await this.getFollowedPulseMetricsGroups();
    if (groupsResult.isErr()) {
      return groupsResult as PulseResult<PulseMetric[]>;
    }

    const metrics: PulseMetric[] = [];
    groupsResult.value.metric_groups.forEach((group) => {
      group.metrics.forEach((metric) => {
        metrics.push(metric);
      });
    });

    return new Ok(metrics);
  };

  /**
   * Returns a summary digest of Pulse Metrics insights for the current user.
   *
   * Required scopes: `tableau:insights:read`
   */
  getPulseSummary = async (): Promise<PulseResult<PulseMetricGroup[]>> => {
    return await guardAgainstPulseDisabled(async () => {
      const response = await this._apiClient.getPulseSummary({
        ...this.authHeader,
      });
      return response.metric_groups;
    });
  };

  /**
   * Generates an AI-powered Pulse Discover brief answering questions about metrics.
   *
   * Required scopes: `tableau:insights:read`, `tableau:insight_metrics:read`, `tableau:insight_definitions_metrics:read`
   *
   * @param question - The question to ask about the metrics
   * @param metricIds - Array of metric IDs to use as context for the question
   * @param actionType - The type of action (default: 'ACTION_TYPE_ANSWER')
   * @param role - The role of the user (default: 'ROLE_USER')
   */
  generatePulseDiscoverBrief = async (
    question: string,
    metricIds: string[],
    actionType: string = 'ACTION_TYPE_ANSWER',
    role: string = 'ROLE_USER',
  ): Promise<PulseResult<PulseDiscoverBrief>> => {
    return await guardAgainstPulseDisabled(async () => {
      // Fetch metrics and definitions to build the context
      const metricsResult = await this.listPulseMetricsFromMetricIds(metricIds);
      if (metricsResult.isErr()) {
        throw new Error(`Failed to fetch metrics: ${metricsResult.error}`);
      }

      const metrics = metricsResult.value;
      const definitionIds = Array.from(new Set(metrics.map((m) => m.definition_id)));

      const definitionsResult =
        await this.listPulseMetricDefinitionsFromMetricDefinitionIds(definitionIds);
      if (definitionsResult.isErr()) {
        throw new Error(`Failed to fetch definitions: ${definitionsResult.error}`);
      }

      const definitions = definitionsResult.value;

      // Build the metric group context
      const metricGroupContext = metrics.map((metric) => {
        const definition = definitions.find((d) => d.metadata.id === metric.definition_id);
        if (!definition) {
          throw new Error(`Definition not found for metric ${metric.id}`);
        }

        return {
          metadata: {
            name: definition.metadata.name,
            metric_id: metric.id,
            definition_id: definition.metadata.id,
          },
          metric: {
            definition: definition.specification,
            metric_specification: metric.specification,
            extension_options: definition.extension_options,
            representation_options: definition.representation_options,
            insights_options: definition.insights_options,
            goals: metric.goals || {},
            candidates: [],
          },
        };
      });

      // Call the API using the upstream generatePulseInsightBrief endpoint
      const response = await this._apiClient.generatePulseInsightBrief(
        {
          language: 'LANGUAGE_EN_US',
          locale: 'LOCALE_EN_US',
          time_zone: 'UTC',
          messages: [
            {
              content: question,
              action_type: actionType,
              role: role,
              metric_group_context_resolved: true,
              metric_group_context: metricGroupContext,
            },
          ],
        },
        { ...this.authHeader },
      );

      if (!response.markup) {
        throw new Error(`Failed to generate discover brief: No markup returned`);
      }

      // Map PulseInsightBriefResponse to PulseDiscoverBrief
      return {
        markup: response.markup,
        follow_up_questions: response.follow_up_questions,
      };
    });
  };

  /**
   * Convenience method to generate a springboard bundle by metric ID.
   * This fetches the metric and definition, then generates the bundle.
   *
   * Required scopes: `tableau:insights:read`, `tableau:insight_metrics:read`, `tableau:insight_definitions_metrics:read`
   *
   * @param metricId - The ID of the metric to generate a springboard bundle for
   */
  generateSpringboardBundleByMetricId = async (
    metricId: string,
  ): Promise<PulseResult<z.infer<typeof pulseBundleResponseSchema>>> => {
    return await guardAgainstPulseDisabled(async () => {
      // Fetch the metric
      const metricsResult = await this.listPulseMetricsFromMetricIds([metricId]);
      if (metricsResult.isErr() || metricsResult.value.length === 0) {
        throw new Error(`Metric not found: ${metricId}`);
      }

      const metric = metricsResult.value[0];

      // Fetch the definition
      const definitionsResult = await this.listPulseMetricDefinitionsFromMetricDefinitionIds([
        metric.definition_id,
      ]);
      if (definitionsResult.isErr() || definitionsResult.value.length === 0) {
        throw new Error(`Definition not found: ${metric.definition_id}`);
      }

      const definition = definitionsResult.value[0];

      // Build the bundle request
      const bundleRequest = {
        bundle_request: {
          version: 1,
          options: {
            output_format: 'OUTPUT_FORMAT_HTML' as const,
            time_zone: 'UTC',
            language: 'LANGUAGE_EN_US' as const,
            locale: 'LOCALE_EN_US' as const,
          },
          input: {
            metadata: {
              name: definition.metadata.name,
              metric_id: metric.id,
              definition_id: definition.metadata.id,
            },
            metric: {
              definition: {
                datasource: definition.specification.datasource,
                basic_specification: definition.specification.basic_specification,
                is_running_total: definition.specification.is_running_total,
              },
              metric_specification: metric.specification,
              extension_options: definition.extension_options,
              representation_options: {
                ...definition.representation_options,
                sentiment_type:
                  definition.representation_options.sentiment_type || 'SENTIMENT_TYPE_UNSPECIFIED',
              },
              insights_options: definition.insights_options || {
                show_insights: true,
                settings: [],
              },
              goals: metric.goals || {},
            },
          },
        },
      };

      // Generate the bundle
      const bundleResult = await this.generatePulseMetricValueInsightBundle(
        bundleRequest,
        'springboard',
      );

      if (bundleResult.isErr()) {
        throw new Error(`Failed to generate springboard bundle: ${bundleResult.error}`);
      }

      return bundleResult.value;
    });
  };
}

export type PulseDisabledError = 'tableau-server' | 'pulse-disabled';
export type PulseResult<T> = Result<T, PulseDisabledError>;
async function guardAgainstPulseDisabled<T>(callback: () => Promise<T>): Promise<PulseResult<T>> {
  try {
    return new Ok(await callback());
  } catch (error) {
    if (isAxiosError(error)) {
      if (error.response?.status === 404) {
        return new Err('tableau-server');
      }

      if (
        error.response?.status === 400 &&
        error.response.headers.tableau_error_code === '0xd3408984' &&
        error.response.headers.validation_code === '400999'
      ) {
        // ntbue-service-chassis/-/blob/main/server/interceptors/site_settings.go
        return new Err('pulse-disabled');
      }
    }

    throw error;
  }
}
