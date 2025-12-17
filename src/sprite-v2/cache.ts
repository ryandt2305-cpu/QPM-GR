// sprite-v2/cache.ts - LRU cache with cost-based eviction

import type { CacheEntry, SpriteConfig, SpriteState } from './types';

/**
 * Calculates the cost of a cache entry (animations cost more)
 */
export function entryCost(e: CacheEntry | undefined): number {
  if (!e) return 0;
  return e.isAnim ? (e.frames?.length || 0) : e.tex ? 1 : 0;
}

/**
 * Evicts least recently used entries when cache exceeds limits
 */
export function lruEvict(state: SpriteState, cfg: SpriteConfig): void {
  if (!cfg.cacheOn) return;

  while (state.lru.size > cfg.cacheMaxEntries || state.cost > cfg.cacheMaxCost) {
    const k = state.lru.keys().next().value;
    if (k === undefined) break;

    const e = state.lru.get(k);
    state.lru.delete(k);
    state.cost = Math.max(0, state.cost - entryCost(e));
  }
}

/**
 * Clears the entire variant cache
 */
export function clearVariantCache(state: SpriteState): void {
  state.lru.clear();
  state.cost = 0;
  state.srcCan.clear();
}

/**
 * Adds an entry to the cache with automatic LRU eviction
 */
export function cacheSet(state: SpriteState, cfg: SpriteConfig, key: string, entry: CacheEntry): void {
  if (!cfg.cacheOn) return;

  state.lru.set(key, entry);
  state.cost += entryCost(entry);
  lruEvict(state, cfg);
}

/**
 * Gets an entry from the cache
 */
export function cacheGet(state: SpriteState, key: string): CacheEntry | undefined {
  return state.lru.get(key);
}

/**
 * Checks if key exists in cache
 */
export function cacheHas(state: SpriteState, key: string): boolean {
  return state.lru.has(key);
}

/**
 * Gets cache statistics
 */
export function getCacheStats(state: SpriteState): { entries: number; cost: number } {
  return {
    entries: state.lru.size,
    cost: state.cost,
  };
}
