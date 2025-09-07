import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConfigManager } from './configManager.js';
import { Server } from './server.js';
import { TableauInstance } from './config.js';

describe('Hot-Swappable Configuration', () => {
  let server: Server;
  let configManager: ConfigManager;

  beforeEach(() => {
    server = new Server();
    configManager = new ConfigManager(server);
  });

  afterEach(() => {
    // Clean up
  });

  describe('ConfigManager', () => {
    it('should initialize with empty instances', () => {
      const status = configManager.getStatus();
      expect(status.totalInstances).toBe(0);
      expect(status.enabledInstances).toBe(0);
      expect(status.instanceNames).toEqual([]);
    });

    it('should add and manage instances', () => {
      const instance: TableauInstance = {
        name: 'test-instance',
        server: 'https://tableau.company.com',
        auth: 'pat',
        patName: 'test-pat',
        patValue: 'test-token',
        enabled: true,
        priority: 5,
        maxConcurrentRequests: 10,
        requestTimeout: 30000,
      };

      configManager.addOrUpdateInstance(instance);
      
      const status = configManager.getStatus();
      expect(status.totalInstances).toBe(1);
      expect(status.enabledInstances).toBe(1);
      expect(status.instanceNames).toEqual(['test-instance']);
      
      const retrieved = configManager.getInstance('test-instance');
      expect(retrieved).toEqual(instance);
    });

    it('should update existing instances', () => {
      const instance: TableauInstance = {
        name: 'test-instance',
        server: 'https://tableau.company.com',
        auth: 'pat',
        patName: 'test-pat',
        patValue: 'test-token',
        enabled: true,
        priority: 5,
        maxConcurrentRequests: 10,
        requestTimeout: 30000,
      };

      configManager.addOrUpdateInstance(instance);
      
      // Update the instance
      const updatedInstance: TableauInstance = {
        ...instance,
        priority: 10,
        enabled: false,
      };

      configManager.addOrUpdateInstance(updatedInstance);
      
      const status = configManager.getStatus();
      expect(status.totalInstances).toBe(1);
      expect(status.enabledInstances).toBe(0); // Should be disabled
      
      const retrieved = configManager.getInstance('test-instance');
      expect(retrieved?.priority).toBe(10);
      expect(retrieved?.enabled).toBe(false);
    });

    it('should remove instances', () => {
      const instance: TableauInstance = {
        name: 'test-instance',
        server: 'https://tableau.company.com',
        auth: 'pat',
        patName: 'test-pat',
        patValue: 'test-token',
        enabled: true,
        priority: 5,
        maxConcurrentRequests: 10,
        requestTimeout: 30000,
      };

      configManager.addOrUpdateInstance(instance);
      expect(configManager.getStatus().totalInstances).toBe(1);
      
      const removed = configManager.removeInstance('test-instance');
      expect(removed).toBe(true);
      expect(configManager.getStatus().totalInstances).toBe(0);
      
      const notFound = configManager.removeInstance('nonexistent');
      expect(notFound).toBe(false);
    });

    it('should track configuration version changes', () => {
      const initialVersion = configManager.getStatus().version;
      
      const instance: TableauInstance = {
        name: 'test-instance',
        server: 'https://tableau.company.com',
        auth: 'pat',
        patName: 'test-pat',
        patValue: 'test-token',
        enabled: true,
        priority: 5,
        maxConcurrentRequests: 10,
        requestTimeout: 30000,
      };

      configManager.addOrUpdateInstance(instance);
      
      const newVersion = configManager.getStatus().version;
      expect(newVersion).toBeGreaterThan(initialVersion);
      expect(configManager.hasChanged(initialVersion)).toBe(true);
    });

    it('should replace all instances', () => {
      // Add initial instances
      const instance1: TableauInstance = {
        name: 'instance1',
        server: 'https://tableau1.company.com',
        auth: 'pat',
        patName: 'pat1',
        patValue: 'token1',
        enabled: true,
        priority: 5,
        maxConcurrentRequests: 10,
        requestTimeout: 30000,
      };

      const instance2: TableauInstance = {
        name: 'instance2',
        server: 'https://tableau2.company.com',
        auth: 'pat',
        patName: 'pat2',
        patValue: 'token2',
        enabled: true,
        priority: 5,
        maxConcurrentRequests: 10,
        requestTimeout: 30000,
      };

      configManager.addOrUpdateInstance(instance1);
      configManager.addOrUpdateInstance(instance2);
      
      expect(configManager.getStatus().totalInstances).toBe(2);
      
      // Replace with new instances
      const newInstance1: TableauInstance = {
        name: 'new-instance1',
        server: 'https://new-tableau1.company.com',
        auth: 'pat',
        patName: 'new-pat1',
        patValue: 'new-token1',
        enabled: true,
        priority: 8,
        maxConcurrentRequests: 15,
        requestTimeout: 30000,
      };

      const newInstance2: TableauInstance = {
        name: 'new-instance2',
        server: 'https://new-tableau2.company.com',
        auth: 'pat',
        patName: 'new-pat2',
        patValue: 'new-token2',
        enabled: false,
        priority: 3,
        maxConcurrentRequests: 5,
        requestTimeout: 30000,
      };

      configManager.updateInstances([newInstance1, newInstance2]);
      
      const status = configManager.getStatus();
      expect(status.totalInstances).toBe(2);
      expect(status.enabledInstances).toBe(1);
      expect(status.instanceNames).toEqual(['new-instance1', 'new-instance2']);
      
      // Verify old instances are gone
      expect(configManager.getInstance('instance1')).toBeUndefined();
      expect(configManager.getInstance('instance2')).toBeUndefined();
      
      // Verify new instances are present
      expect(configManager.getInstance('new-instance1')).toEqual(newInstance1);
      expect(configManager.getInstance('new-instance2')).toEqual(newInstance2);
    });

    it('should filter enabled instances', () => {
      const enabledInstance: TableauInstance = {
        name: 'enabled-instance',
        server: 'https://tableau.company.com',
        auth: 'pat',
        patName: 'test-pat',
        patValue: 'test-token',
        enabled: true,
        priority: 5,
        maxConcurrentRequests: 10,
        requestTimeout: 30000,
      };

      const disabledInstance: TableauInstance = {
        name: 'disabled-instance',
        server: 'https://tableau.company.com',
        auth: 'pat',
        patName: 'test-pat',
        patValue: 'test-token',
        enabled: false,
        priority: 5,
        maxConcurrentRequests: 10,
        requestTimeout: 30000,
      };

      configManager.addOrUpdateInstance(enabledInstance);
      configManager.addOrUpdateInstance(disabledInstance);
      
      const allInstances = configManager.getAllInstances();
      const enabledInstances = configManager.getEnabledInstances();
      
      expect(allInstances).toHaveLength(2);
      expect(enabledInstances).toHaveLength(1);
      expect(enabledInstances[0].name).toBe('enabled-instance');
    });
  });
});
