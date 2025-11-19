// src/data/petTimeToMature.ts
// Time to mature for each pet species (in hours)
// Source: https://magicgarden.wiki/

export const PET_TIME_TO_MATURE: Record<string, number> = {
  // Common pets
  Bee: 12,
  Butterfly: 12,
  Ladybug: 12,
  Dragonfly: 12,

  // Uncommon pets
  Frog: 18,
  Snake: 18,
  Turtle: 18,
  Lizard: 18,

  // Rare pets
  Peacock: 24,
  Swan: 24,
  Flamingo: 24,

  // Epic pets
  Unicorn: 36,
  Dragon: 36,
  Phoenix: 36,

  // Add more as needed - user can provide complete list
};

/**
 * Get time to mature for a pet species (in hours)
 * Returns null if species not found
 */
export function getTimeToMature(species: string | null): number | null {
  if (!species) return null;

  const normalized = species.toLowerCase().trim();

  // Try exact match first
  for (const [key, hours] of Object.entries(PET_TIME_TO_MATURE)) {
    if (key.toLowerCase() === normalized) {
      return hours;
    }
  }

  // Try partial match
  for (const [key, hours] of Object.entries(PET_TIME_TO_MATURE)) {
    if (normalized.includes(key.toLowerCase()) || key.toLowerCase().includes(normalized)) {
      return hours;
    }
  }

  return null;
}

/**
 * Get time to mature in seconds
 */
export function getTimeToMatureSeconds(species: string | null): number | null {
  const hours = getTimeToMature(species);
  return hours ? hours * 3600 : null;
}
