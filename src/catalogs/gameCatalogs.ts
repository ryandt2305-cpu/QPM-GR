// src/catalogs/gameCatalogs.ts
// Typed access layer for game catalogs
// Provides convenient, type-safe methods to access runtime game data

import { getCatalogs, areCatalogsReady, waitForCatalogs, onCatalogsReady, initCatalogLoader, cleanupCatalogLoader } from './catalogLoader';
import type {
  GameCatalogs,
  PetCatalog,
  PetCatalogEntry,
  PlantCatalog,
  PlantCatalogEntry,
  EggCatalog,
  EggCatalogEntry,
  ItemCatalog,
  ItemCatalogEntry,
  DecorCatalog,
  DecorCatalogEntry,
  MutationCatalog,
  MutationCatalogEntry,
  PetAbilities,
  PetAbilityEntry,
} from './types';

// Re-export for convenience
export { getCatalogs, areCatalogsReady, waitForCatalogs, onCatalogsReady, initCatalogLoader, cleanupCatalogLoader } from './catalogLoader';
export type { GameCatalogs };

// Re-export diagnostic function
import { diagnoseCatalogs } from './catalogLoader';
export { diagnoseCatalogs };

// ============================================================================
// PET CATALOG ACCESS
// ============================================================================

/**
 * Get the pet catalog (may be null if not loaded)
 */
export function getPetCatalog(): PetCatalog | null {
  return getCatalogs().petCatalog;
}

/**
 * Get a specific pet species entry
 */
export function getPetSpecies(species: string): PetCatalogEntry | null {
  const catalog = getPetCatalog();
  if (!catalog) return null;
  return catalog[species] ?? null;
}

/**
 * Get all pet species keys
 */
export function getAllPetSpecies(): string[] {
  const catalog = getPetCatalog();
  if (!catalog) return [];
  return Object.keys(catalog);
}

/**
 * Get the diet (allowed foods) for a pet species
 * @returns Array of food species names, or empty array if not found
 */
export function getPetDiet(species: string): string[] {
  const pet = getPetSpecies(species);
  if (!pet || !Array.isArray(pet.diet)) return [];
  return [...pet.diet];
}

/**
 * Get hunger cost to fully replenish a pet
 */
export function getPetHungerCost(species: string): number | null {
  const pet = getPetSpecies(species);
  return pet?.coinsToFullyReplenishHunger ?? null;
}

/**
 * Check if a food is valid for a pet species
 */
export function canPetEat(petSpecies: string, foodSpecies: string): boolean {
  const diet = getPetDiet(petSpecies);
  if (diet.length === 0) return true; // Unknown pet, allow any food

  // Normalize for comparison (case-insensitive)
  const normalizedFood = foodSpecies.toLowerCase().replace(/\s+/g, '');
  return diet.some(food => food.toLowerCase().replace(/\s+/g, '') === normalizedFood);
}

/**
 * Get all pet diets as a map
 * Useful for replacing hardcoded RAW_PET_DIETS
 */
export function getAllPetDiets(): Record<string, string[]> {
  const catalog = getPetCatalog();
  if (!catalog) return {};

  const diets: Record<string, string[]> = {};
  for (const [species, entry] of Object.entries(catalog)) {
    if (entry && Array.isArray(entry.diet)) {
      diets[species] = [...entry.diet];
    }
  }
  return diets;
}

// ============================================================================
// PLANT CATALOG ACCESS
// ============================================================================

/**
 * Get the plant catalog (may be null if not loaded)
 */
export function getPlantCatalog(): PlantCatalog | null {
  return getCatalogs().plantCatalog;
}

/**
 * Get a specific plant species entry
 */
export function getPlantSpecies(species: string): PlantCatalogEntry | null {
  const catalog = getPlantCatalog();
  if (!catalog) return null;
  return catalog[species] ?? null;
}

/**
 * Get all plant species keys
 */
export function getAllPlantSpecies(): string[] {
  const catalog = getPlantCatalog();
  if (!catalog) return [];
  return Object.keys(catalog);
}

/**
 * Get seed price for a plant
 */
export function getSeedPrice(species: string): { coins: number; credits: number } | null {
  const plant = getPlantSpecies(species);
  if (!plant?.seed) return null;

  return {
    coins: plant.seed.coinPrice ?? 0,
    credits: plant.seed.creditPrice ?? 0,
  };
}

// ============================================================================
// EGG CATALOG ACCESS
// ============================================================================

/**
 * Get the egg catalog (may be null if not loaded)
 */
export function getEggCatalog(): EggCatalog | null {
  return getCatalogs().eggCatalog;
}

/**
 * Get a specific egg type entry
 */
export function getEggType(eggId: string): EggCatalogEntry | null {
  const catalog = getEggCatalog();
  if (!catalog) return null;
  return catalog[eggId] ?? null;
}

/**
 * Get all egg type keys
 */
export function getAllEggTypes(): string[] {
  const catalog = getEggCatalog();
  if (!catalog) return [];
  return Object.keys(catalog);
}

/**
 * Get hatch time for an egg in seconds
 */
export function getEggHatchTime(eggId: string): number | null {
  const egg = getEggType(eggId);
  return egg?.secondsToHatch ?? null;
}

/**
 * Get possible pets that can hatch from an egg
 */
export function getEggSpawnWeights(eggId: string): Record<string, number> {
  const egg = getEggType(eggId);
  if (!egg?.faunaSpawnWeights) return {};

  // Handle both array and object formats
  if (Array.isArray(egg.faunaSpawnWeights)) {
    const weights: Record<string, number> = {};
    for (const entry of egg.faunaSpawnWeights) {
      if (entry.species && typeof entry.weight === 'number') {
        weights[entry.species] = entry.weight;
      }
    }
    return weights;
  }

  return { ...egg.faunaSpawnWeights } as Record<string, number>;
}

// ============================================================================
// ITEM CATALOG ACCESS
// ============================================================================

/**
 * Get the item catalog (may be null if not loaded)
 */
export function getItemCatalog(): ItemCatalog | null {
  return getCatalogs().itemCatalog;
}

/**
 * Get a specific item entry
 */
export function getItem(itemId: string): ItemCatalogEntry | null {
  const catalog = getItemCatalog();
  if (!catalog) return null;
  return catalog[itemId] ?? null;
}

/**
 * Get all item keys
 */
export function getAllItems(): string[] {
  const catalog = getItemCatalog();
  if (!catalog) return [];
  return Object.keys(catalog);
}

/**
 * Get item price
 */
export function getItemPrice(itemId: string): { coins: number; credits: number } | null {
  const item = getItem(itemId);
  if (!item) return null;

  return {
    coins: item.coinPrice ?? 0,
    credits: item.creditPrice ?? 0,
  };
}

// ============================================================================
// DECOR CATALOG ACCESS
// ============================================================================

/**
 * Get the decor catalog (may be null if not loaded)
 */
export function getDecorCatalog(): DecorCatalog | null {
  return getCatalogs().decorCatalog;
}

/**
 * Get a specific decoration entry
 */
export function getDecor(decorId: string): DecorCatalogEntry | null {
  const catalog = getDecorCatalog();
  if (!catalog) return null;
  return catalog[decorId] ?? null;
}

/**
 * Get all decoration keys
 */
export function getAllDecor(): string[] {
  const catalog = getDecorCatalog();
  if (!catalog) return [];
  return Object.keys(catalog);
}

// ============================================================================
// MUTATION CATALOG ACCESS
// ============================================================================

/**
 * Get the mutation catalog (may be null if not loaded)
 */
export function getMutationCatalog(): MutationCatalog | null {
  return getCatalogs().mutationCatalog;
}

/**
 * Get a specific mutation entry
 */
export function getMutation(mutationId: string): MutationCatalogEntry | null {
  const catalog = getMutationCatalog();
  if (!catalog) return null;
  return catalog[mutationId] ?? null;
}

/**
 * Get all mutation keys
 */
export function getAllMutations(): string[] {
  const catalog = getMutationCatalog();
  if (!catalog) return [];
  return Object.keys(catalog);
}

/**
 * Get mutation coin multiplier
 */
export function getMutationMultiplier(mutationId: string): number {
  const mutation = getMutation(mutationId);
  return mutation?.coinMultiplier ?? 1;
}

// ============================================================================
// PET ABILITIES ACCESS
// ============================================================================

/**
 * Get the pet abilities catalog (may be null if not loaded)
 */
export function getPetAbilitiesCatalog(): PetAbilities | null {
  return getCatalogs().petAbilities;
}

/**
 * Get a specific ability definition
 */
export function getAbilityDef(abilityId: string): PetAbilityEntry | null {
  const catalog = getPetAbilitiesCatalog();
  if (!catalog) return null;
  return catalog[abilityId] ?? null;
}

/**
 * Get all ability keys
 */
export function getAllAbilities(): string[] {
  const catalog = getPetAbilitiesCatalog();
  if (!catalog) return [];
  return Object.keys(catalog);
}

// ============================================================================
// DIAGNOSTIC UTILITIES
// ============================================================================

/**
 * Get a summary of loaded catalogs for debugging
 */
export function getCatalogLoadStatus(): Record<string, { loaded: boolean; count: number }> {
  const catalogs = getCatalogs();

  return {
    petCatalog: {
      loaded: catalogs.petCatalog !== null,
      count: catalogs.petCatalog ? Object.keys(catalogs.petCatalog).length : 0,
    },
    plantCatalog: {
      loaded: catalogs.plantCatalog !== null,
      count: catalogs.plantCatalog ? Object.keys(catalogs.plantCatalog).length : 0,
    },
    eggCatalog: {
      loaded: catalogs.eggCatalog !== null,
      count: catalogs.eggCatalog ? Object.keys(catalogs.eggCatalog).length : 0,
    },
    itemCatalog: {
      loaded: catalogs.itemCatalog !== null,
      count: catalogs.itemCatalog ? Object.keys(catalogs.itemCatalog).length : 0,
    },
    decorCatalog: {
      loaded: catalogs.decorCatalog !== null,
      count: catalogs.decorCatalog ? Object.keys(catalogs.decorCatalog).length : 0,
    },
    mutationCatalog: {
      loaded: catalogs.mutationCatalog !== null,
      count: catalogs.mutationCatalog ? Object.keys(catalogs.mutationCatalog).length : 0,
    },
    petAbilities: {
      loaded: catalogs.petAbilities !== null,
      count: catalogs.petAbilities ? Object.keys(catalogs.petAbilities).length : 0,
    },
  };
}

/**
 * Log current catalog load status to console
 */
export function logCatalogStatus(): void {
  const status = getCatalogLoadStatus();
  console.log('[QPM Catalogs] Load Status:');
  for (const [name, info] of Object.entries(status)) {
    console.log(`  ${name}: ${info.loaded ? `✅ (${info.count} entries)` : '❌ not loaded'}`);
  }
}
