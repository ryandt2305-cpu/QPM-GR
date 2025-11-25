/**
 * Harvest Strategy Types
 */
export type HarvestStrategy = 'freeze-and-sell' | 'sell-when-mature' | 'freeze-if-gold';
/**
 * Crop Optimization Data
 * Includes base rate, frozen value, and recommended strategy
 */
export interface CropOptimizationData {
    species: string;
    baseRatePerHour: number;
    frozenValuePerHour: number;
    amberValuePerHour: number;
    rank: number;
    strategy: HarvestStrategy;
}
/**
 * Complete crop optimization dataset
 * Ranked by $/Hr per plant efficiency
 */
export declare const CROP_OPTIMIZATION: Record<string, CropOptimizationData>;
/**
 * Get harvest strategy for a crop species
 */
export declare function getHarvestStrategy(species: string): HarvestStrategy | null;
/**
 * Get crops by strategy type
 */
export declare function getCropsByStrategy(strategy: HarvestStrategy): string[];
/**
 * Get strategy description for UI
 */
export declare function getStrategyDescription(strategy: HarvestStrategy): string;
/**
 * Calculate expected value gain from freezing
 */
export declare function getFreezingValueGain(species: string): number;
/**
 * Determine if crop is worth freezing
 */
export declare function isWorthFreezing(species: string, hasGoldMutation?: boolean): boolean;
/**
 * Get top N most valuable crops to freeze
 */
export declare function getTopCropsToFreeze(limit?: number): CropOptimizationData[];
//# sourceMappingURL=cropOptimization.d.ts.map