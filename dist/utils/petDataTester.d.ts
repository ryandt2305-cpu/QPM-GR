import { getActivePetInfos } from '../store/pets';
/**
 * Comprehensive pet statistics for comparison
 */
export interface DetailedPetStats {
    petId: string | null;
    name: string | null;
    species: string | null;
    location: 'active' | 'inventory' | 'hutch';
    slotIndex: number;
    currentStrength: number | null;
    maxStrength: number | null;
    targetScale: number | null;
    maxScale: number | null;
    strengthProgress: number | null;
    maturityTime: number | null;
    xp: number | null;
    level: number | null;
    xpToNextLevel: number | null;
    hungerPct: number | null;
    hungerValue: number | null;
    hungerMax: number | null;
    hungerDepletionRate: number | null;
    feedsPerHour: number | null;
    timeUntilStarving: number | null;
    mutations: string[];
    mutationCount: number;
    hasGold: boolean;
    hasRainbow: boolean;
    abilities: AbilityStats[];
    abilityCount: number;
    position: {
        x: number | null;
        y: number | null;
    } | null;
    updatedAt: number;
    raw: unknown;
}
/**
 * Detailed ability statistics
 */
export interface AbilityStats {
    id: string;
    name: string;
    tier: number | null;
    baseName: string;
    category: string;
    trigger: string;
    baseProbability: number | null;
    effectiveProbability: number | null;
    rollPeriodMinutes: number | null;
    procsPerHour: number | null;
    procsPerDay: number | null;
    timeBetweenProcs: number | null;
    effectLabel: string | null;
    effectBaseValue: number | null;
    effectSuffix: string | null;
    effectiveValue: number | null;
    effectUnit: string | null;
    valuePerHour: number | null;
    valuePerDay: number | null;
    gardenValuePerProc: number | null;
    gardenValueDetail: string | null;
    notes: string | null;
}
/**
 * Get detailed statistics for a pet
 */
export declare function getDetailedPetStats(petInfo: ReturnType<typeof getActivePetInfos>[0]): DetailedPetStats;
/**
 * TEST COMMAND: Get all active pets with detailed statistics
 *
 * Usage in console:
 *   window.testPetData()
 */
export declare function testPetData(): void;
/**
 * TEST COMMAND: Compare two pets side-by-side
 *
 * Usage in console:
 *   window.testComparePets(0, 1)  // Compare slot 0 vs slot 1
 */
export declare function testComparePets(slotIndexA: number, slotIndexB: number): void;
/**
 * TEST COMMAND: List all available ability definitions
 *
 * Usage in console:
 *   window.testAbilityDefinitions()
 */
export declare function testAbilityDefinitions(): void;
//# sourceMappingURL=petDataTester.d.ts.map