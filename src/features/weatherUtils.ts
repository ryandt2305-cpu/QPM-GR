// src/features/weatherUtils.ts
// Weather classification and utility functions

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

// Re-export weather classification utility for mutation tracking
export const classifyWeather = baseClassifyWeather;

// Utility functions
export function formatKeybind(data: KeybindData): string {
  if (!data) return '';

  const parts: string[] = [];
  if (data.ctrlKey) parts.push('Ctrl');
  if (data.shiftKey) parts.push('Shift');
  if (data.altKey) parts.push('Alt');
  if (data.metaKey) parts.push('Meta');

  const key = data.key || '';
  if (key) {
    parts.push(key.length === 1 ? key.toUpperCase() : key);
  }

  return parts.join('+');
}

export async function simulateKeybind(keybindJson: string): Promise<void> {
  // Keybind simulation
}

export function resetWeatherSwapStats(): void {
  // Stats reset
}
