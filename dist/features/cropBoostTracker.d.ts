/**
 * Crop Size Boost Tracker
 * Tracks how many Crop Size Boosts are needed to maximize garden crops
 * Based on active ProduceSizeBoost and ProduceSizeBoostII pets
 */
export interface CropBoostConfig {
    enabled: boolean;
    autoRefresh: boolean;
    refreshInterval: number;
    selectedSpecies: string | null;
}
export interface BoostPetInfo {
    slotIndex: number;
    displayName: string;
    species: string;
    strength: number;
    abilityId: 'ProduceScaleBoost' | 'ProduceScaleBoostII';
    abilityName: string;
    baseBoostPercent: number;
    effectiveBoostPercent: number;
    baseProcChance: number;
    effectiveProcChance: number;
    expectedMinutesPerProc: number;
}
export interface CropSizeInfo {
    species: string;
    currentScale: number;
    maxScale: number;
    currentSizePercent: number;
    sizeRemaining: number;
    mutations: string[];
    fruitCount: number;
    isMature: boolean;
    tileKey: string;
    slotIndex: number;
}
export interface BoostEstimate {
    boostsNeeded: number;
    timeEstimateP10: number;
    timeEstimateP50: number;
    timeEstimateP90: number;
    boostsReceived: number;
    lastBoostAt: number | null;
    expectedNextBoostAt: number;
}
export interface TrackerAnalysis {
    boostPets: BoostPetInfo[];
    crops: CropSizeInfo[];
    totalBoostPets: number;
    totalMatureCrops: number;
    totalCropsAtMax: number;
    totalCropsNeedingBoost: number;
    averageBoostPercent: number;
    weakestBoostPercent: number;
    strongestBoostPercent: number;
    averageMinutesPerProc: number;
    slowestMinutesPerProc: number;
    fastestMinutesPerProc: number;
    overallEstimate: BoostEstimate;
    cropEstimates: Map<string, BoostEstimate>;
    timestamp: number;
}
export declare function getConfig(): CropBoostConfig;
export declare function setConfig(updates: Partial<CropBoostConfig>): void;
export declare function setSelectedSpecies(species: string | null): void;
export declare function onAnalysisChange(callback: (analysis: TrackerAnalysis | null) => void): void;
export declare function getCurrentAnalysis(): TrackerAnalysis | null;
export declare function manualRefresh(): void;
export declare function startCropBoostTracker(): void;
export declare function stopCropBoostTracker(): void;
/**
 * Format time estimate for display
 */
export declare function formatTimeEstimate(minutes: number): string;
/**
 * Format time range for display (showing percentiles)
 */
export declare function formatTimeRange(p10: number, p50: number, p90: number): string;
/**
 * Format countdown for live timer display
 */
export declare function formatCountdown(targetTimestamp: number): {
    text: string;
    isOverdue: boolean;
};
/**
 * Get list of available crop species in garden
 */
export declare function getAvailableSpecies(): string[];
//# sourceMappingURL=cropBoostTracker.d.ts.map