import { getConfig } from './config.js';

export interface CacheEntry<T> {
  key: string;
  data: T;
  timestamp: Date;
  ttl: number;
}

export class RequestCache<T> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly defaultTtl: number;

  constructor(defaultTtl: number = 300000) { // 5 minutes default
    this.defaultTtl = defaultTtl;
    this.startCleanup();
  }

  set(key: string, data: T, ttl?: number): void {
    const entry: CacheEntry<T> = {
      key,
      data,
      timestamp: new Date(),
      ttl: ttl || this.defaultTtl,
    };
    
    this.cache.set(key, entry);
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }
    
    // Check if entry has expired
    const now = new Date();
    const age = now.getTime() - entry.timestamp.getTime();
    
    if (age > entry.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.data;
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }

  private startCleanup(): void {
    // Clean up expired entries every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000);
  }

  private cleanup(): void {
    const now = new Date();
    const expiredKeys: string[] = [];
    
    for (const [key, entry] of this.cache) {
      const age = now.getTime() - entry.timestamp.getTime();
      if (age > entry.ttl) {
        expiredKeys.push(key);
      }
    }
    
    expiredKeys.forEach(key => this.cache.delete(key));
  }

  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.clear();
  }
}

// Global cache instances
export const searchCache = new RequestCache<any[]>(300000); // 5 minutes
export const metadataCache = new RequestCache<any>(3600000); // 1 hour
export const instanceHealthCache = new RequestCache<any>(180000); // 3 minutes

// Cache key generators
export function generateSearchCacheKey(
  query: string,
  contentTypes: string[],
  filters?: string,
  instanceNames: string[] = []
): string {
  const components = [
    'search',
    query.toLowerCase().trim(),
    contentTypes.sort().join(','),
    filters || '',
    instanceNames.sort().join(',')
  ];
  return components.join('|');
}

export function generateMetadataCacheKey(
  instanceName: string,
  contentType: string,
  resourceId: string
): string {
  return `metadata|${instanceName}|${contentType}|${resourceId}`;
}

export function generateInstanceHealthCacheKey(instanceName: string): string {
  return `health|${instanceName}`;
}

// Cache utilities
export function getCachedSearchResults<T>(
  query: string,
  contentTypes: string[],
  filters?: string,
  instanceNames: string[] = []
): T[] | null {
  const key = generateSearchCacheKey(query, contentTypes, filters, instanceNames);
  return searchCache.get(key);
}

export function setCachedSearchResults<T>(
  query: string,
  contentTypes: string[],
  results: T[],
  filters?: string,
  instanceNames: string[] = [],
  ttl?: number
): void {
  const key = generateSearchCacheKey(query, contentTypes, filters, instanceNames);
  searchCache.set(key, results, ttl);
}

export function getCachedMetadata<T>(
  instanceName: string,
  contentType: string,
  resourceId: string
): T | null {
  const key = generateMetadataCacheKey(instanceName, contentType, resourceId);
  return metadataCache.get(key);
}

export function setCachedMetadata<T>(
  instanceName: string,
  contentType: string,
  resourceId: string,
  metadata: T,
  ttl?: number
): void {
  const key = generateMetadataCacheKey(instanceName, contentType, resourceId);
  metadataCache.set(key, metadata, ttl);
}

export function getCachedInstanceHealth(instanceName: string): any | null {
  const key = generateInstanceHealthCacheKey(instanceName);
  return instanceHealthCache.get(key);
}

export function setCachedInstanceHealth(
  instanceName: string,
  health: any,
  ttl?: number
): void {
  const key = generateInstanceHealthCacheKey(instanceName);
  instanceHealthCache.set(key, health, ttl);
}

// Cache configuration from environment
export function getCacheConfig() {
  const config = getConfig();
  return {
    searchCacheTtl: config.searchCacheTtl,
    enableRequestCaching: config.enableRequestCaching,
  };
}
