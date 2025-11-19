// src/features/cropMutationAnalytics.ts - Analytics for Crop Mutation Boost abilities

import { getGardenSnapshot, type GardenSnapshot } from './gardenBridge';
import { getWeatherSnapshot } from '../utils/weatherInfo';
import { calculatePlantValue } from './valueCalculator';
import { computeMutationMultiplier } from '../utils/cropMultipliers';
import { normalizeSpeciesKey } from '../utils/helpers';
import { log } from '../utils/logger';

const FRIEND_BONUS = 1.5;

interface EligibleCrop {
  species: string;
  scale: number;
  mutations: string[];
  currentValue: number;
  fruitCount: number;
  index: number;
}

interface MutationPotential {
  weather: 'rain' | 'snow' | 'dawn' | 'amber' | null;
  eligibleCrops: EligibleCrop[];
  eligibleFruits: number;
  averageValueGain: number;
  projectedMutationsPerEvent: number; // Expected mutations during current event
  baseMutationChance: number; // Base % chance per crop per event
}

/**
 * Analyze eligible crops for mutation boost during current weather/lunar event
 */
export function analyzeCropMutationPotential(): MutationPotential {
  const snapshot = getGardenSnapshot();
  const weather = getWeatherSnapshot();

  if (!snapshot || !weather) {
    return {
      weather: null,
      eligibleCrops: [],
      eligibleFruits: 0,
      averageValueGain: 0,
      projectedMutationsPerEvent: 0,
      baseMutationChance: 0,
    };
  }

  // Extract current weather type from weather snapshot
  const weatherType = typeof weather === 'string' ? weather : (weather as any).type || (weather as any).name;
  const currentWeather = classifyWeatherForMutation(weatherType);
  if (!currentWeather) {
    return {
      weather: null,
      eligibleCrops: [],
      eligibleFruits: 0,
      averageValueGain: 0,
      projectedMutationsPerEvent: 0,
      baseMutationChance: 0,
    };
  }

  const eligible: EligibleCrop[] = [];
  let totalFruits = 0;
  let totalPotentialValue = 0;

  // Scan garden for eligible crops
  const tileObjects = snapshot.tileObjects || {};
  Object.entries(tileObjects).forEach(([tileIndex, tile]: [string, any]) => {
    if (!tile || tile.objectType !== 'plant') return;

    const species = tile.species || tile.plantSpecies || tile.seedSpecies;
    if (!species) return;

    const isMature = tile.fullyMature === true || tile.isMature === true;
    if (!isMature) return;

    const scale = typeof tile.scale === 'number' ? tile.scale : 1;
    const mutations = Array.isArray(tile.mutations) ? [...tile.mutations] : [];

    // Check if plant can receive the current weather mutation
    const canReceiveMutation = checkMutationEligibility(mutations, currentWeather);
    if (!canReceiveMutation) return;

    const fruitCount = extractFruitCount(tile);
    if (fruitCount <= 0) return;

    const normalizedSpecies = normalizeSpeciesKey(species);
    const currentValue = calculatePlantValue(normalizedSpecies, scale, mutations, FRIEND_BONUS);

    // Calculate value with new mutation
    const newMutations = [...mutations, getMutationForWeather(currentWeather)];
    const newValue = calculatePlantValue(normalizedSpecies, scale, newMutations, FRIEND_BONUS);
    const valueGain = newValue - currentValue;

    if (valueGain > 0) {
      eligible.push({
        species,
        scale,
        mutations,
        currentValue,
        fruitCount,
        index: parseInt(tileIndex, 10),
      });

      totalFruits += fruitCount;
      totalPotentialValue += valueGain * fruitCount; // Weight by fruit count
    }
  });

  const averageValueGain = eligible.length > 0 ? totalPotentialValue / totalFruits : 0;

  // Base mutation chances per event (from gameinfo.txt)
  // Rain: 3/4 * (1 - (1-0.07)^5) ≈ 22.8%
  // Snow: 1/4 * (1 - (1-0.07)^5) ≈ 7.6%
  // Dawn: 2/3 * (1 - (1-0.01)^10) ≈ 6.37%
  // Amber: 1/3 * (1 - (1-0.01)^10) ≈ 3.19%
  const baseMutationChance = getBaseMutationChance(currentWeather);

  // Expected mutations during this event = eligible crops × base chance
  const projectedMutationsPerEvent = eligible.length * (baseMutationChance / 100);

  return {
    weather: currentWeather,
    eligibleCrops: eligible,
    eligibleFruits: totalFruits,
    averageValueGain,
    projectedMutationsPerEvent,
    baseMutationChance,
  };
}

/**
 * Get base mutation chance per crop per event (from gameinfo.txt)
 */
function getBaseMutationChance(weather: 'rain' | 'snow' | 'dawn' | 'amber'): number {
  switch (weather) {
    case 'rain':
      // Rain: 75% of weather events, 7% per minute × 5 minutes
      // Chance per event: 1 - (1-0.07)^5 ≈ 30.4%
      // Rain-specific: 3/4 × 30.4% ≈ 22.8%
      return 22.8;
    case 'snow':
      // Snow: 25% of weather events, 7% per minute × 5 minutes
      // Snow-specific: 1/4 × 30.4% ≈ 7.6%
      return 7.6;
    case 'dawn':
      // Dawn: 67% of lunar events, 1% per minute × 10 minutes
      // Chance per event: 1 - (1-0.01)^10 ≈ 9.56%
      // Dawn-specific: 2/3 × 9.56% ≈ 6.37%
      return 6.37;
    case 'amber':
      // Amber: 33% of lunar events, 1% per minute × 10 minutes
      // Amber-specific: 1/3 × 9.56% ≈ 3.19%
      return 3.19;
  }
}

function classifyWeatherForMutation(weatherType: string | undefined): 'rain' | 'snow' | 'dawn' | 'amber' | null {
  if (!weatherType) return null;
  const normalized = weatherType.toLowerCase();
  if (normalized.includes('rain')) return 'rain';
  if (normalized.includes('snow')) return 'snow';
  if (normalized.includes('dawn')) return 'dawn';
  if (normalized.includes('amber')) return 'amber';
  return null;
}

function getMutationForWeather(weather: 'rain' | 'snow' | 'dawn' | 'amber'): string {
  switch (weather) {
    case 'rain': return 'Wet';
    case 'snow': return 'Frozen';
    case 'dawn': return 'Dawnlit';
    case 'amber': return 'Amberlit';
  }
}

function checkMutationEligibility(mutations: string[], weather: 'rain' | 'snow' | 'dawn' | 'amber'): boolean {
  const hasWet = mutations.some(m => m === 'Wet' || m === 'Frozen');
  const hasDawn = mutations.some(m => m === 'Dawnlit' || m === 'Dawnbound');
  const hasAmber = mutations.some(m => m === 'Amberlit' || m === 'Amberbound');
  const hasGold = mutations.includes('Gold');
  const hasRainbow = mutations.includes('Rainbow');

  // Can't add conflicting color mutations
  if ((weather === 'dawn' && (hasAmber || hasGold)) ||
      (weather === 'amber' && (hasDawn || hasGold)) ||
      (hasRainbow)) {
    return false;
  }

  // Can't add rain/snow mutations if already has wet
  if ((weather === 'rain' || weather === 'snow') && hasWet) {
    return false;
  }

  // Can't add dawn if already has dawnlit
  if (weather === 'dawn' && hasDawn) {
    return false;
  }

  // Can't add amber if already has amberlit
  if (weather === 'amber' && hasAmber) {
    return false;
  }

  return true;
}

function extractFruitCount(tile: any): number {
  // Multi-harvest plants
  if (typeof tile.fruitCount === 'number' && tile.fruitCount > 0) {
    return tile.fruitCount;
  }

  // Slot states
  if (Array.isArray(tile.slotStates) && tile.slotStates.length > 0) {
    return tile.slotStates.length;
  }

  // Display name parsing (e.g., "Pepper Plant+9")
  const displayName = tile.displayName || tile.name;
  if (typeof displayName === 'string') {
    const match = displayName.match(/\+(\d+)/);
    if (match && match[1]) {
      return parseInt(match[1], 10);
    }
  }

  // Default to 1 for single-harvest
  return 1;
}
