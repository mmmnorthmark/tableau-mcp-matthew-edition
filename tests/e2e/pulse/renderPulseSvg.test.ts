import z from 'zod';

import { getPulseDefinition } from '../../constants.js';
import { getDefaultEnv, resetEnv, setEnv } from '../../testEnv.js';
import { callTool } from '../client.js';

// Schema for the render-pulse-svg tool output
const renderPulseSvgResultSchema = z.object({
  metricId: z.string(),
  metricName: z.string().optional(),
  visualizations: z.array(
    z.object({
      insightType: z.string(),
      svg: z.string(),
    }),
  ),
});

describe('render-pulse-svg', () => {
  beforeAll(setEnv);
  afterAll(resetEnv);

  it('should render a pulse metric to SVG with all insight types', async () => {
    const env = getDefaultEnv();
    const tableauMcpDefinition = getPulseDefinition(env.SERVER, env.SITE_NAME, 'Tableau MCP');

    const result = await callTool('render-pulse-svg', {
      env,
      schema: renderPulseSvgResultSchema,
      toolArgs: {
        metricId: tableauMcpDefinition.metrics[0].id,
        insightType: 'all',
        width: 800,
        height: 400,
      },
    });

    // Verify the result structure
    expect(result.metricId).toBe(tableauMcpDefinition.metrics[0].id);
    expect(result.metricName).toBeDefined();
    expect(result.visualizations).toBeDefined();
    expect(result.visualizations.length).toBeGreaterThan(0);

    // Verify each visualization has valid SVG
    for (const viz of result.visualizations) {
      expect(viz.insightType).toBeDefined();
      expect(viz.svg).toBeDefined();
      expect(viz.svg).toContain('<svg');
      expect(viz.svg).toContain('</svg>');
    }
  }, 30000); // 30 second timeout for API calls

  it('should render a pulse metric to SVG with specific insight type', async () => {
    const env = getDefaultEnv();
    const tableauMcpDefinition = getPulseDefinition(env.SERVER, env.SITE_NAME, 'Tableau MCP');

    const result = await callTool('render-pulse-svg', {
      env,
      schema: renderPulseSvgResultSchema,
      toolArgs: {
        metricId: tableauMcpDefinition.metrics[0].id,
        insightType: 'currenttrend',
        width: 1200,
        height: 600,
      },
    });

    // Verify the result structure
    expect(result.metricId).toBe(tableauMcpDefinition.metrics[0].id);
    expect(result.visualizations).toBeDefined();

    // Verify we got currenttrend visualizations
    for (const viz of result.visualizations) {
      expect(viz.insightType).toBe('currenttrend');
      expect(viz.svg).toContain('<svg');
      expect(viz.svg).toContain('</svg>');
    }
  }, 30000);

  it('should render with custom width and height', async () => {
    const env = getDefaultEnv();
    const tableauMcpDefinition = getPulseDefinition(env.SERVER, env.SITE_NAME, 'Tableau MCP');

    const customWidth = 1600;
    const customHeight = 900;

    const result = await callTool('render-pulse-svg', {
      env,
      schema: renderPulseSvgResultSchema,
      toolArgs: {
        metricId: tableauMcpDefinition.metrics[0].id,
        insightType: 'all',
        width: customWidth,
        height: customHeight,
      },
    });

    // Verify the result contains SVG
    expect(result.visualizations.length).toBeGreaterThan(0);

    for (const viz of result.visualizations) {
      expect(viz.svg).toContain('<svg');
      // SVG should contain width/height attributes or viewBox
      expect(viz.svg).toMatch(/width=|viewBox=/);
    }
  }, 30000);
});
