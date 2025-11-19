import { ActivePetInfo } from './pets';
export interface XpProcEntry {
    petId: string;
    petName: string;
    species: string;
    abilityId: string;
    xpAmount: number;
    timestamp: number;
}
export interface XpAbilityStats {
    petId: string;
    petName: string;
    species: string;
    abilityId: string;
    abilityName: string;
    strength: number;
    baseXpPerProc: number;
    actualXpPerProc: number;
    baseChancePerMinute: number;
    actualChancePerMinute: number;
    baseChancePerSecond: number;
    actualChancePerSecond: number;
    expectedProcsPerHour: number;
    expectedXpPerHour: number;
    lastProcAt: number | null;
    procCount: number;
    level: number | null;
    currentXp: number | null;
}
export interface XpTrackerConfig {
    speciesXpPerLevel: Record<string, number>;
}
/**
 * Record an XP proc from an ability
 */
export declare function recordXpProc(petId: string, petName: string, species: string, abilityId: string, xpAmount: number): void;
/**
 * Calculate XP statistics for a given pet's XP ability
 */
export declare function calculateXpStats(pet: ActivePetInfo, abilityId: string, abilityName: string, baseChance: number, // Base probability percentage per minute (e.g., 30 for XP Boost I)
baseXp: number): XpAbilityStats;
/**
 * Get total stats for multiple pets with XP abilities
 * Note: Abilities roll independently - they don't "combine" in game logic
 * The combined chance is calculated for display purposes only
 */
export declare function getCombinedXpStats(stats: XpAbilityStats[]): {
    totalXpPerHour: number;
    totalProcsPerHour: number;
    combinedChancePerSecond: number;
    combinedChancePerMinute: number;
    lastProcAt: number | null;
    totalProcCount: number;
};
/**
 * Set XP required per level for a species
 */
export declare function setSpeciesXpPerLevel(species: string, xpPerLevel: number): void;
/**
 * Get XP required per level for a species
 * Automatically calculated based on hours to mature
 */
export declare function getSpeciesXpPerLevel(species: string): number | null;
/**
 * Get all configured species XP per level
 */
export declare function getAllSpeciesXpConfig(): Record<string, number>;
/**
 * Get max scale for a species
 */
export declare function getSpeciesMaxScale(species: string): number | null;
/**
 * Calculate MAX Strength for a pet using targetScale
 * Formula from Aries mod: ((targetScale - 1) / (maxScale - 1)) * 20 + 80
 * This gives a range of 80-100 based on the pet's targetScale
 */
export declare function calculateMaxStrength(targetScale: number | null, species: string): number | null;
/**
 * Calculate time to level up for a pet
 */
export declare function calculateTimeToLevel(currentXp: number, targetXp: number, xpPerHour: number): {
    hours: number;
    minutes: number;
    totalMinutes: number;
} | null;
/**
 * Subscribe to XP tracker updates
 */
export declare function onXpTrackerUpdate(callback: () => void): () => void;
/**
 * Initialize XP tracker from storage
 */
export declare function initializeXpTracker(): void;
/**
 * Clear all XP proc history
 */
export declare function clearXpProcHistory(): void;
/**
 * Get all XP procs for debugging
 */
export declare function getXpProcHistory(): XpProcEntry[];
//# sourceMappingURL=xpTracker.d.ts.map