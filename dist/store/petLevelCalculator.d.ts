import { ActivePetInfo } from './pets';
interface XPSnapshot {
    xp: number;
    timestamp: number;
}
interface LevelEstimate {
    currentLevel: number | null;
    maxLevel: number;
    confidence: 'high' | 'medium' | 'low' | 'none';
    totalXPNeeded: number | null;
    xpGainRate: number | null;
}
/**
 * Record XP observation for a pet
 */
export declare function recordPetXP(pet: ActivePetInfo): void;
/**
 * Estimate pet level using XP gain rate and time-to-mature
 */
export declare function estimatePetLevel(pet: ActivePetInfo): LevelEstimate;
/**
 * Alternative: Estimate level from strength values
 * If we know current strength and max strength, we can estimate level
 */
export declare function estimateLevelFromStrength(currentStrength: number, maxStrength: number, baseStrength?: number): number | null;
/**
 * Clear XP history for a pet
 */
export declare function clearPetXPHistory(petId: string): void;
/**
 * Get XP history for debugging
 */
export declare function getPetXPHistory(petId: string): XPSnapshot[];
export {};
//# sourceMappingURL=petLevelCalculator.d.ts.map