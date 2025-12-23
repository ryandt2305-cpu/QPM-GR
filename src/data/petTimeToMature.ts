// src/data/petTimeToMature.ts
// Time to mature for each pet species (in hours)
// Source: https://magicgarden.wiki/

export const PET_TIME_TO_MATURE: Record<string, number> = {
  // Common pets (12 hours)
  Worm: 12,
  Snail: 12,
  Bee: 12,

  // Uncommon pets (24 hours)
  Chicken: 24,
  Bunny: 24,
  Dragonfly: 24,

  // Rare pets (72 hours)
  Pig: 72,
  Cow: 72,
  Turkey: 72,

  // Legendary pets (100 hours)
  Squirrel: 100,
  Turtle: 100,
  Goat: 100,

  // Mythical pets (144 hours)
  Butterfly: 144,
  Peacock: 144,
  Capybara: 144,
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
