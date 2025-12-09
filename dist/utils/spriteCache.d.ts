declare class SpriteCache {
    private cache;
    private maxEntries;
    private hits;
    private misses;
    /**
     * Generate cache key for sprite
     * Format: type_species_mutations
     * Example: pet_Butterfly_rainbow or crop_Sunflower_gold,wet
     */
    private generateKey;
    /**
     * Get sprite from cache
     */
    get(type: string, species: string, mutations?: string[]): string | null;
    /**
     * Store sprite in cache
     */
    set(type: string, species: string, dataUrl: string, mutations?: string[]): void;
    /**
     * Check if sprite exists in cache
     */
    has(type: string, species: string, mutations?: string[]): boolean;
    /**
     * Evict least recently used entry
     */
    private evictLRU;
    /**
     * Clear all cached sprites
     */
    clear(): void;
    /**
     * Get cache statistics
     */
    getStats(): {
        size: number;
        maxEntries: number;
        hits: number;
        misses: number;
        hitRate: number;
    };
    /**
     * Log cache statistics
     */
    logStats(): void;
}
export declare const spriteCache: SpriteCache;
export {};
//# sourceMappingURL=spriteCache.d.ts.map