// src/features/journalChecker.ts
// Journal Checker: Shows what's missing from the player's journal
// Organized by categories (produce variants, pet variants, pet abilities)

import { getAtomByLabel, readAtomValue } from '../core/jotaiBridge';
import { log } from '../utils/logger';
import { getAllPlantSpecies, getAllPetSpecies, getAllMutations, areCatalogsReady } from '../catalogs/gameCatalogs';

const JOURNAL_DEBUG_LOGS = false;
const jdbg = (...args: unknown[]): void => {
  if (!JOURNAL_DEBUG_LOGS) return;
  log(...(args as [any, ...any[]]));
};

const normalizeKey = (value: string): string => (value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Alias mappings for produce keys that may differ between in-game journal and catalog
const PRODUCE_KEY_ALIASES: Record<string, string[]> = {
  cacaobean: ['cacao', 'cacao bean', 'cacao fruit', 'cacaofruit', 'cocoa', 'cocoabean'],
  favabean: ['fava bean', 'fava bean pod', 'favabeanpod', 'fava pod', 'favapod'],
  passionfruit: ['passion fruit'],
  dragonfruit: ['dragon fruit'],
  burrostail: ["burro's tail", 'burros tail'],
};

const resolveProduceKey = (raw: string): string => {
  const key = normalizeKey(raw);
  for (const [canonical, aliases] of Object.entries(PRODUCE_KEY_ALIASES)) {
    if (key === canonical) return canonical;
    if (aliases.some((alias) => normalizeKey(alias) === key)) return canonical;
  }
  return key;
};

// ============================================================================
// Types
// ============================================================================

export type ProduceVariantLog = { variant: string; createdAt?: number };
export type PetVariantLog = { variant: string; createdAt?: number };
export type PetAbilityLog = { ability: string; createdAt?: number };

export type SpeciesProduceLog = { variantsLogged?: ProduceVariantLog[] };
export type SpeciesPetLog = {
  variantsLogged?: PetVariantLog[];
  abilitiesLogged?: PetAbilityLog[];
};

export type Journal = {
  produce?: Record<string, SpeciesProduceLog>;
  pets?: Record<string, SpeciesPetLog>;
};

export type JournalSummary = {
  produce: {
    species: string;
    variants: {
      variant: string;
      collected: boolean;
      collectedAt?: number | undefined;
    }[];
  }[];
  pets: {
    species: string;
    variants: {
      variant: string;
      collected: boolean;
      collectedAt?: number | undefined;
    }[];
  }[];
};

// ============================================================================
// Game Data Catalog
// ============================================================================

/**
 * Dynamically generate produce catalog from game catalogs
 * Automatically supports new plant species without code changes
 */
function getProduceCatalog(): Record<string, string[]> {
  const catalog: Record<string, string[]> = {};

  // Return empty if catalogs aren't ready yet
  if (!areCatalogsReady()) {
    return catalog;
  }

  // Build variant list dynamically from catalog
  const variants: string[] = ['Normal'];

  // Get all mutation names from catalog and add them ALL (FUTUREPROOF!)
  const mutations = getAllMutations(); // Already returns string[]

  // Add all mutations from catalog (auto-discovers new mutations!)
  for (const mutationName of mutations) {
    // Ensure it's a string and skip MaxWeight
    if (typeof mutationName !== 'string') continue;
    if (mutationName.toLowerCase().includes('maxweight')) continue;
    variants.push(mutationName);
  }

  // Add max weight (always present in journal system)
  variants.push('Max Weight');

  // Get all plant species from catalog
  const species = getAllPlantSpecies();

  // Assign variants to all species
  for (const speciesName of species) {
    catalog[speciesName] = variants.slice(); // Use slice() to create a copy
  }

  return catalog;
}

/**
 * Dynamically generate pet catalog from game catalogs
 * Automatically supports new pet species without code changes
 */
function getPetCatalog(): Record<string, string[]> {
  const catalog: Record<string, string[]> = {};

  // Return empty if catalogs aren't ready yet
  if (!areCatalogsReady()) {
    return catalog;
  }

  // Build variant list for pets
  const variants: string[] = ['Normal'];

  // Get mutation names from catalog
  const mutations = getAllMutations(); // Already returns string[]

  // Pets only track Rainbow and Gold (not weather mutations)
  // Check for these specific mutations in the catalog
  for (const mutationName of mutations) {
    if (mutationName === 'Rainbow' || mutationName === 'Gold') {
      variants.push(mutationName);
    }
  }

  // Add max weight (always present for pets)
  variants.push('Max Weight');

  // Get all pet species from catalog
  const species = getAllPetSpecies();

  // Assign variants to all species
  for (const speciesName of species) {
    catalog[speciesName] = variants.slice(); // Use slice() to create a copy
  }

  return catalog;
}

// ============================================================================
// State
// ============================================================================

let cachedJournal: Journal | null = null;
let lastFetchTime = 0;
const CACHE_DURATION_MS = 5000; // Cache for 5 seconds

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Extract journal from state atom
 */
async function fetchJournalFromState(): Promise<Journal | null> {
  try {
    const stateAtom = getAtomByLabel('stateAtom');
    if (!stateAtom) {
      log('⚠️ stateAtom not found');
      return null;
    }

    const state = await readAtomValue<any>(stateAtom);
    if (!state) {
      log('⚠️ State is null');
      return null;
    }

    // Get player atom to find current player ID
    const playerAtom = getAtomByLabel('playerAtom');
    if (!playerAtom) {
      log('⚠️ playerAtom not found');
      return null;
    }

    const player = await readAtomValue<any>(playerAtom);
    const playerId = player?.id;
    if (!playerId) {
      log('⚠️ Player ID not found');
      return null;
    }

    jdbg(`[JOURNAL-DEBUG] Current player ID: ${playerId}`);

    // Find slot for current player
    const slots = state?.child?.data?.userSlots || [];
    jdbg(`[JOURNAL-DEBUG] Found ${Array.isArray(slots) ? slots.length : Object.keys(slots || {}).length} slots (isArray: ${Array.isArray(slots)})`);

    let playerSlot: any = null;

    if (Array.isArray(slots)) {
      playerSlot = slots.find((s: any) => String(s?.playerId) === String(playerId));
      jdbg(`[JOURNAL-DEBUG] Searched array slots, found match: ${!!playerSlot}`);
    } else if (slots && typeof slots === 'object') {
      // userSlots might be an object with numeric keys
      for (const slot of Object.values(slots)) {
        if (String((slot as any)?.playerId) === String(playerId)) {
          playerSlot = slot;
          break;
        }
      }
      jdbg(`[JOURNAL-DEBUG] Searched object slots, found match: ${!!playerSlot}`);
    }

    if (!playerSlot) {
      log('⚠️ Player slot not found');
      jdbg(`[JOURNAL-DEBUG] Available slot player IDs: ${Array.isArray(slots) ? slots.map((s: any) => s?.playerId).join(', ') : Object.values(slots || {}).map((s: any) => (s as any)?.playerId).join(', ')}`);
      return null;
    }

    // Extract journal
    const journal = playerSlot?.data?.journal || playerSlot?.journal;
    if (!journal || typeof journal !== 'object') {
      log('ℹ️ No journal data found for player');
      jdbg(`[JOURNAL-DEBUG] Player slot structure: ${JSON.stringify(Object.keys(playerSlot || {}))}`);
      jdbg(`[JOURNAL-DEBUG] Player slot.data structure: ${JSON.stringify(Object.keys(playerSlot?.data || {}))}`);
      return { produce: {}, pets: {} };
    }

    jdbg(`[JOURNAL-DEBUG] Found journal with keys: ${JSON.stringify(Object.keys(journal))}`);
    if (journal.produce) {
      jdbg(`[JOURNAL-DEBUG] Produce species: ${JSON.stringify(Object.keys(journal.produce))}`);
    }
    if (journal.pets) {
      jdbg(`[JOURNAL-DEBUG] Pet species: ${JSON.stringify(Object.keys(journal.pets))}`);
    }

    return normalizeJournal(journal);
  } catch (error) {
    log('❌ Error fetching journal:', error);
    return null;
  }
}

/**
 * Normalize journal data
 */
function normalizeJournal(raw: any): Journal {
  const journal: Journal = {};

  if (raw.produce && typeof raw.produce === 'object') {
    journal.produce = Object.fromEntries(
      Object.entries(raw.produce).map(([species, data]) => [
        species,
        {
          variantsLogged: (() => {
            const entry = data as any;
            if (Array.isArray(entry?.variantsLogged)) return entry.variantsLogged;
            if (Array.isArray(entry?.variants)) {
              // Some payloads store variants as plain strings
              return entry.variants.map((v: any) => (typeof v === 'string' ? { variant: v } : v));
            }
            return [] as ProduceVariantLog[];
          })(),
        },
      ])
    );
  }

  if (raw.pets && typeof raw.pets === 'object') {
    journal.pets = Object.fromEntries(
      Object.entries(raw.pets).map(([species, data]) => [
        species,
        {
          variantsLogged: (() => {
            const entry = data as any;
            if (Array.isArray(entry?.variantsLogged)) return entry.variantsLogged;
            if (Array.isArray(entry?.variants)) {
              return entry.variants.map((v: any) => (typeof v === 'string' ? { variant: v } : v));
            }
            return [] as PetVariantLog[];
          })(),
          abilitiesLogged: (() => {
            const entry = data as any;
            if (Array.isArray(entry?.abilitiesLogged)) return entry.abilitiesLogged;
            if (Array.isArray(entry?.abilities)) {
              return entry.abilities.map((a: any) => (typeof a === 'string' ? { ability: a } : a));
            }
            return [] as PetAbilityLog[];
          })(),
        },
      ])
    );
  }

  return journal;
}

/**
 * Get journal with caching
 */
export async function getJournal(): Promise<Journal | null> {
  const now = Date.now();
  if (cachedJournal && now - lastFetchTime < CACHE_DURATION_MS) {
    return cachedJournal;
  }

  const journal = await fetchJournalFromState();
  if (journal) {
    cachedJournal = journal;
    lastFetchTime = now;
  }

  return journal;
}

/**
 * Generate journal summary with missing items
 */
export async function getJournalSummary(): Promise<JournalSummary | null> {
  const journal = await getJournal();
  if (!journal) return null;

  const summary: JournalSummary = {
    produce: [],
    pets: [],
  };

  const produceLogByKey = new Map<string, SpeciesProduceLog>();
  Object.entries(journal.produce ?? {}).forEach(([species, data]) => {
    produceLogByKey.set(resolveProduceKey(species), data);
  });

  const petLogByKey = new Map<string, SpeciesPetLog>();
  Object.entries(journal.pets ?? {}).forEach(([species, data]) => {
    petLogByKey.set(normalizeKey(species), data);
  });

  // Process produce
  const produceCatalog = getProduceCatalog();
  for (const [species, possibleVariants] of Object.entries(produceCatalog)) {
    const speciesLog = produceLogByKey.get(resolveProduceKey(species));
    const loggedVariants = new Map<string, number>();

    if (speciesLog?.variantsLogged) {
      for (const log of speciesLog.variantsLogged) {
        loggedVariants.set(normalizeKey(log.variant), log.createdAt || 0);
      }
    }

    // Ensure possibleVariants is actually an array of strings
    if (!Array.isArray(possibleVariants)) {
      continue; // Skip if not an array
    }

    summary.produce.push({
      species,
      variants: possibleVariants.map((variant) => ({
        variant: String(variant), // Ensure it's a string
        collected: loggedVariants.has(normalizeKey(String(variant))),
        collectedAt: loggedVariants.get(normalizeKey(String(variant))),
      })),
    });
  }

  // Process pets (variants only, no abilities)
  const petCatalog = getPetCatalog();
  for (const [species, possibleVariants] of Object.entries(petCatalog)) {
    const speciesLog = petLogByKey.get(normalizeKey(species));
    const loggedVariants = new Map<string, number>();

    if (speciesLog?.variantsLogged) {
      for (const log of speciesLog.variantsLogged) {
        loggedVariants.set(normalizeKey(log.variant), log.createdAt || 0);
      }
    }

    // Ensure possibleVariants is actually an array of strings
    if (!Array.isArray(possibleVariants)) {
      continue; // Skip if not an array
    }

    summary.pets.push({
      species,
      variants: possibleVariants.map((variant) => ({
        variant: String(variant), // Ensure it's a string
        collected: loggedVariants.has(normalizeKey(String(variant))),
        collectedAt: loggedVariants.get(normalizeKey(String(variant))),
      })),
    });
  }

  return summary;
}

/**
 * Get statistics about journal completion
 */
export async function getJournalStats(): Promise<{
  produce: { collected: number; total: number; percentage: number; typesCollected: number; typesTotal: number };
  petVariants: { collected: number; total: number; percentage: number };
  overall: { collected: number; total: number; percentage: number };
} | null> {
  const summary = await getJournalSummary();
  if (!summary) return null;

  let produceCollected = 0;
  let produceTotal = 0;
  let petVariantsCollected = 0;
  let petVariantsTotal = 0;
  let cropTypesCollected = 0;
  const cropTypesTotal = summary.produce.length;

  // Count produce
  for (const species of summary.produce) {
    let speciesHasVariant = false;
    for (const variant of species.variants) {
      produceTotal++;
      if (variant.collected) {
        produceCollected++;
        speciesHasVariant = true;
      }
    }
    // Count crop type as collected if at least one variant is collected
    if (speciesHasVariant) cropTypesCollected++;
  }

  // Count pet variants only (no abilities)
  for (const species of summary.pets) {
    for (const variant of species.variants) {
      petVariantsTotal++;
      if (variant.collected) petVariantsCollected++;
    }
  }

  const overallCollected = produceCollected + petVariantsCollected;
  const overallTotal = produceTotal + petVariantsTotal;

  return {
    produce: {
      collected: produceCollected,
      total: produceTotal,
      percentage: produceTotal > 0 ? (produceCollected / produceTotal) * 100 : 0,
      typesCollected: cropTypesCollected,
      typesTotal: cropTypesTotal,
    },
    petVariants: {
      collected: petVariantsCollected,
      total: petVariantsTotal,
      percentage: petVariantsTotal > 0 ? (petVariantsCollected / petVariantsTotal) * 100 : 0,
    },
    overall: {
      collected: overallCollected,
      total: overallTotal,
      percentage: overallTotal > 0 ? (overallCollected / overallTotal) * 100 : 0,
    },
  };
}

/**
 * Refresh journal cache
 */
export function refreshJournalCache(): void {
  cachedJournal = null;
  lastFetchTime = 0;
}
