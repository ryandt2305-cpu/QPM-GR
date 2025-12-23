// src/features/valueCalculator.ts
// Utility helpers for computing garden-related values derived from live tile data.

import type { GardenSnapshot } from './gardenBridge';
import { computeMutationMultiplier } from '../utils/cropMultipliers';

const SPECIES_VALUES: Record<string, number> = {
  Sunflower: 750000,
  Starweaver: 10000000,
  DawnCelestial: 11000000,
  MoonCelestial: 11000000,
  Lychee: 50000,
  DragonFruit: 24500,
  PassionFruit: 24500,
  Lemon: 10000,
  Pepper: 7220,
  Grape: 7085,
  Bamboo: 500000,
  Cactus: 287000,
  Mushroom: 160000,
  BurrosTail: 6000,
  Lily: 20123,
  Banana: 1750,
  Coconut: 302,
  Echeveria: 5520,
  Pumpkin: 3700,
  Watermelon: 2708,
  Corn: 36,
  Daffodil: 1090,
  Tomato: 27,
  OrangeTulip: 767,
  Apple: 73,
  Blueberry: 23,
  Aloe: 310,
  Strawberry: 14,
  Carrot: 20,
};

export function calculateMutationMultiplier(mutations: string[] | null | undefined): number {
  if (!mutations || mutations.length === 0) {
    return 1;
  }

  return computeMutationMultiplier(mutations).totalMultiplier;
}

export function calculateGardenValue(snapshot: GardenSnapshot | null | undefined, friendBonus = 1): number {
  if (!snapshot || !snapshot.tileObjects) {
    return 0;
  }

  const now = Date.now();
  let total = 0;

  for (const tile of Object.values(snapshot.tileObjects)) {
    if (!tile || typeof tile !== 'object') continue;
    if ((tile as Record<string, unknown>).objectType !== 'plant') continue;

    const slots = (tile as Record<string, unknown>).slots;
    if (!Array.isArray(slots)) continue;

    for (const slot of slots) {
      if (!slot || typeof slot !== 'object') continue;
      const species = (slot as Record<string, unknown>).species;
      if (typeof species !== 'string') continue;

      const endTimeRaw = (slot as Record<string, unknown>).endTime;
      const endTime = typeof endTimeRaw === 'number' ? endTimeRaw : Number(endTimeRaw);
      if (!Number.isFinite(endTime) || endTime > now) continue;

      const baseValue = SPECIES_VALUES[species];
      if (!baseValue) continue;

      const mutationsRaw = (slot as Record<string, unknown>).mutations;
      const mutations = Array.isArray(mutationsRaw) ? (mutationsRaw as string[]) : [];
      const multiplier = calculateMutationMultiplier(mutations);

      const scaleRaw = (slot as Record<string, unknown>).targetScale;
      const scale = typeof scaleRaw === 'number' && Number.isFinite(scaleRaw) ? scaleRaw : 1;

      const tileValue = Math.round(multiplier * baseValue * scale * friendBonus);
      total += tileValue;
    }
  }

  return total;
}

export function formatCoins(value: number): string {
  return new Intl.NumberFormat().format(Math.round(value));
}

export function formatCoinsAbbreviated(value: number): string {
  const absValue = Math.abs(value);
  const sign = value < 0 ? '-' : '';

  if (absValue >= 1e12) {
    return `${sign}${(absValue / 1e12).toFixed(1)}T`;
  } else if (absValue >= 1e9) {
    return `${sign}${(absValue / 1e9).toFixed(1)}B`;
  } else if (absValue >= 1e6) {
    return `${sign}${(absValue / 1e6).toFixed(1)}M`;
  } else if (absValue >= 1e3) {
    return `${sign}${(absValue / 1e3).toFixed(1)}K`;
  } else {
    return `${sign}${Math.round(absValue)}`;
  }
}

export function getBaseValue(species: string): number | undefined {
  return SPECIES_VALUES[species];
}

export function calculatePlantValue(
  species: string,
  scale = 1,
  mutations: string[] | null | undefined,
  friendBonus = 1,
): number {
  const baseValue = SPECIES_VALUES[species];
  if (!baseValue) return 0;
  const multiplier = calculateMutationMultiplier(mutations ?? []);
  return Math.round(baseValue * multiplier * scale * friendBonus);
}
