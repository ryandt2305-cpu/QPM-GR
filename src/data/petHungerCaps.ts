// src/data/petHungerCaps.ts
// Normalized hunger capacity lookups for pets. Derived from Aries mod hardcoded data.

const RAW_CAPS: Record<string, number> = {
  worm: 500,
  snail: 1000,
  bee: 1500,
  chicken: 3000,
  bunny: 750,
  dragonfly: 250,
  pig: 50000,
  cow: 25000,
  squirrel: 15000,
  turtle: 100000,
  goat: 20000,
  butterfly: 25000,
  capybara: 150000,
  peacock: 100000,
};

export const DEFAULT_HUNGER_CAP = 3000;

function normalizeKey(species: string): string {
  return species.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

export function getHungerCapForSpecies(species: string | null | undefined): number | null {
  if (!species) {
    return null;
  }
  const key = normalizeKey(species);
  if (!key) {
    return null;
  }
  return RAW_CAPS[key] ?? null;
}

export function getHungerCapOrDefault(species: string | null | undefined): number {
  return getHungerCapForSpecies(species) ?? DEFAULT_HUNGER_CAP;
}

export function getKnownHungerCaps(): Record<string, number> {
  return { ...RAW_CAPS };
}
