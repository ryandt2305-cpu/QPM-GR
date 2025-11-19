// src/features/weatherSwap.ts
// Tracking and display support types

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

// Stub functions that return empty/default values
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
  // No-op in General Release
}

export function resetWeatherSwapStats(): void {
  // No-op in General Release
}
