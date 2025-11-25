export type VariantDifficulty = 'easy' | 'medium' | 'hard' | 'very-hard' | 'impossible';
export interface SpeciesRecommendation {
    species: string;
    type: 'produce' | 'pet';
    priority: 'high' | 'medium' | 'low';
    missingVariants: string[];
    completionPct: number;
    difficulty: VariantDifficulty;
    estimatedTime: string;
    strategy: string;
    reasons: string[];
    harvestAdvice?: string;
}
export interface JournalStrategy {
    recommendedFocus: SpeciesRecommendation[];
    fastestPath: {
        steps: SpeciesRecommendation[];
        estimatedTime: string;
        expectedCompletion: number;
    };
    lowHangingFruit: SpeciesRecommendation[];
    longTermGoals: SpeciesRecommendation[];
}
/**
 * Generate complete journal strategy with recommendations
 */
export declare function generateJournalStrategy(): Promise<JournalStrategy | null>;
/**
 * Get difficulty badge emoji
 */
export declare function getDifficultyEmoji(difficulty: VariantDifficulty): string;
/**
 * Get difficulty description
 */
export declare function getDifficultyDescription(difficulty: VariantDifficulty): string;
/**
 * Get priority badge emoji
 */
export declare function getPriorityEmoji(priority: 'high' | 'medium' | 'low'): string;
//# sourceMappingURL=journalRecommendations.d.ts.map