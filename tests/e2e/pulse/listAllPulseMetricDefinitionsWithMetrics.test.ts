import z from 'zod';

import { pulseMetricDefinitionSchema } from '../../../src/sdks/tableau/types/pulse.js';
import { getPulseDefinition } from '../../constants.js';
import { getDefaultEnv, resetEnv, setEnv } from '../../testEnv.js';
import { callTool } from '../client.js';

describe('list-all-pulse-metric-definitions-with-metrics', () => {
  beforeAll(setEnv);
  afterAll(resetEnv);

  it('should list all pulse metric definitions with all metrics', async () => {
    const env = getDefaultEnv();
    const tableauMcpDefinition = getPulseDefinition(env.SERVER, env.SITE_NAME, 'Tableau MCP');

    const definitions = await callTool('list-all-pulse-metric-definitions-with-metrics', {
      env,
      schema: z.array(pulseMetricDefinitionSchema),
    });

    expect(definitions.length).toBeGreaterThan(0);

    // Find the Tableau MCP definition
    const definition = definitions.find((d) => d.metadata.id === tableauMcpDefinition.id);
    expect(definition).toBeDefined();

    // Verify it has metrics
    expect(definition?.metrics).toBeDefined();
    expect(Array.isArray(definition?.metrics)).toBe(true);

    // Verify total_metrics matches the actual count
    expect(definition?.total_metrics).toBe(definition?.metrics.length);
  });
});
