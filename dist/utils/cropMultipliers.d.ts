export type MutationCategory = 'color' | 'weather' | 'time';
export interface MutationDefinition {
    readonly name: string;
    readonly category: MutationCategory;
    readonly multiplier: number;
    readonly aliases?: readonly string[];
}
export interface MutationEntry {
    readonly definition: MutationDefinition;
    readonly sourceName: string;
}
export interface MutationMultiplierBreakdown {
    readonly color: MutationEntry | null;
    readonly weather: MutationEntry | null;
    readonly time: MutationEntry | null;
    readonly combo: WeatherTimeCombination | null;
    readonly totalMultiplier: number;
}
export interface WeatherTimeCombination {
    readonly weather: MutationDefinition;
    readonly time: MutationDefinition;
    readonly multiplier: number;
}
export declare function normalizeMutationName(input: string | null | undefined): string | null;
export declare function resolveMutation(input: string | null | undefined): MutationDefinition | null;
export declare function classifyMutations(inputs: readonly string[] | null | undefined): {
    colors: MutationEntry[];
    weathers: MutationEntry[];
    times: MutationEntry[];
    unknown: readonly string[];
};
export declare function computeMutationMultiplier(inputs: readonly string[] | null | undefined): MutationMultiplierBreakdown;
export declare function getAllMutationDefinitions(): readonly MutationDefinition[];
export declare function getWeatherTimeCombinations(): readonly WeatherTimeCombination[];
//# sourceMappingURL=cropMultipliers.d.ts.map