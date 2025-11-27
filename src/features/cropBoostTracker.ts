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

export interface CropBoostConfig {
  enabled: boolean;
  autoRefresh: boolean;
  refreshInterval: number; // seconds
  selectedSpecies: string | null; // null = all crops
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
  timeEstimateP10: number; // minutes (10th percentile - optimistic)
  timeEstimateP50: number; // minutes (50th percentile - median/expected)
  timeEstimateP90: number; // minutes (90th percentile - pessimistic)
  boostsReceived: number;  // boosts received so far
  lastBoostAt: number | null; // timestamp of last boost
  expectedNextBoostAt: number; // expected timestamp of next boost
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
  autoRefresh: true,
  refreshInterval: 30, // 30 seconds
  selectedSpecies: null, // Show all crops by default
};

let config: CropBoostConfig = { ...DEFAULT_CONFIG };
let currentAnalysis: TrackerAnalysis | null = null;
let gardenUnsubscribe: (() => void) | null = null;
let refreshInterval: number | null = null;
let changeCallback: ((analysis: TrackerAnalysis | null) => void) | null = null;
let lastRecalcTime = 0;
const RECALC_THROTTLE_MS = 5000; // Only recalculate every 5 seconds max

// Per-crop boost tracking
interface CropBoostHistory {
  initialSize: number;
  boostTimestamps: number[];
  lastSize: number;
}

const cropBoostHistory = new Map<string, CropBoostHistory>();

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

export function setSelectedSpecies(species: string | null): void {
  config.selectedSpecies = species;
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

        // Include ALL crops (growing and mature) - Crop Size Boost works on all crops!
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
 * Calculate time estimates using statistical formulas (fast, no simulation)
 * For independent Poisson processes, combined rate = sum of individual rates
 * Returns P10 (optimistic), P50 (median/expected), P90 (pessimistic) percentiles
 */
function calculateTimeEstimates(
  boostsNeeded: number,
  boostPets: BoostPetInfo[]
): { p10: number; p50: number; p90: number } {
  if (boostPets.length === 0 || boostsNeeded <= 0) {
    return { p10: 0, p50: 0, p90: 0 };
  }

  // Combined rate: sum of individual proc rates (boosts per minute)
  // For independent Poisson processes, rates add
  const combinedRatePerMinute = boostPets.reduce((sum, pet) => {
    return sum + (pet.effectiveProcChance / 100); // Convert percent/min to rate
  }, 0);

  if (combinedRatePerMinute <= 0) {
    return { p10: 0, p50: 0, p90: 0 };
  }

  // Expected time (median) = boosts needed / combined rate
  const p50 = boostsNeeded / combinedRatePerMinute;

  // Percentile estimates using variance of Poisson process
  // Variance = λt for Poisson, std dev = sqrt(λt)
  // Using approximate percentile multipliers for realistic spread
  const p10 = p50 * 0.65; // Optimistic (faster than median)
  const p90 = p50 * 1.50; // Pessimistic (slower than median)

  return { p10, p50, p90 };
}

/**
 * Update boost history for crops (detect new boosts based on size changes)
 */
function updateBoostHistory(crops: CropSizeInfo[]): void {
  const now = Date.now();

  for (const crop of crops) {
    const key = `${crop.tileKey}-${crop.slotIndex}`;
    const history = cropBoostHistory.get(key);

    if (!history) {
      // Initialize tracking for new crop
      cropBoostHistory.set(key, {
        initialSize: crop.currentSizePercent,
        boostTimestamps: [],
        lastSize: crop.currentSizePercent,
      });
    } else {
      // Check if size increased (potential boost)
      const sizeDiff = crop.currentSizePercent - history.lastSize;
      if (sizeDiff > 0.5) {
        // Size increased significantly - likely a boost!
        history.boostTimestamps.push(now);
        history.lastSize = crop.currentSizePercent;
      }
    }
  }

  // Clean up history for crops that no longer exist
  const currentKeys = new Set(crops.map(c => `${c.tileKey}-${c.slotIndex}`));
  for (const key of cropBoostHistory.keys()) {
    if (!currentKeys.has(key)) {
      cropBoostHistory.delete(key);
    }
  }
}

/**
 * Perform full analysis of boost pets and crops
 */
function analyzeBoostTracker(): TrackerAnalysis | null {
  const boostPets = getBoostPets();
  const allCrops = scanGardenCrops();

  if (boostPets.length === 0) {
    log('ℹ️ Crop Boost Tracker: No active boost pets');
    return null;
  }

  // Update boost history based on size changes
  updateBoostHistory(allCrops);

  // Include ALL crops (growing and mature)
  const cropsAtMax = allCrops.filter(c => c.sizeRemaining <= 0);
  const cropsNeedingBoost = allCrops.filter(c => c.sizeRemaining > 0);

  // Calculate aggregate stats
  const boostPercents = boostPets.map(p => p.effectiveBoostPercent);
  const averageBoostPercent = boostPercents.reduce((a, b) => a + b, 0) / boostPercents.length;
  const weakestBoostPercent = Math.min(...boostPercents);
  const strongestBoostPercent = Math.max(...boostPercents);

  const minutesList = boostPets.map(p => p.expectedMinutesPerProc);
  const averageMinutesPerProc = minutesList.reduce((a, b) => a + b, 0) / minutesList.length;
  const slowestMinutesPerProc = Math.max(...minutesList);
  const fastestMinutesPerProc = Math.min(...minutesList);

  // Use average boost percent for calculations
  const boostPercentForCalc = averageBoostPercent;

  // Calculate per-crop estimates using Monte Carlo
  const cropEstimates = new Map<string, BoostEstimate>();
  let totalBoostsNeeded = 0;
  const now = Date.now();

  for (const crop of cropsNeedingBoost) {
    const key = `${crop.tileKey}-${crop.slotIndex}`;
    const history = cropBoostHistory.get(key);
    const boostsReceived = history?.boostTimestamps.length ?? 0;
    const lastBoostAt = history?.boostTimestamps[history.boostTimestamps.length - 1] ?? null;

    const boostsNeeded = calculateBoostsNeeded(crop, boostPercentForCalc);
    const remainingBoosts = Math.max(0, boostsNeeded - boostsReceived);

    // Calculate time estimates for remaining boosts
    const estimates = calculateTimeEstimates(remainingBoosts, boostPets);

    // Calculate expected next boost time
    const singleBoostEstimate = calculateTimeEstimates(1, boostPets);
    const expectedNextBoostAt = now + (singleBoostEstimate.p50 * 60 * 1000); // Convert to ms

    const estimate: BoostEstimate = {
      boostsNeeded,
      timeEstimateP10: estimates.p10,
      timeEstimateP50: estimates.p50,
      timeEstimateP90: estimates.p90,
      boostsReceived,
      lastBoostAt,
      expectedNextBoostAt,
    };

    cropEstimates.set(key, estimate);

    // For overall: use the crop that needs the most boosts
    totalBoostsNeeded = Math.max(totalBoostsNeeded, boostsNeeded);
  }

  // Overall estimate: time until ALL crops are maxed
  const overallEstimates = calculateTimeEstimates(totalBoostsNeeded, boostPets);

  const analysis: TrackerAnalysis = {
    boostPets,
    crops: allCrops,

    totalBoostPets: boostPets.length,
    totalMatureCrops: allCrops.length, // All crops now, not just mature
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
      timeEstimateP10: overallEstimates.p10,
      timeEstimateP50: overallEstimates.p50,
      timeEstimateP90: overallEstimates.p90,
      boostsReceived: 0, // Overall doesn't track boosts
      lastBoostAt: null,
      expectedNextBoostAt: 0,
    },

    cropEstimates,

    timestamp: Date.now(),
  };

  return analysis;
}

/**
 * Recalculate analysis and notify listeners
 * Throttled to prevent performance issues from frequent updates
 */
function recalculate(): void {
  const now = Date.now();

  // Throttle: Don't recalculate more than once every 5 seconds
  if (now - lastRecalcTime < RECALC_THROTTLE_MS) {
    return;
  }

  lastRecalcTime = now;
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

  // Subscribe to garden changes (throttled to prevent lag)
  gardenUnsubscribe = onGardenSnapshot(() => {
    recalculate();
  });
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

/**
 * Format time range for display (showing percentiles)
 */
export function formatTimeRange(p10: number, p50: number, p90: number): string {
  const p10Str = formatTimeEstimate(p10);
  const p50Str = formatTimeEstimate(p50);
  const p90Str = formatTimeEstimate(p90);

  // If all similar, just show one value
  if (p10Str === p50Str && p50Str === p90Str) {
    return p50Str;
  }

  // Show range with median
  return `${p10Str} - ${p90Str} (median: ${p50Str})`;
}

/**
 * Format countdown for live timer display
 */
export function formatCountdown(targetTimestamp: number): { text: string; isOverdue: boolean } {
  const now = Date.now();
  const msRemaining = targetTimestamp - now;

  if (msRemaining <= 0) {
    const msOverdue = Math.abs(msRemaining);
    const minutesOverdue = Math.floor(msOverdue / 60000);
    const secondsOverdue = Math.floor((msOverdue % 60000) / 1000);

    if (minutesOverdue > 0) {
      return { text: `+${minutesOverdue}m ${secondsOverdue}s overdue`, isOverdue: true };
    } else {
      return { text: `+${secondsOverdue}s overdue`, isOverdue: true };
    }
  }

  const totalSeconds = Math.floor(msRemaining / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return { text: `${hours}h ${minutes}m ${seconds}s`, isOverdue: false };
  } else if (minutes > 0) {
    return { text: `${minutes}m ${seconds}s`, isOverdue: false };
  } else {
    return { text: `${seconds}s`, isOverdue: false };
  }
}

/**
 * Get list of available crop species in garden
 */
export function getAvailableSpecies(): string[] {
  const analysis = getCurrentAnalysis();
  if (!analysis) return [];

  const speciesSet = new Set<string>();
  for (const crop of analysis.crops) {
    speciesSet.add(crop.species);
  }

  return Array.from(speciesSet).sort();
}
