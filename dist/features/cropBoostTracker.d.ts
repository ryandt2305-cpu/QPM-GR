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
    timeEstimateMin: number;
    timeEstimateMax: number;
    timeEstimateAvg: number;
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
 * Format time range for display
 */
export declare function formatTimeRange(minMinutes: number, maxMinutes: number): string;
/**
 * Get list of available crop species in garden
 */
export declare function getAvailableSpecies(): string[];
//# sourceMappingURL=cropBoostTracker.d.ts.map