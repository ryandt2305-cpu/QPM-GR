// src/data/weatherEvents.ts
// Weather event data from the game

export interface WeatherEvent {
  name: string;
  baseChance: number; // Base chance to apply mutation to each eligible crop (%)
  mutationTypes: string[]; // Possible mutations this weather can apply
  frequency: string; // How often this weather occurs
  duration: number; // Duration in minutes
}

export const WEATHER_EVENTS: Record<string, WeatherEvent> = {
  sunny: {
    name: 'Sunny',
    baseChance: 0,
    mutationTypes: [],
    frequency: 'default',
    duration: 5,
  },
  rain: {
    name: 'Rain',
    baseChance: 7, // 7% base chance per crop
    mutationTypes: ['wet', 'frozen'], // Wet, or Frozen if crop already has Chilled
    frequency: '75% chance every 20-35min',
    duration: 5,
  },
  frost: {
    name: 'Frost',
    baseChance: 7, // 7% base chance per crop
    mutationTypes: ['chilled', 'frozen'], // Chilled, or Frozen if crop already has Wet
    frequency: '25% chance every 20-35min',
    duration: 5,
  },
  dawn: {
    name: 'Dawn',
    baseChance: 1, // 1% base chance per crop
    mutationTypes: ['dawnlit'],
    frequency: '67% chance every 4 hours',
    duration: 10,
  },
  amber: {
    name: 'Amber Moon',
    baseChance: 1, // 1% base chance per crop
    mutationTypes: ['amberlit'],
    frequency: '33% chance every 4 hours',
    duration: 10,
  },
};

// On average, 30% of applicable crops get the modifier during a weather event
export const AVERAGE_WEATHER_PROC_RATE = 0.30;
