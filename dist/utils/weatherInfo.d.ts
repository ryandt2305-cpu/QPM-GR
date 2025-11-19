export type DetailedWeather = 'sunny' | 'rain' | 'snow' | 'amber' | 'dawn' | string;
export interface WeatherSnapshot {
    kind: string;
    timestamp: number;
    raw?: string;
    startedAt?: number;
    expectedEndAt?: number | null;
    hash?: string;
}
export declare function updateWeatherInfo(kind: string): void;
export declare function getWeatherSnapshot(): WeatherSnapshot | null;
export declare function onWeatherSnapshot(callback?: (snapshot: WeatherSnapshot) => void, fireImmediately?: boolean): () => void;
export declare function mapDetailedWeather(kind: string): DetailedWeather;
//# sourceMappingURL=weatherInfo.d.ts.map