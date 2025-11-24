// src/features/shopRestockTracker.ts
// Shop Restock Tracker - Import, analyze, and predict shop restocks

import { storage } from '../utils/storage';
import { log } from '../utils/logger';
import { notify } from '../core/notifications';

const STORAGE_KEY_RESTOCKS = 'qpm.shopRestocks.v1';
const STORAGE_KEY_CONFIG = 'qpm.shopRestockConfig.v1';
const STORAGE_KEY_MIGRATION = 'qpm.shopRestocks.migration';
const CURRENT_MIGRATION_VERSION = 1;

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
  'Echeveria': 'rare',
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
  'Blueberry': 'common',
  'Apple': 'common',
  'Tulip': 'common',
  'Tomato': 'common',
  'Daffodil': 'common',
  'Corn': 'common',
  'Coconut': 'common',
  'Banana': 'common',
  'Camellia': 'common',
  'Squash': 'common',
};

/**
 * Get item rarity based on name
 */
function getItemRarity(itemName: string): ItemStats['rarity'] {
  return ITEM_RARITY_MAP[itemName] || 'common';
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

    const savedConfig = storage.get<RestockConfig>(STORAGE_KEY_CONFIG, {
      importedFiles: [],
      watchedItems: [],
    });
    config = savedConfig;

    // Migrate old data if needed
    const migratedCount = migrateRestockData();

    // Load default restock data on first run (if no data exists)
    if (restockEvents.length === 0) {
      loadDefaultRestockData();
    }

    isInitialized = true;

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
 * Load default restock data from pre-parsed Discord history
 * Called automatically on first run when no user data exists
 */
function loadDefaultRestockData(): void {
  try {
    // Dynamically import default data to avoid increasing bundle size unnecessarily
    import('../data/defaultRestockData').then(module => {
      const defaultEvents = module.DEFAULT_RESTOCK_EVENTS;

      if (defaultEvents && defaultEvents.length > 0) {
        log(`📥 Loading ${defaultEvents.length} default restock events...`);

        // Add all default events
        restockEvents = [...defaultEvents];

        // Save to storage
        saveRestocks();

        log(`✅ Loaded default restock data: ${defaultEvents.length} events`);

        // Notify listeners so UI can update with the loaded data
        notifyListeners();
      } else {
        log('ℹ️ No default restock data available');
      }
    }).catch(error => {
      log('⚠️ Failed to load default restock data', error);
    });
  } catch (error) {
    log('⚠️ Failed to import default restock data', error);
  }
}

/**
 * Save restocks to storage
 * Merges with existing storage to prevent data loss from multiple tabs
 */
function saveRestocks(): void {
  try {
    // Load current storage to merge with in-memory data
    const storedEvents = storage.get<RestockEvent[]>(STORAGE_KEY_RESTOCKS, []);
    const storedIds = new Set(restockEvents.map(e => e.id));

    // Add any events from storage that aren't in memory
    let merged = 0;
    for (const event of storedEvents) {
      if (!storedIds.has(event.id)) {
        restockEvents.push(event);
        storedIds.add(event.id);
        merged++;
      }
    }

    // Sort by timestamp
    if (merged > 0) {
      restockEvents.sort((a, b) => a.timestamp - b.timestamp);
      log(`🔄 Merged ${merged} events from storage (multi-tab sync)`);
    }

    // Save merged data
    storage.set(STORAGE_KEY_RESTOCKS, restockEvents);
    storage.set(STORAGE_KEY_CONFIG, config);
  } catch (error) {
    log('⚠️ Failed to save restock data', error);
  }
}

/**
 * Add a restock event
 */
export function addRestockEvent(event: RestockEvent): void {
  // Check for duplicates (same timestamp)
  const exists = restockEvents.some(e => e.id === event.id);
  if (exists) {
    log(`⚠️ Duplicate restock event skipped`);
    return;
  }

  restockEvents.push(event);

  // Sort by timestamp to keep events in chronological order
  restockEvents.sort((a, b) => a.timestamp - b.timestamp);

  log(`✅ Saved restock event (${event.source}): Total ${restockEvents.length} events`);

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

  // Sort by timestamp
  restockEvents.sort((a, b) => a.timestamp - b.timestamp);

  saveRestocks();
  notifyListeners();

  log(`📊 Added ${added} new restock events (${events.length - added} duplicates skipped)`);
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
 * Predict when a specific item will appear next
 * Based on item's last appearance, restock interval, and appearance rate
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

  const summary = getSummaryStats();
  const intervalMs = summary.avgRestockInterval * 60 * 1000;

  if (intervalMs === 0) {
    return null;
  }

  // Calculate expected number of restocks until this item appears
  // If item appears 50% of the time, we expect it in ~2 restocks
  // If item appears 25% of the time, we expect it in ~4 restocks
  const probabilityDecimal = itemStats.appearanceRate / 100;
  const expectedRestocksUntilAppearance = 1 / probabilityDecimal;

  // Predict next appearance based on last seen + expected wait time
  let nextAppearance = itemStats.lastSeen + (intervalMs * expectedRestocksUntilAppearance);

  // If prediction is in the past, project forward to next future occurrence
  const now = Date.now();
  if (nextAppearance < now) {
    // Calculate how many intervals have passed since the prediction
    const timeSincePrediction = now - nextAppearance;
    const intervalsPassed = Math.ceil(timeSincePrediction / (intervalMs * expectedRestocksUntilAppearance));

    // Add enough intervals to get to the future
    nextAppearance += (intervalMs * expectedRestocksUntilAppearance * intervalsPassed);
  }

  return nextAppearance;
}

/**
 * Clear all restock data
 */
export function clearAllRestocks(): void {
  restockEvents = [];
  config.importedFiles = [];
  saveRestocks();
  notifyListeners();
  log('📊 Cleared all restock data');
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
