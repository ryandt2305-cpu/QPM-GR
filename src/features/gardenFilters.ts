// src/features/gardenFilters.ts
// Filter visible crops and eggs in the garden by dimming non-matching tiles
// Uses PIXI stage traversal and child labels for filtering

import { storage } from '../utils/storage';
import { log } from '../utils/logger';
import { criticalInterval } from '../utils/timerManager';
import { getGardenSnapshot, getMapSnapshot } from './gardenBridge';

// Declare unsafeWindow for TypeScript
declare const unsafeWindow: (Window & typeof globalThis) | undefined;

const STORAGE_KEY = 'qpm.gardenFilters.v1';
const DIM_ALPHA = 0.1; // Barely visible

// Species name to PIXI View label mapping
const SPECIES_TO_VIEW: Record<string, string> = {
  'Carrot': 'Carrot Plant View',
  'Strawberry': 'Strawberry Plant View',
  'Aloe': 'Aloe Vera Plant View',
  'FavaBean': 'Fava Bean Plant View',
  'Delphinium': 'Delphinium Plant View',
  'Blueberry': 'Blueberry Plant View',
  'Apple': 'Apple Tree View',
  'OrangeTulip': 'Tulip Plant View',
  'Tomato': 'Tomato Plant View',
  'Daffodil': 'Daffodil Plant View',
  'Mushroom': 'Mushroom Plant View',
  'Sunflower': 'Sunflower Plant View',
  'Corn': 'Corn Plant View',
  'Pepper': 'Pepper Plant View',
  'Watermelon': 'Watermelon Plant View',
  'Squash': 'Squash Plant View',
  'Pumpkin': 'Pumpkin Plant View',
  'Lemon': 'Lemon Tree View',
  'Grape': 'Grape Plant View',
  'Coconut': 'Coconut Tree View',
  'Banana': 'Banana Plant View',
  'PassionFruit': 'Passion Fruit Plant View',
  'Lychee': 'Lychee Plant View',
  'DragonFruit': 'Dragon Fruit Plant View',
  'Cacao': 'Cacao Plant View',
  'Lily': 'Lily Plant View',
  'Chrysanthemum': 'Chrysanthemum Bush View',
  'PineTree': 'Pine Tree View',
  'Poinsettia': 'Poinsettia Bush View',
  'Cactus': 'Cactus Plant View',
  'BurrosTail': "Burro's Tail Plant View",
  'Echeveria': 'Echeveria Plant View',
  'Bamboo': 'Bamboo Plant View',
  'Camellia': 'Camellia Hedge View',
  'MoonCelestial': 'Moonbinder View',
  'DawnCelestial': 'Dawnbinder View',
  'Starweaver': 'Starweaver Plant View',
};

export interface GardenFiltersConfig {
  enabled: boolean;
  mutations: string[]; // List of mutations to show (Rainbow, Gold, Frozen, etc)
  cropSpecies: string[]; // List of crop species to show (Carrot, Strawberry, etc)
  eggTypes: string[]; // List of egg types to show (CommonEgg, RareEgg, etc)
  growthStates: ('mature' | 'growing')[]; // Growth state filter ([] = show all)
}

let config: GardenFiltersConfig = {
  enabled: false,
  mutations: [],
  cropSpecies: [],
  eggTypes: [],
  growthStates: [],
};

const listeners = new Set<(config: GardenFiltersConfig) => void>();
let cleanupInterval: (() => void) | null = null;

/**
 * Get the page window context (unsafeWindow for Tampermonkey, or globalThis fallback)
 */
function getPageWindow(): any {
  return typeof unsafeWindow !== 'undefined' && unsafeWindow
    ? unsafeWindow
    : globalThis;
}

/**
 * Access PIXI app via QPM's own capture system
 */
function getPixiApp(): any {
  try {
    const pageWin = getPageWindow();
    const captured = pageWin.__QPM_PIXI_CAPTURED__;
    if (captured && captured.app) {
      return captured.app;
    }
    return null;
  } catch (error) {
    log('⚠️ [GARDEN-FILTERS] Error accessing PIXI app', error);
    return null;
  }
}

/**
 * Extract all unique mutations from all slots in a tile
 * Mutations are stored per-slot in the slots array, not at the tile level
 */
function getTileMutations(tileData: any): string[] {
  if (!tileData?.slots || !Array.isArray(tileData.slots)) {
    return [];
  }

  const allMutations = new Set<string>();

  for (const slot of tileData.slots) {
    if (slot.mutations && Array.isArray(slot.mutations)) {
      slot.mutations.forEach((m: string) => allMutations.add(m));
    }
  }

  return Array.from(allMutations);
}

/**
 * Get growth state of a plant tile
 * Returns 'growing' if plant hasn't matured yet, 'mature' if it has
 */
function getGrowthState(tileData: any): 'growing' | 'mature' | null {
  if (!tileData) return null;

  // Check if it's a plant (eggs don't have growth states in the same way)
  if (tileData.objectType !== 'plant') return null;

  const now = Date.now();
  const maturedAt = tileData.maturedAt;

  if (!maturedAt) return null;

  return now < maturedAt ? 'growing' : 'mature';
}

/**
 * Get garden tile data for PIXI coordinates using the map's coordinate system
 *
 * How it works:
 * 1. Convert PIXI coords (x, y) to globalIdx using formula: x + y * cols
 * 2. Use map.globalTileIdxToDirtTile[globalIdx] to get the local dirt tile index
 * 3. Access snapshot.tileObjects[localIdx] to get the actual tile data
 * 4. Same for boardwalk tiles
 */
function getGardenTileData(x: number, y: number): any {
  const snapshot = getGardenSnapshot();
  const map = getMapSnapshot();

  if (!snapshot || !map) return null;

  // Convert PIXI coordinates to global tile index
  // CRITICAL: Formula is x + y * cols, NOT y * cols + x
  const globalIdx = x + y * map.cols;

  // Check dirt tiles (garden tiles)
  const dirtMapping = map.globalTileIdxToDirtTile?.[globalIdx];
  if (dirtMapping) {
    const localIdx = dirtMapping.dirtTileIdx;
    const tileData = snapshot.tileObjects?.[localIdx];
    if (tileData) return tileData;
  }

  // Check boardwalk tiles
  const boardwalkMapping = map.globalTileIdxToBoardwalk?.[globalIdx];
  if (boardwalkMapping) {
    const localIdx = boardwalkMapping.boardwalkTileIdx;
    const tileData = snapshot.boardwalkTileObjects?.[localIdx];
    if (tileData) return tileData;
  }

  return null;
}

/**
 * Traverse PIXI stage and apply filters based on child labels and mutations
 *
 * How it works:
 * 1. Find all nodes with label "Tile (x, y)"
 * 2. Check the first child's label (e.g., "Carrot Plant View" or "Egg")
 * 3. Use coordinate math to look up garden data
 * 4. Check species/egg type and mutations
 * 5. Dim tiles that don't match filters
 */
function applyFiltersToStage(
  node: any,
  speciesToShow: Set<string>,
  mutationsToShow: Set<string>,
  eggTypesToShow: Set<string>,
  growthStatesToShow: Set<string>,
  stats: { visible: number; dimmed: number; withData: number; withoutData: number },
  depth: number = 0,
  maxDepth: number = 10
): void {
  if (!node || depth > maxDepth) return;

  // Check if this is a Tile container
  if (node.label && /^Tile \((\d+), (\d+)\)$/.test(node.label)) {
    const match = node.label.match(/^Tile \((\d+), (\d+)\)$/);
    const childLabel = node.children?.[0]?.label;

    // Skip empty tiles and sprite-only tiles
    if (match && childLabel && childLabel !== 'Sprite') {
      const x = parseInt(match[1]!);
      const y = parseInt(match[2]!);

      // Species/Egg filtering can work from PIXI labels alone (no garden data needed)
      let speciesMatches = true;
      let eggMatches = true;

      const isEgg = childLabel === 'Egg';

      if (isEgg) {
        // Egg filtering - for now, we can't filter eggs without garden data
        // TODO: Add egg type to PIXI label or use different approach
        if (eggTypesToShow.size > 0) {
          // For eggs, we need garden data to get egg type
          const tileData = getGardenTileData(x, y);
          if (tileData) {
            const eggType = tileData.eggType || tileData.species;
            eggMatches = eggTypesToShow.has(eggType);
          } else {
            // No data for egg, show it (don't filter unknown eggs)
            eggMatches = true;
          }
        }
      } else {
        // Plant/Decor filtering - use PIXI child label directly
        if (speciesToShow.size > 0) {
          speciesMatches = speciesToShow.has(childLabel);
        }
      }

      // Mutation and growth state filtering REQUIRE garden data
      let mutationMatches = true;
      let growthStateMatches = true;
      const needsGardenData = mutationsToShow.size > 0 || growthStatesToShow.size > 0;

      if (needsGardenData) {
        const tileData = getGardenTileData(x, y);
        if (tileData) {
          stats.withData++;

          // Check mutations (ANY slot has ANY selected mutation)
          if (mutationsToShow.size > 0) {
            const tileMutations = getTileMutations(tileData);
            mutationMatches = tileMutations.some((m: string) => mutationsToShow.has(m));

            // Debug first tile with data
            if (stats.withData === 1) {
              log(`[GARDEN-FILTERS-DEBUG] First tile with data (${x}, ${y}): species=${tileData.species}, mutations=${JSON.stringify(tileMutations)}, mutationMatches=${mutationMatches}`);
            }
          }

          // Check growth state
          if (growthStatesToShow.size > 0) {
            const growthState = getGrowthState(tileData);
            growthStateMatches = growthState !== null && growthStatesToShow.has(growthState);
          }
        } else {
          stats.withoutData++;
          // No garden data = can't verify mutations or growth state
          // Don't show tiles when filtering by these if we can't verify
          mutationMatches = false;
          growthStateMatches = false;
        }
      } else {
        // Not filtering by mutations or growth state, don't need garden data
        stats.withoutData++;
      }

      const shouldShow = speciesMatches && eggMatches && mutationMatches && growthStateMatches;

      if (shouldShow) {
        node.alpha = 1.0;
        stats.visible++;
      } else {
        node.alpha = DIM_ALPHA;
        stats.dimmed++;
      }
    }
  }

  // Recursively traverse children
  if (node.children && Array.isArray(node.children)) {
    for (const child of node.children) {
      applyFiltersToStage(child, speciesToShow, mutationsToShow, eggTypesToShow, growthStatesToShow, stats, depth + 1, maxDepth);
    }
  }
}

/**
 * Reset all tile alphas to 1.0
 */
function resetFiltersOnStage(
  node: any,
  depth: number = 0,
  maxDepth: number = 10
): void {
  if (!node || depth > maxDepth) return;

  if (node.label && /^Tile \(\d+, \d+\)$/.test(node.label)) {
    node.alpha = 1.0;
  }

  if (node.children && Array.isArray(node.children)) {
    for (const child of node.children) {
      resetFiltersOnStage(child, depth + 1, maxDepth);
    }
  }
}

/**
 * Apply current filters to all tiles in the garden
 * Uses child label matching for species and coordinate math for data lookup
 */
function applyFilters(): void {
  if (!config.enabled) {
    resetFilters();
    return;
  }

  try {
    const app = getPixiApp();
    if (!app || !app.stage) {
      log('⚠️ [GARDEN-FILTERS] PIXI app/stage not available');
      return;
    }

    // Convert selected species to view labels
    const speciesToShow = new Set<string>();

    // Add selected crop species
    for (const species of config.cropSpecies) {
      const viewLabel = SPECIES_TO_VIEW[species];
      if (viewLabel) {
        speciesToShow.add(viewLabel);
      }
    }

    // Add selected mutations
    const mutationsToShow = new Set<string>(config.mutations);

    // Add selected egg types
    const eggTypesToShow = new Set<string>(config.eggTypes);

    // Add selected growth states
    const growthStatesToShow = new Set<string>(config.growthStates);

    const stats = { visible: 0, dimmed: 0, withData: 0, withoutData: 0 };
    applyFiltersToStage(app.stage, speciesToShow, mutationsToShow, eggTypesToShow, growthStatesToShow, stats);

    if (stats.visible + stats.dimmed > 0) {
      const filterInfo = [];
      if (speciesToShow.size > 0) filterInfo.push(`${speciesToShow.size} species`);
      if (mutationsToShow.size > 0) {
        filterInfo.push(`${mutationsToShow.size} mutations`);
        filterInfo.push(`${stats.withData} mapped, ${stats.withoutData} unmapped`);
      }
      if (growthStatesToShow.size > 0) {
        filterInfo.push(`${growthStatesToShow.size} growth states`);
      }
      const filterDesc = filterInfo.length > 0 ? ` (${filterInfo.join(', ')})` : '';
      log(`🔍 [GARDEN-FILTERS] Applied${filterDesc}: ${stats.visible} visible, ${stats.dimmed} dimmed`);
    } else {
      log('🔍 [GARDEN-FILTERS] No tiles found');
    }
  } catch (error) {
    log('⚠️ [GARDEN-FILTERS] Error applying filters', error);
  }
}

/**
 * Reset all tiles to fully visible (alpha 1.0)
 */
function resetFilters(): void {
  try {
    const app = getPixiApp();
    if (!app || !app.stage) {
      return;
    }

    resetFiltersOnStage(app.stage);
    log('🔍 [GARDEN-FILTERS] All tiles visible');
  } catch (error) {
    log('⚠️ [GARDEN-FILTERS] Error resetting filters', error);
  }
}

/**
 * Load config from storage
 */
function loadConfig(): void {
  try {
    const stored = storage.get<Partial<GardenFiltersConfig> | null>(STORAGE_KEY, null);
    if (stored && typeof stored === 'object') {
      config = {
        enabled: stored.enabled ?? config.enabled,
        mutations: stored.mutations ?? config.mutations,
        cropSpecies: stored.cropSpecies ?? config.cropSpecies,
        eggTypes: stored.eggTypes ?? config.eggTypes,
        growthStates: stored.growthStates ?? config.growthStates,
      };
    }
  } catch (error) {
    log('⚠️ Failed to load garden filters config', error);
  }
}

/**
 * Save config to storage and notify listeners
 */
function saveConfig(): void {
  try {
    storage.set(STORAGE_KEY, config);
    notifyListeners();
  } catch (error) {
    log('⚠️ Failed to save garden filters config', error);
  }
}

/**
 * Notify all config listeners
 */
function notifyListeners(): void {
  for (const listener of listeners) {
    try {
      listener({ ...config });
    } catch (error) {
      log('⚠️ Garden filters listener error', error);
    }
  }
}

/**
 * Start polling interval to apply filters
 * Uses criticalInterval which is visibility-aware and pauses when tab is hidden
 */
function startFilteringPolling(): void {
  if (cleanupInterval !== null) return;

  cleanupInterval = criticalInterval(
    'garden-filters-poll',
    () => {
      if (!config.enabled) return;
      applyFilters();
    },
    2000 // Every 2 seconds
  );

  log('✅ [GARDEN-FILTERS] Polling started (2s interval, visibility-aware)');
}

/**
 * Stop polling interval
 */
function stopFilteringPolling(): void {
  if (cleanupInterval !== null) {
    cleanupInterval();
    cleanupInterval = null;
    log('⏹️ [GARDEN-FILTERS] Polling stopped');
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Initialize the garden filters system
 * Called once during app startup
 */
export function initializeGardenFilters(): void {
  loadConfig();
  startFilteringPolling();
  log('✅ [GARDEN-FILTERS] System initialized', config);
}

/**
 * Get current config (immutable copy)
 */
export function getGardenFiltersConfig(): GardenFiltersConfig {
  return { ...config };
}

/**
 * Update config and save to storage
 * Immediately applies or resets filters based on enabled state
 */
export function updateGardenFiltersConfig(updates: Partial<GardenFiltersConfig>): void {
  config = { ...config, ...updates };
  saveConfig();

  if (config.enabled) {
    applyFilters(); // Apply immediately
  } else {
    resetFilters(); // Reset immediately
  }
}

/**
 * Subscribe to config changes
 * @returns Unsubscribe function
 */
export function subscribeToGardenFiltersConfig(
  listener: (config: GardenFiltersConfig) => void
): () => void {
  listeners.add(listener);
  listener({ ...config }); // Call immediately with current config
  return () => listeners.delete(listener);
}

/**
 * Manually trigger filter application (for "Apply Filters" button)
 */
export function applyGardenFiltersNow(): void {
  applyFilters();
}

/**
 * Manually reset all filters (for "Reset All" button)
 */
export function resetGardenFiltersNow(): void {
  resetFilters();
}

/**
 * Get list of all plant species (for UI)
 */
export function getAllPlantSpecies(): string[] {
  return Object.keys(SPECIES_TO_VIEW);
}

/**
 * Get list of all egg types from catalog (future-proof)
 */
export function getAllEggTypes(): string[] {
  try {
    const catalogs = (typeof window !== 'undefined' && (window as any).__QPM_CATALOGS) || {};
    const eggCatalog = catalogs.eggCatalog || {};

    // Return egg type keys from catalog
    return Object.keys(eggCatalog);
  } catch (error) {
    log('⚠️ Failed to load egg types from catalog', error);
    return [];
  }
}
