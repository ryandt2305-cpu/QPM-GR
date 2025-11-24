import { WeatherSnapshot } from '../store/weatherHub';
import { MutationActiveWeather, MutationSummary, MutationWeatherWindow } from '../store/mutationSummary';
export interface MutationConfig {
    enabled: boolean;
    showNotifications: boolean;
    highlightPlants: boolean;
}
export type MutationLetter = 'F' | 'W' | 'C' | 'D' | 'A' | 'R' | 'G';
export type MutationStage = 'wet' | 'dawn' | 'amber';
export interface MutationStageProgress {
    complete: number;
    total: number;
}
export interface PlantSlotState {
    letters: MutationLetter[];
    hasFrozen: boolean;
    hasWet: boolean;
    hasChilled: boolean;
    hasDawnlit: boolean;
    hasAmberlit: boolean;
    hasDawnbound: boolean;
    hasAmberbound: boolean;
    hasRainbow: boolean;
    hasGold: boolean;
    progress: Partial<Record<MutationStage, MutationStageProgress>>;
}
export interface PlantData {
    name: string;
    mutations: string;
    element: Element;
    fruitCount: number;
    slotStates: PlantSlotState[];
    slotSource: 'inventory' | 'fallback' | 'garden';
    domMutationCounts: Record<MutationLetter, number>;
    domBoldCounts: Record<'D' | 'A', number>;
}
export type WeatherType = 'rain' | 'snow' | 'dawn' | 'amber' | 'sunny' | 'unknown';
export declare function startMutationReminder(): void;
export declare function setMutationReminderEnabled(enabled: boolean): void;
export declare function setStatusCallback(callback: (status: string) => void): void;
export declare function getConfig(): MutationConfig;
export declare function getCurrentWeather(): WeatherType;
/**
 * Simulate a weather change for testing/debugging
 * This bypasses the weather detection and forces a weather type
 */
export declare function simulateWeather(weather: WeatherType): Promise<void>;
export declare function checkForMutations(): Promise<void>;
export declare function resolveWeatherDurationMs(weather: WeatherType): number | null;
export declare function deriveWeatherWindowFromSnapshot(weather: WeatherType, snapshot: WeatherSnapshot | null): MutationWeatherWindow | null;
export declare function computeSlotStateFromMutationNames(mutations: string[]): PlantSlotState;
export declare function createMutationCountMap(initial?: number): Record<MutationLetter, number>;
export declare function combineMutationSources(slotStates: PlantSlotState[], domCounts: Record<MutationLetter, number>, domBoldCounts: Record<'D' | 'A', number>): string;
export type MutationSummaryCollector = (weather: MutationActiveWeather, plant: PlantData, stats: {
    pendingFruit: number;
    needsSnowFruit: number;
    tag?: string;
}) => void;
export declare function buildMutationSummary(plants: PlantData[], activeWeather: WeatherType, weatherWindow?: MutationWeatherWindow | null, collect?: MutationSummaryCollector): MutationSummary;
/**
 * Manual check for mutations (triggered by UI button)
 */
export declare function manualCheckMutations(): Promise<void>;
//# sourceMappingURL=mutationReminder.d.ts.map