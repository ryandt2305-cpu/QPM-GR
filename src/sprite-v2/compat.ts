// sprite-v2/compat.ts - Compatibility layer for old sprite API (canvas-first)

import { canvasToDataUrl } from '../utils/canvasHelpers';
import { scheduleNonBlocking, delay } from '../utils/scheduling';
import { log } from '../utils/logger';
import type { SpriteService } from './types';

let service: SpriteService | null = null;
let serviceReadyResolve: ((svc: SpriteService | null) => void) | null = null;
export const serviceReady: Promise<SpriteService | null> = new Promise((resolve) => {
  serviceReadyResolve = resolve;
});

// Callbacks waiting for sprites to be ready
const spritesReadyCallbacks: Array<() => void> = [];
let spritesReady = false;

/**
 * Register a callback to be called when sprites are ready.
 * If sprites are already ready, the callback is called immediately.
 * Returns an unsubscribe function.
 */
export function onSpritesReady(callback: () => void): () => void {
  if (spritesReady) {
    // Already ready, call immediately
    try {
      callback();
    } catch (e) {
      console.error('[Sprite Compat] onSpritesReady callback error:', e);
    }
    return () => {}; // No-op unsubscribe since already called
  } else {
    spritesReadyCallbacks.push(callback);
    // Return unsubscribe function
    return () => {
      const idx = spritesReadyCallbacks.indexOf(callback);
      if (idx !== -1) {
        spritesReadyCallbacks.splice(idx, 1);
      }
    };
  }
}

/**
 * Check if sprites are ready for use.
 */
export function isSpritesReady(): boolean {
  return spritesReady;
}

function notifySpritesReady(): void {
  spritesReady = true;
  for (const cb of spritesReadyCallbacks) {
    try {
      cb();
    } catch (e) {
      console.error('[Sprite Compat] onSpritesReady callback error:', e);
    }
  }
  spritesReadyCallbacks.length = 0; // Clear callbacks
}

/**
 * All sprite categories supported by the sprite service API
 * IMPORTANT: Kept for compatibility with callers that iterate categories
 */
const SPRITE_CATEGORIES = ['pet', 'plant', 'tallplant', 'crop', 'item', 'decor', 'seed'] as const;

/**
 * Crop-related categories
 * Used for looking up crops, plants, items, seeds, and some special items stored in 'pet' sheet
 * NOTE: Eggs, bulbs, and tulips may be in 'pet' or 'plant' sprite sheets
 */
const CROP_CATEGORIES = ['plant', 'tallplant', 'crop', 'item', 'decor', 'seed', 'pet'] as const;

const dataUrlCache = new Map<string, string>();
const MAX_DATAURL_CACHE_SIZE = 500;

function makeCacheKey(category: string, id: string, mutations: string[] = []): string {
  const mutStr = mutations.length > 0 ? mutations.join(',') : '';
  return `${category}:${id}:${mutStr}`;
}

function cacheDataUrl(key: string, value: string | null): string {
  if (!value) return '';
  if (dataUrlCache.has(key)) {
    return dataUrlCache.get(key)!;
  }
  if (dataUrlCache.size >= MAX_DATAURL_CACHE_SIZE) {
    const firstKey = dataUrlCache.keys().next().value;
    if (firstKey !== undefined) {
      dataUrlCache.delete(firstKey);
    }
  }
  dataUrlCache.set(key, value);
  return value;
}

// Legacy compat used data URL caches and warmup; the canvas-first path relies on PIXI's internal cache.
export function setSpriteService(svc: SpriteService): void {
  service = svc;
  serviceReadyResolve?.(service);
  // Notify all waiting callbacks that sprites are ready
  notifySpritesReady();
}

/**
 * Normalize species names for consistent sprite lookup
 */
function normalizeSpeciesName(species: string | number): string {
  const str = String(species).trim();
  const lower = str.toLowerCase();

  // Celestial crops - Map display names to internal sprite IDs
  // The sprite manifest uses DawnCelestial/MoonCelestial, not Dawnbinder/Moonbinder
  // Also handle common typos: Dawnbiner, Moobinder
  if (lower === 'dawnbinder' || lower === 'dawncelestial' || lower === 'dawnbiner') return 'DawnCelestial';
  if (lower === 'moonbinder' || lower === 'mooncelestial' || lower === 'moobinder') return 'MoonCelestial';

  // Egg variations - handle singular/plural
  if (lower === 'uncommon egg' || lower === 'uncommon eggs' || lower === 'uncommonegg') return 'UncommonEgg';
  if (lower === 'rare egg' || lower === 'rare eggs' || lower === 'rareegg') return 'RareEgg';
  if (lower === 'legendary egg' || lower === 'legendary eggs' || lower === 'legendaryegg') return 'LegendaryEgg';
  if (lower === 'mythical egg' || lower === 'mythical eggs' || lower === 'mythicalegg') return 'MythicalEgg';

  // Flower variations - handle various naming conventions
  if (lower === 'orange tulip' || lower === 'orangetulip') return 'OrangeTulip';
  if (lower === 'red tulip' || lower === 'redtulip') return 'RedTulip';
  if (lower === 'yellow tulip' || lower === 'yellowtulip') return 'YellowTulip';
  if (lower === 'pink tulip' || lower === 'pinktulip') return 'PinkTulip';
  if (lower === 'purple tulip' || lower === 'purpletulip') return 'PurpleTulip';

  // Cacao / cocoa variants - game uses "Cacao" as the internal sprite name
  // Display names are "Cacao Bean" (seed), "Cacao Plant" (plant), "Cacao Fruit" (fruit)
  if (lower === 'cacaobean' || lower === 'cacaobeans' || lower === 'cacaofruit' || lower === 'cacao' || lower === 'cacao bean' || lower === 'cocoa bean' || lower === 'cocoabean' || lower === 'cacao plant' || lower === 'cacao fruit') return 'Cacao';

  // Starweaver variations
  if (lower === 'starweaver') return 'Starweaver';

  // Handle names with spaces - remove spaces and capitalize properly
  // e.g., "cacao bean" -> "CacaoBean", "burro's tail" -> "BurrosTail"
  if (str.includes(' ')) {
    const normalized = str
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('');
    // Remove apostrophes: "Burro's" -> "Burros"
    return normalized.replace(/'/g, '');
  }

  // If already proper case (first letter uppercase), return as-is
  if (str.charAt(0) === str.charAt(0).toUpperCase()) {
    return str;
  }

  // Otherwise capitalize first letter
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

function normalizeMutations(mutations: string[] = []): string[] {
  return (mutations ?? [])
    .map((mut) => String(mut ?? '').trim())
    .filter(Boolean)
    .map((mut) => {
      const lower = mut.toLowerCase();
      if (lower === 'rainbow') return 'Rainbow';
      if (lower === 'gold' || lower === 'golden') return 'Gold';
      return mut.charAt(0).toUpperCase() + mut.slice(1);
    });
}

function getIdVariations(category: string, id: string): string[] {
  const variations = [id]; // Try original display name first

  // Celestial crops: manifest uses suffixes
  // - plant category: "DawnCelestialCrop", "MoonCelestialCrop"
  // - tallplant category: "DawnCelestialPlant", "MoonCelestialPlant"
  if (id === 'DawnCelestial' || id === 'MoonCelestial') {
    if (category === 'plant') {
      variations.push(id + 'Crop');
    }
    if (category === 'tallplant') {
      variations.push(id + 'Plant');
    }
  }

  // Color variants: manifest only has base sprite
  // OrangeTulip, RedTulip, etc. all use "Tulip" sprite
  const colorMatch = id.match(/^(Orange|Red|Yellow|Pink|Purple|White)(.+)$/);
  if (colorMatch && colorMatch[2]) {
    variations.push(colorMatch[2]); // Extract base name (e.g., "Tulip")
  }

  return variations;
}

function tryRenderCanvas(category: string, id: string, mutations: string[] = []): HTMLCanvasElement | null {
  if (!service) {
    console.warn('[Sprite Compat] Service not initialized yet');
    return null;
  }

  try {
    return service.renderToCanvas({ category: category as any, id, mutations });
  } catch (e) {
    console.error(`[Sprite Compat] render failed for ${category}:${id}`, e);
    return null;
  }
}

function renderAcrossCategories(
  categories: readonly string[],
  id: string,
  mutations: string[] = [],
  includeVariants = false
): HTMLCanvasElement | null {
  const targets = includeVariants ? getIdVariations(categories[0] ?? '', id) : [id];

  for (const category of categories) {
    const ids = includeVariants ? getIdVariations(category, id) : targets;
    for (const variant of ids) {
      const canvas = tryRenderCanvas(category, variant, mutations);
      if (canvas) {
        return canvas;
      }
    }
  }

  return null;
}

/**
 * Gets crop sprite canvas by species name or tile ID (no mutations)
 */
export function getCropSpriteCanvas(speciesOrTile: string | number | null | undefined): HTMLCanvasElement | null {
  if (speciesOrTile == null) return null;
  const id = normalizeSpeciesName(speciesOrTile);
  return renderAcrossCategories(CROP_CATEGORIES, id, [], true);
}

/**
 * Gets crop sprite canvas with mutations applied
 */
export function getCropSpriteWithMutations(
  speciesOrTile: string | number | null | undefined,
  mutations: string[] = []
): HTMLCanvasElement | null {
  if (speciesOrTile == null) return null;
  const id = normalizeSpeciesName(speciesOrTile);
  const normalizedMutations = normalizeMutations(mutations);
  return renderAcrossCategories(CROP_CATEGORIES, id, normalizedMutations, true);
}

/**
 * Gets crop sprite data URL by species name or tile ID (legacy API)
 */
export function getCropSpriteDataUrl(speciesOrTile: string | number | null | undefined): string {
  const id = speciesOrTile == null ? '' : String(speciesOrTile);
  const key = makeCacheKey('crop', id);
  if (dataUrlCache.has(key)) {
    return dataUrlCache.get(key)!;
  }
  return cacheDataUrl(key, canvasToDataUrl(getCropSpriteCanvas(speciesOrTile)));
}

/**
 * Gets crop sprite data URL with mutations (legacy API)
 */
export function getCropSpriteDataUrlWithMutations(speciesOrTile: string | number, mutations: string[]): string {
  const key = makeCacheKey('crop', String(speciesOrTile), normalizeMutations(mutations));
  if (dataUrlCache.has(key)) {
    return dataUrlCache.get(key)!;
  }
  return cacheDataUrl(key, canvasToDataUrl(getCropSpriteWithMutations(speciesOrTile, mutations)));
}

/**
 * Gets pet sprite canvas
 */
export function getPetSpriteCanvas(species: string): HTMLCanvasElement | null {
  if (!species) return null;
  const normalized = normalizeSpeciesName(species);
  return tryRenderCanvas('pet', normalized, []);
}

/**
 * Gets pet sprite canvas with mutations applied
 */
export function getPetSpriteWithMutations(species: string, mutations: string[] = []): HTMLCanvasElement | null {
  if (!species) return null;
  const normalized = normalizeSpeciesName(species);
  const normalizedMutations = normalizeMutations(mutations);
  return tryRenderCanvas('pet', normalized, normalizedMutations);
}

/**
 * Gets pet sprite data URL by species name (legacy API)
 */
export function getPetSpriteDataUrl(species: string): string {
  const key = makeCacheKey('pet', species);
  if (dataUrlCache.has(key)) {
    return dataUrlCache.get(key)!;
  }
  return cacheDataUrl(key, canvasToDataUrl(getPetSpriteCanvas(species)));
}

/**
 * Gets pet sprite data URL with mutations (legacy API)
 */
export function getPetSpriteDataUrlWithMutations(species: string, mutations: string[]): string {
  const normalizedMutations = normalizeMutations(mutations);
  const key = makeCacheKey('pet', species, normalizedMutations);
  if (dataUrlCache.has(key)) {
    return dataUrlCache.get(key)!;
  }
  return cacheDataUrl(key, canvasToDataUrl(getPetSpriteWithMutations(species, normalizedMutations)));
}

/**
 * Gets crop sprite canvas by tile ID
 */
export function getCropSpriteByTileId(tileId: string | number | null | undefined): HTMLCanvasElement | null {
  if (tileId == null) return null;
  const id = normalizeSpeciesName(tileId);
  return renderAcrossCategories(['plant', 'tallplant'], id, [], true);
}

/**
 * Gets mutation overlay data URL
 */
export function getMutationOverlayDataUrl(mutation: string): string {
  if (!mutation) return '';
  return canvasToDataUrl(tryRenderCanvas('mutation-overlay', mutation, []));
}

/**
 * Renders plant with mutations
 * OLD API: renderPlantWithMutations(base: HTMLCanvasElement, mutations: string[])
 * NOTE: In new system, we need species/id, not a base canvas
 */
export function renderPlantWithMutations(
  baseOrId: HTMLCanvasElement | string,
  mutations: string[]
): HTMLCanvasElement | null {
  if (typeof baseOrId === 'string') {
    const normalized = normalizeSpeciesName(baseOrId);
    const normalizedMutations = normalizeMutations(mutations);
    return tryRenderCanvas('plant', normalized, normalizedMutations);
  }

  // If it's a canvas, we can't easily reverse-engineer the species
  console.warn('[Sprite Compat] renderPlantWithMutations called with canvas - cannot apply mutations without species ID');
  return baseOrId;
}

/**
 * Creates sprite element (old API for debug views)
 * OLD API: createSpriteElement(sheet: string, index: number, size?: number)
 */
export function createSpriteElement(sheet: string, index: number, size = 64): HTMLDivElement | null {
  const canvas = tryRenderCanvas('any', `${sheet}/${index}`, []);
  if (!canvas) return null;

  const url = canvasToDataUrl(canvas);
  if (!url) return null;

  const el = document.createElement('div');
  el.style.cssText = `width:${size}px;height:${size}px;background:url(${url}) center/contain no-repeat;image-rendering:pixelated;flex-shrink:0;`;
  el.dataset.sheet = sheet;
  el.dataset.index = String(index);
  return el;
}

/**
 * Renders plant sprite
 * OLD API: renderPlantSprite(tileId, species?, mutations?)
 */
export function renderPlantSprite(
  tileId: string | number | null | undefined,
  species?: string | null,
  mutations: string[] = []
): string {
  const id = species || String(tileId ?? '');
  if (!id) return '';
  const normalized = normalizeSpeciesName(id);
  const normalizedMutations = normalizeMutations(mutations);
  return canvasToDataUrl(renderAcrossCategories(['plant', 'tallplant'], normalized, normalizedMutations, true));
}

/**
 * Legacy sprite extractor object for compatibility
 */
export const spriteExtractor = {
  getTile: (sheet: string, index: number): HTMLCanvasElement | null => {
    if (!service) return null;
    try {
      return service.renderToCanvas({ category: 'any', id: `${sheet}/${index}`, mutations: [] });
    } catch (e) {
      return null;
    }
  },

  getCropSprite: (species: string): HTMLCanvasElement | null => getCropSpriteCanvas(species),

  getCropSpriteByTileId,

  getSeedSprite: (seedName: string): HTMLCanvasElement | null => {
    if (!service) return null;
    try {
      return service.renderToCanvas({ category: 'seed', id: seedName, mutations: [] });
    } catch (e) {
      return null;
    }
  },

  getPetSprite: getPetSpriteCanvas,

  renderPlantWithMutations,

  loadSheetFromUrl: async (_url: string, _alias?: string, _forceSize?: 256 | 512): Promise<boolean> => {
    // In new system, all sprites are loaded from manifest automatically
    console.log('[Sprite Compat] loadSheetFromUrl is deprecated - sprites auto-loaded from manifest');
    return true;
  },

  init: (): void => {
    console.log('[Sprite Compat] init() is deprecated - sprite system initializes automatically');
  },
};

/**
 * Exposes the Sprites object for global access
 */
export const Sprites = {
  init: () => {
    console.log('[Sprite Compat] Sprites.init() is deprecated');
  },
  clearCaches: () => {
    if (service) {
      (service as any).state?.srcCan?.clear();
      (service as any).state?.lru?.clear();
    }
  },
  lists: () => {
    if (!service) return { all: [], tiles: [] };
    return {
      all: service.list('any').map((it) => it.key),
      tiles: service.list('any').map((it) => it.key),
    };
  },
};

/**
 * Initialize function
 */
export function initSprites(): void {
  console.log('[Sprite Compat] initSprites() called - system initializes automatically');
}

// Debug helpers
export async function inspectPetSprites(): Promise<void> {
  if (!service) {
    console.error('[Sprite Compat] Service not initialized');
    return;
  }

  const pets = service.list('pet');
  console.log('🐾 Pet sprites loaded:', pets.length);
  console.table(pets.slice(0, 20).map((p) => ({ key: p.key, isAnim: p.isAnim, frames: p.count })));
}

export function renderSpriteGridOverlay(_sheetName = 'plants', _maxTiles = 80): void {
  console.warn('[Sprite Compat] renderSpriteGridOverlay is deprecated in sprite-v2');
}

export function renderAllSpriteSheetsOverlay(_maxTilesPerSheet = 80): void {
  console.warn('[Sprite Compat] renderAllSpriteSheetsOverlay is deprecated in sprite-v2');
}

export function listTrackedSpriteResources(_category = 'all'): Array<{ url: string; families: string[] }> {
  console.warn('[Sprite Compat] listTrackedSpriteResources is deprecated in sprite-v2');
  return [];
}

export function loadTrackedSpriteSheets(_maxSheets = 3, _category = 'all'): Promise<string[]> {
  console.warn('[Sprite Compat] loadTrackedSpriteSheets is deprecated in sprite-v2');
  return Promise.resolve([]);
}

// ============================================================================
// SPRITE CACHE WARMUP (Aries Mod Pattern)
// Pre-renders common sprites during browser idle time to avoid lag when displayed
// ============================================================================

// Warmup configuration
const WARMUP_BATCH_SIZE = 3;  // Sprites per batch (matches Aries Mod)
const WARMUP_DELAY_MS = 8;    // Delay between batches (matches Aries Mod)
const WARMUP_CATEGORIES = ['pet', 'plant', 'crop', 'item'] as const;

// Warmup state
let warmupStarted = false;
let warmupCompleted = false;
type WarmupState = { total: number; done: number; completed: boolean };
let warmupState: WarmupState = { total: 0, done: 0, completed: false };
const warmupListeners = new Set<(state: WarmupState) => void>();

function notifyWarmupProgress(state: Partial<WarmupState>): void {
  Object.assign(warmupState, state);
  for (const listener of warmupListeners) {
    try {
      listener(warmupState);
    } catch {
      // Ignore listener errors
    }
  }
}

/**
 * Subscribe to warmup progress updates.
 * Returns an unsubscribe function.
 */
export function onSpriteWarmupProgress(listener: (state: WarmupState) => void): () => void {
  warmupListeners.add(listener);
  // Emit current state immediately
  try {
    listener(warmupState);
  } catch {
    // Ignore
  }
  return () => warmupListeners.delete(listener);
}

/**
 * Get current warmup state
 */
export function getSpriteWarmupState(): WarmupState {
  return { ...warmupState };
}

/**
 * Pre-warm the sprite cache during browser idle time.
 * Uses scheduleNonBlocking to avoid blocking the main thread.
 * Processes sprites in batches of 3 with 8ms delays (Aries Mod pattern).
 */
export async function warmupSpriteCache(): Promise<void> {
  if (warmupStarted || warmupCompleted) {
    return;
  }
  
  if (!service) {
    // Retry after service is ready
    await serviceReady;
    if (!service) {
      log('⚠️ Sprite warmup: service not available');
      return;
    }
  }

  warmupStarted = true;
  log('🔥 Starting sprite cache warmup...');

  // Collect all sprites to warm up
  const tasks: Array<{ category: string; id: string }> = [];
  const seen = new Set<string>();

  for (const category of WARMUP_CATEGORIES) {
    try {
      const items = service.list(category);
      for (const item of items) {
        const key = item.key;
        if (!key || seen.has(key)) continue;
        seen.add(key);
        
        // Extract base name from key (e.g., "sprite/pet/Cat" -> "Cat")
        const parts = key.split('/').filter(Boolean);
        const id = parts[parts.length - 1] || key;
        tasks.push({ category, id });
      }
    } catch {
      // Ignore category errors
    }
  }

  const total = tasks.length;
  let done = 0;
  
  notifyWarmupProgress({ total, done: 0, completed: false });
  log(`🔥 Warming ${total} sprites in batches of ${WARMUP_BATCH_SIZE}...`);

  // Process in batches
  const processNextBatch = async (startIndex: number): Promise<void> => {
    const batch = tasks.slice(startIndex, startIndex + WARMUP_BATCH_SIZE);
    
    // Process batch items using scheduleNonBlocking
    await Promise.all(
      batch.map(async ({ category, id }) => {
        try {
          await scheduleNonBlocking(() => {
            // This triggers the sprite to be rendered and cached
            if (category === 'pet') {
              getPetSpriteCanvas(id);
            } else {
              getCropSpriteCanvas(id);
            }
          });
          done++;
          notifyWarmupProgress({ done });
        } catch {
          // Ignore individual sprite errors
          done++;
          notifyWarmupProgress({ done });
        }
      })
    );

    // Schedule next batch if there are more
    const nextStart = startIndex + WARMUP_BATCH_SIZE;
    if (nextStart < tasks.length) {
      await delay(WARMUP_DELAY_MS);
      await processNextBatch(nextStart);
    }
  };

  if (tasks.length > 0) {
    await processNextBatch(0);
  }

  warmupCompleted = true;
  notifyWarmupProgress({ completed: true });
  log(`✅ Sprite warmup complete: ${done} sprites cached`);
}

/**
 * Start sprite warmup after a delay (to not interfere with initial load).
 * Uses requestIdleCallback if available for optimal timing.
 */
export function scheduleWarmup(delayMs: number = 2000): void {
  if (warmupStarted || warmupCompleted) {
    return;
  }

  const startWarmup = () => {
    if (typeof (window as any).requestIdleCallback === 'function') {
      (window as any).requestIdleCallback(() => {
        void warmupSpriteCache();
      }, { timeout: 5000 });
    } else {
      void warmupSpriteCache();
    }
  };

  // Wait for sprites to be ready first, then delay
  if (spritesReady) {
    setTimeout(startWarmup, delayMs);
  } else {
    onSpritesReady(() => {
      setTimeout(startWarmup, delayMs);
    });
  }
}
