// src/features/shopRestockTracker.ts
// Shop Restock Tracker - Import, analyze, and predict shop restocks

import { storage } from '../utils/storage';
import { log } from '../utils/logger';
import { notify } from '../core/notifications';

const STORAGE_KEY_RESTOCKS = 'qpm.shopRestocks.v1';
const STORAGE_KEY_CONFIG = 'qpm.shopRestockConfig.v1';
const STORAGE_KEY_MIGRATION = 'qpm.shopRestocks.migration';
const STORAGE_KEY_PREDICTIONS = 'qpm.shopRestocks.predictions.v1';
const STORAGE_KEY_ACTIVE_PREDICTIONS = 'qpm.shopRestocks.activePredictions.v1';
const CURRENT_MIGRATION_VERSION = 1;

// Items to track predictions for
const TRACKED_PREDICTION_ITEMS = ['Mythical Eggs', 'Sunflower', 'Starweaver', 'Dawnbinder', 'Moonbinder'];

// Performance optimization: Cache for item intervals to avoid recalculating
let itemIntervalsCache: Map<string, number[]> | null = null;
let itemIntervalsCacheVersion: number = 0;

/**
 * Restock event data structure
 */
export interface RestockEvent {
  id: string; // Unique ID (timestamp + hash)
  timestamp: number; // Unix timestamp in ms
  dateString: string; // Human-readable date (from Discord)
  items: RestockItem[];
  source: 'discord' | 'live' | 'manual';
}

/**
 * Individual item in a restock
 */
export interface RestockItem {
  name: string; // Item name (e.g., "Lily", "Rare Eggs", "Rain")
  quantity: number; // Quantity available (0 for weather events)
  type: 'seed' | 'crop' | 'egg' | 'weather' | 'unknown';
}

/**
 * Item statistics
 */
export interface ItemStats {
  name: string;
  type: string;
  totalRestocks: number; // How many times it appeared
  totalQuantity: number; // Sum of all quantities
  avgQuantity: number; // Average quantity per restock
  lastSeen: number; // Last timestamp it appeared
  firstSeen: number; // First timestamp it appeared
  appearanceRate: number; // Percentage of restocks it appeared in
  rarity: 'common' | 'uncommon' | 'rare' | 'mythic' | 'divine' | 'celestial';
}

/**
 * Game item rarity mapping
 */
const ITEM_RARITY_MAP: Record<string, ItemStats['rarity']> = {
  // Celestial (end-game seeds)
  'Starweaver': 'celestial',
  'Dawnbinder': 'celestial',
  'Moonbinder': 'celestial',

  // Divine (high-end seeds)
  'Sunflower': 'divine',
  'Lychee': 'divine',
  'Dragon Fruit': 'divine',
  'Passion Fruit': 'divine',
  'Lemon': 'divine',
  'Pepper': 'divine',
  'Cacao Bean': 'divine', // Added Nov 2025

  // Mythic (rare seeds and eggs)
  'Mythical Eggs': 'mythic',
  'Grape': 'mythic',
  'Chrysanthemum': 'mythic',
  'Bamboo': 'mythic',
  'Cactus': 'mythic',
  'Mushroom': 'mythic',

  // Rare
  'Lily': 'rare',
  "Burro's Tail": 'rare',
  'Echeveria': 'rare', // Updated from legendary to rare (Nov 2025)
  'Legendary Eggs': 'rare',
  'Rare Eggs': 'rare',

  // Uncommon
  'Watermelon': 'uncommon',
  'Pumpkin': 'uncommon',
  'Uncommon Eggs': 'uncommon',

  // Common (basic seeds)
  'Carrot': 'common',
  'Strawberry': 'common',
  'Aloe': 'common',
  'Delphinium': 'common',
  'Blueberry': 'common', // Spawn rate changed to 75% (Nov 2025)
  'Apple': 'common',
  'Tulip': 'common',
  'Tomato': 'common', // Spawn rate changed to 75% (Nov 2025)
  'Daffodil': 'common',
  'Corn': 'common',
  'Coconut': 'common',
  'Banana': 'common',
  'Camellia': 'common',
  'Squash': 'common',
  'Fava Bean': 'common', // Added Nov 2025
};

/**
 * Get item rarity based on name
 */
function getItemRarity(itemName: string): ItemStats['rarity'] {
  return ITEM_RARITY_MAP[itemName] || 'common';
}

/**
 * Prediction accuracy record
 */
export interface PredictionRecord {
  itemName: string;
  predictedTime: number | null; // When we predicted it would appear (null if no prediction was active)
  predictionMadeAt: number | null; // When we made the prediction (null if no prediction was active)
  actualTime: number | null; // When it actually appeared (null if not yet)
  differenceMinutes: number | null; // How far off in minutes (+ = late, - = early)
  differenceMs: number | null; // How far off in milliseconds (+ = late, - = early)
}

/**
 * Restock tracker configuration
 */
interface RestockConfig {
  importedFiles: string[]; // Track which files have been imported
  watchedItems: string[]; // Items to watch/alert for
}

// In-memory cache
let restockEvents: RestockEvent[] = [];
let config: RestockConfig = {
  importedFiles: [],
  watchedItems: [],
};
let restockEventsSorted = true;
let lastStorageMergeMs = 0;
const STORAGE_MERGE_INTERVAL_MS = 15000;
let predictionHistory: Map<string, PredictionRecord[]> = new Map(); // itemName -> history (max 3)
let activePredictions: Map<string, number> = new Map(); // itemName -> predicted time (PERSISTED TO STORAGE)

let updateCallbacks: Array<() => void> = [];
let isInitialized = false;

/**
 * Migrate old restock data to fix timezone issues
 * Migration v1: Convert timestamps that were interpreted as local time to AEST
 */
function migrateRestockData(): number {
  const migrationVersion = storage.get<number>(STORAGE_KEY_MIGRATION, 0);

  // Already migrated to current version
  if (migrationVersion >= CURRENT_MIGRATION_VERSION) {
    return 0;
  }

  // Skip migration if no data exists
  if (restockEvents.length === 0) {
    storage.set(STORAGE_KEY_MIGRATION, CURRENT_MIGRATION_VERSION);
    return 0;
  }

  log('🔄 Migrating restock data to fix timezone interpretation...');

  /**
   * Migration v1: Fix AEST timezone interpretation
   *
   * OLD BEHAVIOR: Timestamps were interpreted as local time
   *   parseTimestamp("22/11/2025 8:00 pm") → new Date(2025, 10, 22, 20, 0) → local 8pm as Unix timestamp
   *
   * NEW BEHAVIOR: Timestamps should be interpreted as AEST (UTC+10)
   *   parseTimestamp("22/11/2025 8:00 pm") → Date.UTC(...) - AEST_OFFSET → AEST 8pm as Unix timestamp
   *
   * CORRECTION: Add the difference between AEST offset and local offset
   */

  // Get local timezone offset (in milliseconds)
  const localOffsetMinutes = new Date().getTimezoneOffset(); // Minutes BEHIND UTC (negative for ahead)
  const localOffsetMs = -localOffsetMinutes * 60 * 1000; // Convert to ms AHEAD of UTC

  // AEST is UTC+10
  const AEST_OFFSET_MS = 10 * 60 * 60 * 1000;

  // Calculate correction: old data was stored as if times were in local TZ, but should be AEST
  // Example: PST user (UTC-8) saw "8PM" and stored as "PST 8PM", but it should be "AEST 8PM" = "PST 2AM"
  // Correction: "PST 2AM" - "PST 8PM" = -18 hours (subtract)
  const correctionMs = localOffsetMs - AEST_OFFSET_MS;

  let correctedCount = 0;

  for (const event of restockEvents) {
    event.timestamp += correctionMs;
    correctedCount++;
  }

  // Save corrected data
  if (correctedCount > 0) {
    storage.set(STORAGE_KEY_RESTOCKS, restockEvents);
    log(`✅ Migrated ${correctedCount} restock events (adjusted by ${(correctionMs / (1000 * 60 * 60)).toFixed(1)} hours)`);
  }

  // Mark as migrated
  storage.set(STORAGE_KEY_MIGRATION, CURRENT_MIGRATION_VERSION);

  return correctedCount;
}

/**
 * Initialize restock tracker from storage
 * Only loads once - subsequent calls are ignored to prevent data loss
 */
export function initializeRestockTracker(): void {
  if (isInitialized) {
    log('📊 Restock tracker already initialized, skipping reload');
    return;
  }

  try {
    const savedRestocks = storage.get<RestockEvent[]>(STORAGE_KEY_RESTOCKS, []);
    restockEvents = savedRestocks;
    if (restockEvents.length > 1) {
      restockEvents.sort((a, b) => a.timestamp - b.timestamp);
      restockEventsSorted = true;
    }

    const savedConfig = storage.get<RestockConfig>(STORAGE_KEY_CONFIG, {
      importedFiles: [],
      watchedItems: [],
    });
    config = savedConfig;

    // Load prediction history
    const savedPredictions = storage.get<Record<string, PredictionRecord[]>>(STORAGE_KEY_PREDICTIONS, {});
    predictionHistory = new Map(Object.entries(savedPredictions));

    // Load active predictions
    const savedActivePredictions = storage.get<Record<string, number>>(STORAGE_KEY_ACTIVE_PREDICTIONS, {});
    activePredictions = new Map(Object.entries(savedActivePredictions));
    log(`📊 Loaded ${activePredictions.size} active predictions from storage`);

    // Migrate old data if needed
    const migratedCount = migrateRestockData();

    // Backfill prediction history from existing restock events (for tracked items that have no history)
    backfillPredictionHistory();

    // Load default restock data on first run (if no data exists)
    // DISABLED: Don't auto-load default data
    // if (restockEvents.length === 0) {
    //   loadDefaultRestockData();
    // }

    isInitialized = true;

    // Generate initial predictions
    generatePredictions();

    if (migratedCount > 0) {
      log(`📊 Loaded ${restockEvents.length} restock events from storage (${migratedCount} migrated to correct timezone)`);
      // Notify user about successful migration
      setTimeout(() => {
        notify({
          feature: 'shop-restock-tracker',
          level: 'success',
          message: `✅ Updated ${migratedCount} restock times to correct timezone`
        });
      }, 2000); // Delay to ensure UI is ready
    } else {
      log(`📊 Loaded ${restockEvents.length} restock events from storage`);
    }
  } catch (error) {
    log('⚠️ Failed to load restock data', error);
  }
}

/**
 * Backfill prediction history from existing restock events
 * This populates history for tracked items that don't have any history yet
 */
function backfillPredictionHistory(): void {
  if (restockEvents.length === 0) {
    return; // No events to backfill from
  }

  let backfilled = 0;

  for (const itemName of TRACKED_PREDICTION_ITEMS) {
    // Check if this item already has history
    const existingHistory = predictionHistory.get(itemName);
    if (existingHistory && existingHistory.length > 0) {
      continue; // Skip items that already have history
    }

    // Find all restock events for this item
    const itemRestocks = restockEvents
      .filter(event => event.items.some(item => item.name === itemName))
      .sort((a, b) => b.timestamp - a.timestamp) // Most recent first
      .slice(0, 3); // Take up to 3 most recent

    if (itemRestocks.length > 0) {
      // Create history records (without predictions)
      const history: PredictionRecord[] = itemRestocks.map(event => ({
        itemName,
        predictedTime: null,
        predictionMadeAt: null,
        actualTime: event.timestamp,
        differenceMinutes: null,
        differenceMs: null,
      }));

      predictionHistory.set(itemName, history);
      backfilled += itemRestocks.length;
      log(`📊 Backfilled ${itemRestocks.length} restock(s) for ${itemName}`);
    }
  }

  if (backfilled > 0) {
    // Save backfilled history
    savePredictions();
    log(`✅ Backfilled ${backfilled} total restock records into prediction history`);
  }
}

/**
 * Load default restock data from pre-parsed Discord history
 * REMOVED: Default data was 11MB and caused severe performance issues
 * Users should import their own Discord export files instead
 */
function loadDefaultRestockData(): void {
  // NO-OP: Default data removed for performance
  log('ℹ️ No default restock data (removed for performance)');
}

/**
 * Save restocks to storage
 * Merges with existing storage to prevent data loss from multiple tabs
 */
function saveRestocks(forceMerge = false): void {
  try {
    const now = Date.now();
    const shouldMerge = forceMerge || (now - lastStorageMergeMs > STORAGE_MERGE_INTERVAL_MS);

    if (shouldMerge) {
      const storedEvents = storage.get<RestockEvent[]>(STORAGE_KEY_RESTOCKS, []);
      const storedIds = new Set(restockEvents.map(e => e.id));

      let merged = 0;
      for (const event of storedEvents) {
        if (!storedIds.has(event.id)) {
          restockEvents.push(event);
          storedIds.add(event.id);
          merged++;
          restockEventsSorted = false;
        }
      }

      if (merged > 0) {
        log(`dY", Merged ${merged} events from storage (multi-tab sync)`);
      }

      lastStorageMergeMs = now;
    }

    if (!restockEventsSorted) {
      restockEvents.sort((a, b) => a.timestamp - b.timestamp);
      restockEventsSorted = true;
    }

    storage.set(STORAGE_KEY_RESTOCKS, restockEvents);
    storage.set(STORAGE_KEY_CONFIG, config);
  } catch (error) {
    log('?s??,? Failed to save restock data', error);
  }
}

/**
 * Add a restock event
 */
export function addRestockEvent(event: RestockEvent): void {
  // Check for duplicates (same timestamp)
  const exists = restockEvents.some(e => e.id === event.id);
  if (exists) {
    log(`?s??,? Duplicate restock event skipped`);
    return;
  }

  const previousLast = restockEvents[restockEvents.length - 1]?.timestamp ?? null;
  restockEvents.push(event);
  if (previousLast != null && event.timestamp < previousLast) {
    restockEventsSorted = false;
  }

  log(`?o. Saved restock event (${event.source}): Total ${restockEvents.length} events`);

  // Check prediction accuracy
  checkPredictionAccuracy(event);

  // Save to storage so live events persist
  saveRestocks();

  // Notify UI to update
  notifyListeners();
}

/**
 * Add multiple restock events (bulk import)
 */
export function addRestockEvents(events: RestockEvent[]): void {
  let added = 0;
  const existingIds = new Set(restockEvents.map(e => e.id));

  for (const event of events) {
    if (!existingIds.has(event.id)) {
      restockEvents.push(event);
      existingIds.add(event.id);
      added++;
    }
  }

  restockEventsSorted = false;

  saveRestocks(true);
  notifyListeners();

  log(`dY"S Added ${added} new restock events (${events.length - added} duplicates skipped)`);
}

/**
 * Get all restock events
 */
export function getAllRestockEvents(): RestockEvent[] {
  return [...restockEvents];
}

/**
 * Get restocks within a time range
 */
export function getRestocksInRange(startTime: number, endTime: number): RestockEvent[] {
  return restockEvents.filter(e => e.timestamp >= startTime && e.timestamp <= endTime);
}

/**
 * Calculate item statistics
 */
export function calculateItemStats(): Map<string, ItemStats> {
  const statsMap = new Map<string, ItemStats>();
  const totalRestocks = restockEvents.length;

  if (totalRestocks === 0) {
    return statsMap;
  }

  // Count appearances for each item
  for (const event of restockEvents) {
    for (const item of event.items) {
      const existing = statsMap.get(item.name);

      if (existing) {
        existing.totalRestocks++;
        existing.totalQuantity += item.quantity;
        existing.lastSeen = Math.max(existing.lastSeen, event.timestamp);
        existing.firstSeen = Math.min(existing.firstSeen, event.timestamp);
      } else {
        statsMap.set(item.name, {
          name: item.name,
          type: item.type,
          totalRestocks: 1,
          totalQuantity: item.quantity,
          avgQuantity: 0,
          lastSeen: event.timestamp,
          firstSeen: event.timestamp,
          appearanceRate: 0,
          rarity: getItemRarity(item.name),
        });
      }
    }
  }

  // Calculate averages and assign actual game rarity
  for (const stats of statsMap.values()) {
    stats.avgQuantity = stats.totalQuantity / stats.totalRestocks;
    stats.appearanceRate = (stats.totalRestocks / totalRestocks) * 100;

    // Assign rarity based on actual game item rarity
    stats.rarity = getItemRarity(stats.name);
  }

  return statsMap;
}

/**
 * Get summary statistics
 */
export function getSummaryStats(): {
  totalRestocks: number;
  totalItems: number;
  dateRange: { start: number; end: number } | null;
  avgRestockInterval: number; // Average time between restocks in minutes
  uniqueItems: number;
} {
  if (restockEvents.length === 0) {
    return {
      totalRestocks: 0,
      totalItems: 0,
      dateRange: null,
      avgRestockInterval: 0,
      uniqueItems: 0,
    };
  }

  const totalItems = restockEvents.reduce((sum, e) => sum + e.items.length, 0);
  const timestamps = restockEvents.map(e => e.timestamp).sort((a, b) => a - b);
  const dateRange = {
    start: timestamps[0]!,
    end: timestamps[timestamps.length - 1]!,
  };

  // Calculate average interval
  let totalInterval = 0;
  for (let i = 1; i < timestamps.length; i++) {
    const current = timestamps[i];
    const previous = timestamps[i - 1];
    if (current !== undefined && previous !== undefined) {
      totalInterval += current - previous;
    }
  }
  const avgRestockInterval = timestamps.length > 1
    ? totalInterval / (timestamps.length - 1) / 1000 / 60 // Convert to minutes
    : 0;

  const uniqueItems = new Set(
    restockEvents.flatMap(e => e.items.map(i => i.name))
  ).size;

  return {
    totalRestocks: restockEvents.length,
    totalItems,
    dateRange: timestamps.length > 0 ? dateRange : null,
    avgRestockInterval,
    uniqueItems,
  };
}

/**
 * Predict next restock time
 */
export function predictNextRestock(): {
  nextRestockTime: number | null;
  timeUntilRestock: number | null; // in milliseconds
  confidence: 'high' | 'medium' | 'low' | 'none';
} {
  if (restockEvents.length < 2) {
    return {
      nextRestockTime: null,
      timeUntilRestock: null,
      confidence: 'none',
    };
  }

  // Get the most recent restock
  const sortedEvents = [...restockEvents].sort((a, b) => b.timestamp - a.timestamp);
  const lastRestock = sortedEvents[0]!;

  // Calculate average interval (should be ~5 minutes)
  const summary = getSummaryStats();
  const intervalMs = summary.avgRestockInterval * 60 * 1000;

  // Predict next restock
  const nextRestockTime = lastRestock.timestamp + intervalMs;
  const now = Date.now();
  const timeUntilRestock = nextRestockTime - now;

  // Determine confidence based on data consistency
  let confidence: 'high' | 'medium' | 'low' | 'none' = 'none';
  if (restockEvents.length >= 100) {
    confidence = 'high';
  } else if (restockEvents.length >= 20) {
    confidence = 'medium';
  } else if (restockEvents.length >= 5) {
    confidence = 'low';
  }

  return {
    nextRestockTime,
    timeUntilRestock,
    confidence,
  };
}

/**
 * Get item appearance probability
 */
export function getItemProbability(itemName: string): number {
  if (restockEvents.length === 0) return 0;

  const stats = calculateItemStats();
  const itemStats = stats.get(itemName);

  return itemStats ? itemStats.appearanceRate : 0;
}

/**
 * Get top likely items for next restock
 */
export function getTopLikelyItems(limit: number = 5): Array<{ name: string; probability: number; rarity: string }> {
  const stats = Array.from(calculateItemStats().values())
    .sort((a, b) => b.appearanceRate - a.appearanceRate)
    .slice(0, limit);

  return stats.map(s => ({
    name: s.name,
    probability: s.appearanceRate,
    rarity: s.rarity,
  }));
}

/**
 * Calculate percentile from sorted array
 */
function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  return sorted[lower]! * (1 - weight) + sorted[upper]! * weight;
}

/**
 * Get intervals between appearances of an item (with rapid restock filtering)
 * Uses item-specific thresholds to filter out clustering behavior
 */
/**
 * Build cache for item intervals (performance optimization)
 * Call this once before processing many items to avoid O(n*m) complexity
 */
function buildItemIntervalsCache(): void {
  // Only rebuild if data changed
  if (itemIntervalsCache && itemIntervalsCacheVersion === restockEvents.length) {
    return;
  }

  itemIntervalsCache = new Map();
  itemIntervalsCacheVersion = restockEvents.length;

  // Build appearance map for all items at once
  const appearancesMap = new Map<string, number[]>();

  for (const event of restockEvents) {
    for (const item of event.items) {
      let appearances = appearancesMap.get(item.name);
      if (!appearances) {
        appearances = [];
        appearancesMap.set(item.name, appearances);
      }
      appearances.push(event.timestamp);
    }
  }

  // Calculate intervals for each item
  for (const [itemName, appearances] of appearancesMap.entries()) {
    appearances.sort((a, b) => a - b);

    if (appearances.length < 2) {
      itemIntervalsCache.set(itemName, []);
      continue;
    }

    // Item-specific rapid restock thresholds to filter clustering
    let rapidRestockThreshold: number;

    if (itemName === 'Starweaver' || itemName === 'Dawnbinder' || itemName === 'Moonbinder') {
      rapidRestockThreshold = 5 * 24 * 60 * 60 * 1000; // 5 days
    } else if (itemName === 'Sunflower' || itemName === 'Mythical Eggs') {
      rapidRestockThreshold = 12 * 60 * 60 * 1000; // 12 hours
    } else {
      rapidRestockThreshold = 30 * 60 * 1000; // 30 minutes
    }

    const filteredAppearances: number[] = [appearances[0]!];

    for (let i = 1; i < appearances.length; i++) {
      const timeSinceLast = appearances[i]! - appearances[i - 1]!;
      if (timeSinceLast > rapidRestockThreshold) {
        filteredAppearances.push(appearances[i]!);
      }
    }

    // Calculate intervals
    const intervals: number[] = [];
    for (let i = 1; i < filteredAppearances.length; i++) {
      intervals.push(filteredAppearances[i]! - filteredAppearances[i - 1]!);
    }

    itemIntervalsCache.set(itemName, intervals);
  }
}

function getItemIntervals(itemName: string): number[] {
  // Check cache first (performance optimization for large datasets)
  if (itemIntervalsCache && itemIntervalsCacheVersion === restockEvents.length) {
    const cached = itemIntervalsCache.get(itemName);
    if (cached !== undefined) {
      return cached;
    }
  }

  // If not in cache, build cache for all items
  // (this happens on first call or after data changes)
  buildItemIntervalsCache();

  return itemIntervalsCache?.get(itemName) ?? [];
}

/**
 * Predict when a specific item will appear next
 * Uses item-specific algorithms based on statistical analysis:
 * - Highly variable items (CV > 1.0): Use median with confidence intervals
 * - Moderate variability (CV 0.5-1.0): Use median with tighter intervals
 * - Consistent items (CV < 0.5): Use simple median prediction
 */
export function predictItemNextAppearance(itemName: string): number | null {
  if (restockEvents.length < 2) {
    return null;
  }

  const stats = calculateItemStats();
  const itemStats = stats.get(itemName);

  if (!itemStats || itemStats.appearanceRate === 0) {
    return null;
  }

  // Get filtered intervals for this item
  const intervals = getItemIntervals(itemName);

  if (intervals.length === 0) {
    // Fall back to old method if not enough data
    const summary = getSummaryStats();
    const intervalMs = summary.avgRestockInterval * 60 * 1000;
    if (intervalMs === 0) return null;

    const probabilityDecimal = itemStats.appearanceRate / 100;
    const expectedRestocksUntilAppearance = 1 / probabilityDecimal;
    let nextAppearance = itemStats.lastSeen + (intervalMs * expectedRestocksUntilAppearance);

    const now = Date.now();
    if (nextAppearance < now) {
      const timeSincePrediction = now - nextAppearance;
      const intervalsPassed = Math.ceil(timeSincePrediction / (intervalMs * expectedRestocksUntilAppearance));
      nextAppearance += (intervalMs * expectedRestocksUntilAppearance * intervalsPassed);
    }

    return nextAppearance;
  }

  // Use median for prediction (more robust than mean for variable data)
  const median = percentile(intervals, 50);

  // Calculate coefficient of variation to determine approach
  const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const variance = intervals.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / intervals.length;
  const stdDev = Math.sqrt(variance);
  const cv = stdDev / mean;

  // Item-specific adjustments based on discovered patterns
  // Always err on the side of caution - better to predict conservatively than disappoint users
  let predictionInterval = median;

  if (itemName === 'Sunflower') {
    // Sunflower: Use 55th percentile for more accurate predictions
    // Previous 75th percentile was too conservative (consistently 20h late)
    // Adjusted based on user feedback
    predictionInterval = percentile(intervals, 55);
  } else if (itemName === 'Mythical Eggs') {
    // Mythical Eggs: Use 65th percentile for balanced predictions
    // These can vary wildly (hours to days)
    predictionInterval = percentile(intervals, 65);
  } else if (itemName === 'Starweaver' || itemName === 'Dawnbinder' || itemName === 'Moonbinder') {
    // Celestials: Can go 10-15+ days without appearing
    // Use 80th percentile to account for long tail distribution
    // These are rare enough that conservative estimates are critical
    predictionInterval = percentile(intervals, 80);
  } else {
    // Default: use 65th percentile (slightly conservative)
    predictionInterval = percentile(intervals, 65);
  }

  // Predict next appearance based on last seen + prediction interval
  let nextAppearance = itemStats.lastSeen + predictionInterval;

  // If prediction is in the past, project forward
  const now = Date.now();
  if (nextAppearance < now) {
    const timeSinceLast = now - itemStats.lastSeen;
    const intervalsPassed = Math.ceil(timeSinceLast / predictionInterval);
    nextAppearance = itemStats.lastSeen + (predictionInterval * intervalsPassed);
  }

  return nextAppearance;
}

/**
 * Predict item next appearance using simpler QPM-GR method (for comparison)
 * Uses appearance rate without clustering filters - typically more optimistic
 */
export function predictItemNextAppearanceSimple(itemName: string): number | null {
  if (restockEvents.length < 2) {
    return null;
  }

  const stats = calculateItemStats();
  const itemStats = stats.get(itemName);

  if (!itemStats || itemStats.appearanceRate === 0) {
    return null;
  }

  const summary = getSummaryStats();
  const intervalMs = summary.avgRestockInterval * 60 * 1000;

  if (intervalMs === 0) {
    return null;
  }

  // Calculate expected number of restocks until this item appears
  // If item appears 50% of the time, we expect it in ~2 restocks
  const probabilityDecimal = itemStats.appearanceRate / 100;
  const expectedRestocksUntilAppearance = 1 / probabilityDecimal;

  // Predict next appearance based on last seen + expected wait time
  let nextAppearance = itemStats.lastSeen + (intervalMs * expectedRestocksUntilAppearance);

  // If prediction is in the past, project forward to next future occurrence
  const now = Date.now();
  if (nextAppearance < now) {
    const timeSincePrediction = now - nextAppearance;
    const intervalsPassed = Math.ceil(timeSincePrediction / (intervalMs * expectedRestocksUntilAppearance));
    nextAppearance += (intervalMs * expectedRestocksUntilAppearance * intervalsPassed);
  }

  return nextAppearance;
}

/**
 * Get dual predictions (optimistic QPM-GR and conservative MGQPM)
 * Returns both predictions for display as a range
 */
export interface DualPrediction {
  optimistic: number | null; // QPM-GR simple method (typically earlier)
  conservative: number | null; // MGQPM percentile method (typically later)
}

export function predictItemDual(itemName: string): DualPrediction {
  const optimistic = predictItemNextAppearanceSimple(itemName);
  const conservative = predictItemNextAppearance(itemName);

  return {
    optimistic,
    conservative,
  };
}

/**
 * Detailed prediction statistics for an item
 */
export interface DetailedPredictionStats {
  itemName: string;
  predictedTime: number | null; // Simple point estimate
  confidence: 'high' | 'medium' | 'low' | 'none';

  // Statistical details
  median: number | null; // Median interval in ms
  mean: number | null; // Mean interval in ms
  stdDev: number | null; // Standard deviation in ms
  coefficientOfVariation: number | null; // CV (stdDev/mean)

  // Confidence intervals
  interval25th: number | null; // 25th percentile interval
  interval75th: number | null; // 75th percentile interval
  interval95th: number | null; // 95th percentile interval

  // Probability windows (likelihood of appearing in next X time)
  probabilityNext6h: number | null; // % chance in next 6 hours
  probabilityNext24h: number | null; // % chance in next 24 hours
  probabilityNext7d: number | null; // % chance in next 7 days

  // Data quality
  sampleSize: number; // Number of intervals analyzed
  lastSeen: number | null; // When item was last seen

  // Interpretation
  variability: 'highly_variable' | 'moderate' | 'consistent';
  recommendedApproach: string; // Human-readable recommendation
}

/**
 * Get detailed prediction statistics for an item
 * This provides comprehensive data for the "Show Detailed Stats" UI toggle
 */
export function getDetailedPredictionStats(itemName: string): DetailedPredictionStats {
  const defaultStats: DetailedPredictionStats = {
    itemName,
    predictedTime: null,
    confidence: 'none',
    median: null,
    mean: null,
    stdDev: null,
    coefficientOfVariation: null,
    interval25th: null,
    interval75th: null,
    interval95th: null,
    probabilityNext6h: null,
    probabilityNext24h: null,
    probabilityNext7d: null,
    sampleSize: 0,
    lastSeen: null,
    variability: 'consistent',
    recommendedApproach: 'Not enough data for prediction',
  };

  if (restockEvents.length < 2) {
    return defaultStats;
  }

  const stats = calculateItemStats();
  const itemStats = stats.get(itemName);

  if (!itemStats) {
    return defaultStats;
  }

  const intervals = getItemIntervals(itemName);

  if (intervals.length === 0) {
    return {
      ...defaultStats,
      lastSeen: itemStats.lastSeen,
      sampleSize: 0,
    };
  }

  // Calculate statistics
  const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const variance = intervals.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / intervals.length;
  const stdDev = Math.sqrt(variance);
  const cv = stdDev / mean;

  const median = percentile(intervals, 50);
  const p25 = percentile(intervals, 25);
  const p75 = percentile(intervals, 75);
  const p95 = percentile(intervals, 95);

  // Determine confidence based on sample size and CV
  let confidence: 'high' | 'medium' | 'low' | 'none' = 'none';
  if (intervals.length >= 10 && cv < 0.5) {
    confidence = 'high';
  } else if (intervals.length >= 5 && cv < 1.0) {
    confidence = 'medium';
  } else if (intervals.length >= 3) {
    confidence = 'low';
  }

  // Determine variability category
  let variability: 'highly_variable' | 'moderate' | 'consistent' = 'consistent';
  let recommendedApproach = '';

  if (cv > 1.0) {
    variability = 'highly_variable';
    recommendedApproach = 'Highly unpredictable - use probability ranges instead of point estimates';
  } else if (cv > 0.5) {
    variability = 'moderate';
    recommendedApproach = 'Moderate variability - predictions have wider confidence intervals';
  } else {
    variability = 'consistent';
    recommendedApproach = 'Fairly consistent pattern - predictions are reliable';
  }

  // Calculate probability windows using empirical CDF
  // This gives the actual observed probability based on historical intervals
  const now = Date.now();
  const timeSinceLastSeen = now - itemStats.lastSeen;

  // Time windows in ms
  const sixHours = 6 * 60 * 60 * 1000;
  const twentyFourHours = 24 * 60 * 60 * 1000;
  const sevenDays = 7 * 24 * 60 * 60 * 1000;

  // Empirical probability calculation:
  // Count what fraction of historical intervals were ≤ (timeSinceLastSeen + window)
  const calculateProbability = (windowMs: number): number => {
    const targetTime = timeSinceLastSeen + windowMs;

    // Count how many historical intervals were at or below this time
    const countAtOrBelow = intervals.filter(interval => interval <= targetTime).length;

    // Probability = fraction of intervals that were this short or shorter
    const prob = countAtOrBelow / intervals.length;

    return Math.round(prob * 100);
  };

  const probabilityNext6h = calculateProbability(sixHours);
  const probabilityNext24h = calculateProbability(twentyFourHours);
  const probabilityNext7d = calculateProbability(sevenDays);

  // Get predicted time
  const predictedTime = predictItemNextAppearance(itemName);

  return {
    itemName,
    predictedTime,
    confidence,
    median,
    mean,
    stdDev,
    coefficientOfVariation: cv,
    interval25th: p25,
    interval75th: p75,
    interval95th: p95,
    probabilityNext6h,
    probabilityNext24h,
    probabilityNext7d,
    sampleSize: intervals.length,
    lastSeen: itemStats.lastSeen,
    variability,
    recommendedApproach,
  };
}

/**
 * Save prediction history to storage
 */
function savePredictions(): void {
  try {
    const predictions: Record<string, PredictionRecord[]> = {};
    predictionHistory.forEach((history, itemName) => {
      predictions[itemName] = history;
    });
    storage.set(STORAGE_KEY_PREDICTIONS, predictions);
  } catch (error) {
    log('⚠️ Failed to save prediction history', error);
  }
}

/**
 * Generate and store predictions for tracked items
 */
export function generatePredictions(): void {
  const now = Date.now();

  for (const itemName of TRACKED_PREDICTION_ITEMS) {
    // Keep existing predictions (even if overdue) until the item actually restocks
    if (activePredictions.has(itemName)) {
      continue;
    }

    const predictedTime = predictItemNextAppearance(itemName);
    if (predictedTime && predictedTime > now) {
      activePredictions.set(itemName, predictedTime);
      log(`📊 Generated prediction for ${itemName}: ${new Date(predictedTime).toLocaleString()}`);
    }
  }

  // Save active predictions to storage
  saveActivePredictions();
}

/**
 * Save active predictions to storage
 */
function saveActivePredictions(): void {
  try {
    const predictions: Record<string, number> = {};
    activePredictions.forEach((time, itemName) => {
      predictions[itemName] = time;
    });
    storage.set(STORAGE_KEY_ACTIVE_PREDICTIONS, predictions);
  } catch (error) {
    log('⚠️ Failed to save active predictions', error);
  }
}

/**
 * Check if a restock matches any active predictions and record accuracy
 */
export function checkPredictionAccuracy(event: RestockEvent): void {
  for (const item of event.items) {
    // Only track specific items
    if (!TRACKED_PREDICTION_ITEMS.includes(item.name)) {
      continue;
    }

    const predictedTime = activePredictions.get(item.name);

    // Create prediction record
    const record: PredictionRecord = {
      itemName: item.name,
      predictedTime: predictedTime || null as any, // null if no prediction was active
      predictionMadeAt: predictedTime ? Date.now() : null as any, // Approximate
      actualTime: event.timestamp,
      differenceMinutes: predictedTime ? Math.round((event.timestamp - predictedTime) / (1000 * 60)) : null,
      differenceMs: predictedTime ? (event.timestamp - predictedTime) : null,
    };

    // Add to history (keep max 3)
    let history = predictionHistory.get(item.name) || [];
    history.unshift(record); // Add to front
    if (history.length > 3) {
      history = history.slice(0, 3);
    }
    predictionHistory.set(item.name, history);

    // Clear active prediction if it existed
    if (predictedTime) {
      activePredictions.delete(item.name);
      saveActivePredictions(); // Persist the deletion
      log(`📊 Prediction accuracy for ${item.name}: ${record.differenceMinutes! > 0 ? `${record.differenceMinutes} min late` : `${Math.abs(record.differenceMinutes!)} min early`}`);
    } else {
      log(`📊 Recorded restock for ${item.name} (no active prediction)`);
    }
  }

  // Save to storage
  savePredictions();

  // Generate new predictions
  generatePredictions();
}

/**
 * Get prediction history for an item (up to 3 most recent)
 */
export function getPredictionHistory(itemName: string): PredictionRecord[] {
  return predictionHistory.get(itemName) || [];
}

/**
 * Get all prediction histories
 */
export function getAllPredictionHistories(): Map<string, PredictionRecord[]> {
  return new Map(predictionHistory);
}

/**
 * Get the current active prediction timestamp for an item (if any)
 */
export function getActivePrediction(itemName: string): number | null {
  return activePredictions.get(itemName) ?? null;
}

/**
 * Clear all shop restock data (restocks, predictions, config)
 * Only clears shop restock specific keys, not all QPM data
 */
export function clearAllRestocks(): void {
  restockEvents = [];
  restockEventsSorted = true;
  lastStorageMergeMs = Date.now();
  config.importedFiles = [];
  config.watchedItems = [];
  predictionHistory.clear();
  activePredictions.clear();

  // Clear only shop restock specific storage keys by setting empty values
  storage.set(STORAGE_KEY_RESTOCKS, []);
  storage.set(STORAGE_KEY_CONFIG, { importedFiles: [], watchedItems: [] });
  storage.set(STORAGE_KEY_MIGRATION, 0);
  storage.set(STORAGE_KEY_PREDICTIONS, {});
  storage.set(STORAGE_KEY_ACTIVE_PREDICTIONS, {});

  notifyListeners();
  log('📊 Cleared shop restock history and prediction data');
}

/**
 * Subscribe to restock updates
 */
export function onRestockUpdate(callback: () => void): () => void {
  updateCallbacks.push(callback);
  return () => {
    updateCallbacks = updateCallbacks.filter(cb => cb !== callback);
  };
}

function notifyListeners(): void {
  updateCallbacks.forEach(cb => {
    try {
      cb();
    } catch (error) {
      log('⚠️ Restock callback error', error);
    }
  });
}

/**
 * Mark a file as imported
 */
export function markFileAsImported(fileName: string): void {
  if (!config.importedFiles.includes(fileName)) {
    config.importedFiles.push(fileName);
    saveRestocks();
  }
}

/**
 * Check if file has been imported
 */
export function isFileImported(fileName: string): boolean {
  return config.importedFiles.includes(fileName);
}

/**
 * Get watched items
 */
export function getWatchedItems(): string[] {
  return [...config.watchedItems];
}

/**
 * Add item to watch list
 */
export function addWatchedItem(itemName: string): void {
  if (!config.watchedItems.includes(itemName)) {
    config.watchedItems.push(itemName);
    saveRestocks();
    notifyListeners();
  }
}

/**
 * Remove item from watch list
 */
export function removeWatchedItem(itemName: string): void {
  config.watchedItems = config.watchedItems.filter(i => i !== itemName);
  saveRestocks();
  notifyListeners();
}
