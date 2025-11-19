// src/data/petAbilities.ts
// Ability metadata used for tracker projections.

export type AbilityCategory = 'plantGrowth' | 'eggGrowth' | 'xp' | 'coins' | 'misc';

type AbilityTrigger = 'continuous' | 'hatchEgg' | 'sellAllCrops' | 'sellPet' | 'harvest';

export interface AbilityDefinition {
  id: string;
  name: string;
  aliases?: readonly string[];
  category: AbilityCategory;
  trigger: AbilityTrigger;
  baseProbability?: number;
  rollPeriodMinutes?: number;
  effectValuePerProc?: number;
  effectUnit?: 'minutes' | 'xp' | 'coins';
  notes?: string;
  // Wiki effect formula display
  effectLabel?: string; // e.g., "Scale increase", "Growth time reduction", "Coin range"
  effectBaseValue?: number; // e.g., 10 for "10% × STR"
  effectSuffix?: string; // e.g., "%", "m", "" for ranges
}

const ABILITY_DEFINITIONS: AbilityDefinition[] = [
  {
    id: 'ProduceScaleBoost',
    name: 'Crop Size Boost I',
    aliases: ['Crop Size Boost 1'],
    category: 'misc',
    trigger: 'continuous',
    baseProbability: 0.30,
    rollPeriodMinutes: 1,
    effectUnit: 'coins',
    effectLabel: 'Scale increase',
    effectBaseValue: 6.0,
    effectSuffix: '%',
    notes: 'Chance: 0.30% × STR. Effect: 6% size increase × STR, capped at max scale.',
  },
  {
    id: 'ProduceScaleBoostII',
    name: 'Crop Size Boost II',
    aliases: ['Crop Size Boost 2'],
    category: 'misc',
    trigger: 'continuous',
    baseProbability: 0.4,
    rollPeriodMinutes: 1,
    effectUnit: 'coins',
    effectLabel: 'Scale increase',
    effectBaseValue: 10,
    effectSuffix: '%',
    notes: 'Chance: 0.40% × STR. Effect: 10% size increase × STR, capped at max scale.',
  },
  {
    id: 'DoubleHarvest',
    name: 'Double Harvest',
    category: 'misc',
    trigger: 'harvest',
    baseProbability: 5,
  },
  {
    id: 'ProduceEater',
    name: 'Crop Eater',
    category: 'coins',
    trigger: 'continuous',
    baseProbability: 60,
    rollPeriodMinutes: 1,
    notes: 'Cannot estimate coin value without live crop data.',
  },
  {
    id: 'SellBoostI',
    name: 'Sell Boost I',
    aliases: ['Sell Boost 1'],
    category: 'misc',
    trigger: 'sellAllCrops',
    baseProbability: 10,
  },
  {
    id: 'SellBoostII',
    name: 'Sell Boost II',
    aliases: ['Sell Boost 2'],
    category: 'misc',
    trigger: 'sellAllCrops',
    baseProbability: 12,
  },
  {
    id: 'SellBoostIII',
    name: 'Sell Boost III',
    aliases: ['Sell Boost 3'],
    category: 'misc',
    trigger: 'sellAllCrops',
    baseProbability: 14,
  },
  {
    id: 'SellBoostIV',
    name: 'Sell Boost IV',
    aliases: ['Sell Boost 4'],
    category: 'misc',
    trigger: 'sellAllCrops',
    baseProbability: 16,
  },
  {
    id: 'ProduceRefund',
    name: 'Crop Refund',
    category: 'misc',
    trigger: 'sellAllCrops',
    baseProbability: 20,
  },
  {
    id: 'PlantGrowthBoost',
    name: 'Plant Growth Boost I',
    aliases: ['Plant Growth Boost 1'],
    category: 'plantGrowth',
    trigger: 'continuous',
    baseProbability: 24,
    rollPeriodMinutes: 1,
    effectValuePerProc: 3,
    effectUnit: 'minutes',
    effectLabel: 'Growth time reduction',
    effectBaseValue: 3,
    effectSuffix: 'm',
  },
  {
    id: 'PlantGrowthBoostII',
    name: 'Plant Growth Boost II',
    aliases: ['Plant Growth Boost 2'],
    category: 'plantGrowth',
    trigger: 'continuous',
    baseProbability: 27,
    rollPeriodMinutes: 1,
    effectValuePerProc: 5,
    effectUnit: 'minutes',
    effectLabel: 'Growth time reduction',
    effectBaseValue: 5,
    effectSuffix: 'm',
  },
  {
    id: 'ProduceMutationBoost',
    name: 'Crop Mutation Boost I',
    aliases: ['Crop Mutation Boost 1'],
    category: 'misc',
    trigger: 'continuous',
    baseProbability: 0.1,
    rollPeriodMinutes: 1,
    effectUnit: 'coins',
    effectLabel: 'Chance increase',
    effectBaseValue: 10,
    effectSuffix: '%',
    notes: 'Increases the base weather mutation chance (0.1% × STR) by 10% × STR during active weather/lunar events. Only works when weather/lunar event is active. Grants: Wet (Rain), Frozen (Snow), Dawnlit (Dawn), Amberlit (Dusk).',
  },
  {
    id: 'ProduceMutationBoostII',
    name: 'Crop Mutation Boost II',
    aliases: ['Crop Mutation Boost 2'],
    category: 'misc',
    trigger: 'continuous',
    baseProbability: 0.1,
    rollPeriodMinutes: 1,
    effectUnit: 'coins',
    effectLabel: 'Chance increase',
    effectBaseValue: 15,
    effectSuffix: '%',
    notes: 'Increases the base weather mutation chance (0.1% × STR) by 15% × STR during active weather/lunar events. Only works when weather/lunar event is active. Grants: Wet (Rain), Frozen (Snow), Dawnlit (Dawn), Amberlit (Dusk).',
  },
  {
    id: 'PetMutationBoost',
    name: 'Pet Mutation Boost I',
    aliases: ['Pet Mutation Boost 1'],
    category: 'misc',
    trigger: 'hatchEgg',
  },
  {
    id: 'PetMutationBoostII',
    name: 'Pet Mutation Boost II',
    aliases: ['Pet Mutation Boost 2'],
    category: 'misc',
    trigger: 'hatchEgg',
  },
  {
    id: 'GoldGranter',
    name: 'Gold Granter',
    category: 'misc',
    trigger: 'continuous',
    baseProbability: 0.72,
    rollPeriodMinutes: 1,
    effectUnit: 'coins',
    notes: 'Converts a random uncolored crop to Gold using live garden snapshot.',
  },
  {
    id: 'RainbowGranter',
    name: 'Rainbow Granter',
    category: 'misc',
    trigger: 'continuous',
    baseProbability: 0.72,
    rollPeriodMinutes: 1,
    effectUnit: 'coins',
    notes: 'Converts a random uncolored crop to Rainbow using live garden snapshot.',
  },
  {
    id: 'EggGrowthBoost',
    name: 'Egg Growth Boost I',
    aliases: ['Egg Growth Boost 1'],
    category: 'eggGrowth',
    trigger: 'continuous',
    baseProbability: 21,
    rollPeriodMinutes: 1,
    effectValuePerProc: 7,
    effectUnit: 'minutes',
  },
  {
    id: 'EggGrowthBoostII',
    name: 'Egg Growth Boost II',
    aliases: ['Egg Growth Boost 2'],
    category: 'eggGrowth',
    trigger: 'continuous',
    baseProbability: 24,
    rollPeriodMinutes: 1,
    effectValuePerProc: 10,
    effectUnit: 'minutes',
  },
  {
    id: 'EggGrowthBoostIII',
    name: 'Egg Growth Boost III',
    aliases: ['Egg Growth Boost 3'],
    category: 'eggGrowth',
    trigger: 'continuous',
    baseProbability: 27,
    rollPeriodMinutes: 1,
    effectValuePerProc: 13,
    effectUnit: 'minutes',
  },
  {
    id: 'PetAgeBoost',
    name: 'Hatch XP Boost I',
    aliases: ['Hatch XP Boost 1'],
    category: 'xp',
    trigger: 'hatchEgg',
    baseProbability: 50,
    effectValuePerProc: 8000,
    effectUnit: 'xp',
  },
  {
    id: 'PetAgeBoostII',
    name: 'Hatch XP Boost II',
    aliases: ['Hatch XP Boost 2'],
    category: 'xp',
    trigger: 'hatchEgg',
    baseProbability: 60,
    effectValuePerProc: 12000,
    effectUnit: 'xp',
  },
  {
    id: 'PetHatchSizeBoost',
    name: 'Max Strength Boost I',
    aliases: ['Max Strength Boost 1'],
    category: 'misc',
    trigger: 'hatchEgg',
    baseProbability: 12,
  },
  {
    id: 'PetHatchSizeBoostII',
    name: 'Max Strength Boost II',
    aliases: ['Max Strength Boost 2'],
    category: 'misc',
    trigger: 'hatchEgg',
    baseProbability: 14,
  },
  {
    id: 'PetXpBoost',
    name: 'XP Boost I',
    aliases: ['Pet XP Boost I', 'Pet XP Boost 1', 'XP Boost 1'],
    category: 'xp',
    trigger: 'continuous',
    baseProbability: 30,
    rollPeriodMinutes: 1,
    effectValuePerProc: 300,
    effectUnit: 'xp',
  },
  {
    id: 'PetXpBoostII',
    name: 'XP Boost II',
    aliases: ['Pet XP Boost II', 'Pet XP Boost 2', 'XP Boost 2'],
    category: 'xp',
    trigger: 'continuous',
    baseProbability: 35,
    rollPeriodMinutes: 1,
    effectValuePerProc: 400,
    effectUnit: 'xp',
  },
  {
    id: 'HungerRestore',
    name: 'Hunger Restore I',
    aliases: ['Hunger Restore 1'],
    category: 'misc',
    trigger: 'continuous',
    baseProbability: 12,
    rollPeriodMinutes: 1,
  },
  {
    id: 'HungerRestoreII',
    name: 'Hunger Restore II',
    aliases: ['Hunger Restore 2'],
    category: 'misc',
    trigger: 'continuous',
    baseProbability: 14,
    rollPeriodMinutes: 1,
  },
  {
    id: 'HungerBoost',
    name: 'Hunger Boost I',
    aliases: ['Hunger Boost 1'],
    category: 'misc',
    trigger: 'continuous',
    baseProbability: 0,
    rollPeriodMinutes: 1,
  },
  {
    id: 'HungerBoostII',
    name: 'Hunger Boost II',
    aliases: ['Hunger Boost 2'],
    category: 'misc',
    trigger: 'continuous',
    baseProbability: 0,
    rollPeriodMinutes: 1,
  },
  {
    id: 'PetRefund',
    name: 'Pet Refund I',
    aliases: ['Pet Refund 1'],
    category: 'misc',
    trigger: 'sellPet',
    baseProbability: 5,
  },
  {
    id: 'PetRefundII',
    name: 'Pet Refund II',
    aliases: ['Pet Refund 2'],
    category: 'misc',
    trigger: 'sellPet',
    baseProbability: 7,
  },
  {
    id: 'Copycat',
    name: 'Copycat',
    category: 'misc',
    trigger: 'continuous',
    baseProbability: 1,
    rollPeriodMinutes: 1,
  },
  {
    id: 'CoinFinderI',
    name: 'Coin Finder I',
    aliases: ['Coin Finder 1', 'CoinFinder I', 'CoinFinder 1'],
    category: 'coins',
    trigger: 'continuous',
    baseProbability: 35,
    rollPeriodMinutes: 1,
    effectValuePerProc: 120000,
    effectUnit: 'coins',
    effectLabel: 'Coin range',
    effectBaseValue: 120000,
    effectSuffix: '',
  },
  {
    id: 'CoinFinderII',
    name: 'Coin Finder II',
    aliases: ['Coin Finder 2', 'CoinFinder II', 'CoinFinder 2'],
    category: 'coins',
    trigger: 'continuous',
    baseProbability: 13,
    rollPeriodMinutes: 1,
    effectValuePerProc: 1200000,
    effectUnit: 'coins',
    effectLabel: 'Coin range',
    effectBaseValue: 1200000,
    effectSuffix: '',
  },
  {
    id: 'CoinFinderIII',
    name: 'Coin Finder III',
    aliases: ['Coin Finder 3', 'CoinFinder III', 'CoinFinder 3'],
    category: 'coins',
    trigger: 'continuous',
    baseProbability: 6,
    rollPeriodMinutes: 1,
    effectValuePerProc: 10000000,
    effectUnit: 'coins',
    effectLabel: 'Coin range',
    effectBaseValue: 10000000,
    effectSuffix: '',
  },
  {
    id: 'SeedFinderI',
    name: 'Seed Finder I',
    aliases: ['Seed Finder 1', 'SeedFinder I', 'SeedFinder 1'],
    category: 'misc',
    trigger: 'continuous',
    baseProbability: 40,
    rollPeriodMinutes: 1,
  },
  {
    id: 'SeedFinderII',
    name: 'Seed Finder II',
    aliases: ['Seed Finder 2', 'SeedFinder II', 'SeedFinder 2'],
    category: 'misc',
    trigger: 'continuous',
    baseProbability: 20,
    rollPeriodMinutes: 1,
  },
  {
    id: 'SeedFinderIII',
    name: 'Seed Finder III',
    aliases: ['Seed Finder 3', 'SeedFinder III', 'SeedFinder 3'],
    category: 'misc',
    trigger: 'continuous',
    baseProbability: 10,
    rollPeriodMinutes: 1,
  },
  {
    id: 'SeedFinderIV',
    name: 'Seed Finder IV',
    aliases: ['Seed Finder 4', 'SeedFinder IV', 'SeedFinder 4'],
    category: 'misc',
    trigger: 'continuous',
    baseProbability: 0.01,
    rollPeriodMinutes: 1,
  },
];

const abilityLookup = new Map<string, AbilityDefinition>();

const normalizeKey = (value: string): string => value.trim().toLowerCase();

for (const definition of ABILITY_DEFINITIONS) {
  abilityLookup.set(normalizeKey(definition.id), definition);
  abilityLookup.set(normalizeKey(definition.name), definition);
  if (Array.isArray(definition.aliases)) {
    for (const alias of definition.aliases) {
      abilityLookup.set(normalizeKey(alias), definition);
    }
  }
}

export function getAbilityDefinition(raw: string | null | undefined): AbilityDefinition | null {
  if (!raw) {
    return null;
  }
  const normalized = normalizeKey(raw);
  return abilityLookup.get(normalized) ?? null;
}

const STRENGTH_BASELINE = 100;
const MIN_MULTIPLIER = 0.25;
const MAX_CHANCE_PER_SECOND = 0.95 / 60; // Max 95% per minute = ~1.58% per second
const DEFAULT_ROLL_MINUTES = 1;

export interface AbilityStats {
  multiplier: number;
  chancePerRoll: number;
  rollPeriodMinutes: number;
  procsPerHour: number;
  chancePerSecond: number; // Chance per second (game checks every second)
  chancePerMinute: number; // Chance per minute (for display)
}

export function computeAbilityStats(definition: AbilityDefinition, strength: number | null | undefined): AbilityStats {
  // Wiki formula: "X% × STR" means STR acts as a percentage multiplier
  // STR=100 → 100% = 1.0x, STR=62 → 62% = 0.62x, STR=50 → 50% = 0.5x
  const rawStrength = Number.isFinite(strength) ? (strength as number) : STRENGTH_BASELINE;
  const multiplier = Math.max(MIN_MULTIPLIER, rawStrength / 100);

  // Game checks abilities every SECOND, not every minute
  // So we divide the per-minute chance by 60 to get per-second chance
  const baseChancePerMinute = Math.max(0, definition.baseProbability ?? 0);
  const baseChancePerSecond = baseChancePerMinute / 60;

  const chancePerSecondDecimal = Math.max(0, baseChancePerSecond / 100);
  const chancePerRoll = Math.min(MAX_CHANCE_PER_SECOND, chancePerSecondDecimal * multiplier);

  // Abilities roll every SECOND, so 3600 rolls per hour (60 seconds × 60 minutes)
  const rollsPerHour = 3600;
  const procsPerHour = rollsPerHour * chancePerRoll;

  // For display
  const chancePerSecond = chancePerRoll * 100; // Convert to percentage
  const chancePerMinute = chancePerSecond * 60;

  const rollPeriodMinutes = definition.rollPeriodMinutes ?? DEFAULT_ROLL_MINUTES;

  return {
    multiplier,
    chancePerRoll,
    rollPeriodMinutes,
    procsPerHour,
    chancePerSecond,
    chancePerMinute,
  };
}

export function computeEffectPerHour(definition: AbilityDefinition, stats: AbilityStats): number {
  const effect = definition.effectValuePerProc ?? 0;
  if (!Number.isFinite(effect) || effect === 0) {
    return 0;
  }
  return stats.procsPerHour * effect;
}

export const abilityDefinitions = ABILITY_DEFINITIONS;
