export interface CropStats {
    name: string;
    seedPrice: number;
    baseSellPrice: number;
    cropGrowTime: number;
    regrow: string;
    matureTime?: number;
    baseWeight: number;
    maxWeight: number;
    exclusive?: string;
    rarity?: number;
}
export declare const CROP_BASE_STATS: Record<string, CropStats>;
/**
 * Get crop stats by name (case-insensitive)
 */
export declare function getCropStats(cropName: string): CropStats | null;
/**
 * Calculate crop value with scale
 */
export declare function calculateCropValue(cropName: string, scale: number): number;
//# sourceMappingURL=cropBaseStats.d.ts.map