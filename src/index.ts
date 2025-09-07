#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import dotenv from 'dotenv';

import { getConfig } from './config.js';
import { isLoggingLevel, log, setLogLevel, writeToStderr } from './logging/log.js';
import { Server, serverName, serverVersion } from './server.js';
import { startExpressServer } from './server/express.js';
import { getExceptionMessage } from './utils/getExceptionMessage.js';
import { initializeConfigManager } from './configManager.js';

async function startServer(): Promise<void> {
  dotenv.config();
  const config = getConfig();

  const logLevel = isLoggingLevel(config.defaultLogLevel) ? config.defaultLogLevel : 'debug';

  switch (config.transport) {
    case 'stdio': {
      const server = new Server();
      server.registerTools();
      server.registerRequestHandlers();

      const transport = new StdioServerTransport();
      await server.connect(transport);

      setLogLevel(server, logLevel);
      
      // Initialize ConfigManager with instances at startup
      if (config.instances.length > 0) {
        initializeConfigManager(server, config.instances);
        const enabledCount = config.instances.filter(instance => instance.enabled).length;
        const instanceNames = config.instances.map(instance => instance.name).join(', ');
        log.info(server, `Loaded ${config.instances.length} Tableau instances (${enabledCount} enabled): ${instanceNames}`);
      } else {
        log.warn(server, 'No Tableau instances loaded');
      }
      
      log.info(server, `${server.name} v${server.version} running on stdio`);
      break;
    }
    case 'http': {
      // Create a server instance for ConfigManager initialization
      const httpServer = new Server();
      
      // Initialize ConfigManager with instances at startup
      if (config.instances.length > 0) {
        initializeConfigManager(httpServer, config.instances);
        const enabledCount = config.instances.filter(instance => instance.enabled).length;
        const instanceNames = config.instances.map(instance => instance.name).join(', ');
        // eslint-disable-next-line no-console -- console.log is intentional here since the transport is not stdio.
        console.log(`✅ Loaded ${config.instances.length} Tableau instances (${enabledCount} enabled): ${instanceNames}`);
      } else {
        // eslint-disable-next-line no-console -- console.log is intentional here since the transport is not stdio.
        console.log('⚠️  No Tableau instances loaded');
      }
      
      const { url } = await startExpressServer({ basePath: serverName, config, logLevel });

      // eslint-disable-next-line no-console -- console.log is intentional here since the transport is not stdio.
      console.log(
        `${serverName} v${serverVersion} stateless streamable HTTP server available at ${url}`,
      );
      break;
    }
  }

  if (config.disableLogMasking) {
    writeToStderr('Log masking is disabled!');
  }
}

try {
  await startServer();
} catch (error) {
  writeToStderr(`Fatal error when starting the server: ${getExceptionMessage(error)}`);
  process.exit(1);
}
