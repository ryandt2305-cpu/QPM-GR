export declare const WEATHER_CANVAS_SELECTORS: readonly string[];
export type WeatherEventCategory = 'base' | 'weather' | 'lunar';
export interface WeatherEventDefinition {
    id: string;
    label: string;
    normalized: string;
    kind: DetailedWeather;
    category: WeatherEventCategory;
    durationMs: number | null;
    rawState: 'weather' | 'noweather';
    aliases: string[];
}
export declare const WEATHER_EVENT_DEFINITIONS: readonly WeatherEventDefinition[];
export declare function normalizeWeatherLabel(value: string | null | undefined): string;
export declare function getWeatherDefinitionFromLabel(value: string | null | undefined): WeatherEventDefinition | null;
export declare function classifyWeatherFromLabel(value: string | null | undefined): DetailedWeather;
export declare function findWeatherCanvas(): HTMLCanvasElement | null;
export declare function isCanvasDrawn(canvas: HTMLCanvasElement): boolean;
export declare function getCanvasHash(canvas: HTMLCanvasElement): string;
export declare function classifyWeather(canvas: HTMLCanvasElement): 'weather' | 'noweather';
export type DetailedWeather = 'sunny' | 'rain' | 'snow' | 'dawn' | 'amber' | 'unknown';
export declare function detectDetailedWeather(canvas: HTMLCanvasElement): DetailedWeather;
//# sourceMappingURL=weatherDetection.d.ts.map