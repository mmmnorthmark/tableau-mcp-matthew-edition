import { describe, expect, it } from 'vitest';

import {
  getAvailableInsightTypes,
  getCurrentMetricValue,
  getDiscoverBriefFootnote,
  getFollowupQuestions,
  getInsightsByType,
  getInsightsWithVisualizations,
  getMetricDifference,
  getPeriodOverPeriodComparison,
  getTimeSeriesInsights,
  getTopContributors,
  hasInsightType,
} from './pulseInsightHelpers.js';

describe('pulseInsightHelpers', () => {
  // Mock bundle with various insight types
  const mockBundle = {
    bundle_response: {
      result: {
        insight_groups: [
          {
            type: 'ban',
            insights: [
              {
                insight_type: 'popc',
                result: {
                  type: 'popc',
                  markup: 'Current value is $1,234',
                  viz: { data: 'some-viz-data' },
                  facts: {
                    target_period_value: {
                      formatted: '$1,234',
                      raw: 1234,
                    },
                    difference: {
                      absolute: {
                        formatted: '+$100',
                        raw: 100,
                      },
                      relative: {
                        formatted: '+8.8%',
                      },
                    },
                  },
                },
              },
            ],
          },
          {
            type: 'timeseries',
            insights: [
              {
                insight_type: 'currenttrend',
                result: {
                  type: 'currenttrend',
                  markup: 'Trend over time',
                  viz: { data: 'trend-viz-data' },
                },
              },
            ],
          },
          {
            type: 'breakdown',
            insights: [
              {
                insight_type: 'topcontributor',
                result: {
                  type: 'topcontributor',
                  markup: 'Top contributors',
                  viz: { data: 'breakdown-viz-data' },
                },
              },
              {
                insight_type: 'top-detractors',
                result: {
                  type: 'top-detractors',
                  markup: 'Top detractors',
                  viz: { data: 'detractors-viz-data' },
                },
              },
            ],
          },
        ],
      },
    },
  };

  describe('getCurrentMetricValue', () => {
    it('extracts the current metric value from a bundle', () => {
      const value = getCurrentMetricValue(mockBundle);
      expect(value).toEqual({
        formatted: '$1,234',
        raw: 1234,
      });
    });

    it('returns undefined when no BAN group exists', () => {
      const emptyBundle = {
        bundle_response: { result: { insight_groups: [] } },
      };
      const value = getCurrentMetricValue(emptyBundle);
      expect(value).toBeUndefined();
    });

    it('returns undefined when bundle_response is missing', () => {
      const value = getCurrentMetricValue({});
      expect(value).toBeUndefined();
    });
  });

  describe('getMetricDifference', () => {
    it('extracts the period-over-period difference', () => {
      const difference = getMetricDifference(mockBundle);
      expect(difference).toEqual({
        absolute: {
          formatted: '+$100',
          raw: 100,
        },
        relative: {
          formatted: '+8.8%',
        },
      });
    });

    it('returns undefined when no POPC insight exists', () => {
      const emptyBundle = {
        bundle_response: { result: { insight_groups: [] } },
      };
      const difference = getMetricDifference(emptyBundle);
      expect(difference).toBeUndefined();
    });
  });

  describe('getPeriodOverPeriodComparison', () => {
    it('extracts the POPC insight', () => {
      const popc = getPeriodOverPeriodComparison(mockBundle);
      expect(popc).toBeDefined();
      expect(popc.insight_type).toBe('popc');
      expect(popc.result.type).toBe('popc');
    });

    it('returns undefined when no POPC insight exists', () => {
      const emptyBundle = {
        bundle_response: { result: { insight_groups: [] } },
      };
      const popc = getPeriodOverPeriodComparison(emptyBundle);
      expect(popc).toBeUndefined();
    });
  });

  describe('getInsightsByType', () => {
    it('filters insights by type', () => {
      const popcInsights = getInsightsByType(mockBundle, 'popc');
      expect(popcInsights).toHaveLength(1);
      expect(popcInsights[0].insight_type).toBe('popc');

      const trendInsights = getInsightsByType(mockBundle, 'currenttrend');
      expect(trendInsights).toHaveLength(1);
      expect(trendInsights[0].insight_type).toBe('currenttrend');
    });

    it('returns empty array when type not found', () => {
      const insights = getInsightsByType(mockBundle, 'nonexistent');
      expect(insights).toHaveLength(0);
    });

    it('returns empty array when bundle_response is missing', () => {
      const insights = getInsightsByType({}, 'popc');
      expect(insights).toHaveLength(0);
    });
  });

  describe('getInsightsWithVisualizations', () => {
    it('extracts all insights that have viz data', () => {
      const insights = getInsightsWithVisualizations(mockBundle);
      expect(insights).toHaveLength(4);
      insights.forEach((insight) => {
        expect(insight.viz).toBeDefined();
        expect(insight.type).toBeDefined();
        expect(insight.groupType).toBeDefined();
      });
    });

    it('filters out insights without viz data', () => {
      const bundleWithoutViz = {
        bundle_response: {
          result: {
            insight_groups: [
              {
                type: 'test',
                insights: [
                  {
                    insight_type: 'test',
                    result: {
                      // No viz field
                      markup: 'Test',
                    },
                  },
                ],
              },
            ],
          },
        },
      };
      const insights = getInsightsWithVisualizations(bundleWithoutViz);
      expect(insights).toHaveLength(0);
    });

    it('returns empty array when bundle_response is missing', () => {
      const insights = getInsightsWithVisualizations({});
      expect(insights).toHaveLength(0);
    });
  });

  describe('getTopContributors', () => {
    it('extracts all contributor-related insights', () => {
      const contributors = getTopContributors(mockBundle);
      expect(contributors).toHaveLength(2);
      expect(contributors[0].insight_type).toBe('topcontributor');
      expect(contributors[1].insight_type).toBe('top-detractors');
    });

    it('returns empty array when no contributors exist', () => {
      const emptyBundle = {
        bundle_response: { result: { insight_groups: [] } },
      };
      const contributors = getTopContributors(emptyBundle);
      expect(contributors).toHaveLength(0);
    });
  });

  describe('getTimeSeriesInsights', () => {
    it('extracts currenttrend insights', () => {
      const timeseries = getTimeSeriesInsights(mockBundle);
      expect(timeseries).toHaveLength(1);
      expect(timeseries[0].insight_type).toBe('currenttrend');
    });

    it('returns empty array when no time series exist', () => {
      const emptyBundle = {
        bundle_response: { result: { insight_groups: [] } },
      };
      const timeseries = getTimeSeriesInsights(emptyBundle);
      expect(timeseries).toHaveLength(0);
    });
  });

  describe('getAvailableInsightTypes', () => {
    it('returns a list of all available insight types', () => {
      const types = getAvailableInsightTypes(mockBundle);
      expect(types).toContain('popc');
      expect(types).toContain('currenttrend');
      expect(types).toContain('topcontributor');
      expect(types).toContain('top-detractors');
      expect(types).toHaveLength(4);
    });

    it('returns empty array when no insights exist', () => {
      const emptyBundle = {
        bundle_response: { result: { insight_groups: [] } },
      };
      const types = getAvailableInsightTypes(emptyBundle);
      expect(types).toHaveLength(0);
    });

    it('returns empty array when bundle_response is missing', () => {
      const types = getAvailableInsightTypes({});
      expect(types).toHaveLength(0);
    });
  });

  describe('hasInsightType', () => {
    it('returns true when insight type exists', () => {
      expect(hasInsightType(mockBundle, 'popc')).toBe(true);
      expect(hasInsightType(mockBundle, 'currenttrend')).toBe(true);
    });

    it('returns false when insight type does not exist', () => {
      expect(hasInsightType(mockBundle, 'nonexistent')).toBe(false);
    });
  });

  describe('getDiscoverBriefFootnote', () => {
    const mockBrief = {
      markup:
        'This is a test with [[1]](def-id-1|metric-id-1) and [[2]](def-id-2|metric-id-2) footnotes.',
      follow_up_questions: [],
      source_insights: [
        { type: 'popc', markup: 'Insight 1', viz: {} },
        { type: 'currenttrend', markup: 'Insight 2', viz: {} },
      ],
      group_context: [],
    };

    it('extracts footnote by number', () => {
      const footnote1 = getDiscoverBriefFootnote(mockBrief, 1);
      expect(footnote1).toBeDefined();
      expect(footnote1?.metricId).toBe('metric-id-1');
      expect(footnote1?.insight.type).toBe('popc');

      const footnote2 = getDiscoverBriefFootnote(mockBrief, 2);
      expect(footnote2).toBeDefined();
      expect(footnote2?.metricId).toBe('metric-id-2');
      expect(footnote2?.insight.type).toBe('currenttrend');
    });

    it('returns undefined for invalid footnote number', () => {
      const footnote = getDiscoverBriefFootnote(mockBrief, 99);
      expect(footnote).toBeUndefined();
    });

    it('returns undefined for footnote number less than 1', () => {
      const footnote = getDiscoverBriefFootnote(mockBrief, 0);
      expect(footnote).toBeUndefined();
    });
  });

  describe('getFollowupQuestions', () => {
    const mockBrief = {
      markup: 'Some answer',
      follow_up_questions: [{ content: 'Question 1?' }, { content: 'Question 2?' }],
      source_insights: [],
      group_context: [],
    };

    it('extracts followup questions', () => {
      const questions = getFollowupQuestions(mockBrief);
      expect(questions).toHaveLength(2);
      expect(questions[0]).toBe('Question 1?');
      expect(questions[1]).toBe('Question 2?');
    });

    it('returns empty array when no questions exist', () => {
      const brief = {
        markup: 'Some answer',
        follow_up_questions: [],
        source_insights: [],
        group_context: [],
      };
      const questions = getFollowupQuestions(brief);
      expect(questions).toHaveLength(0);
    });
  });
});
