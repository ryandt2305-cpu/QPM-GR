export interface WeatherEvent {
    name: string;
    baseChance: number;
    mutationTypes: string[];
    frequency: string;
    duration: number;
}
export declare const WEATHER_EVENTS: Record<string, WeatherEvent>;
export declare const AVERAGE_WEATHER_PROC_RATE = 0.3;
//# sourceMappingURL=weatherEvents.d.ts.map