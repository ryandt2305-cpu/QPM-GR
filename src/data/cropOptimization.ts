// Crop harvest optimization strategies
// Source: Community spreadsheet by Mega Matt EX
// Ranked by $/Hr per plant efficiency
// Last Updated: 2025-11-25

/**
 * Harvest Strategy Types
 */
export type HarvestStrategy =
  | 'freeze-and-sell'      // "Just put some ice on that" - Worth waiting for Frozen
  | 'sell-when-mature'     // "Pick that bad boy" - Sell immediately when mature
  | 'freeze-if-gold';      // "Pick that bad boy (Freeze if Gold)" - Conditional strategy

/**
 * Crop Optimization Data
 * Includes base rate, frozen value, and recommended strategy
 */
export interface CropOptimizationData {
  species: string;
  baseRatePerHour: number;
  frozenValuePerHour: number;
  amberValuePerHour: number;
  rank: number;
  strategy: HarvestStrategy;
}

/**
 * Complete crop optimization dataset
 * Ranked by $/Hr per plant efficiency
 */
export const CROP_OPTIMIZATION: Record<string, CropOptimizationData> = {
  // Top tier - Always freeze (Rank 1-4)
  'Moonbinder': {
    species: 'Moonbinder',
    baseRatePerHour: 557746,
    frozenValuePerHour: 4615385,
    amberValuePerHour: 1622001,
    rank: 1,
    strategy: 'freeze-and-sell',
  },
  'Dawnbinder': {
    species: 'Dawnbinder',
    baseRatePerHour: 309859,
    frozenValuePerHour: 2564103,
    amberValuePerHour: 90112,
    rank: 2,
    strategy: 'freeze-and-sell',
  },
  'Starweaver': {
    species: 'Starweaver',
    baseRatePerHour: 281690,
    frozenValuePerHour: 2331002,
    amberValuePerHour: 819193,
    rank: 3,
    strategy: 'freeze-and-sell',
  },
  'Sunflower': {
    species: 'Sunflower',
    baseRatePerHour: 100000,
    frozenValuePerHour: 503356,
    amberValuePerHour: 73478,
    rank: 4,
    strategy: 'freeze-and-sell',
  },

  // High tier - Always freeze (Rank 7-8, 17-18, 20, 27, 30)
  'Cactus': {
    species: 'Cactus',
    baseRatePerHour: 104400,
    frozenValuePerHour: 263636,
    amberValuePerHour: 26497,
    rank: 7,
    strategy: 'freeze-and-sell',
  },
  'Bamboo': {
    species: 'Bamboo',
    baseRatePerHour: 41667,
    frozenValuePerHour: 257732,
    amberValuePerHour: 47490,
    rank: 8,
    strategy: 'freeze-and-sell',
  },
  'Mushroom': {
    species: 'Mushroom',
    baseRatePerHour: 6667,
    frozenValuePerHour: 50955,
    amberValuePerHour: 14053,
    rank: 17,
    strategy: 'freeze-and-sell',
  },
  'PassionFruit': {
    species: 'PassionFruit',
    baseRatePerHour: 32667,
    frozenValuePerHour: 43109,
    amberValuePerHour: 3769,
    rank: 18,
    strategy: 'freeze-and-sell',
  },
  'Lemon': {
    species: 'Lemon',
    baseRatePerHour: 14286,
    frozenValuePerHour: 24077,
    amberValuePerHour: 2191,
    rank: 20,
    strategy: 'freeze-and-sell',
  },
  'Banana': {
    species: 'Banana',
    baseRatePerHour: 2000,
    frozenValuePerHour: 4043,
    amberValuePerHour: 382,
    rank: 27,
    strategy: 'freeze-and-sell',
  },
  'Coconut': {
    species: 'Coconut',
    baseRatePerHour: 470,
    frozenValuePerHour: 792,
    amberValuePerHour: 72,
    rank: 30,
    strategy: 'freeze-and-sell',
  },
  'Apple': {
    species: 'Apple',
    baseRatePerHour: 49,
    frozenValuePerHour: 156,
    amberValuePerHour: 17,
    rank: 31,
    strategy: 'freeze-and-sell',
  },

  // Conditional - Freeze only if Gold (Rank 6, 9-14, 16, 21, 23, 25)
  'Lily': {
    species: 'Lily',
    baseRatePerHour: 301845,
    frozenValuePerHour: 26950,
    amberValuePerHour: 2080,
    rank: 6,
    strategy: 'freeze-if-gold',
  },
  'BurrosTail': {
    species: 'BurrosTail',
    baseRatePerHour: 216000,
    frozenValuePerHour: 12094,
    amberValuePerHour: 930,
    rank: 9,
    strategy: 'freeze-if-gold',
  },
  'DragonFruit': {
    species: 'DragonFruit',
    baseRatePerHour: 155909,
    frozenValuePerHour: 73605,
    amberValuePerHour: 5895,
    rank: 10,
    strategy: 'freeze-if-gold',
  },
  'Lychee': {
    species: 'Lychee',
    baseRatePerHour: 155556,
    frozenValuePerHour: 143149,
    amberValuePerHour: 11997,
    rank: 11,
    strategy: 'freeze-if-gold',
  },
  'Echeveria': {
    species: 'Echeveria',
    baseRatePerHour: 138000,
    frozenValuePerHour: 6188,
    amberValuePerHour: 476,
    rank: 12,
    strategy: 'freeze-if-gold',
  },
  'Squash': {
    species: 'Squash',
    baseRatePerHour: 75600,
    frozenValuePerHour: 8419,
    amberValuePerHour: 651,
    rank: 14,
    strategy: 'freeze-if-gold',
  },
  'Pepper': {
    species: 'Pepper',
    baseRatePerHour: 70887,
    frozenValuePerHour: 23166,
    amberValuePerHour: 1829,
    rank: 16,
    strategy: 'freeze-if-gold',
  },
  'Grape': {
    species: 'Grape',
    baseRatePerHour: 18893,
    frozenValuePerHour: 9113,
    amberValuePerHour: 731,
    rank: 21,
    strategy: 'freeze-if-gold',
  },
  'Watermelon': {
    species: 'Watermelon',
    baseRatePerHour: 13540,
    frozenValuePerHour: 3563,
    amberValuePerHour: 280,
    rank: 23,
    strategy: 'freeze-if-gold',
  },
  'Pumpkin': {
    species: 'Pumpkin',
    baseRatePerHour: 6343,
    frozenValuePerHour: 4635,
    amberValuePerHour: 381,
    rank: 25,
    strategy: 'freeze-if-gold',
  },

  // Low value - Sell immediately (Rank 5, 13, 15, 19, 22, 24, 26, 28-29)
  'Tulip': {
    species: 'Tulip',
    baseRatePerHour: 394457,
    frozenValuePerHour: 1036,
    amberValuePerHour: 79,
    rank: 5,
    strategy: 'sell-when-mature',
  },
  'Daffodil': {
    species: 'Daffodil',
    baseRatePerHour: 78480,
    frozenValuePerHour: 1470,
    amberValuePerHour: 113,
    rank: 13,
    strategy: 'sell-when-mature',
  },
  'Delphinium': {
    species: 'Delphinium',
    baseRatePerHour: 73385,
    frozenValuePerHour: 716,
    amberValuePerHour: 55,
    rank: 15,
    strategy: 'sell-when-mature',
  },
  'Aloe': {
    species: 'Aloe',
    baseRatePerHour: 24800,
    frozenValuePerHour: 418,
    amberValuePerHour: 32,
    rank: 19,
    strategy: 'sell-when-mature',
  },
  'Carrot': {
    species: 'Carrot',
    baseRatePerHour: 18000,
    frozenValuePerHour: 27,
    amberValuePerHour: 2,
    rank: 22,
    strategy: 'sell-when-mature',
  },
  'Strawberry': {
    species: 'Strawberry',
    baseRatePerHour: 7200,
    frozenValuePerHour: 41,
    amberValuePerHour: 3,
    rank: 24,
    strategy: 'sell-when-mature',
  },
  'Blueberry': {
    species: 'Blueberry',
    baseRatePerHour: 4436,
    frozenValuePerHour: 67,
    amberValuePerHour: 5,
    rank: 26,
    strategy: 'sell-when-mature',
  },
  'Corn': {
    species: 'Corn',
    baseRatePerHour: 2880,
    frozenValuePerHour: 49,
    amberValuePerHour: 4,
    rank: 28,
    strategy: 'sell-when-mature',
  },
  'Tomato': {
    species: 'Tomato',
    baseRatePerHour: 2430,
    frozenValuePerHour: 55,
    amberValuePerHour: 4,
    rank: 29,
    strategy: 'sell-when-mature',
  },
};

/**
 * Get harvest strategy for a crop species
 */
export function getHarvestStrategy(species: string): HarvestStrategy | null {
  const data = CROP_OPTIMIZATION[species];
  return data?.strategy ?? null;
}

/**
 * Get crops by strategy type
 */
export function getCropsByStrategy(strategy: HarvestStrategy): string[] {
  return Object.values(CROP_OPTIMIZATION)
    .filter(crop => crop.strategy === strategy)
    .sort((a, b) => a.rank - b.rank)
    .map(crop => crop.species);
}

/**
 * Get strategy description for UI
 */
export function getStrategyDescription(strategy: HarvestStrategy): string {
  switch (strategy) {
    case 'freeze-and-sell':
      return 'Wait for Frozen mutation, then sell (high value gain)';
    case 'freeze-if-gold':
      return 'Freeze only if Gold mutation, otherwise sell when mature';
    case 'sell-when-mature':
      return 'Sell immediately when mature (not worth waiting for mutations)';
  }
}

/**
 * Calculate expected value gain from freezing
 */
export function getFreezingValueGain(species: string): number {
  const data = CROP_OPTIMIZATION[species];
  if (!data) return 0;
  return data.frozenValuePerHour - data.baseRatePerHour;
}

/**
 * Determine if crop is worth freezing
 */
export function isWorthFreezing(species: string, hasGoldMutation: boolean = false): boolean {
  const data = CROP_OPTIMIZATION[species];
  if (!data) return false;

  if (data.strategy === 'freeze-and-sell') return true;
  if (data.strategy === 'freeze-if-gold') return hasGoldMutation;
  return false;
}

/**
 * Get top N most valuable crops to freeze
 */
export function getTopCropsToFreeze(limit: number = 10): CropOptimizationData[] {
  return Object.values(CROP_OPTIMIZATION)
    .filter(crop => crop.strategy === 'freeze-and-sell')
    .sort((a, b) => a.rank - b.rank)
    .slice(0, limit);
}
