import { classifyWeather as baseClassifyWeather } from '../utils/weatherDetection';
export type WeatherPreset = 'primary' | 'alternate';
export interface KeybindData {
    key: string;
    code?: string;
    keyCode?: number;
    ctrlKey?: boolean;
    shiftKey?: boolean;
    altKey?: boolean;
    metaKey?: boolean;
}
export declare const classifyWeather: typeof baseClassifyWeather;
export declare function formatKeybind(data: KeybindData): string;
export declare function simulateKeybind(keybindJson: string): Promise<void>;
export declare function resetWeatherSwapStats(): void;
//# sourceMappingURL=weatherUtils.d.ts.map