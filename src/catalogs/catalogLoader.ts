// src/catalogs/catalogLoader.ts
// Runtime catalog capture system using Object.* method interception
// Based on proven MG Catalog Dumper pattern
// NOTE: This module is intentionally self-contained with no external imports
// to avoid circular dependency issues during early initialization

import type { GameCatalogs } from './types';

// Local log function to avoid circular imports
const CATALOG_PREFIX = '[QPM Catalog]';
function catalogLog(...args: unknown[]): void {
  console.log(CATALOG_PREFIX, ...args);
}

// ============================================================================
// GLOBAL STATE
// ============================================================================

/**
 * Storage for captured catalogs
 * Exposed globally as window.__QPM_CATALOGS for debugging
 */
const capturedCatalogs: GameCatalogs = {
  itemCatalog: null,
  decorCatalog: null,
  mutationCatalog: null,
  eggCatalog: null,
  petCatalog: null,
  petAbilities: null,
  plantCatalog: null,
  weatherCatalog: null,
};

// Track objects we've already scanned to avoid infinite loops
const seenObjects = new WeakSet<object>();

// Ready state tracking
let catalogsReady = false;
const readyCallbacks: Array<(catalogs: GameCatalogs) => void> = [];
const errorCallbacks: Array<(error: Error) => void> = [];

// Store original Object methods before any interception
const NativeObject = Object;
const originalKeys = NativeObject.keys;
const originalValues = NativeObject.values;
const originalEntries = NativeObject.entries;

// ============================================================================
// CATALOG DETECTION FUNCTIONS
// These identify catalogs by their unique "fingerprint" properties
// ============================================================================

/**
 * Detect itemCatalog: has WateringCan, PlanterPot, Shovel, RainbowPotion
 * with coinPrice and creditPrice properties
 */
function looksLikeItemCatalog(obj: Record<string, unknown>, keys: string[]): boolean {
  const required = ['WateringCan', 'PlanterPot', 'Shovel', 'RainbowPotion'];
  if (!required.every(k => keys.includes(k))) return false;

  const sample = obj.WateringCan;
  return (
    sample !== null &&
    typeof sample === 'object' &&
    'coinPrice' in sample &&
    'creditPrice' in sample
  );
}

/**
 * Detect decorCatalog: has rock types with coinPrice/creditPrice
 */
function looksLikeDecorCatalog(obj: Record<string, unknown>, keys: string[]): boolean {
  const required = ['SmallRock', 'MediumRock', 'LargeRock'];
  if (!required.every(k => keys.includes(k))) return false;

  const sample = obj.SmallRock;
  return (
    sample !== null &&
    typeof sample === 'object' &&
    'coinPrice' in sample &&
    'creditPrice' in sample
  );
}

/**
 * Detect mutationCatalog: has Gold, Rainbow, Wet, etc. with baseChance/coinMultiplier
 */
function looksLikeMutationCatalog(obj: Record<string, unknown>, keys: string[]): boolean {
  const required = ['Gold', 'Rainbow', 'Wet', 'Chilled', 'Frozen'];
  if (!required.every(k => keys.includes(k))) return false;

  const sample = obj.Gold;
  return (
    sample !== null &&
    typeof sample === 'object' &&
    'baseChance' in sample &&
    'coinMultiplier' in sample
  );
}

/**
 * Detect eggCatalog: has egg types with faunaSpawnWeights and secondsToHatch
 */
function looksLikeEggCatalog(obj: Record<string, unknown>, keys: string[]): boolean {
  const required = ['CommonEgg', 'UncommonEgg', 'RareEgg', 'LegendaryEgg'];
  if (!required.every(k => keys.includes(k))) return false;

  const sample = obj.CommonEgg;
  return (
    sample !== null &&
    typeof sample === 'object' &&
    'faunaSpawnWeights' in sample &&
    'secondsToHatch' in sample
  );
}

/**
 * Detect petCatalog: has pet species with diet array and coinsToFullyReplenishHunger
 * RELAXED DETECTION: Only requires 3 of 5 common pets to allow for game updates
 */
function looksLikePetCatalog(obj: Record<string, unknown>, keys: string[]): boolean {
  const commonPets = ['Worm', 'Snail', 'Bee', 'Chicken', 'Bunny', 'Turkey', 'Goat'];

  // Count how many common pets are present
  const matchCount = commonPets.filter(k => keys.includes(k)).length;

  // Require at least 3 common pets (more flexible for game updates)
  if (matchCount < 3) return false;

  // Find a sample pet to check structure
  const sampleKey = commonPets.find(k => keys.includes(k));
  if (!sampleKey) return false;

  const sample = obj[sampleKey];
  return (
    sample !== null &&
    typeof sample === 'object' &&
    'coinsToFullyReplenishHunger' in sample &&
    'diet' in sample &&
    Array.isArray((sample as { diet: unknown }).diet)
  );
}

/**
 * Detect petAbilities: has ability names with trigger and baseParameters
 */
function looksLikePetAbilities(obj: Record<string, unknown>, keys: string[]): boolean {
  const required = ['ProduceScaleBoost', 'DoubleHarvest', 'SeedFinderI', 'CoinFinderI'];
  if (!required.every(k => keys.includes(k))) return false;

  const sample = obj.ProduceScaleBoost;
  return (
    sample !== null &&
    typeof sample === 'object' &&
    'trigger' in sample &&
    'baseParameters' in sample
  );
}

/**
 * Detect plantCatalog: has plant species with seed/plant/crop sub-objects
 * RELAXED DETECTION: Only requires 3 of 5 common plants to allow for game updates
 */
function looksLikePlantCatalog(obj: Record<string, unknown>, keys: string[]): boolean {
  const commonPlants = ['Carrot', 'Strawberry', 'Aloe', 'Blueberry', 'Apple', 'Tomato', 'Corn'];

  // Count how many common plants are present
  const matchCount = commonPlants.filter(k => keys.includes(k)).length;

  // Require at least 3 common plants (more flexible for game updates)
  if (matchCount < 3) return false;

  // Find a sample plant to check structure
  const sampleKey = commonPlants.find(k => keys.includes(k));
  if (!sampleKey) return false;

  const sample = obj[sampleKey];
  return (
    sample !== null &&
    typeof sample === 'object' &&
    'seed' in sample &&
    'plant' in sample &&
    'crop' in sample
  );
}

// ============================================================================
// DEEP SCAN LOGIC
// ============================================================================

/**
 * Recursively scan an object and its children for catalog patterns
 * Limited to depth 3 to avoid performance issues
 */
function deepScan(obj: unknown, depth: number): void {
  if (!obj || typeof obj !== 'object') return;
  if (seenObjects.has(obj as object)) return;
  seenObjects.add(obj as object);

  let keys: string[] = [];
  try {
    keys = originalKeys.call(NativeObject, obj);
  } catch {
    return;
  }

  if (keys.length === 0) return;

  const record = obj as Record<string, unknown>;

  try {
    // Check each catalog type (only if not already captured)
    if (!capturedCatalogs.itemCatalog && looksLikeItemCatalog(record, keys)) {
      capturedCatalogs.itemCatalog = record as GameCatalogs['itemCatalog'];
      catalogLog('Captured itemCatalog');
    }

    if (!capturedCatalogs.decorCatalog && looksLikeDecorCatalog(record, keys)) {
      capturedCatalogs.decorCatalog = record as GameCatalogs['decorCatalog'];
      catalogLog('Captured decorCatalog');
    }

    if (!capturedCatalogs.mutationCatalog && looksLikeMutationCatalog(record, keys)) {
      capturedCatalogs.mutationCatalog = record as GameCatalogs['mutationCatalog'];
      catalogLog('Captured mutationCatalog');
    }

    if (!capturedCatalogs.eggCatalog && looksLikeEggCatalog(record, keys)) {
      capturedCatalogs.eggCatalog = record as GameCatalogs['eggCatalog'];
      catalogLog('Captured eggCatalog');
    }

    if (!capturedCatalogs.petCatalog && looksLikePetCatalog(record, keys)) {
      capturedCatalogs.petCatalog = record as GameCatalogs['petCatalog'];
      catalogLog(`✅ Captured petCatalog with ${keys.length} species:`, keys.slice(0, 10).join(', '), '...');
    }

    if (!capturedCatalogs.petAbilities && looksLikePetAbilities(record, keys)) {
      capturedCatalogs.petAbilities = record as GameCatalogs['petAbilities'];
      catalogLog('Captured petAbilities');
    }

    if (!capturedCatalogs.plantCatalog && looksLikePlantCatalog(record, keys)) {
      capturedCatalogs.plantCatalog = record as GameCatalogs['plantCatalog'];
      catalogLog(`✅ Captured plantCatalog with ${keys.length} species:`, keys.slice(0, 10).join(', '), '...');
    }

    // Check if essential catalogs are ready and notify waiters
    checkAndNotifyReady();
  } catch (e) {
    // Silently ignore detection errors
  }

  // Don't recurse too deep - performance optimization
  if (depth >= 3) return;

  // Recursively scan child objects
  for (const key of keys) {
    try {
      const value = record[key];
      if (value && typeof value === 'object') {
        deepScan(value, depth + 1);
      }
    } catch {
      // Ignore access errors
    }
  }
}

/**
 * Entry point for scanning an object
 */
function maybeCapture(obj: unknown): void {
  try {
    deepScan(obj, 0);
  } catch {
    // Silently ignore
  }
}

// ============================================================================
// READY STATE MANAGEMENT
// ============================================================================

/**
 * Check if essential catalogs are loaded and notify waiting callbacks
 */
function checkAndNotifyReady(): void {
  if (catalogsReady) return;

  // Consider ready when petCatalog is available (most important for automation)
  // Other catalogs are nice-to-have but not blocking
  const hasEssentials = capturedCatalogs.petCatalog !== null;

  if (hasEssentials) {
    catalogsReady = true;
    catalogLog('Essential catalogs ready');

    // Expose globally for debugging
    try {
      if (typeof window !== 'undefined') {
        (window as any).__QPM_CATALOGS = capturedCatalogs;
      }
      // Also try unsafeWindow for userscript compatibility
      if (typeof (globalThis as any).unsafeWindow !== 'undefined') {
        ((globalThis as any).unsafeWindow as any).__QPM_CATALOGS = capturedCatalogs;
      }
    } catch (err) {
      catalogLog('Failed to expose __QPM_CATALOGS to window:', err);
    }

    // Notify all waiting callbacks
    for (const callback of readyCallbacks) {
      try {
        callback(capturedCatalogs);
      } catch (e) {
        console.error('[Catalog] Ready callback error:', e);
      }
    }
    readyCallbacks.length = 0;
  }
}

// ============================================================================
// OBJECT.* METHOD HOOKS
// ============================================================================

/**
 * Install hooks on Object.keys, Object.values, Object.entries
 * These intercept all iterations over objects in the game code
 */
function installHooks(): void {
  try {
    // Hook Object.keys
    NativeObject.keys = function hookedKeys(target: object): string[] {
      maybeCapture(target);
      return originalKeys.call(NativeObject, target);
    };

    // Hook Object.values
    if (originalValues) {
      NativeObject.values = function hookedValues<T>(target: Record<string, T>): T[] {
        maybeCapture(target);
        return originalValues.call(NativeObject, target);
      };
    }

    // Hook Object.entries
    if (originalEntries) {
      NativeObject.entries = function hookedEntries<T>(target: Record<string, T>): [string, T][] {
        maybeCapture(target);
        return originalEntries.call(NativeObject, target);
      };
    }

    catalogLog('Object.* hooks installed');
  } catch (e) {
    console.error('[Catalog] Failed to install hooks:', e);
  }
}

/**
 * Remove hooks and restore original Object methods
 */
function removeHooks(): void {
  try {
    NativeObject.keys = originalKeys;
    if (originalValues) {
      NativeObject.values = originalValues;
    }
    if (originalEntries) {
      NativeObject.entries = originalEntries;
    }
    catalogLog('Object.* hooks removed');
  } catch {
    // Ignore
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Get current captured catalogs (may be partially loaded)
 */
export function getCatalogs(): GameCatalogs {
  return capturedCatalogs;
}

/**
 * Check if catalogs are ready
 */
export function areCatalogsReady(): boolean {
  return catalogsReady;
}

/**
 * Wait for catalogs to be ready
 * @param timeoutMs Maximum time to wait (default 15 seconds)
 * @returns Promise that resolves with catalogs or rejects on timeout
 */
export function waitForCatalogs(timeoutMs: number = 15000): Promise<GameCatalogs> {
  return new Promise((resolve, reject) => {
    // Already ready
    if (catalogsReady) {
      resolve(capturedCatalogs);
      return;
    }

    // Set up timeout
    const timeoutId = setTimeout(() => {
      // Remove from callbacks
      const readyIdx = readyCallbacks.indexOf(onReady);
      if (readyIdx !== -1) readyCallbacks.splice(readyIdx, 1);
      const errorIdx = errorCallbacks.indexOf(onError);
      if (errorIdx !== -1) errorCallbacks.splice(errorIdx, 1);

      reject(new Error(`Catalogs not ready within ${timeoutMs}ms`));
    }, timeoutMs);

    const onReady = (catalogs: GameCatalogs) => {
      clearTimeout(timeoutId);
      resolve(catalogs);
    };

    const onError = (error: Error) => {
      clearTimeout(timeoutId);
      reject(error);
    };

    readyCallbacks.push(onReady);
    errorCallbacks.push(onError);
  });
}

/**
 * Register callback for when catalogs are ready
 * If already ready, callback is called immediately
 * @returns Unsubscribe function
 */
export function onCatalogsReady(callback: (catalogs: GameCatalogs) => void): () => void {
  if (catalogsReady) {
    try {
      callback(capturedCatalogs);
    } catch (e) {
      console.error('[Catalog] onCatalogsReady callback error:', e);
    }
    return () => {};
  }

  readyCallbacks.push(callback);
  return () => {
    const idx = readyCallbacks.indexOf(callback);
    if (idx !== -1) readyCallbacks.splice(idx, 1);
  };
}

/**
 * Initialize the catalog loader
 * MUST be called as early as possible (ideally at document-start)
 */
export function initCatalogLoader(): void {
  catalogLog('Initializing catalog loader...');
  installHooks();

  // Auto-remove hooks after catalogs are ready (optimization)
  // Keep them for longer to catch late-loading catalog updates
  onCatalogsReady(() => {
    setTimeout(() => {
      // Only remove if all important catalogs are captured
      if (
        capturedCatalogs.petCatalog &&
        capturedCatalogs.plantCatalog &&
        capturedCatalogs.eggCatalog
      ) {
        catalogLog('Removing hooks after successful capture');
        removeHooks();
      }
    }, 30000); // Increased from 5s to 30s to catch late-loading species
  });
}

/**
 * Force cleanup - call when script unloads
 */
export function cleanupCatalogLoader(): void {
  removeHooks();
  readyCallbacks.length = 0;
  errorCallbacks.length = 0;
}

/**
 * Diagnostic: Manually check and log current catalog status
 * Useful for debugging catalog loading issues
 */
export function diagnoseCatalogs(): void {
  console.log('[QPM Catalog Diagnostics]');
  console.log('Catalogs Ready:', catalogsReady);
  console.log('Hooks Active:', NativeObject.keys !== originalKeys);

  const catalogs = capturedCatalogs;

  console.log('\nPlant Catalog:',
    catalogs.plantCatalog ? `✅ ${Object.keys(catalogs.plantCatalog).length} species` : '❌ Not captured'
  );
  if (catalogs.plantCatalog) {
    console.log('  Species:', Object.keys(catalogs.plantCatalog).join(', '));
  }

  console.log('\nPet Catalog:',
    catalogs.petCatalog ? `✅ ${Object.keys(catalogs.petCatalog).length} species` : '❌ Not captured'
  );
  if (catalogs.petCatalog) {
    console.log('  Species:', Object.keys(catalogs.petCatalog).join(', '));
  }

  console.log('\nPet Abilities:',
    catalogs.petAbilities ? `✅ ${Object.keys(catalogs.petAbilities).length} abilities` : '❌ Not captured'
  );
  if (catalogs.petAbilities) {
    console.log('  Abilities:', Object.keys(catalogs.petAbilities).slice(0, 20).join(', '), '...');
  }

  console.log('\nMutation Catalog:',
    catalogs.mutationCatalog ? `✅ ${Object.keys(catalogs.mutationCatalog).length} mutations` : '❌ Not captured'
  );

  console.log('\n💡 Tip: Access catalogs directly via window.__QPM_CATALOGS');
  console.log('💡 To check if specific species exist:');
  console.log('   window.__QPM_CATALOGS.plantCatalog["PineTree"]');
  console.log('   Object.keys(window.__QPM_CATALOGS.plantCatalog)');
}

// Expose diagnostic function globally for debugging
if (typeof window !== 'undefined') {
  (window as any).__QPM_DiagnoseCatalogs = diagnoseCatalogs;
}
