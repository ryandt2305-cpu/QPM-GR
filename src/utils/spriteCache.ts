// src/utils/spriteCache.ts - Global sprite cache with LRU eviction
import { log } from './logger';

interface CacheEntry {
  dataUrl: string;
  lastAccess: number;
  accessCount: number;
}

class SpriteCache {
  private cache = new Map<string, CacheEntry>();
  private maxEntries = 500;
  private hits = 0;
  private misses = 0;

  /**
   * Generate cache key for sprite
   * Format: type_species_mutations
   * Example: pet_Butterfly_rainbow or crop_Sunflower_gold,wet
   */
  private generateKey(type: string, species: string, mutations: string[] = []): string {
    const sortedMutations = mutations.sort().join(',');
    return `${type}_${species}_${sortedMutations}`;
  }

  /**
   * Get sprite from cache
   */
  get(type: string, species: string, mutations: string[] = []): string | null {
    const key = this.generateKey(type, species, mutations);
    const entry = this.cache.get(key);
    
    if (entry) {
      entry.lastAccess = Date.now();
      entry.accessCount++;
      this.hits++;
      return entry.dataUrl;
    }
    
    this.misses++;
    return null;
  }

  /**
   * Store sprite in cache
   */
  set(type: string, species: string, dataUrl: string, mutations: string[] = []): void {
    const key = this.generateKey(type, species, mutations);
    
    // Evict oldest entry if at max capacity
    if (this.cache.size >= this.maxEntries && !this.cache.has(key)) {
      this.evictLRU();
    }
    
    this.cache.set(key, {
      dataUrl,
      lastAccess: Date.now(),
      accessCount: 1,
    });
  }

  /**
   * Check if sprite exists in cache
   */
  has(type: string, species: string, mutations: string[] = []): boolean {
    const key = this.generateKey(type, species, mutations);
    return this.cache.has(key);
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccess < oldestTime) {
        oldestTime = entry.lastAccess;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  /**
   * Clear all cached sprites
   */
  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
    log('🗑️ Sprite cache cleared');
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; maxEntries: number; hits: number; misses: number; hitRate: number } {
    const total = this.hits + this.misses;
    const hitRate = total > 0 ? (this.hits / total) * 100 : 0;
    
    return {
      size: this.cache.size,
      maxEntries: this.maxEntries,
      hits: this.hits,
      misses: this.misses,
      hitRate,
    };
  }

  /**
   * Log cache statistics
   */
  logStats(): void {
    const stats = this.getStats();
    log(`📊 Sprite Cache Stats:
      Size: ${stats.size}/${stats.maxEntries}
      Hits: ${stats.hits}
      Misses: ${stats.misses}
      Hit Rate: ${stats.hitRate.toFixed(2)}%`);
  }
}

// Global singleton
export const spriteCache = new SpriteCache();

// Expose to window for debugging
if (typeof window !== 'undefined') {
  (window as any).QPM_SPRITE_CACHE = spriteCache;
  (window as any).QPM_CLEAR_SPRITE_CACHE = () => spriteCache.clear();
  (window as any).QPM_SPRITE_CACHE_STATS = () => spriteCache.logStats();
}
