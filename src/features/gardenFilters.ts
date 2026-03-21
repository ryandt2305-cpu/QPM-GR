// src/features/gardenFilters.ts
// Filter visible crops and eggs in the garden by dimming non-matching tiles
// Uses PIXI stage traversal and child labels for filtering

import { storage } from '../utils/storage';
import { log } from '../utils/logger';
import { visibleInterval } from '../utils/timerManager';
import { getGardenSnapshot, getMapSnapshot } from './gardenBridge';
import { normalizeMutationName } from '../utils/cropMultipliers';
import { getAllPlantSpecies as getCatalogPlantSpecies, getEggCatalog, getPlantSpecies } from '../catalogs/gameCatalogs';

// Declare unsafeWindow for TypeScript
declare const unsafeWindow: (Window & typeof globalThis) | undefined;

const STORAGE_KEY = 'qpm.gardenFilters.v1';
const DIM_ALPHA = 0.1; // Barely visible

// Tile node cache — rebuilt only when stage children count changes
interface TileNode {
  node: any;
  x: number;
  y: number;
}
let tileNodeCache: TileNode[] | null = null;
let tileNodeCacheStageLength = -1;

// Species name to PIXI View label mapping
// Derived from floraSpeciesDex: PIXI label = plant.name + ' View'
const SPECIES_TO_VIEW: Record<string, string> = {
  'Carrot': 'Carrot Plant View',
  'Cabbage': 'Cabbage Plant View',
  'Strawberry': 'Strawberry Plant View',
  'Aloe': 'Aloe Plant View',
  'Beet': 'Beet Plant View',
  'Rose': 'Rose Plant View',
  'FavaBean': 'Fava Bean Plant View',
  'Delphinium': 'Delphinium Plant View',
  'Blueberry': 'Blueberry Plant View',
  'Apple': 'Apple Tree View',
  'OrangeTulip': 'Tulip Plant View',
  'Tomato': 'Tomato Plant View',
  'Daffodil': 'Daffodil Plant View',
  'Corn': 'Corn Plant View',
  'Watermelon': 'Watermelon Plant View',
  'Pumpkin': 'Pumpkin Plant View',
  'Echeveria': 'Echeveria Plant View',
  'Pear': 'Pear Tree View',
  'Gentian': 'Gentian Plant View',
  'Coconut': 'Coconut Tree View',
  'PineTree': 'Pine Tree View',
  'Banana': 'Banana Plant View',
  'Lily': 'Lily Plant View',
  'Camellia': 'Camellia Hedge View',
  'Squash': 'Squash Plant View',
  'Peach': 'Peach Tree View',
  'BurrosTail': "Burro's Tail Plant View",
  'Mushroom': 'Mushroom Plant View',
  'Cactus': 'Cactus Plant View',
  'Bamboo': 'Bamboo Plant View',
  'Poinsettia': 'Poinsettia Bush View',
  'VioletCort': 'Violet Cort Plant View',
  'Chrysanthemum': 'Chrysanthemum Bush View',
  'Date': 'Date Palm View',
  'Grape': 'Grape Plant View',
  'Pepper': 'Pepper Plant View',
  'Lemon': 'Lemon Tree View',
  'PassionFruit': 'Passion Fruit Plant View',
  'DragonFruit': 'Dragon Fruit Plant View',
  'Cacao': 'Cacao Plant View',
  'Lychee': 'Lychee Plant View',
  'Sunflower': 'Sunflower Plant View',
  'Starweaver': 'Starweaver Plant View',
  'DawnCelestial': 'Dawnbinder View',
  'MoonCelestial': 'Moonbinder View',
  // Clover species (separate dex, confirmed from catalog)
  'Clover': 'Clover Patch Plant View',
  'FourLeafClover': 'Four-Leaf Clover Plant View',
};

function normalizeMutationFilterKey(raw: unknown): string | null {
  if (raw == null) return null;
  const text = String(raw).trim();
  if (!text) return null;

  const canonical = normalizeMutationName(text) ?? text;
  let key = canonical.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!key) return null;

  // Game payloads may use either Amberlit or Ambershine for the same amber lunar mutation.
  if (key === 'ambershine' || key === 'amberlit') {
    key = 'amberlit';
  }

  return key;
}

function collectMutationKeys(value: unknown, out: Set<string>, seen: WeakSet<object> = new WeakSet<object>(), depth = 0): void {
  if (value == null || depth > 4) return;

  if (typeof value === 'string' || typeof value === 'number') {
    const normalized = normalizeMutationFilterKey(value);
    if (normalized) out.add(normalized);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectMutationKeys(item, out, seen, depth + 1);
    }
    return;
  }

  if (value instanceof Set || value instanceof Map) {
    const values = value instanceof Set ? Array.from(value.values()) : Array.from(value.values());
    collectMutationKeys(values, out, seen, depth + 1);
    return;
  }

  if (typeof value !== 'object') return;
  if (seen.has(value)) return;
  seen.add(value);

  const record = value as Record<string, unknown>;
  collectMutationKeys(record.mutations, out, seen, depth + 1);
  collectMutationKeys(record.mutation, out, seen, depth + 1);

  // Fallback for descriptor-like payloads.
  const descriptorFields = [record.name, record.id, record.label, record.value, record.key];
  for (const field of descriptorFields) {
    if (typeof field === 'string') {
      const normalized = normalizeMutationFilterKey(field);
      if (normalized) out.add(normalized);
    }
  }
}

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

// Cached filter label sets — rebuilt only when config changes, not on every 2s poll
interface CachedFilterSets {
  speciesToShow: Set<string>;
  unknownSpeciesToShow: Set<string>;
  mutationsToShow: Set<string>;
  eggTypesToShow: Set<string>;
  growthStatesToShow: Set<string>;
}
let cachedFilterSets: CachedFilterSets | null = null;

function getOrBuildFilterSets(): CachedFilterSets {
  if (cachedFilterSets !== null) return cachedFilterSets;
  const { speciesToShow, unknownSpeciesToShow } = buildSpeciesLabelSets(config.cropSpecies);
  const mutationsToShow = new Set<string>();
  for (const mutation of config.mutations) {
    const normalized = normalizeMutationFilterKey(mutation);
    if (normalized) mutationsToShow.add(normalized);
  }
  cachedFilterSets = {
    speciesToShow,
    unknownSpeciesToShow,
    mutationsToShow,
    eggTypesToShow: new Set<string>(config.eggTypes),
    growthStatesToShow: new Set<string>(config.growthStates),
  };
  return cachedFilterSets;
}

/**
 * Stats hub species override — when non-null, bypasses main config entirely.
 * Only a species-allow-list is applied; mutations/growthStates/eggTypes are ignored.
 * Never touches config or storage.
 */
let statsHubOverride: string[] | null = null;

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
    collectMutationKeys(slot?.mutations, allMutations);
    collectMutationKeys(slot?.mutation, allMutations);
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
 * Recursively collect all Tile nodes from the PIXI stage into a flat array.
 * Called only when the stage children count changes.
 */
function buildTileNodeCache(node: any, out: TileNode[] = [], depth = 0, maxDepth = 10): TileNode[] {
  if (!node || depth > maxDepth) return out;

  if (node.label && /^Tile \((\d+), (\d+)\)$/.test(node.label)) {
    const match = node.label.match(/^Tile \((\d+), (\d+)\)$/)!;
    out.push({ node, x: parseInt(match[1]!), y: parseInt(match[2]!) });
    // Tiles don't contain other tiles — skip recursing into them
    return out;
  }

  if (node.children && Array.isArray(node.children)) {
    for (const child of node.children) {
      buildTileNodeCache(child, out, depth + 1, maxDepth);
    }
  }

  return out;
}

/**
 * Return cached tile nodes, rebuilding only when stage children count changes.
 */
function getOrBuildTileNodeCache(stage: any): TileNode[] {
  const currentLength: number = stage?.children?.length ?? -1;
  if (tileNodeCache !== null && tileNodeCacheStageLength === currentLength) {
    return tileNodeCache;
  }
  tileNodeCache = buildTileNodeCache(stage);
  tileNodeCacheStageLength = currentLength;
  return tileNodeCache;
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
  unknownSpeciesToShow: Set<string>,
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
        // Plant/Decor filtering.
        // Known species (in SPECIES_TO_VIEW): fast path via PIXI child label.
        // Unknown species (new crops not yet in SPECIES_TO_VIEW): deferred to tile data.
        if (speciesToShow.size > 0 || unknownSpeciesToShow.size > 0) {
          if (speciesToShow.has(childLabel)) {
            speciesMatches = true; // fast path — no tile data needed
          } else if (unknownSpeciesToShow.size > 0) {
            speciesMatches = false; // may be resolved after tile data fetch below
          } else {
            speciesMatches = false;
          }
        }
      }

      // Mutation and growth state filtering REQUIRE garden data.
      // Unknown-species tiles that didn't match via PIXI label also need tile data.
      let mutationMatches = true;
      let growthStateMatches = true;
      const needsGardenData =
        mutationsToShow.size > 0 ||
        growthStatesToShow.size > 0 ||
        (!isEgg && !speciesMatches && unknownSpeciesToShow.size > 0);

      if (needsGardenData) {
        const tileData = getGardenTileData(x, y);
        if (tileData) {
          stats.withData++;

          // Resolve unknown-species match via tile data species field
          if (!isEgg && !speciesMatches && unknownSpeciesToShow.size > 0) {
            speciesMatches = unknownSpeciesToShow.has(tileData.species);
          }

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
          // No garden data — can't verify mutations or growth state, so default to visible
          if (!isEgg && unknownSpeciesToShow.size > 0) speciesMatches = false;
          // mutationMatches and growthStateMatches stay true — can't verify, show by default
        }
      } else {
        // Not filtering by mutations, growth state, or unknown species — no tile data needed
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
      applyFiltersToStage(child, speciesToShow, unknownSpeciesToShow, mutationsToShow, eggTypesToShow, growthStatesToShow, stats, depth + 1, maxDepth);
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
 * Build the two label sets used for PIXI matching from a list of species keys.
 * speciesToShow — PIXI child labels to match (3 candidates per species).
 * unknownSpeciesToShow — catalog keys that had no static or catalog name, fall back to tile data.
 */
function buildSpeciesLabelSets(
  species: string[]
): { speciesToShow: Set<string>; unknownSpeciesToShow: Set<string> } {
  const speciesToShow = new Set<string>();
  const unknownSpeciesToShow = new Set<string>();
  for (const s of species) {
    let mapped = false;
    const staticLabel = SPECIES_TO_VIEW[s];
    if (staticLabel) { speciesToShow.add(staticLabel); mapped = true; }
    const catalogEntry = getPlantSpecies(s);
    const plantDisplayName = (catalogEntry?.plant as any)?.name as string | undefined;
    if (plantDisplayName) { speciesToShow.add(plantDisplayName + ' Plant View'); mapped = true; }
    speciesToShow.add(s + ' Plant View');
    if (!mapped) unknownSpeciesToShow.add(s);
  }
  return { speciesToShow, unknownSpeciesToShow };
}

/**
 * Apply current filters to all tiles in the garden.
 * When statsHubOverride is active, only species filtering is applied (no mutations/
 * growthStates/eggTypes) using the override list — main config is untouched.
 */
function applyFilters(): void {
  // ── Stats hub override path ───────────────────────────────────────────────
  // Takes full priority; main config (including enabled, mutations, etc.) is ignored.
  if (statsHubOverride !== null) {
    try {
      const app = getPixiApp();
      if (!app || !app.stage) return;
      const { speciesToShow, unknownSpeciesToShow } = buildSpeciesLabelSets(statsHubOverride);
      const emptySet = new Set<string>();
      const stats = { visible: 0, dimmed: 0, withData: 0, withoutData: 0 };
      const tileNodes = getOrBuildTileNodeCache(app.stage);
      for (const { node } of tileNodes) {
        applyFiltersToStage(node, speciesToShow, unknownSpeciesToShow, emptySet, emptySet, emptySet, stats, 0, 0);
      }
      log(`🔍 [GARDEN-FILTERS] Override: ${stats.visible} visible, ${stats.dimmed} dimmed`);
    } catch (error) {
      log('⚠️ [GARDEN-FILTERS] Error applying stats hub override', error);
    }
    return;
  }

  // ── Normal config path ────────────────────────────────────────────────────
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

    const { speciesToShow, unknownSpeciesToShow, mutationsToShow, eggTypesToShow, growthStatesToShow } = getOrBuildFilterSets();

    const stats = { visible: 0, dimmed: 0, withData: 0, withoutData: 0 };
    const tileNodes = getOrBuildTileNodeCache(app.stage);
    for (const { node } of tileNodes) {
      applyFiltersToStage(node, speciesToShow, unknownSpeciesToShow, mutationsToShow, eggTypesToShow, growthStatesToShow, stats, 0, 0);
    }

    if (stats.visible + stats.dimmed > 0) {
      const filterInfo = [];
      const totalSpecies = speciesToShow.size + unknownSpeciesToShow.size;
      if (totalSpecies > 0) filterInfo.push(`${totalSpecies} species`);
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

    tileNodeCache = null;
    tileNodeCacheStageLength = -1;
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
      cachedFilterSets = null; // Invalidate cached sets after loading new config
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
 * Uses visibleInterval which pauses when tab is hidden (purely visual update)
 */
function startFilteringPolling(): void {
  if (cleanupInterval !== null) return;

  cleanupInterval = visibleInterval(
    'garden-filters-poll',
    () => {
      // Override always wins — keep it fresh as garden state changes
      if (statsHubOverride !== null) { applyFilters(); return; }
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
    statsHubOverride = null;
    tileNodeCache = null;
    tileNodeCacheStageLength = -1;
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
  cachedFilterSets = null; // Invalidate cached sets whenever config changes
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
 * Stats hub species override — completely isolated from the Garden Filters feature.
 *
 * Pass a non-empty array to show ONLY those species (no mutations, no growth states, no
 * egg type filters — purely a species allow-list). Pass null to release the override and
 * restore the main Garden Filters config without touching it.
 *
 * Does NOT write to storage and does NOT modify config.
 */
export function setStatsHubSpeciesOverride(species: string[] | null): void {
  statsHubOverride = species;
  if (species !== null) {
    applyFilters(); // Apply override immediately
  } else {
    // Release override — restore main config behaviour
    if (config.enabled) {
      applyFilters();
    } else {
      resetFilters();
    }
  }
}

/**
 * Get list of all plant species (for UI).
 * Merges the live plant catalog (auto-updated with the game) with the static
 * SPECIES_TO_VIEW map so newly added crops appear automatically.
 */
export function getAllPlantSpecies(): string[] {
  const staticKeys = Object.keys(SPECIES_TO_VIEW);
  try {
    const catalogKeys = getCatalogPlantSpecies();
    if (catalogKeys.length === 0) return staticKeys;
    const merged = new Set([...staticKeys, ...catalogKeys]);
    return Array.from(merged).sort();
  } catch {
    return staticKeys;
  }
}

/**
 * Get list of all egg types from catalog (auto-updates with the game).
 */
export function getAllEggTypes(): string[] {
  try {
    const catalog = getEggCatalog();
    return catalog ? Object.keys(catalog) : [];
  } catch (error) {
    log('⚠️ Failed to load egg types from catalog', error);
    return [];
  }
}
