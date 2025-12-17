import { CacheEntry, SpriteConfig, SpriteState } from './types';
/**
 * Calculates the cost of a cache entry (animations cost more)
 */
export declare function entryCost(e: CacheEntry | undefined): number;
/**
 * Evicts least recently used entries when cache exceeds limits
 */
export declare function lruEvict(state: SpriteState, cfg: SpriteConfig): void;
/**
 * Clears the entire variant cache
 */
export declare function clearVariantCache(state: SpriteState): void;
/**
 * Adds an entry to the cache with automatic LRU eviction
 */
export declare function cacheSet(state: SpriteState, cfg: SpriteConfig, key: string, entry: CacheEntry): void;
/**
 * Gets an entry from the cache
 */
export declare function cacheGet(state: SpriteState, key: string): CacheEntry | undefined;
/**
 * Checks if key exists in cache
 */
export declare function cacheHas(state: SpriteState, key: string): boolean;
/**
 * Gets cache statistics
 */
export declare function getCacheStats(state: SpriteState): {
    entries: number;
    cost: number;
};
//# sourceMappingURL=cache.d.ts.map