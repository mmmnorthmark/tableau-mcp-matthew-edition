import { getSearchContentTool } from './contentExploration/searchContent.js';
import { getGetDatasourceMetadataTool } from './getDatasourceMetadata/getDatasourceMetadata.js';
import { getListDatasourcesTool } from './listDatasources/listDatasources.js';
import { getGeneratePulseInsightBriefTool } from './pulse/generateInsightBrief/generatePulseInsightBriefTool.js';
import { getGeneratePulseMetricValueInsightBundleTool } from './pulse/generateMetricValueInsightBundle/generatePulseMetricValueInsightBundleTool.js';
import { getGeneratePulseDiscoverBriefTool } from './pulse/generateDiscoverBrief/index.js';
import { getFollowedPulseMetricsTool } from './pulse/getFollowedMetrics/index.js';
import { getListAllPulseMetricDefinitionsTool } from './pulse/listAllMetricDefinitions/listAllPulseMetricDefinitions.js';
import { getListAllPulseMetricDefinitionsWithMetricsTool } from './pulse/listAllMetricDefinitions/listAllPulseMetricDefinitionsWithMetrics.js';
import { getListPulseMetricDefinitionsFromDefinitionIdsTool } from './pulse/listMetricDefinitionsFromDefinitionIds/listPulseMetricDefinitionsFromDefinitionIds.js';
import { getListPulseMetricsFromMetricDefinitionIdTool } from './pulse/listMetricsFromMetricDefinitionId/listPulseMetricsFromMetricDefinitionId.js';
import { getListPulseMetricsFromMetricIdsTool } from './pulse/listMetricsFromMetricIds/listPulseMetricsFromMetricIds.js';
import { getListPulseMetricSubscriptionsTool } from './pulse/listMetricSubscriptions/listPulseMetricSubscriptions.js';
import { getRenderPulseMetricTool } from './pulse/renderPulseMetric/renderPulseMetric.js';
import { getRenderPulseSvgTool } from './pulse/renderPulseSvg/renderPulseSvg.js';
import { getQueryDatasourceTool } from './queryDatasource/queryDatasource.js';
import { getGetViewDataTool } from './views/getViewData.js';
import { getGetViewImageTool } from './views/getViewImage.js';
import { getListViewsTool } from './views/listViews.js';
import { getGetWorkbookTool } from './workbooks/getWorkbook.js';
import { getListWorkbooksTool } from './workbooks/listWorkbooks.js';

export const toolFactories = [
  getGetDatasourceMetadataTool,
  getListDatasourcesTool,
  getQueryDatasourceTool,
  getListAllPulseMetricDefinitionsTool,
  getListAllPulseMetricDefinitionsWithMetricsTool,
  getListPulseMetricDefinitionsFromDefinitionIdsTool,
  getListPulseMetricsFromMetricDefinitionIdTool,
  getListPulseMetricsFromMetricIdsTool,
  getListPulseMetricSubscriptionsTool,
  getGeneratePulseMetricValueInsightBundleTool,
  getGeneratePulseInsightBriefTool,
  getGeneratePulseDiscoverBriefTool,
  getFollowedPulseMetricsTool,
  getRenderPulseMetricTool,
  getRenderPulseSvgTool,
  getGetWorkbookTool,
  getGetViewDataTool,
  getGetViewImageTool,
  getListWorkbooksTool,
  getListViewsTool,
  getSearchContentTool,
];
