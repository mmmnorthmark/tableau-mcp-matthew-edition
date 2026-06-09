import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Config } from '../config.js';
import { ConfigManager } from '../configManager.js';
import { InstanceManager } from '../instanceManager.js';
import { Server } from '../server.js';

const integrationEnabled = process.env.TABLEAU_INTEGRATION === '1';

describe.skipIf(!integrationEnabled)('Multi-instance live authentication', () => {
  let instanceManager: InstanceManager;
  let config: Config;
  let server: Server;

  beforeAll(() => {
    const hasInstancesEnv = Boolean(process.env.TABLEAU_INSTANCES);
    const hasConfigFile = Boolean(process.env.CONFIG_FILE_PATH);

    expect(
      hasInstancesEnv || hasConfigFile,
      'Set TABLEAU_INSTANCES or CONFIG_FILE_PATH before running integration tests',
    ).toBe(true);

    config = new Config();

    expect(config.instances.length).toBeGreaterThanOrEqual(2);

    const authTypes = new Set(config.instances.map((instance) => instance.auth));
    expect(authTypes.has('pat'), 'Expected at least one PAT instance in configuration').toBe(true);
    expect(
      authTypes.has('direct-trust'),
      'Expected at least one direct-trust (connected app) instance in configuration',
    ).toBe(true);

    server = new Server();
    const configManager = new ConfigManager(server, config.instances);
    instanceManager = new InstanceManager(server, 'integration-test', configManager);
  });

  afterAll(async () => {
    if (instanceManager) {
      await instanceManager.shutdown();
    }
  });

  it('authenticates all configured instances and establishes REST sessions', async () => {
    await instanceManager.initializeFromConfigManager();

    const enabledInstances = config.instances.filter((instance) => instance.enabled);
    const stats = instanceManager.getInstanceStats();

    expect(stats.length).toBe(enabledInstances.length);

    for (const stat of stats) {
      expect(stat.health.healthy, `${stat.name} should be healthy`).toBe(true);
      expect(stat.health.error, `${stat.name} should have no error`).toBeUndefined();
    }

    const healthyConnections = await instanceManager.getHealthyInstances();
    expect(healthyConnections.length).toBe(enabledInstances.length);

    for (const connection of healthyConnections) {
      expect(connection.restApi.siteId).toBeTruthy();
    }
  });
});
