export interface PersonalRecords {
    fastestLevelUp: {
        species: string;
        timeMs: number;
        fromLevel: number;
        toLevel: number;
        recordedAt: number;
    } | null;
    mostProcsInSession: {
        count: number;
        abilityId: string;
        recordedAt: number;
    } | null;
    highestValueMutation: {
        type: 'gold' | 'rainbow';
        species: string;
        estimatedValue: number;
        recordedAt: number;
    } | null;
    bestXpGainRate: {
        xpPerHour: number;
        species: string;
        recordedAt: number;
    } | null;
    longestSession: {
        duration: number;
        recordedAt: number;
    } | null;
}
export type GoalType = 'pet_level' | 'collect_items' | 'earn_coins' | 'get_procs';
export interface Goal {
    id: string;
    type: GoalType;
    target: number;
    current: number;
    description: string;
    createdAt: number;
    completedAt: number | null;
    estimatedCompletion: number | null;
    petSpecies?: string;
    itemName?: string;
    abilityId?: string;
}
export interface ETAPrediction {
    petLevelUp: Map<string, {
        currentLevel: number;
        nextLevel: number;
        currentXp: number;
        targetXp: number;
        xpNeeded: number;
        xpPerHour: number;
        estimatedHours: number;
        estimatedTimestamp: number;
    }>;
    coinGoals: Map<string, {
        currentCoins: number;
        targetCoins: number;
        coinsNeeded: number;
        coinsPerHour: number;
        estimatedHours: number;
        estimatedTimestamp: number;
    }>;
    nextAbilityProc: Map<string, {
        abilityId: string;
        abilityName: string;
        avgTimeBetweenProcs: number;
        lastProcAt: number;
        estimatedNextProc: number;
    }>;
}
export interface TimeComparison {
    thisSession: {
        value: number;
        label: string;
    };
    lastSession: {
        value: number;
        label: string;
    } | null;
    percentChange: number;
}
export interface SpeciesComparison {
    species: string;
    avgXpRate: number;
    avgAbilityValue: number;
    sampleSize: number;
}
export interface ComparativeAnalytics {
    xpGain: TimeComparison;
    procCount: TimeComparison;
    sessionValue: TimeComparison;
    speciesRankings: SpeciesComparison[];
    topSpecies: SpeciesComparison | null;
}
export interface MutationByWeather {
    weatherType: string;
    mutationCount: number;
    successRate: number;
    avgValue: number;
    bestMutation: string | null;
}
export interface MutationAnalytics {
    byWeather: MutationByWeather[];
    totalMutations: number;
    mostValuableWeather: string | null;
    bestTimeForMutations: number | null;
}
export interface ComprehensiveSnapshot {
    records: PersonalRecords;
    goals: Goal[];
    predictions: ETAPrediction;
    comparisons: ComparativeAnalytics;
    mutations: MutationAnalytics;
    updatedAt: number;
}
export declare function addGoal(goal: Omit<Goal, 'id' | 'createdAt' | 'completedAt' | 'estimatedCompletion'>): string;
export declare function removeGoal(id: string): void;
export declare function updateGoalProgress(id: string, current: number): void;
export declare function recordLevelUp(species: string, fromLevel: number, toLevel: number, timeMs: number): void;
export declare function recordMutation(type: 'gold' | 'rainbow', species: string, estimatedValue: number): void;
export declare function initializeComprehensiveAnalytics(): void;
export declare function getComprehensiveSnapshot(): ComprehensiveSnapshot;
export declare function subscribeToComprehensiveAnalytics(listener: (snapshot: ComprehensiveSnapshot) => void): () => void;
export declare function resetComprehensiveAnalytics(keepRecords?: boolean): void;
//# sourceMappingURL=comprehensiveAnalytics.d.ts.map