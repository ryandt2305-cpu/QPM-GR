/**
 * Garden Data Access Utilities
 * Provides functions to read garden state from Jotai atoms
 * 
 * NOTE: This accesses the same data as Arie's mod (Atoms.data.garden.get()):
 * - Arie's mod: Uses centralized Atoms wrapper → Atoms.data.garden.get()
 * - This code: Direct Jotai cache access → window.jotaiAtomCache.cache
 * 
 * Both access 'myOwnCurrentGardenObjectAtom' which contains:
 * {
 *   tileObjects: Record<slot_number, object>,  // Garden tiles
 *   boardwalkTileObjects: Record<slot_number, object>  // Boardwalk tiles
 * }
 * 
 * Each object has 'tileRef' (plant type ID), 'species', 'plantedAt', etc.
 */

import { log } from './logger';

/**
 * Celestial plant tile references from hardcoded-data
 */
export const CELESTIAL_PLANTS = {
  MOONBINDER: 10, // tileRefsTallPlants.MoonCelestialPlant
  DAWNBINDER: 4,  // tileRefsTallPlants.DawnCelestialPlant
};

/**
 * Check if player has a Moonbinder in their garden
 * NOTE: Currently always returns false - Jotai atom access not yet working
 */
export function hasMoonbinder(): boolean {
  try {
    // TODO: Implement proper Jotai atom access without triggering game protection
    // The game appears to block direct atom access attempts
    return false;
  } catch (error) {
    log('❌ Error checking for Moonbinder:', error);
    return false;
  }
}

/**
 * Check if player has a Dawnbinder in their garden
 * NOTE: Currently always returns false - Jotai atom access not yet working
 */
export function hasDawnbinder(): boolean {
  try {
    // TODO: Implement proper Jotai atom access without triggering game protection
    return false;
  } catch (error) {
    log('❌ Error checking for Dawnbinder:', error);
    return false;
  }
}

/**
 * Check if player is currently in their garden
 * NOTE: Currently always returns false - Jotai atom access not yet working
 */
export function isInGarden(): boolean {
  try {
    // TODO: Implement proper Jotai atom access without triggering game protection
    return false;
  } catch (error) {
    return false;
  }
}

/**
 * Get both celestial plant statuses
 */
export function getCelestialPlantStatus(): {
  hasMoonbinder: boolean;
  hasDawnbinder: boolean;
  isInGarden: boolean;
} {
  const inGarden = isInGarden();
  
  if (!inGarden) {
    return {
      hasMoonbinder: false,
      hasDawnbinder: false,
      isInGarden: false,
    };
  }

  return {
    hasMoonbinder: hasMoonbinder(),
    hasDawnbinder: hasDawnbinder(),
    isInGarden: true,
  };
}

/**
 * DEBUG: List all available atom labels in the cache
 * This helps find the correct atom names the game is using
 */
export function listAllAtomLabels(): string[] {
  log('⚠️ Atom label listing disabled (avoids triggering protection)');
  return [];
}

/**
 * DEBUG: Get raw garden data structure using proper Jotai store methods
 * NOTE: Disabled - atom access triggers game protection
 */
export function inspectGardenAtom(): any {
  try {
    // TODO: Re-enable when we find a safe way to access atoms
    return {
      _debug: {
        disabled: true,
        reason: 'Atom access triggers game protection',
      }
    };
  } catch (error) {
    return { error: String(error) };
  }
}
