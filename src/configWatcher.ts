import { watch } from 'fs';
import { readFile } from 'fs/promises';
import { log } from './logging/log.js';
import { Server } from './server.js';
import { getConfigManager } from './configManager.js';
import { TableauInstance } from './config.js';

export class ConfigWatcher {
  private watcher: any = null;
  private readonly configPath: string;
  private readonly server: Server;
  private isWatching: boolean = false;

  constructor(server: Server, configPath: string) {
    this.server = server;
    this.configPath = configPath;
  }

  startWatching(): void {
    if (this.isWatching) return;

    try {
      this.watcher = watch(this.configPath, { persistent: true }, (eventType) => {
        if (eventType === 'change') {
          log.info(this.server, `Configuration file changed: ${this.configPath}`);
          this.reloadConfiguration();
        }
      });

      this.isWatching = true;
      log.info(this.server, `Started watching configuration file: ${this.configPath}`);
    } catch (error) {
      log.error(this.server, `Failed to start watching configuration file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  stopWatching(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
      this.isWatching = false;
      log.info(this.server, 'Stopped watching configuration file');
    }
  }

  private async reloadConfiguration(): Promise<void> {
    try {
      // Read and parse the configuration file
      const configData = await readFile(this.configPath, 'utf8');
      const instances: TableauInstance[] = JSON.parse(configData);
      
      // Update the configuration manager
      const configManager = getConfigManager(this.server);
      configManager.updateInstances(instances);
      
      log.info(this.server, `Configuration reloaded from file: ${instances.length} instances`);
    } catch (error) {
      log.error(this.server, `Failed to reload configuration: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  isActive(): boolean {
    return this.isWatching;
  }
}

// Global config watcher instance
let globalConfigWatcher: ConfigWatcher | null = null;

export function getConfigWatcher(server?: Server, configPath?: string): ConfigWatcher | null {
  if (!globalConfigWatcher && server && configPath) {
    globalConfigWatcher = new ConfigWatcher(server, configPath);
  }
  return globalConfigWatcher;
}

export function startConfigWatcher(server: Server, configPath: string): ConfigWatcher {
  globalConfigWatcher = new ConfigWatcher(server, configPath);
  globalConfigWatcher.startWatching();
  return globalConfigWatcher;
}

export function stopConfigWatcher(): void {
  if (globalConfigWatcher) {
    globalConfigWatcher.stopWatching();
    globalConfigWatcher = null;
  }
}
