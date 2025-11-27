/**
 * Crop Size Boost Tracker
 * Tracks how many Crop Size Boosts are needed to maximize garden crops
 * Based on active ProduceSizeBoost and ProduceSizeBoostII pets
 */

import { log } from '../utils/logger';
import { storage } from '../utils/storage';
import { getActivePetInfos, type ActivePetInfo } from '../store/pets';
import { getGardenSnapshot, onGardenSnapshot, type GardenSnapshot } from './gardenBridge';
import { lookupMaxScale } from '../utils/plantScales';

// ============================================================================
// Types
// ============================================================================

export type EstimateMode = 'conservative' | 'average' | 'optimistic';

export interface CropBoostConfig {
  enabled: boolean;
  estimateMode: EstimateMode;
  autoRefresh: boolean;
  refreshInterval: number; // seconds
}

export interface BoostPetInfo {
  slotIndex: number;
  displayName: string;
  species: string;
  strength: number;
  abilityId: 'ProduceScaleBoost' | 'ProduceScaleBoostII';
  abilityName: string;
  baseBoostPercent: number; // 6 for I, 10 for II
  effectiveBoostPercent: number; // base × (strength / 100)
  baseProcChance: number; // 0.30 for I, 0.40 for II
  effectiveProcChance: number; // base × (strength / 100)
  expectedMinutesPerProc: number;
}

export interface CropSizeInfo {
  species: string;
  currentScale: number;
  maxScale: number;
  currentSizePercent: number; // 50-100%
  sizeRemaining: number; // percent to 100%
  mutations: string[];
  fruitCount: number;
  isMature: boolean;
  tileKey: string;
  slotIndex: number;
}

export interface BoostEstimate {
  boostsNeeded: number;
  timeEstimate: number; // minutes
  confidenceLevel: 'high' | 'medium' | 'low';
}

export interface TrackerAnalysis {
  boostPets: BoostPetInfo[];
  crops: CropSizeInfo[];

  // Summary stats
  totalBoostPets: number;
  totalMatureCrops: number;
  totalCropsAtMax: number;
  totalCropsNeedingBoost: number;

  // Aggregate calculations
  averageBoostPercent: number;
  weakestBoostPercent: number;
  strongestBoostPercent: number;

  averageMinutesPerProc: number;
  slowestMinutesPerProc: number;
  fastestMinutesPerProc: number;

  // Overall estimates
  overallEstimate: BoostEstimate;

  // Per-crop estimates
  cropEstimates: Map<string, BoostEstimate>; // key: `${tileKey}-${slotIndex}`

  timestamp: number;
}

// ============================================================================
// State
// ============================================================================

const DEFAULT_CONFIG: CropBoostConfig = {
  enabled: true,
  estimateMode: 'conservative',
  autoRefresh: true,
  refreshInterval: 30, // 30 seconds
};

let config: CropBoostConfig = { ...DEFAULT_CONFIG };
let currentAnalysis: TrackerAnalysis | null = null;
let gardenUnsubscribe: (() => void) | null = null;
let refreshInterval: number | null = null;
let changeCallback: ((analysis: TrackerAnalysis | null) => void) | null = null;

// ============================================================================
// Configuration
// ============================================================================

export function getConfig(): CropBoostConfig {
  return { ...config };
}

export function setConfig(updates: Partial<CropBoostConfig>): void {
  config = { ...config, ...updates };
  saveConfig();

  if (config.enabled) {
    startTracking();
  } else {
    stopTracking();
  }
}

export function setEstimateMode(mode: EstimateMode): void {
  config.estimateMode = mode;
  saveConfig();
  recalculate();
}

function saveConfig(): void {
  storage.set('cropBoostTracker:config', config);
}

function loadConfig(): void {
  const saved = storage.get<CropBoostConfig>('cropBoostTracker:config', DEFAULT_CONFIG);
  config = { ...DEFAULT_CONFIG, ...saved };
}

// ============================================================================
// Callbacks
// ============================================================================

export function onAnalysisChange(callback: (analysis: TrackerAnalysis | null) => void): void {
  changeCallback = callback;
}

// ============================================================================
// Core Logic
// ============================================================================

/**
 * Get all active pets with Crop Size Boost abilities
 */
function getBoostPets(): BoostPetInfo[] {
  const pets = getActivePetInfos();
  const boostPets: BoostPetInfo[] = [];

  for (const pet of pets) {
    const abilities = [
      { id: 'ProduceScaleBoost', name: 'Crop Size Boost I', base: 6, chance: 0.30 },
      { id: 'ProduceScaleBoostII', name: 'Crop Size Boost II', base: 10, chance: 0.40 },
    ];

    for (const ability of abilities) {
      if (pet.abilities && pet.abilities.includes(ability.id)) {
        const strength = pet.strength ?? 100;
        const effectiveBoost = (ability.base * strength) / 100;
        const effectiveChance = (ability.chance * strength) / 100;
        const minutesPerProc = 100 / effectiveChance; // Expected minutes between procs

        boostPets.push({
          slotIndex: pet.slotIndex,
          displayName: pet.name ?? pet.species ?? 'Unknown',
          species: pet.species ?? 'unknown',
          strength,
          abilityId: ability.id as any,
          abilityName: ability.name,
          baseBoostPercent: ability.base,
          effectiveBoostPercent: effectiveBoost,
          baseProcChance: ability.chance,
          effectiveProcChance: effectiveChance,
          expectedMinutesPerProc: minutesPerProc,
        });
      }
    }
  }

  return boostPets;
}

/**
 * Scan garden for mature crops and their size info
 */
function scanGardenCrops(): CropSizeInfo[] {
  const snapshot = getGardenSnapshot();
  if (!snapshot) return [];

  const crops: CropSizeInfo[] = [];

  // Helper to process tiles
  const processTiles = (tiles: Record<string, any> | undefined, prefix: string) => {
    if (!tiles) return;

    for (const [tileKey, tile] of Object.entries(tiles)) {
      if (tile.objectType !== 'plant') continue;
      if (!tile.slots || !Array.isArray(tile.slots)) continue;

      for (let i = 0; i < tile.slots.length; i++) {
        const slot = tile.slots[i];
        if (!slot || !slot.species) continue;

        const species = slot.species;
        const currentScale = slot.targetScale ?? slot.scale ?? slot.plantScale ?? 1.0;
        const maxScale = slot.maxScale ?? slot.targetMaxScale ?? lookupMaxScale(species) ?? 2.0;
        const mutations = slot.mutations ?? [];
        const fruitCount = slot.fruitCount ?? slot.remainingFruitCount ?? 1;
        const endTime = slot.endTime ?? 0;
        const isMature = endTime > 0 && Date.now() >= endTime;

        // Calculate size percentage (50% = scale 1.0, 100% = maxScale)
        const ratio = (currentScale - 1.0) / (maxScale - 1.0);
        const currentSizePercent = 50 + ratio * 50;
        const sizeRemaining = Math.max(0, 100 - currentSizePercent);

        crops.push({
          species,
          currentScale,
          maxScale,
          currentSizePercent: Math.max(50, Math.min(100, currentSizePercent)),
          sizeRemaining,
          mutations,
          fruitCount,
          isMature,
          tileKey: `${prefix}${tileKey}`,
          slotIndex: i,
        });
      }
    }
  };

  processTiles(snapshot.tileObjects, '');
  processTiles(snapshot.boardwalkTileObjects, 'bw-');

  return crops;
}

/**
 * Calculate boosts needed for a crop to reach 100% size
 */
function calculateBoostsNeeded(
  crop: CropSizeInfo,
  boostPercent: number
): number {
  if (crop.sizeRemaining <= 0) return 0;
  if (boostPercent <= 0) return Infinity;

  // How many boosts to reach 100%
  return Math.ceil(crop.sizeRemaining / boostPercent);
}

/**
 * Calculate time estimate based on estimate mode
 */
function calculateTimeEstimate(
  boostsNeeded: number,
  boostPets: BoostPetInfo[],
  mode: EstimateMode
): { minutes: number; confidenceLevel: 'high' | 'medium' | 'low' } {
  if (boostPets.length === 0) {
    return { minutes: Infinity, confidenceLevel: 'low' };
  }

  let minutesPerProc: number;
  let confidence: 'high' | 'medium' | 'low';

  if (mode === 'conservative') {
    // Use slowest pet (most minutes per proc)
    minutesPerProc = Math.max(...boostPets.map(p => p.expectedMinutesPerProc));
    confidence = 'high';
  } else if (mode === 'optimistic') {
    // Use fastest pet (least minutes per proc)
    minutesPerProc = Math.min(...boostPets.map(p => p.expectedMinutesPerProc));
    confidence = 'low';
  } else {
    // Use average
    const sum = boostPets.reduce((acc, p) => acc + p.expectedMinutesPerProc, 0);
    minutesPerProc = sum / boostPets.length;
    confidence = 'medium';
  }

  // Account for multiple pets: they can proc independently
  // So effective rate is sum of individual rates
  const combinedRate = boostPets.reduce((acc, p) => acc + (1 / p.expectedMinutesPerProc), 0);
  const effectiveMinutesPerProc = 1 / combinedRate;

  return {
    minutes: boostsNeeded * effectiveMinutesPerProc,
    confidenceLevel: confidence,
  };
}

/**
 * Perform full analysis of boost pets and crops
 */
function analyzeBoostTracker(): TrackerAnalysis | null {
  const boostPets = getBoostPets();
  const crops = scanGardenCrops();

  if (boostPets.length === 0) {
    log('ℹ️ Crop Boost Tracker: No active boost pets');
    return null;
  }

  // Filter for mature crops only
  const matureCrops = crops.filter(c => c.isMature);
  const cropsAtMax = matureCrops.filter(c => c.sizeRemaining <= 0);
  const cropsNeedingBoost = matureCrops.filter(c => c.sizeRemaining > 0);

  // Calculate aggregate stats
  const boostPercents = boostPets.map(p => p.effectiveBoostPercent);
  const averageBoostPercent = boostPercents.reduce((a, b) => a + b, 0) / boostPercents.length;
  const weakestBoostPercent = Math.min(...boostPercents);
  const strongestBoostPercent = Math.max(...boostPercents);

  const minutesList = boostPets.map(p => p.expectedMinutesPerProc);
  const averageMinutesPerProc = minutesList.reduce((a, b) => a + b, 0) / minutesList.length;
  const slowestMinutesPerProc = Math.max(...minutesList);
  const fastestMinutesPerProc = Math.min(...minutesList);

  // Determine boost percent to use for calculations
  let boostPercentForCalc: number;
  if (config.estimateMode === 'conservative') {
    boostPercentForCalc = weakestBoostPercent;
  } else if (config.estimateMode === 'optimistic') {
    boostPercentForCalc = strongestBoostPercent;
  } else {
    boostPercentForCalc = averageBoostPercent;
  }

  // Calculate per-crop estimates
  const cropEstimates = new Map<string, BoostEstimate>();
  let totalBoostsNeeded = 0;

  for (const crop of cropsNeedingBoost) {
    const boostsNeeded = calculateBoostsNeeded(crop, boostPercentForCalc);
    const timeResult = calculateTimeEstimate(boostsNeeded, boostPets, config.estimateMode);

    const estimate: BoostEstimate = {
      boostsNeeded,
      timeEstimate: timeResult.minutes,
      confidenceLevel: timeResult.confidenceLevel,
    };

    const key = `${crop.tileKey}-${crop.slotIndex}`;
    cropEstimates.set(key, estimate);

    // For overall: use the crop that needs the most boosts
    totalBoostsNeeded = Math.max(totalBoostsNeeded, boostsNeeded);
  }

  // Overall estimate: time until ALL crops are maxed
  const overallTimeResult = calculateTimeEstimate(totalBoostsNeeded, boostPets, config.estimateMode);

  const analysis: TrackerAnalysis = {
    boostPets,
    crops: matureCrops,

    totalBoostPets: boostPets.length,
    totalMatureCrops: matureCrops.length,
    totalCropsAtMax: cropsAtMax.length,
    totalCropsNeedingBoost: cropsNeedingBoost.length,

    averageBoostPercent,
    weakestBoostPercent,
    strongestBoostPercent,

    averageMinutesPerProc,
    slowestMinutesPerProc,
    fastestMinutesPerProc,

    overallEstimate: {
      boostsNeeded: totalBoostsNeeded,
      timeEstimate: overallTimeResult.minutes,
      confidenceLevel: overallTimeResult.confidenceLevel,
    },

    cropEstimates,

    timestamp: Date.now(),
  };

  return analysis;
}

/**
 * Recalculate analysis and notify listeners
 */
function recalculate(): void {
  currentAnalysis = analyzeBoostTracker();

  if (changeCallback) {
    changeCallback(currentAnalysis);
  }
}

/**
 * Start tracking garden changes
 */
function startTracking(): void {
  if (gardenUnsubscribe) return; // Already tracking

  log('🌱 Crop Boost Tracker: Starting');

  // Initial calculation
  recalculate();

  // Subscribe to garden changes
  gardenUnsubscribe = onGardenSnapshot(() => {
    recalculate();
  });

  // Set up auto-refresh if enabled
  if (config.autoRefresh && !refreshInterval) {
    refreshInterval = window.setInterval(() => {
      recalculate();
    }, config.refreshInterval * 1000);
  }
}

/**
 * Stop tracking
 */
function stopTracking(): void {
  if (gardenUnsubscribe) {
    gardenUnsubscribe();
    gardenUnsubscribe = null;
  }

  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }

  log('🌱 Crop Boost Tracker: Stopped');
}

// ============================================================================
// Public API
// ============================================================================

export function getCurrentAnalysis(): TrackerAnalysis | null {
  return currentAnalysis;
}

export function manualRefresh(): void {
  recalculate();
}

export function startCropBoostTracker(): void {
  loadConfig();

  if (config.enabled) {
    startTracking();
  }

  log('🌱 Crop Boost Tracker initialized');
}

export function stopCropBoostTracker(): void {
  stopTracking();
}

/**
 * Format time estimate for display
 */
export function formatTimeEstimate(minutes: number): string {
  if (!isFinite(minutes)) return 'N/A';
  if (minutes < 1) return '< 1m';

  const hours = Math.floor(minutes / 60);
  const mins = Math.floor(minutes % 60);

  if (hours > 24) {
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    return `${days}d ${remainingHours}h`;
  } else if (hours > 0) {
    return `${hours}h ${mins}m`;
  } else {
    return `${mins}m`;
  }
}
