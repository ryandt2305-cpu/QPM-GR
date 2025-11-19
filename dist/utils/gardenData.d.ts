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
/**
 * Celestial plant tile references from hardcoded-data
 */
export declare const CELESTIAL_PLANTS: {
    MOONBINDER: number;
    DAWNBINDER: number;
};
/**
 * Check if player has a Moonbinder in their garden
 * NOTE: Currently always returns false - Jotai atom access not yet working
 */
export declare function hasMoonbinder(): boolean;
/**
 * Check if player has a Dawnbinder in their garden
 * NOTE: Currently always returns false - Jotai atom access not yet working
 */
export declare function hasDawnbinder(): boolean;
/**
 * Check if player is currently in their garden
 * NOTE: Currently always returns false - Jotai atom access not yet working
 */
export declare function isInGarden(): boolean;
/**
 * Get both celestial plant statuses
 */
export declare function getCelestialPlantStatus(): {
    hasMoonbinder: boolean;
    hasDawnbinder: boolean;
    isInGarden: boolean;
};
/**
 * DEBUG: List all available atom labels in the cache
 * This helps find the correct atom names the game is using
 */
export declare function listAllAtomLabels(): string[];
/**
 * DEBUG: Get raw garden data structure using proper Jotai store methods
 * NOTE: Disabled - atom access triggers game protection
 */
export declare function inspectGardenAtom(): any;
//# sourceMappingURL=gardenData.d.ts.map