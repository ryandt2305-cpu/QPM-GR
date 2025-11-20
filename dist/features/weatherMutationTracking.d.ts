export type WeatherMutationType = 'wet' | 'chilled' | 'frozen' | 'dawnlit' | 'dawnbound' | 'amberlit' | 'amberbound';
export interface WeatherMutationStats {
    wetCount: number;
    wetPerHour: number;
    wetTotalValue: number;
    wetLastAt: number | null;
    chilledCount: number;
    chilledPerHour: number;
    chilledTotalValue: number;
    chilledLastAt: number | null;
    frozenCount: number;
    frozenPerHour: number;
    frozenTotalValue: number;
    frozenLastAt: number | null;
    dawnlitCount: number;
    dawnlitPerHour: number;
    dawnlitTotalValue: number;
    dawnlitLastAt: number | null;
    dawnboundCount: number;
    dawnboundPerHour: number;
    dawnboundTotalValue: number;
    dawnboundLastAt: number | null;
    amberlitCount: number;
    amberlitPerHour: number;
    amberlitTotalValue: number;
    amberlitLastAt: number | null;
    amberboundCount: number;
    amberboundPerHour: number;
    amberboundTotalValue: number;
    amberboundLastAt: number | null;
    sessionValue: number;
    sessionStart: number;
    bestHourValue: number;
    bestHourTime: number | null;
    bestSessionValue: number;
    bestSessionTime: number | null;
}
export interface WeatherMutationSnapshot {
    stats: WeatherMutationStats;
    updatedAt: number;
}
export declare function initializeWeatherMutationTracking(): void;
export declare function clearAllWeatherMutationHistory(): void;
export declare function getWeatherMutationSnapshot(): WeatherMutationSnapshot;
export declare function subscribeToWeatherMutationTracking(listener: (snapshot: WeatherMutationSnapshot) => void): () => void;
export declare function forceRecalculateWeatherMutations(): void;
export declare function resetWeatherMutationTracking(): void;
//# sourceMappingURL=weatherMutationTracking.d.ts.map