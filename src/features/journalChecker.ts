// src/features/journalChecker.ts
// Journal Checker: Shows what's missing from the player's journal
// Organized by categories (produce variants, pet variants, pet abilities)

import { getAtomByLabel, readAtomValue } from '../core/jotaiBridge';
import { log } from '../utils/logger';

const JOURNAL_DEBUG_LOGS = false;
const jdbg = (...args: unknown[]): void => {
  if (!JOURNAL_DEBUG_LOGS) return;
  log(...(args as [any, ...any[]]));
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

// All crop species and their variants
// Journal tracks: Normal, Rainbow, Gold, mutations (Frozen, Wet, Chilled, Dawnlit, Dawnbound, Amberlit, Amberbound), and Max size
const PRODUCE_CATALOG: Record<string, string[]> = {
  // Common crops
  'Carrot': ['Normal', 'Rainbow', 'Gold', 'Frozen', 'Wet', 'Chilled', 'Dawnlit', 'Dawncharged', 'Ambershine', 'Ambercharged', 'Max Weight'],
  'Tomato': ['Normal', 'Rainbow', 'Gold', 'Frozen', 'Wet', 'Chilled', 'Dawnlit', 'Dawncharged', 'Ambershine', 'Ambercharged', 'Max Weight'],
  'Corn': ['Normal', 'Rainbow', 'Gold', 'Frozen', 'Wet', 'Chilled', 'Dawnlit', 'Dawncharged', 'Ambershine', 'Ambercharged', 'Max Weight'],
  'Pepper': ['Normal', 'Rainbow', 'Gold', 'Frozen', 'Wet', 'Chilled', 'Dawnlit', 'Dawncharged', 'Ambershine', 'Ambercharged', 'Max Weight'],
  'FavaBean': ['Normal', 'Rainbow', 'Gold', 'Frozen', 'Wet', 'Chilled', 'Dawnlit', 'Dawncharged', 'Ambershine', 'Ambercharged', 'Max Weight'],

  // Vegetables
  'Pumpkin': ['Normal', 'Rainbow', 'Gold', 'Frozen', 'Wet', 'Chilled', 'Dawnlit', 'Dawncharged', 'Ambershine', 'Ambercharged', 'Max Weight'],
  'Squash': ['Normal', 'Rainbow', 'Gold', 'Frozen', 'Wet', 'Chilled', 'Dawnlit', 'Dawncharged', 'Ambershine', 'Ambercharged', 'Max Weight'],

  // Fruits
  'Strawberry': ['Normal', 'Rainbow', 'Gold', 'Frozen', 'Wet', 'Chilled', 'Dawnlit', 'Dawncharged', 'Ambershine', 'Ambercharged', 'Max Weight'],
  'Blueberry': ['Normal', 'Rainbow', 'Gold', 'Frozen', 'Wet', 'Chilled', 'Dawnlit', 'Dawncharged', 'Ambershine', 'Ambercharged', 'Max Weight'],
  'Watermelon': ['Normal', 'Rainbow', 'Gold', 'Frozen', 'Wet', 'Chilled', 'Dawnlit', 'Dawncharged', 'Ambershine', 'Ambercharged', 'Max Weight'],
  'Grape': ['Normal', 'Rainbow', 'Gold', 'Frozen', 'Wet', 'Chilled', 'Dawnlit', 'Dawncharged', 'Ambershine', 'Ambercharged', 'Max Weight'],
  'Apple': ['Normal', 'Rainbow', 'Gold', 'Frozen', 'Wet', 'Chilled', 'Dawnlit', 'Dawncharged', 'Ambershine', 'Ambercharged', 'Max Weight'],
  'Banana': ['Normal', 'Rainbow', 'Gold', 'Frozen', 'Wet', 'Chilled', 'Dawnlit', 'Dawncharged', 'Ambershine', 'Ambercharged', 'Max Weight'],
  'Lemon': ['Normal', 'Rainbow', 'Gold', 'Frozen', 'Wet', 'Chilled', 'Dawnlit', 'Dawncharged', 'Ambershine', 'Ambercharged', 'Max Weight'],
  'Coconut': ['Normal', 'Rainbow', 'Gold', 'Frozen', 'Wet', 'Chilled', 'Dawnlit', 'Dawncharged', 'Ambershine', 'Ambercharged', 'Max Weight'],
  'Lychee': ['Normal', 'Rainbow', 'Gold', 'Frozen', 'Wet', 'Chilled', 'Dawnlit', 'Dawncharged', 'Ambershine', 'Ambercharged', 'Max Weight'],
  'DragonFruit': ['Normal', 'Rainbow', 'Gold', 'Frozen', 'Wet', 'Chilled', 'Dawnlit', 'Dawncharged', 'Ambershine', 'Ambercharged', 'Max Weight'],
  'PassionFruit': ['Normal', 'Rainbow', 'Gold', 'Frozen', 'Wet', 'Chilled', 'Dawnlit', 'Dawncharged', 'Ambershine', 'Ambercharged', 'Max Weight'],

  // Flowers
  'Lily': ['Normal', 'Rainbow', 'Gold', 'Frozen', 'Wet', 'Chilled', 'Dawnlit', 'Dawncharged', 'Ambershine', 'Ambercharged', 'Max Weight'],
  'Sunflower': ['Normal', 'Rainbow', 'Gold', 'Frozen', 'Wet', 'Chilled', 'Dawnlit', 'Dawncharged', 'Ambershine', 'Ambercharged', 'Max Weight'],
  'Daffodil': ['Normal', 'Rainbow', 'Gold', 'Frozen', 'Wet', 'Chilled', 'Dawnlit', 'Dawncharged', 'Ambershine', 'Ambercharged', 'Max Weight'],
  'Camellia': ['Normal', 'Rainbow', 'Gold', 'Frozen', 'Wet', 'Chilled', 'Dawnlit', 'Dawncharged', 'Ambershine', 'Ambercharged', 'Max Weight'],
  'Delphinium': ['Normal', 'Rainbow', 'Gold', 'Frozen', 'Wet', 'Chilled', 'Dawnlit', 'Dawncharged', 'Ambershine', 'Ambercharged', 'Max Weight'],
  'OrangeTulip': ['Normal', 'Rainbow', 'Gold', 'Frozen', 'Wet', 'Chilled', 'Dawnlit', 'Dawncharged', 'Ambershine', 'Ambercharged', 'Max Weight'],
  'Chrysanthemum': ['Normal', 'Rainbow', 'Gold', 'Frozen', 'Wet', 'Chilled', 'Dawnlit', 'Dawncharged', 'Ambershine', 'Ambercharged', 'Max Weight'],

  // Succulents/Plants
  'Aloe': ['Normal', 'Rainbow', 'Gold', 'Frozen', 'Wet', 'Chilled', 'Dawnlit', 'Dawncharged', 'Ambershine', 'Ambercharged', 'Max Weight'],
  'Cactus': ['Normal', 'Rainbow', 'Gold', 'Frozen', 'Wet', 'Chilled', 'Dawnlit', 'Dawncharged', 'Ambershine', 'Ambercharged', 'Max Weight'],
  'Echeveria': ['Normal', 'Rainbow', 'Gold', 'Frozen', 'Wet', 'Chilled', 'Dawnlit', 'Dawncharged', 'Ambershine', 'Ambercharged', 'Max Weight'],
  'BurrosTail': ['Normal', 'Rainbow', 'Gold', 'Frozen', 'Wet', 'Chilled', 'Dawnlit', 'Dawncharged', 'Ambershine', 'Ambercharged', 'Max Weight'],
  'Bamboo': ['Normal', 'Rainbow', 'Gold', 'Frozen', 'Wet', 'Chilled', 'Dawnlit', 'Dawncharged', 'Ambershine', 'Ambercharged', 'Max Weight'],

  // Special/Rare
  'Mushroom': ['Normal', 'Rainbow', 'Gold', 'Frozen', 'Wet', 'Chilled', 'Dawnlit', 'Dawncharged', 'Ambershine', 'Ambercharged', 'Max Weight'],
  'Starweaver': ['Normal', 'Rainbow', 'Gold', 'Frozen', 'Wet', 'Chilled', 'Dawnlit', 'Dawncharged', 'Ambershine', 'Ambercharged', 'Max Weight'],
  'DawnCelestial': ['Normal', 'Rainbow', 'Gold', 'Frozen', 'Wet', 'Chilled', 'Dawnlit', 'Dawncharged', 'Ambershine', 'Ambercharged', 'Max Weight'],
  'MoonCelestial': ['Normal', 'Rainbow', 'Gold', 'Frozen', 'Wet', 'Chilled', 'Dawnlit', 'Dawncharged', 'Ambershine', 'Ambercharged', 'Max Weight'],
  'CacaoBean': ['Normal', 'Rainbow', 'Gold', 'Frozen', 'Wet', 'Chilled', 'Dawnlit', 'Dawncharged', 'Ambershine', 'Ambercharged', 'Max Weight'],
};

// All pet species and their variants
// Pets track: Normal, Rainbow, Gold, and Max size
const PET_CATALOG: Record<string, string[]> = {
  // Tier 1 - Common
  'Worm': ['Normal', 'Rainbow', 'Gold', 'Max Weight'],
  'Snail': ['Normal', 'Rainbow', 'Gold', 'Max Weight'],
  'Bee': ['Normal', 'Rainbow', 'Gold', 'Max Weight'],

  // Tier 2 - Uncommon
  'Chicken': ['Normal', 'Rainbow', 'Gold', 'Max Weight'],
  'Bunny': ['Normal', 'Rainbow', 'Gold', 'Max Weight'],
  'Dragonfly': ['Normal', 'Rainbow', 'Gold', 'Max Weight'],

  // Tier 3 - Rare
  'Pig': ['Normal', 'Rainbow', 'Gold', 'Max Weight'],
  'Cow': ['Normal', 'Rainbow', 'Gold', 'Max Weight'],
  'Sheep': ['Normal', 'Rainbow', 'Gold', 'Max Weight'],
  'Turkey': ['Normal', 'Rainbow', 'Gold', 'Max Weight'],

  // Tier 4 - Epic
  'Squirrel': ['Normal', 'Rainbow', 'Gold', 'Max Weight'],
  'Turtle': ['Normal', 'Rainbow', 'Gold', 'Max Weight'],
  'Goat': ['Normal', 'Rainbow', 'Gold', 'Max Weight'],

  // Tier 5 - Legendary
  'Butterfly': ['Normal', 'Rainbow', 'Gold', 'Max Weight'],
  'Peacock': ['Normal', 'Rainbow', 'Gold', 'Max Weight'],
  'Capybara': ['Normal', 'Rainbow', 'Gold', 'Max Weight'],
};

// All pet abilities
const PET_ABILITIES: string[] = [
  // XP Boost
  'XP Boost I',
  'XP Boost II',
  'XP Boost III',

  // Selling
  'Higher Sell Price I',
  'Higher Sell Price II',
  'Higher Sell Price III',

  // Growth Speed
  'Faster Growth I',
  'Faster Growth II',
  'Faster Growth III',

  // Crop Size
  'Bigger Crops I',
  'Bigger Crops II',
  'Bigger Crops III',

  // Special Mutations
  'Gold Granter',
  'Rainbow Granter',

  // Harvesting
  'Extra Harvests I',
  'Extra Harvests II',

  // Utility
  'Crop Refund',
  'Double Seeds',
  'Weather Bonus',
];

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
          variantsLogged: Array.isArray((data as any)?.variantsLogged)
            ? (data as any).variantsLogged
            : [],
        },
      ])
    );
  }

  if (raw.pets && typeof raw.pets === 'object') {
    journal.pets = Object.fromEntries(
      Object.entries(raw.pets).map(([species, data]) => [
        species,
        {
          variantsLogged: Array.isArray((data as any)?.variantsLogged)
            ? (data as any).variantsLogged
            : [],
          abilitiesLogged: Array.isArray((data as any)?.abilitiesLogged)
            ? (data as any).abilitiesLogged
            : [],
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

  // Process produce
  for (const [species, possibleVariants] of Object.entries(PRODUCE_CATALOG)) {
    const speciesLog = journal.produce?.[species];
    const loggedVariants = new Map<string, number>();

    if (speciesLog?.variantsLogged) {
      for (const log of speciesLog.variantsLogged) {
        loggedVariants.set(log.variant, log.createdAt || 0);
      }
    }

    summary.produce.push({
      species,
      variants: possibleVariants.map((variant) => ({
        variant,
        collected: loggedVariants.has(variant),
        collectedAt: loggedVariants.get(variant),
      })),
    });
  }

  // Process pets (variants only, no abilities)
  for (const [species, possibleVariants] of Object.entries(PET_CATALOG)) {
    const speciesLog = journal.pets?.[species];
    const loggedVariants = new Map<string, number>();

    if (speciesLog?.variantsLogged) {
      for (const log of speciesLog.variantsLogged) {
        loggedVariants.set(log.variant, log.createdAt || 0);
      }
    }

    summary.pets.push({
      species,
      variants: possibleVariants.map((variant) => ({
        variant,
        collected: loggedVariants.has(variant),
        collectedAt: loggedVariants.get(variant),
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
