import { WeatherCondition } from '../data/cropMultipliers';
export interface MutationOpportunity {
    cropSpecies: string;
    cropIndex: number;
    currentMutations: string[];
    currentMultiplier: number;
    currentValue: number;
    targetWeather: WeatherCondition;
    targetMultiplier: number;
    targetValue: number;
    valueDifference: number;
    weatherEventName: string;
}
/**
 * Scan the garden and find the most valuable mutation opportunity
 * Returns the crop that would benefit most from a weather mutation
 */
export declare function findBestMutationOpportunity(): MutationOpportunity | null;
/**
 * Format mutation opportunity for display
 */
export declare function formatMutationOpportunity(opportunity: MutationOpportunity | null, petStrength: number): string;
//# sourceMappingURL=gardenScanner.d.ts.map