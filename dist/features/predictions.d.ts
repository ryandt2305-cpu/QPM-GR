export interface PetLevelPrediction {
    petId: string;
    petName: string;
    species: string;
    currentLevel: number;
    maxLevel: number;
    currentXP: number;
    totalXPNeeded: number;
    xpGainRate: number;
    xpRemaining: number;
    estimatedCompletionAt: number | null;
    confidence: 'high' | 'medium' | 'low' | 'none';
}
export interface GoalPrediction {
    goalId: string;
    description: string;
    type: string;
    current: number;
    target: number;
    remaining: number;
    progressRate: number;
    estimatedCompletionAt: number | null;
    confidence: 'high' | 'medium' | 'low' | 'none';
}
export interface AbilityPrediction {
    abilityId: string;
    abilityName: string;
    currentProcs: number;
    procsPerHour: number;
    milestones: Array<{
        target: number;
        estimatedAt: number | null;
    }>;
}
export interface PredictionsSnapshot {
    petPredictions: PetLevelPrediction[];
    goalPredictions: GoalPrediction[];
    abilityPredictions: AbilityPrediction[];
    updatedAt: number;
}
export declare function initializePredictions(): void;
export declare function getPredictionsSnapshot(): PredictionsSnapshot;
export declare function subscribeToPredictions(listener: (snapshot: PredictionsSnapshot) => void): () => void;
export declare function forceRecalculatePredictions(): void;
export declare function resetPredictions(): void;
/**
 * Format ETA timestamp into human-readable string
 */
export declare function formatETA(timestamp: number | null): string;
//# sourceMappingURL=predictions.d.ts.map