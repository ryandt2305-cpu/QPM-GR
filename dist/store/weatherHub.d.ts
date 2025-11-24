import { DetailedWeather } from '../utils/weatherDetection';
export type WeatherSnapshot = {
    kind: DetailedWeather;
    raw: 'weather' | 'noweather';
    hash: string | null;
    canvasPresent: boolean;
    timestamp: number;
    source: 'atom' | 'canvas' | 'unknown';
    label: string | null;
    startedAt: number | null;
    expectedEndAt: number | null;
};
export declare function startWeatherHub(): void;
export declare function stopWeatherHub(): void;
export declare function refreshWeatherState(): void;
export declare function onWeatherSnapshot(callback: (snapshot: WeatherSnapshot) => void, fireImmediately?: boolean): () => void;
export declare function getWeatherSnapshot(): WeatherSnapshot;
export declare function setWeatherOverride(kind: DetailedWeather, durationMs?: number): void;
//# sourceMappingURL=weatherHub.d.ts.map