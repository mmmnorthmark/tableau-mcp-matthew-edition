import { z } from 'zod';
import { log } from './logging/log.js';
import { Server } from './server.js';
import { TableauInstance, validateTableauInstance } from './config.js';

// Runtime configuration management
export class ConfigManager {
  private instances: Map<string, TableauInstance> = new Map();
  private configVersion: number = 0;
  private lastUpdated: Date = new Date();
  private readonly server: Server;

  constructor(server: Server, initialInstances: TableauInstance[] = []) {
    this.server = server;
    this.initializeInstances(initialInstances);
  }

  private initializeInstances(instances: TableauInstance[]): void {
    for (const instance of instances) {
      this.instances.set(instance.name, instance);
    }
    log.info(this.server, `Initialized ConfigManager with ${instances.length} instances`);
  }

  // Add or update an instance
  addOrUpdateInstance(instance: TableauInstance): void {
    try {
      validateTableauInstance(instance, this.instances.size);
      this.instances.set(instance.name, instance);
      this.configVersion++;
      this.lastUpdated = new Date();
      log.info(this.server, `Added/updated instance: ${instance.name}`);
    } catch (error) {
      log.error(this.server, `Failed to add/update instance ${instance.name}: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  // Remove an instance
  removeInstance(instanceName: string): boolean {
    const removed = this.instances.delete(instanceName);
    if (removed) {
      this.configVersion++;
      this.lastUpdated = new Date();
      log.info(this.server, `Removed instance: ${instanceName}`);
    }
    return removed;
  }

  // Get all instances
  getAllInstances(): TableauInstance[] {
    return Array.from(this.instances.values());
  }

  // Get enabled instances only
  getEnabledInstances(): TableauInstance[] {
    return Array.from(this.instances.values()).filter(instance => instance.enabled);
  }

  // Get instance by name
  getInstance(name: string): TableauInstance | undefined {
    return this.instances.get(name);
  }

  // Update multiple instances at once
  updateInstances(instances: TableauInstance[]): void {
    const newInstances = new Map<string, TableauInstance>();
    
    // Validate all instances first
    instances.forEach((instance, index) => {
      validateTableauInstance(instance, index);
      newInstances.set(instance.name, instance);
    });

    // Replace all instances
    this.instances = newInstances;
    this.configVersion++;
    this.lastUpdated = new Date();
    
    log.info(this.server, `Updated ConfigManager with ${instances.length} instances`);
  }

  // Get configuration status
  getStatus(): {
    version: number;
    lastUpdated: Date;
    totalInstances: number;
    enabledInstances: number;
    instanceNames: string[];
  } {
    return {
      version: this.configVersion,
      lastUpdated: this.lastUpdated,
      totalInstances: this.instances.size,
      enabledInstances: this.getEnabledInstances().length,
      instanceNames: Array.from(this.instances.keys()),
    };
  }

  // Check if configuration has changed
  hasChanged(version: number): boolean {
    return this.configVersion > version;
  }
}

// Global configuration manager instance
let globalConfigManager: ConfigManager | null = null;

export function getConfigManager(server?: Server): ConfigManager {
  if (!globalConfigManager && server) {
    globalConfigManager = new ConfigManager(server);
  }
  if (!globalConfigManager) {
    throw new Error('ConfigManager not initialized');
  }
  return globalConfigManager;
}

export function initializeConfigManager(server: Server, instances: TableauInstance[]): ConfigManager {
  globalConfigManager = new ConfigManager(server, instances);
  return globalConfigManager;
}
