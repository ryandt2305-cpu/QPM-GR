// src/data/cropMultipliers.ts
// Crop multiplier data from the game

export type MutationType = 'golden' | 'rainbow';
export type WeatherCondition = 'wet' | 'chilled' | 'frozen' | 'dawnlit' | 'dawnbound' | 'amberlit' | 'amberbound';

export interface MultiplierCombination {
  mutation?: MutationType;
  weather?: WeatherCondition;
  multiplier: number;
}

// Base multipliers
export const BASE_MULTIPLIERS = {
  none: 1,
  // Mutations
  golden: 25,
  rainbow: 50,
  // Weather conditions
  wet: 2,
  chilled: 2,
  frozen: 10,
  dawnlit: 2,
  dawnbound: 3,
  amberlit: 5,
  amberbound: 6,
};

// Combined multipliers (special stacking rules)
export const COMBINED_MULTIPLIERS: Record<string, number> = {
  // Wet/Chilled + Dawn/Amber
  'wet+dawnlit': 3,
  'chilled+dawnlit': 3,
  'wet+amberlit': 6,
  'chilled+amberlit': 6,
  // Frozen + Dawn/Amber
  'frozen+dawnlit': 11,
  'frozen+dawnbound': 12,
  'frozen+amberlit': 14,
  'frozen+amberbound': 15,
  // Golden + Weather
  'golden+wet': 50,
  'golden+chilled': 50,
  'golden+frozen': 250,
  'golden+dawnlit': 50,
  'golden+dawnbound': 75,
  'golden+amberlit': 125,
  'golden+amberbound': 150,
  // Golden + Combined weather
  'golden+wet+dawnlit': 75,
  'golden+chilled+dawnlit': 75,
  'golden+wet+amberlit': 150,
  'golden+chilled+amberlit': 150,
  'golden+frozen+dawnlit': 275,
  'golden+frozen+dawnbound': 300,
  'golden+frozen+amberlit': 350,
  'golden+frozen+amberbound': 375,
  // Rainbow + Weather
  'rainbow+wet': 100,
  'rainbow+chilled': 100,
  'rainbow+frozen': 500,
  'rainbow+dawnlit': 100,
  'rainbow+dawnbound': 150,
  'rainbow+amberlit': 250,
  'rainbow+amberbound': 300,
  // Rainbow + Combined weather
  'rainbow+wet+dawnlit': 150,
  'rainbow+chilled+dawnlit': 150,
  'rainbow+wet+amberlit': 300,
  'rainbow+chilled+amberlit': 300,
  'rainbow+frozen+dawnlit': 550,
  'rainbow+frozen+dawnbound': 600,
  'rainbow+frozen+amberlit': 700,
  'rainbow+frozen+amberbound': 750,
};

/**
 * Calculate the multiplier for a given combination of mutation and weather conditions
 */
export function calculateMultiplier(
  mutation: MutationType | null,
  weatherConditions: WeatherCondition[],
): number {
  if (!mutation && weatherConditions.length === 0) {
    return BASE_MULTIPLIERS.none;
  }

  // Build key for lookup
  const parts: string[] = [];
  if (mutation) parts.push(mutation);
  weatherConditions.sort().forEach((w) => parts.push(w));
  const key = parts.join('+');

  // Check combined multipliers first
  if (COMBINED_MULTIPLIERS[key]) {
    return COMBINED_MULTIPLIERS[key];
  }

  // Otherwise multiply base values
  let multiplier = BASE_MULTIPLIERS.none;
  if (mutation) {
    multiplier *= BASE_MULTIPLIERS[mutation];
  }
  weatherConditions.forEach((w) => {
    multiplier *= BASE_MULTIPLIERS[w];
  });

  return multiplier;
}

/**
 * Get the most valuable weather mutation for a crop
 * Returns the weather condition and resulting multiplier
 */
export function getMostValuableWeatherMutation(
  currentMutation: MutationType | null,
  currentWeather: WeatherCondition[],
): { weather: WeatherCondition; multiplier: number; weatherEventName: string } | null {
  // All possible weather mutations that can be added
  const possibleWeather: Array<{ weather: WeatherCondition; event: string }> = [
    { weather: 'wet', event: 'Rain' },
    { weather: 'chilled', event: 'Frost' },
    { weather: 'frozen', event: 'Rain+Frost' },
    { weather: 'dawnlit', event: 'Dawn' },
    { weather: 'amberlit', event: 'Amber Moon' },
  ];

  let best: { weather: WeatherCondition; multiplier: number; weatherEventName: string } | null = null;

  for (const { weather, event } of possibleWeather) {
    // Skip if crop already has this weather condition
    if (currentWeather.includes(weather)) continue;

    // Skip incompatible combinations
    if (weather === 'dawnlit' && currentWeather.some((w) => w === 'amberlit' || w === 'amberbound')) continue;
    if (weather === 'amberlit' && currentWeather.some((w) => w === 'dawnlit' || w === 'dawnbound')) continue;
    if (weather === 'wet' && currentWeather.includes('chilled')) {
      // This would create frozen
      continue;
    }
    if (weather === 'chilled' && currentWeather.includes('wet')) {
      // This would create frozen
      continue;
    }

    const newWeather = [...currentWeather, weather];
    const newMultiplier = calculateMultiplier(currentMutation, newWeather);

    if (!best || newMultiplier > best.multiplier) {
      best = { weather, multiplier: newMultiplier, weatherEventName: event };
    }
  }

  return best;
}
