// src/store/hatchStatsStore.ts
// Rich per-hatch stats tracking: species + abilities + session/lifetime counts.

import { storage } from '../utils/storage';
import { log } from '../utils/logger';

const STORAGE_KEY = 'qpm.hatchStats.v1';
const MAX_EVENTS = 100;
const CURRENT_VERSION = 1;

export interface HatchEvent {
  species: string;
  rarity: 'normal' | 'gold' | 'rainbow';
  abilities: string[];
  timestamp: number;
}

export interface SpeciesCounts {
  total: number;
  normal: number;
  gold: number;
  rainbow: number;
}

export interface HatchBucket {
  totalHatched: number;
  bySpecies: Record<string, SpeciesCounts>;
  byAbility: Record<string, number>;
}

export interface HatchStatsState {
  lifetime: HatchBucket;
  session: HatchBucket & { start: number };
  recentEvents: HatchEvent[];
  seededPetIds: string[]; // pet IDs already seeded — prevents double-counts on re-seed
  meta: { version: number; updatedAt: number };
}

export interface PetSeedInput {
  id?: unknown;
  species?: unknown;
  name?: unknown;
  targetScale?: unknown;
  rarity?: unknown;
  isGold?: unknown;
  isRainbow?: unknown;
  abilities?: unknown;
  [key: string]: unknown;
}

function emptyBucket(): HatchBucket {
  return { totalHatched: 0, bySpecies: {}, byAbility: {} };
}

function defaultState(): HatchStatsState {
  return {
    lifetime: emptyBucket(),
    session: { ...emptyBucket(), start: Date.now() },
    recentEvents: [],
    seededPetIds: [],
    meta: { version: CURRENT_VERSION, updatedAt: Date.now() },
  };
}

let state: HatchStatsState = defaultState();
const listeners = new Set<(s: HatchStatsState) => void>();

function notify(): void {
  for (const cb of listeners) {
    try {
      cb(state);
    } catch {
      // ignore listener errors
    }
  }
}

function persist(): void {
  try {
    storage.set(STORAGE_KEY, state);
  } catch (error) {
    log('[HatchStats] Failed to persist', error);
  }
}

export function initHatchStatsStore(): void {
  try {
    const saved = storage.get<HatchStatsState | null>(STORAGE_KEY, null);
    if (saved && saved.meta?.version === CURRENT_VERSION) {
      // Restore lifetime + recentEvents + seededPetIds; always reset session on init
      state = {
        ...saved,
        seededPetIds: Array.isArray(saved.seededPetIds) ? saved.seededPetIds : [],
        session: { ...emptyBucket(), start: Date.now() },
      };
    } else {
      state = defaultState();
    }
    log('[HatchStats] Store initialized');
  } catch (error) {
    log('[HatchStats] Failed to load saved stats', error);
    state = defaultState();
  }
}

function incrementBucket(
  bucket: HatchBucket,
  species: string,
  rarity: 'normal' | 'gold' | 'rainbow',
  abilities: string[],
): void {
  bucket.totalHatched++;

  if (!bucket.bySpecies[species]) {
    bucket.bySpecies[species] = { total: 0, normal: 0, gold: 0, rainbow: 0 };
  }
  bucket.bySpecies[species].total++;
  bucket.bySpecies[species][rarity]++;

  for (const ability of abilities) {
    bucket.byAbility[ability] = (bucket.byAbility[ability] ?? 0) + 1;
  }
}

export function recordDetailedHatch(
  species: string,
  rarity: 'normal' | 'gold' | 'rainbow',
  abilities: string[],
  timestamp: number,
): void {
  incrementBucket(state.lifetime, species, rarity, abilities);
  incrementBucket(state.session, species, rarity, abilities);

  const event: HatchEvent = { species, rarity, abilities, timestamp };
  state.recentEvents.unshift(event);
  if (state.recentEvents.length > MAX_EVENTS) {
    state.recentEvents = state.recentEvents.slice(0, MAX_EVENTS);
  }

  state.meta.updatedAt = Date.now();
  persist();
  notify();
}

export function getHatchStatsSnapshot(): HatchStatsState {
  return state;
}

export function subscribeHatchStats(listener: (s: HatchStatsState) => void): () => void {
  listeners.add(listener);
  try {
    listener(state);
  } catch {
    // ignore
  }
  return () => listeners.delete(listener);
}

export function resetHatchStatsSession(): void {
  state.session = { ...emptyBucket(), start: Date.now() };
  state.meta.updatedAt = Date.now();
  persist();
  notify();
}

// ---------------------------------------------------------------------------
// Seed lifetime from existing pets (inventory / hutch backfill)
// ---------------------------------------------------------------------------

function detectSeedRarity(pet: PetSeedInput): 'normal' | 'gold' | 'rainbow' {
  if (pet.rarity) {
    const r = String(pet.rarity).toLowerCase();
    if (r.includes('rainbow')) return 'rainbow';
    if (r.includes('gold')) return 'gold';
  }
  if (pet.isRainbow === true) return 'rainbow';
  if (pet.isGold === true) return 'gold';
  if (typeof pet.targetScale === 'number') {
    if (pet.targetScale >= 1.25) return 'rainbow';
    if (pet.targetScale >= 1.1) return 'gold';
  }
  if (typeof pet.name === 'string') {
    const n = pet.name.toLowerCase();
    if (n.startsWith('rainbow ')) return 'rainbow';
    if (n.startsWith('gold ')) return 'gold';
  }
  return 'normal';
}

/**
 * Backfill lifetime stats from a list of existing pets (inventory / hutch).
 * Each pet is counted once — duplicate calls with the same pet IDs are ignored.
 * Returns { added } = number of newly added pets.
 */
export function seedLifetimeFromPets(pets: PetSeedInput[]): { added: number } {
  let added = 0;
  const seenIds = new Set(state.seededPetIds);

  for (const pet of pets) {
    const id = typeof pet.id === 'string' && pet.id
      ? pet.id
      : `seed:${pet.species ?? pet.name ?? 'unknown'}:${pet.targetScale ?? 1}:${pets.indexOf(pet)}`;

    if (seenIds.has(id)) continue;
    seenIds.add(id);

    const species = typeof pet.species === 'string' && pet.species
      ? pet.species
      : (typeof pet.name === 'string' ? pet.name : 'Unknown');
    const rarity = detectSeedRarity(pet);
    const abilities = Array.isArray(pet.abilities)
      ? (pet.abilities as unknown[]).filter((a): a is string => typeof a === 'string')
      : [];

    incrementBucket(state.lifetime, species, rarity, abilities);
    added++;
  }

  if (added > 0) {
    state.seededPetIds = Array.from(seenIds);
    state.meta.updatedAt = Date.now();
    persist();
    notify();
  }

  return { added };
}
