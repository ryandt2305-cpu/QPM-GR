import { GardenSnapshot } from './gardenBridge';
export declare function calculateMutationMultiplier(mutations: string[] | null | undefined): number;
export declare function calculateGardenValue(snapshot: GardenSnapshot | null | undefined, friendBonus?: number): number;
export declare function formatCoins(value: number): string;
export declare function formatCoinsAbbreviated(value: number): string;
export declare function getBaseValue(species: string): number | undefined;
export declare function calculatePlantValue(species: string, scale: number | undefined, mutations: string[] | null | undefined, friendBonus?: number): number;
//# sourceMappingURL=valueCalculator.d.ts.map