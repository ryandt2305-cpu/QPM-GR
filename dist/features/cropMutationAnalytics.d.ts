interface EligibleCrop {
    species: string;
    scale: number;
    mutations: string[];
    currentValue: number;
    fruitCount: number;
    index: number;
}
interface MutationPotential {
    weather: 'rain' | 'snow' | 'dawn' | 'amber' | null;
    eligibleCrops: EligibleCrop[];
    eligibleFruits: number;
    averageValueGain: number;
    projectedMutationsPerEvent: number;
    baseMutationChance: number;
}
/**
 * Analyze eligible crops for mutation boost during current weather/lunar event
 */
export declare function analyzeCropMutationPotential(): MutationPotential;
export {};
//# sourceMappingURL=cropMutationAnalytics.d.ts.map