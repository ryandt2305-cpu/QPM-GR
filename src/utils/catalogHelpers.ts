/**
 * Centralized catalog access utilities
 * Provides consistent error handling and fallbacks
 */

import {
  getAllPlantSpecies,
  getAllPetSpecies,
  getAllMutations,
  getAllAbilities,
  getPlantSpecies,
  getPetSpecies,
  getMutation,
  getAbilityDef,
  areCatalogsReady,
  waitForCatalogs,
} from '../catalogs/gameCatalogs';

export { areCatalogsReady, waitForCatalogs };

/**
 * Get all plant species with fallback to empty array
 */
export function getPlantSpeciesSafe(): string[] {
  return areCatalogsReady() ? getAllPlantSpecies() : [];
}

/**
 * Get all pet species with fallback to empty array
 */
export function getPetSpeciesSafe(): string[] {
  return areCatalogsReady() ? getAllPetSpecies() : [];
}

/**
 * Get all mutation IDs with fallback to empty array
 */
export function getMutationsSafe(): string[] {
  return areCatalogsReady() ? Object.keys(getAllMutations()) : [];
}

/**
 * Get all ability IDs with fallback to empty array
 */
export function getAbilitiesSafe(): string[] {
  return areCatalogsReady() ? getAllAbilities() : [];
}

/**
 * Get plant entry with fallback to null
 */
export function getPlantSafe(species: string) {
  return areCatalogsReady() ? getPlantSpecies(species) : null;
}

/**
 * Get pet entry with fallback to null
 */
export function getPetSafe(species: string) {
  return areCatalogsReady() ? getPetSpecies(species) : null;
}

/**
 * Check if a species exists in plant catalog
 */
export function isValidPlantSpecies(species: string): boolean {
  return getPlantSpeciesSafe().includes(species);
}

/**
 * Check if a species exists in pet catalog
 */
export function isValidPetSpecies(species: string): boolean {
  return getPetSpeciesSafe().includes(species);
}

/**
 * Check if a mutation exists in catalog
 */
export function isValidMutation(mutationId: string): boolean {
  return getMutationsSafe().includes(mutationId);
}

/**
 * Check if an ability exists in catalog
 */
export function isValidAbility(abilityId: string): boolean {
  return getAbilitiesSafe().includes(abilityId);
}

/**
 * Get ability display name with fallback to ID
 */
export function getAbilityName(abilityId: string): string {
  if (!areCatalogsReady()) return abilityId;
  const def = getAbilityDef(abilityId);
  return def?.name || abilityId;
}

/**
 * Get mutation display name with fallback to ID
 */
export function getMutationName(mutationId: string): string {
  if (!areCatalogsReady()) return mutationId;
  const def = getMutation(mutationId);
  return def?.name || mutationId;
}
