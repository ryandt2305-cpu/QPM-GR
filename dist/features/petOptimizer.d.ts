import { StrategyCategory } from '../data/abilityStrategies';
export type PetLocation = 'active' | 'inventory' | 'hutch';
export type PetStatus = 'keep' | 'consider' | 'obsolete' | 'upgrade';
export interface CollectedPet {
    id: string;
    name: string | null;
    species: string | null;
    location: PetLocation;
    slotIndex: number;
    strength: number;
    maxStrength: number | null;
    targetScale: number | null;
    xp: number | null;
    level: number | null;
    abilities: string[];
    abilityIds: string[];
    mutations: string[];
    hasGold: boolean;
    hasRainbow: boolean;
    raw: unknown;
}
export interface PetScore {
    total: number;
    granterBonus: number;
    granterType: 'rainbow' | 'gold' | null;
    breakdown: {
        currentStrength: number;
        maxStrength: number;
        potential: number;
        abilityTier: number;
        abilityRarity: number;
        mutation: number;
    };
}
export interface PetComparison {
    pet: CollectedPet;
    score: PetScore;
    status: PetStatus;
    reason: string;
    betterAlternatives: CollectedPet[];
    upgradeOpportunities: string[];
}
export interface OptimizerAnalysis {
    allPets: CollectedPet[];
    comparisons: PetComparison[];
    keep: PetComparison[];
    consider: PetComparison[];
    obsolete: PetComparison[];
    upgrades: PetComparison[];
    strategyPets: Map<StrategyCategory, PetComparison[]>;
    totalPets: number;
    activePets: number;
    inventoryPets: number;
    hutchPets: number;
    obsoleteCount: number;
    upgradeCount: number;
}
export interface OptimizerConfig {
    selectedStrategy: StrategyCategory | 'all';
    showObsoleteOnly: boolean;
    groupBySpecies: boolean;
    sortBy: 'strength' | 'maxStrength' | 'score' | 'location';
    sortDirection: 'asc' | 'desc';
    minStrengthThreshold: number;
    protectedPetIds: Set<string>;
}
export declare function getOptimizerConfig(): OptimizerConfig;
export declare function setOptimizerConfig(updates: Partial<OptimizerConfig>): void;
export declare function protectPet(petId: string): void;
export declare function unprotectPet(petId: string): void;
/**
 * Collect all pets from active slots, inventory, and hutch
 */
export declare function collectAllPets(): Promise<CollectedPet[]>;
/**
 * Calculate comprehensive score for a pet
 * Higher score = more valuable
 */
export declare function calculatePetScore(pet: CollectedPet): PetScore;
/**
 * Analyze all collected pets and determine status (ASYNC version for better performance)
 * Breaks work into chunks to prevent blocking the main thread
 */
export declare function analyzePetsAsync(pets: CollectedPet[], onProgress?: (percent: number) => void): Promise<OptimizerAnalysis>;
/**
 * Analyze all collected pets and determine status (SYNCHRONOUS version - kept for compatibility)
 * NOTE: Use analyzePetsAsync() for better performance to avoid blocking the UI
 */
export declare function analyzePets(pets: CollectedPet[]): OptimizerAnalysis;
/**
 * Get full analysis with caching
 */
export declare function getOptimizerAnalysis(forceRefresh?: boolean, onProgress?: (percent: number) => void): Promise<OptimizerAnalysis>;
export declare function onAnalysisUpdate(callback: (analysis: OptimizerAnalysis) => void): () => void;
export declare function startPetOptimizer(): void;
//# sourceMappingURL=petOptimizer.d.ts.map