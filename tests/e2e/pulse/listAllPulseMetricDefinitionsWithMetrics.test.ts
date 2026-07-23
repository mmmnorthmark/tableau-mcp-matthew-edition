import z from 'zod';

import { pulseMetricDefinitionSchema } from '../../../src/sdks/tableau/types/pulse.js';
import { getPulseDefinition } from '../../constants.js';
import { getDefaultEnv, resetEnv, setEnv } from '../../testEnv.js';
import { McpClient } from '../mcpClient.js';

describe('list-all-pulse-metric-definitions-with-metrics', () => {
  let client: McpClient;

  beforeAll(setEnv);
  afterAll(resetEnv);

  beforeAll(async () => {
    client = new McpClient();
    await client.connect();
  });

  afterAll(async () => {
    await client.close();
  });

  it('should list all pulse metric definitions with all metrics', async () => {
    const env = getDefaultEnv();
    const tableauMcpDefinition = getPulseDefinition(env.SERVER, env.SITE_NAME, 'Tableau MCP');

    const definitions = await client.callTool('list-all-pulse-metric-definitions-with-metrics', {
      schema: z.array(pulseMetricDefinitionSchema.passthrough()),
    });

    expect(definitions.length).toBeGreaterThan(0);

    // Find the Tableau MCP definition
    const definition = definitions.find(
      (d: z.infer<typeof pulseMetricDefinitionSchema>) => d.metadata.id === tableauMcpDefinition.id,
    );
    expect(definition).toBeDefined();

    // Verify it has metrics
    expect(definition?.metrics).toBeDefined();
    expect(Array.isArray(definition?.metrics)).toBe(true);

    // Verify total_metrics matches the actual count
    expect(definition?.total_metrics).toBe(definition?.metrics.length);
  });
});
