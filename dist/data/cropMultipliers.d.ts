export type MutationType = 'golden' | 'rainbow';
export type WeatherCondition = 'wet' | 'chilled' | 'frozen' | 'dawnlit' | 'dawnbound' | 'amberlit' | 'amberbound';
export interface MultiplierCombination {
    mutation?: MutationType;
    weather?: WeatherCondition;
    multiplier: number;
}
export declare const BASE_MULTIPLIERS: {
    none: number;
    golden: number;
    rainbow: number;
    wet: number;
    chilled: number;
    frozen: number;
    dawnlit: number;
    dawnbound: number;
    amberlit: number;
    amberbound: number;
};
export declare const COMBINED_MULTIPLIERS: Record<string, number>;
/**
 * Calculate the multiplier for a given combination of mutation and weather conditions
 */
export declare function calculateMultiplier(mutation: MutationType | null, weatherConditions: WeatherCondition[]): number;
/**
 * Get the most valuable weather mutation for a crop
 * Returns the weather condition and resulting multiplier
 */
export declare function getMostValuableWeatherMutation(currentMutation: MutationType | null, currentWeather: WeatherCondition[]): {
    weather: WeatherCondition;
    multiplier: number;
    weatherEventName: string;
} | null;
//# sourceMappingURL=cropMultipliers.d.ts.map