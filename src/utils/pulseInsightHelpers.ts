/**
 * Helper functions for extracting and manipulating Pulse insight data.
 * These pure functions provide convenient access to specific insight types and values.
 */

import { PulseDiscoverBrief, PulseInsightResult } from '../sdks/tableau/types/pulse.js';

/**
 * Extract the current metric value (BAN) from a springboard/detail bundle.
 * Returns the target period value with formatted string.
 *
 * @param bundle - The insight bundle response
 * @returns The current metric value object with formatted and raw values, or undefined if not found
 */
export function getCurrentMetricValue(bundle: any): {
  formatted: string;
  raw?: number;
} | undefined {
  const insightGroups = bundle.bundle_response?.result?.insight_groups;
  if (!insightGroups) return undefined;

  // Find the BAN group (contains period-over-period comparison)
  const banGroup = insightGroups.find((g: any) => g.type === 'ban');
  if (!banGroup) return undefined;

  // Find the POPC (Period Over Period Comparison) insight
  const popcInsight = banGroup.insights?.find((i: any) => i.result?.type === 'popc');
  if (!popcInsight) return undefined;

  return popcInsight.result?.facts?.target_period_value;
}

/**
 * Extract insights of a specific type from a bundle.
 * Useful for filtering to specific visualization types like 'currenttrend', 'topcontributor', etc.
 *
 * @param bundle - The insight bundle response
 * @param insightType - The type of insight to filter for (e.g., 'currenttrend', 'topcontributor')
 * @returns Array of insights matching the specified type
 */
export function getInsightsByType(bundle: any, insightType: string): any[] {
  const insightGroups = bundle.bundle_response?.result?.insight_groups;
  if (!insightGroups) return [];

  const insights: any[] = [];
  insightGroups.forEach((group: any) => {
    if (group.insights) {
      group.insights.forEach((insight: any) => {
        if (insight.insight_type === insightType) {
          insights.push(insight);
        }
      });
    }
  });

  return insights;
}

/**
 * Parse footnotes from a Pulse Discover brief markup.
 * Footnotes are in the format [[N]](definitionId|metricId) where N is the footnote number.
 *
 * @param brief - The Pulse Discover brief
 * @param footnoteNumber - The footnote number to extract (1-indexed)
 * @returns Object containing the metric ID and corresponding insight, or undefined if not found
 */
export function getDiscoverBriefFootnote(
  brief: PulseDiscoverBrief,
  footnoteNumber: number,
): { metricId: string; insight: PulseInsightResult } | undefined {
  // Regex to match [[N]](definitionId|metricId)
  const regex = /\[\[(\d+)\]\]\(([^|]+)\|([^)]+)\)/g;
  const matches = [...brief.markup.matchAll(regex)];

  if (footnoteNumber < 1 || footnoteNumber > matches.length) {
    return undefined;
  }

  const match = matches[footnoteNumber - 1];
  const metricId = match[3]; // Third capture group is the metric ID
  const insight = brief.source_insights[footnoteNumber - 1];

  if (!metricId || !insight) {
    return undefined;
  }

  return { metricId, insight };
}

/**
 * Extract all insights that have visualizations from a bundle.
 * Filters out insights without viz data.
 *
 * @param bundle - The insight bundle response
 * @returns Array of insights with visualizations
 */
export function getInsightsWithVisualizations(bundle: any): Array<{
  type: string;
  groupType: string;
  viz: any;
  result: any;
}> {
  const insightGroups = bundle.bundle_response?.result?.insight_groups;
  if (!insightGroups) return [];

  const insights: Array<{ type: string; groupType: string; viz: any; result: any }> = [];

  insightGroups.forEach((group: any) => {
    if (group.insights) {
      group.insights.forEach((insight: any) => {
        if (
          insight.result?.viz &&
          typeof insight.result.viz === 'object' &&
          Object.keys(insight.result.viz).length > 0
        ) {
          insights.push({
            type: insight.insight_type,
            groupType: group.type,
            viz: insight.result.viz,
            result: insight.result,
          });
        }
      });
    }
  });

  return insights;
}

/**
 * Extract top contributors/detractors from a bundle.
 * Useful for understanding what dimensions are driving metric changes.
 *
 * @param bundle - The insight bundle response
 * @returns Array of contributor insights
 */
export function getTopContributors(bundle: any): any[] {
  const contributorTypes = ['topcontributor', 'top-contributors', 'top-detractors'];
  const insights: any[] = [];

  contributorTypes.forEach((type) => {
    insights.push(...getInsightsByType(bundle, type));
  });

  return insights;
}

/**
 * Extract time series/trend insights from a bundle.
 *
 * @param bundle - The insight bundle response
 * @returns Array of time series insights
 */
export function getTimeSeriesInsights(bundle: any): any[] {
  return getInsightsByType(bundle, 'currenttrend');
}

/**
 * Extract the period-over-period comparison insight (BAN).
 *
 * @param bundle - The insight bundle response
 * @returns The POPC insight object, or undefined if not found
 */
export function getPeriodOverPeriodComparison(bundle: any): any | undefined {
  const popcInsights = getInsightsByType(bundle, 'popc');
  return popcInsights.length > 0 ? popcInsights[0] : undefined;
}

/**
 * Extract the difference (absolute and relative) from a POPC insight.
 *
 * @param bundle - The insight bundle response
 * @returns Object containing absolute and relative differences, or undefined if not found
 */
export function getMetricDifference(bundle: any): {
  absolute: { formatted: string; raw?: number };
  relative: { formatted: string };
} | undefined {
  const popcInsight = getPeriodOverPeriodComparison(bundle);
  if (!popcInsight) return undefined;

  return popcInsight.result?.facts?.difference;
}

/**
 * Get all followup questions from a Discover brief.
 *
 * @param brief - The Pulse Discover brief
 * @returns Array of followup question strings
 */
export function getFollowupQuestions(brief: PulseDiscoverBrief): string[] {
  return brief.follow_up_questions.map((q) => q.content);
}

/**
 * Check if a bundle has insights of a specific type.
 *
 * @param bundle - The insight bundle response
 * @param insightType - The type of insight to check for
 * @returns True if the bundle contains insights of the specified type
 */
export function hasInsightType(bundle: any, insightType: string): boolean {
  return getInsightsByType(bundle, insightType).length > 0;
}

/**
 * Get all available insight types in a bundle.
 *
 * @param bundle - The insight bundle response
 * @returns Array of unique insight type strings
 */
export function getAvailableInsightTypes(bundle: any): string[] {
  const insightGroups = bundle.bundle_response?.result?.insight_groups;
  if (!insightGroups) return [];

  const types = new Set<string>();
  insightGroups.forEach((group: any) => {
    if (group.insights) {
      group.insights.forEach((insight: any) => {
        if (insight.insight_type) {
          types.add(insight.insight_type);
        }
      });
    }
  });

  return Array.from(types);
}
