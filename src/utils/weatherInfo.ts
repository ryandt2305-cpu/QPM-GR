// src/utils/weatherInfo.ts - Weather information reading
// This file provides read-only weather information for mutation tracking purposes

export type DetailedWeather = 'sunny' | 'rain' | 'snow' | 'amber' | 'dawn' | string;

export interface WeatherSnapshot {
  kind: string;
  timestamp: number;
  raw?: string;
  startedAt?: number;
  expectedEndAt?: number | null;
  hash?: string;
}

// Simple weather state tracking (read-only)
let currentWeather: WeatherSnapshot | null = null;
const listeners: Set<(snapshot: WeatherSnapshot) => void> = new Set();

export function updateWeatherInfo(kind: string): void {
  const now = Date.now();
  const snapshot: WeatherSnapshot = {
    kind,
    timestamp: now,
    raw: kind,
    startedAt: now,
  };

  currentWeather = snapshot;

  // Notify listeners
  for (const listener of listeners) {
    try {
      listener(snapshot);
    } catch (err) {
      console.error('[WeatherInfo] Listener error:', err);
    }
  }
}

export function getWeatherSnapshot(): WeatherSnapshot | null {
  return currentWeather;
}

export function onWeatherSnapshot(
  callback?: (snapshot: WeatherSnapshot) => void,
  fireImmediately?: boolean
): () => void {
  if (callback) {
    listeners.add(callback);
    if (fireImmediately && currentWeather) {
      try {
        callback(currentWeather);
      } catch {}
    }
    return () => {
      listeners.delete(callback);
    };
  }
  return () => {};
}

export function mapDetailedWeather(kind: string): DetailedWeather {
  return kind as DetailedWeather;
}

// Initialize with sunny weather as default
updateWeatherInfo('sunny');
