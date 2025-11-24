// src/data/gameInfo.ts
// Shared constants and helper formulas extracted from community Gameinfo notes.

export const RAINBOW_GOLD_BASE_CHANCE_PER_MINUTE = 0.0072;
const SECONDS_PER_MINUTE = 60;

export interface RainbowGoldEtaInput {
  strengths: number[];
  uncoloredCropCount: number;
}

export interface RainbowGoldEtaResult {
  triggersPerSecond: number;
  expectedTriggers: number;
  expectedSeconds: number;
}

const harmonicCache = new Map<number, number>();

export function harmonicNumber(n: number): number {
  if (!Number.isFinite(n) || n <= 0) {
    return 0;
  }
  const integer = Math.floor(n);
  if (harmonicCache.has(integer)) {
    return harmonicCache.get(integer)!;
  }
  let sum = 0;
  for (let i = 1; i <= integer; i += 1) {
    sum += 1 / i;
  }
  harmonicCache.set(integer, sum);
  return sum;
}

export function rainbowGoldChancePerSecond(strength: number): number {
  const clampedStrength = Math.max(0, strength);
  const perMinute = RAINBOW_GOLD_BASE_CHANCE_PER_MINUTE * (clampedStrength / 100);
  const probability = 1 - Math.pow(1 - perMinute, 1 / SECONDS_PER_MINUTE);
  return Math.max(0, Math.min(1, probability));
}

export function estimateRainbowGoldEta(input: RainbowGoldEtaInput): RainbowGoldEtaResult {
  const { strengths, uncoloredCropCount } = input;
  const triggersPerSecond = strengths
    .map(rainbowGoldChancePerSecond)
    .reduce((total, value) => total + value, 0);

  const crops = Math.max(1, Math.round(uncoloredCropCount));
  const expectedTriggers = crops === 1 ? 1 : harmonicNumber(crops);
  const expectedSeconds = triggersPerSecond > 0 ? expectedTriggers / triggersPerSecond : Infinity;

  return {
    triggersPerSecond,
    expectedTriggers,
    expectedSeconds,
  };
}

export const WEATHER_EVENT_CADENCE = {
  rainSnow: {
    windowMinutes: 25,
    eventDurationMinutes: 5,
    rainChance: 0.75,
    snowChance: 0.25,
  },
  lunar: {
    windowMinutes: 240,
    eventDurationMinutes: 10,
    dawnChance: 2 / 3,
    harvestChance: 1 / 3,
  },
};

export const WEATHER_APPLICATION_CHANCES = {
  wet: 1 - Math.pow(0.93, 5),
  chilled: 1 - Math.pow(0.93, 5),
  dawnlit: 1 - Math.pow(0.99, 10),
};

export const WEATHER_LUNAR_MULTIPLIERS = {
  base: {
    Golden: 25,
    Rainbow: 50,
  },
  weather: {
    Wet: 2,
    Chilled: 2,
    Frozen: 10,
  },
  lunar: {
    Dawnlit: 2,
    Dawnbound: 3,
    Amberlit: 5,
    Amberbound: 6,
  },
  combined: {
    'Wet+Dawnlit': 3,
    'Wet+Amberlit': 6,
    'Frozen+Dawnlit': 11,
    'Frozen+Dawnbound': 12,
    'Frozen+Amberlit': 14,
    'Frozen+Amberbound': 15,
  },
};
