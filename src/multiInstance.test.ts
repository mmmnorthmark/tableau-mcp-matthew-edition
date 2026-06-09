import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Config, exportedForTesting } from './config.js';
import { RequestCache } from './requestCache.js';

const { validateTableauInstance } = exportedForTesting;

describe('Multi-Instance Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('validateTableauInstance', () => {
    it('should validate a valid PAT instance', () => {
      const instance = {
        name: 'test',
        server: 'https://tableau.company.com',
        auth: 'pat' as const,
        patName: 'test-pat',
        patValue: 'test-token',
        enabled: true,
        priority: 5,
        maxConcurrentRequests: 10,
        requestTimeout: 30000,
      };

      expect(() => validateTableauInstance(instance, 0)).not.toThrow();
    });

    it('should validate a valid direct-trust instance', () => {
      const instance = {
        name: 'test',
        server: 'https://tableau.company.com',
        auth: 'direct-trust' as const,
        jwtSubClaim: 'test@company.com',
        connectedAppClientId: 'client-id',
        connectedAppSecretId: 'secret-id',
        connectedAppSecretValue: 'secret-value',
        enabled: true,
        priority: 5,
        maxConcurrentRequests: 10,
        requestTimeout: 30000,
      };

      expect(() => validateTableauInstance(instance, 0)).not.toThrow();
    });

    it('should reject invalid server URL', () => {
      const instance = {
        name: 'test',
        server: 'http://tableau.company.com', // Should be https
        auth: 'pat' as const,
        patName: 'test-pat',
        patValue: 'test-token',
        enabled: true,
        priority: 5,
        maxConcurrentRequests: 10,
        requestTimeout: 30000,
      };

      expect(() => validateTableauInstance(instance, 0)).toThrow('Server URL must start with "https://"');
    });

    it('should reject PAT instance without credentials', () => {
      const instance = {
        name: 'test',
        server: 'https://tableau.company.com',
        auth: 'pat' as const,
        // Missing patName and patValue
        enabled: true,
        priority: 5,
        maxConcurrentRequests: 10,
        requestTimeout: 30000,
      };

      expect(() => validateTableauInstance(instance, 0)).toThrow('PAT authentication requires both patName and patValue');
    });

    it('should reject direct-trust instance without credentials', () => {
      const instance = {
        name: 'test',
        server: 'https://tableau.company.com',
        auth: 'direct-trust' as const,
        // Missing required fields
        enabled: true,
        priority: 5,
        maxConcurrentRequests: 10,
        requestTimeout: 30000,
      };

      expect(() => validateTableauInstance(instance, 0)).toThrow('Direct-trust authentication requires jwtSubClaim, connectedAppClientId, connectedAppSecretId, and connectedAppSecretValue');
    });
  });

  describe('Config with TABLEAU_INSTANCES', () => {
    it('should parse valid multi-instance configuration', () => {
      process.env.TABLEAU_INSTANCES = JSON.stringify([
        {
          name: 'prod',
          server: 'https://tableau.company.com',
          auth: 'pat',
          patName: 'prod-pat',
          patValue: 'prod-token',
          enabled: true,
          priority: 10,
          maxConcurrentRequests: 15,
          requestTimeout: 30000,
        },
        {
          name: 'staging',
          server: 'https://tableau-staging.company.com',
          auth: 'pat',
          patName: 'staging-pat',
          patValue: 'staging-token',
          enabled: true,
          priority: 5,
          maxConcurrentRequests: 10,
          requestTimeout: 30000,
        },
      ]);

      const config = new Config();

      expect(config.instances).toHaveLength(2);
      expect(config.instances[0].name).toBe('prod');
      expect(config.instances[0].priority).toBe(10);
      expect(config.instances[1].name).toBe('staging');
      expect(config.instances[1].priority).toBe(5);
    });

    it('should throw when TABLEAU_INSTANCES and CONFIG_FILE_PATH are missing', () => {
      delete process.env.TABLEAU_INSTANCES;
      delete process.env.CONFIG_FILE_PATH;

      expect(() => new Config()).toThrow(
        'Tableau instance configuration required. Set either TABLEAU_INSTANCES or CONFIG_FILE_PATH environment variable.',
      );
    });

    it('should reject invalid JSON in TABLEAU_INSTANCES', () => {
      process.env.TABLEAU_INSTANCES = 'invalid json';

      expect(() => new Config()).toThrow('Failed to parse TABLEAU_INSTANCES');
    });

    it('should allow an empty instances array', () => {
      process.env.TABLEAU_INSTANCES = '[]';

      const config = new Config();
      expect(config.instances).toHaveLength(0);
    });

    it('should set search configuration defaults', () => {
      process.env.TABLEAU_INSTANCES = JSON.stringify([
        {
          name: 'test',
          server: 'https://tableau.company.com',
          auth: 'pat',
          patName: 'test-pat',
          patValue: 'test-token',
        },
      ]);

      const config = new Config();
      
      expect(config.searchCacheTtl).toBe(300000); // 5 minutes
      expect(config.maxConcurrentSearches).toBe(10);
      expect(config.searchTimeout).toBe(30000);
      expect(config.enableRequestCaching).toBe(true);
      expect(config.systemPrompt).toContain('Prioritize results');
    });

    it('should use custom search configuration', () => {
      process.env.TABLEAU_INSTANCES = JSON.stringify([
        {
          name: 'test',
          server: 'https://tableau.company.com',
          auth: 'pat',
          patName: 'test-pat',
          patValue: 'test-token',
        },
      ]);
      process.env.SEARCH_CACHE_TTL = '600000';
      process.env.MAX_CONCURRENT_SEARCHES = '20';
      process.env.SEARCH_TIMEOUT = '60000';
      process.env.ENABLE_REQUEST_CACHING = 'false';
      process.env.SYSTEM_PROMPT = 'Custom prompt';

      const config = new Config();
      
      expect(config.searchCacheTtl).toBe(600000);
      expect(config.maxConcurrentSearches).toBe(20);
      expect(config.searchTimeout).toBe(60000);
      expect(config.enableRequestCaching).toBe(false);
      expect(config.systemPrompt).toBe('Custom prompt');
    });
  });
});

describe('RequestCache', () => {
  let cache: RequestCache<string>;

  beforeEach(() => {
    cache = new RequestCache<string>(1000); // 1 second TTL for testing
  });

  afterEach(() => {
    cache.shutdown();
  });

  it('should store and retrieve cached data', () => {
    cache.set('key1', 'value1');
    expect(cache.get('key1')).toBe('value1');
  });

  it('should return null for non-existent keys', () => {
    expect(cache.get('nonexistent')).toBe(null);
  });

  it('should return null for expired entries', async () => {
    cache.set('key1', 'value1', 100); // 100ms TTL
    
    expect(cache.get('key1')).toBe('value1');
    
    // Wait for expiration
    await new Promise(resolve => setTimeout(resolve, 150));
    
    expect(cache.get('key1')).toBe(null);
  });

  it('should check if key exists', () => {
    cache.set('key1', 'value1');
    expect(cache.has('key1')).toBe(true);
    expect(cache.has('nonexistent')).toBe(false);
  });

  it('should delete entries', () => {
    cache.set('key1', 'value1');
    expect(cache.delete('key1')).toBe(true);
    expect(cache.get('key1')).toBe(null);
    expect(cache.delete('nonexistent')).toBe(false);
  });

  it('should clear all entries', () => {
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    expect(cache.size()).toBe(2);
    
    cache.clear();
    expect(cache.size()).toBe(0);
  });
});
