/**
 * Mutation value calculator utility
 * Calculates dynamic mutation values based on catalog data
 */

import { getMutationMultiplier, getPlantCatalog, getAllMutations, areCatalogsReady } from '../catalogs/gameCatalogs';

/**
 * Calculate average value of a mutation based on catalog data
 */
export function calculateMutationValue(mutationId: string): number | null {
  if (!areCatalogsReady()) return null;

  const multiplier = getMutationMultiplier(mutationId);
  if (multiplier <= 1) return null;

  const plantCatalog = getPlantCatalog();
  if (!plantCatalog) return null;

  // Calculate average base crop value
  const cropValues: number[] = [];
  for (const [species, entry] of Object.entries(plantCatalog)) {
    if (entry.crop?.baseSellPrice && typeof entry.crop.baseSellPrice === 'number') {
      cropValues.push(entry.crop.baseSellPrice);
    }
  }

  if (cropValues.length === 0) return null;

  // Average base value
  const avgBaseValue = cropValues.reduce((sum, val) => sum + val, 0) / cropValues.length;

  // Apply mutation multiplier
  return Math.floor(avgBaseValue * multiplier);
}

/**
 * Get all mutation values from catalog
 */
export function getAllMutationValues(): Record<string, number> {
  const values: Record<string, number> = {};

  if (!areCatalogsReady()) return values;

  const mutations = getAllMutations();
  for (const mutationId of Object.keys(mutations)) {
    const value = calculateMutationValue(mutationId);
    if (value !== null) {
      values[mutationId] = value;
    }
  }

  return values;
}
