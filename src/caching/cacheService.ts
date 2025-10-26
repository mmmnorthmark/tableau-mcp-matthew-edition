/**
 * Simple in-memory cache service using node-cache
 * Provides caching for Tableau Pulse API responses
 */

import NodeCache from 'node-cache';

// Cache TTLs (in seconds)
export const CACHE_TTL = {
  METRIC_DEFINITIONS: 300, // 5 minutes
  METRIC_DATA: 60, // 1 minute
  INSIGHTS: 60, // 1 minute
  SESSION_TOKEN: 3600, // 1 hour
} as const;

class CacheService {
  private cache: NodeCache;

  constructor() {
    this.cache = new NodeCache({
      stdTTL: 60, // Default TTL: 1 minute
      checkperiod: 120, // Check for expired keys every 2 minutes
      useClones: true, // Clone objects to prevent mutation
    });
  }

  /**
   * Get a value from cache
   */
  get<T>(key: string): T | undefined {
    return this.cache.get<T>(key);
  }

  /**
   * Set a value in cache with optional TTL
   */
  set<T>(key: string, value: T, ttl?: number): boolean {
    return this.cache.set(key, value, ttl || CACHE_TTL.METRIC_DATA);
  }

  /**
   * Delete a key from cache
   */
  delete(key: string): number {
    return this.cache.del(key);
  }

  /**
   * Clear entire cache
   */
  flush(): void {
    this.cache.flushAll();
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return this.cache.getStats();
  }

  /**
   * Get cache keys
   */
  keys(): string[] {
    return this.cache.keys();
  }
}

// Singleton instance
export const cacheService = new CacheService();

/**
 * Helper to generate cache keys
 */
export const CacheKeys = {
  metricDefinition: (defId: string) => `metric_def:${defId}`,
  metricData: (metricId: string) => `metric_data:${metricId}`,
  insightBundle: (metricId: string, defId: string) => `insight_bundle:${metricId}:${defId}`,
  pulseToken: (userId: string) => `pulse_token:${userId}`,
} as const;
