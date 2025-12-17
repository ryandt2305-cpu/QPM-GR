// sprite-v2/compat.ts - Compatibility layer for old sprite API

import type { SpriteService } from './types';

/**
 * This module provides backward compatibility with the old spriteExtractor API.
 * It wraps the new sprite-v2 system to make it work with existing code.
 */

let service: SpriteService | null = null;

export function setSpriteService(svc: SpriteService): void {
  service = svc;
}

/**
 * Gets crop sprite data URL by species name or tile ID
 * OLD API: getCropSpriteDataUrl(speciesOrTile: string | number)
 * NOTE: Synchronous wrapper around async service
 */
export function getCropSpriteDataUrl(speciesOrTile: string | number | null | undefined): string {
  if (!service) {
    console.warn('[Sprite Compat] Service not initialized yet');
    return '';
  }

  if (speciesOrTile == null) return '';

  const id = String(speciesOrTile);

  try {
    // Try plant first
    let canvas = service.renderToCanvas({ category: 'plant', id, mutations: [] });
    if (canvas) return canvas.toDataURL('image/png');

    // Try tallplant
    canvas = service.renderToCanvas({ category: 'tallplant', id, mutations: [] });
    if (canvas) return canvas.toDataURL('image/png');

    return '';
  } catch (e) {
    console.error('[Sprite Compat] getCropSpriteDataUrl failed:', e);
    return '';
  }
}

/**
 * Gets pet sprite data URL by species name
 * OLD API: getPetSpriteDataUrl(species: string)
 * NOTE: Synchronous wrapper around async service
 */
export function getPetSpriteDataUrl(species: string): string {
  if (!service) {
    console.warn('[Sprite Compat] Service not initialized yet');
    return '';
  }

  if (!species) return '';

  try {
    const canvas = service.renderToCanvas({ category: 'pet', id: species, mutations: [] });
    if (!canvas) return '';
    return canvas.toDataURL('image/png');
  } catch (e) {
    console.error('[Sprite Compat] getPetSpriteDataUrl failed:', e);
    return '';
  }
}

/**
 * Gets crop sprite canvas by tile ID
 * OLD API: getCropSpriteByTileId(tileId: string | number)
 */
export function getCropSpriteByTileId(tileId: string | number | null | undefined): HTMLCanvasElement | null {
  if (!service) {
    console.warn('[Sprite Compat] Service not initialized yet');
    return null;
  }

  if (tileId == null) return null;

  const id = String(tileId);

  try {
    // Try plant first
    let canvas = service.renderToCanvas({ category: 'plant', id, mutations: [] });
    if (canvas) return canvas;

    // Try tallplant
    canvas = service.renderToCanvas({ category: 'tallplant', id, mutations: [] });
    if (canvas) return canvas;

    return null;
  } catch (e) {
    console.error('[Sprite Compat] getCropSpriteByTileId failed:', e);
    return null;
  }
}

/**
 * Gets mutation overlay data URL
 * OLD API: getMutationOverlayDataUrl(mutation: string)
 * NOTE: Synchronous wrapper around async service
 */
export function getMutationOverlayDataUrl(mutation: string): string {
  if (!service) {
    console.warn('[Sprite Compat] Service not initialized yet');
    return '';
  }

  if (!mutation) return '';

  try {
    const canvas = service.renderToCanvas({ category: 'mutation-overlay', id: mutation, mutations: [] });
    if (!canvas) return '';
    return canvas.toDataURL('image/png');
  } catch (e) {
    console.error('[Sprite Compat] getMutationOverlayDataUrl failed:', e);
    return '';
  }
}

/**
 * Renders plant with mutations
 * OLD API: renderPlantWithMutations(base: HTMLCanvasElement, mutations: string[])
 * NOTE: In new system, we need species/id, not a base canvas
 */
export function renderPlantWithMutations(baseOrId: HTMLCanvasElement | string, mutations: string[]): HTMLCanvasElement | null {
  if (!service) {
    console.warn('[Sprite Compat] Service not initialized yet');
    return null;
  }

  // If baseOrId is a string (species name), use it directly
  if (typeof baseOrId === 'string') {
    try {
      return service.renderToCanvas({ category: 'plant', id: baseOrId, mutations });
    } catch (e) {
      console.error('[Sprite Compat] renderPlantWithMutations failed:', e);
      return null;
    }
  }

  // If it's a canvas, we can't easily reverse-engineer the species
  // Log a warning and return the base canvas unchanged
  console.warn('[Sprite Compat] renderPlantWithMutations called with canvas - cannot apply mutations without species ID');
  return baseOrId;
}

/**
 * Gets pet sprite canvas
 * OLD API: getPetSpriteCanvas(species: string)
 */
export function getPetSpriteCanvas(species: string): HTMLCanvasElement | null {
  if (!service) {
    console.warn('[Sprite Compat] Service not initialized yet');
    return null;
  }

  if (!species) return null;

  try {
    return service.renderToCanvas({ category: 'pet', id: species, mutations: [] });
  } catch (e) {
    console.error('[Sprite Compat] getPetSpriteCanvas failed:', e);
    return null;
  }
}

/**
 * Creates sprite element (old API for debug views)
 * OLD API: createSpriteElement(sheet: string, index: number, size?: number)
 */
export function createSpriteElement(sheet: string, index: number, size = 64): HTMLDivElement | null {
  if (!service) {
    console.warn('[Sprite Compat] Service not initialized yet');
    return null;
  }

  try {
    const canvas = service.renderToCanvas({ category: 'any', id: `${sheet}/${index}`, mutations: [] });
    if (!canvas) return null;

    const url = canvas.toDataURL('image/png');
    const el = document.createElement('div');
    el.style.cssText = `width:${size}px;height:${size}px;background:url(${url}) center/contain no-repeat;image-rendering:pixelated;flex-shrink:0;`;
    el.dataset.sheet = sheet;
    el.dataset.index = String(index);
    return el;
  } catch (e) {
    console.error('[Sprite Compat] createSpriteElement failed:', e);
    return null;
  }
}

/**
 * Renders plant sprite
 * OLD API: renderPlantSprite(tileId, species?, mutations?)
 * NOTE: Synchronous wrapper around async service
 */
export function renderPlantSprite(tileId: string | number | null | undefined, species?: string | null, mutations: string[] = []): string {
  if (!service) {
    console.warn('[Sprite Compat] Service not initialized yet');
    return '';
  }

  const id = species || String(tileId);
  if (!id) return '';

  try {
    // Try plant first
    let canvas = service.renderToCanvas({ category: 'plant', id, mutations });
    if (canvas) return canvas.toDataURL('image/png');

    // Try tallplant
    canvas = service.renderToCanvas({ category: 'tallplant', id, mutations });
    if (canvas) return canvas.toDataURL('image/png');

    return '';
  } catch (e) {
    console.error('[Sprite Compat] renderPlantSprite failed:', e);
    return '';
  }
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

  getCropSprite: (species: string): HTMLCanvasElement | null => {
    if (!service) return null;
    try {
      return service.renderToCanvas({ category: 'plant', id: species, mutations: [] });
    } catch (e) {
      return null;
    }
  },

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

export function renderSpriteGridOverlay(sheetName = 'plants', maxTiles = 80): void {
  console.warn('[Sprite Compat] renderSpriteGridOverlay is deprecated in sprite-v2');
}

export function renderAllSpriteSheetsOverlay(maxTilesPerSheet = 80): void {
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
