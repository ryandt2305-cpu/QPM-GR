import { WeatherType } from '../features/mutationReminder';
export type MutationActiveWeather = Exclude<WeatherType, 'sunny' | 'unknown'>;
export interface MutationWeatherSummary {
    weather: MutationActiveWeather;
    plantCount: number;
    pendingFruitCount: number;
    needsSnowFruitCount?: number;
}
export interface MutationWeatherWindow {
    weather: WeatherType;
    startedAt: number | null;
    expectedEndAt: number | null;
    durationMs: number | null;
    remainingMs: number | null;
}
export interface MutationLunarStats {
    trackedPlantCount: number;
    pendingPlantCount: number;
    mutatedPlantCount: number;
    totalFruitCount: number;
    pendingFruitCount: number;
    mutatedFruitCount: number;
}
export interface MutationSummary {
    timestamp: number;
    activeWeather: WeatherType;
    totals: Record<MutationActiveWeather, MutationWeatherSummary>;
    overallEligiblePlantCount: number;
    overallPendingFruitCount: number;
    overallTrackedPlantCount: number;
    lunar: MutationLunarStats;
    weatherWindow: MutationWeatherWindow | null;
}
export type MutationSummarySource = 'inventory' | 'garden';
export interface MutationSummaryEnvelope {
    source: MutationSummarySource;
    summary: MutationSummary;
}
export type MutationDebugPlantSource = 'inventory' | 'garden' | 'fallback';
export interface MutationDebugWeatherEntry {
    name: string;
    pendingFruit: number;
    needsSnowFruit: number;
    fruitCount: number;
    source: MutationDebugPlantSource;
    tag?: string;
}
export type MutationDebugWeatherMap = Record<MutationActiveWeather, MutationDebugWeatherEntry[]>;
export interface MutationDebugSnapshot {
    source: MutationSummarySource;
    generatedAt: number;
    summary: MutationSummary;
    perWeather: MutationDebugWeatherMap;
    metadata?: {
        scannedPlantCount?: number;
        highlightedPlantCount?: number;
        lunarTrackedPlantCount?: number;
        lunarPendingPlantCount?: number;
        lunarMutatedPlantCount?: number;
        nonLunarMutatedPlantCount?: number;
        dawnPendingFruitCount?: number;
        amberPendingFruitCount?: number;
        notes?: string;
    };
}
export type MutationDebugMetadata = NonNullable<MutationDebugSnapshot['metadata']>;
type MutationSummaryListener = (envelope: MutationSummaryEnvelope) => void;
export declare function createEmptyMutationDebugMap(): MutationDebugWeatherMap;
export declare function updateMutationDebugSnapshot(snapshot: MutationDebugSnapshot): void;
export declare function createMutationDebugMetadata(summary: MutationSummary, extra?: Partial<MutationDebugMetadata>): MutationDebugMetadata;
export declare function publishMutationSummary(source: MutationSummarySource, summary: MutationSummary): void;
export declare function getMutationSummary(source?: MutationSummarySource): MutationSummary | null;
export declare function getAllMutationSummaries(): Partial<Record<MutationSummarySource, MutationSummary>>;
export declare function onMutationSummary(cb: MutationSummaryListener, fireImmediately?: boolean): () => void;
export {};
//# sourceMappingURL=mutationSummary.d.ts.map