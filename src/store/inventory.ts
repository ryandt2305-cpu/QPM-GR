// src/store/inventory.ts
// Bridge for inventory data via myInventoryAtom and myCropInventoryAtom

import { getAtomByLabel, subscribeAtom, readAtomValue } from '../core/jotaiBridge';
import { log } from '../utils/logger';
import { autoFavoriteIfNeeded } from '../features/autoFavorite';

export interface InventoryItem {
  id: string;
  itemId?: string;
  species?: string | null;
  name?: string | null;
  displayName?: string | null;
  itemType?: string | null;
  quantity?: number;
  count?: number;
  amount?: number;
  stackSize?: number;
  raw: unknown;
}

export interface InventoryData {
  items: InventoryItem[];
  favoritedItemIds?: string[];
}

const INVENTORY_ATOM_LABEL = 'myInventoryAtom';
const CROP_INVENTORY_ATOM_LABEL = 'myCropInventoryAtom';

let cachedInventory: InventoryItem[] = [];
let cachedFavorites: Set<string> = new Set();
let previousInventoryIds: Set<string> = new Set();
let unsubscribe: (() => void) | null = null;
let initializing = false;
let isFirstInventoryUpdate = true;

function normalizeInventoryItem(raw: any): InventoryItem | null {
  if (!raw || typeof raw !== 'object') return null;

  const id = String(raw.id ?? raw.itemId ?? '');
  if (!id) return null;

  return {
    id,
    itemId: raw.itemId,
    species: raw.species ?? raw.petSpecies ?? null,
    name: raw.name ?? raw.displayName ?? null,
    displayName: raw.displayName ?? raw.name ?? null,
    itemType: raw.itemType ?? null,
    quantity: raw.quantity ?? raw.count ?? raw.amount ?? raw.stackSize,
    count: raw.count,
    amount: raw.amount,
    stackSize: raw.stackSize,
    raw,
  };
}

function normalizeInventoryData(raw: any): InventoryData | null {
  if (!raw) return null;

  // Try to extract items array
  let itemsArray: any[] = [];
  if (Array.isArray(raw)) {
    itemsArray = raw;
  } else if (Array.isArray(raw.items)) {
    itemsArray = raw.items;
  } else if (Array.isArray(raw.inventory)) {
    itemsArray = raw.inventory;
  } else if (typeof raw === 'object') {
    // Try to find an array in the object
    const values = Object.values(raw);
    const candidate = values.find((v): v is any[] =>
      Array.isArray(v) && v.length > 0 && typeof v[0] === 'object'
    );
    if (candidate) {
      itemsArray = candidate;
    }
  }

  const items: InventoryItem[] = [];
  for (const rawItem of itemsArray) {
    const normalized = normalizeInventoryItem(rawItem);
    if (normalized) {
      items.push(normalized);
    }
  }

  // Extract favorited item IDs
  let favoritedItemIds: string[] = [];
  if (Array.isArray(raw?.favoritedItemIds)) {
    favoritedItemIds = raw.favoritedItemIds.filter((id: any): id is string => typeof id === 'string');
  } else if (Array.isArray(raw?.favorites)) {
    favoritedItemIds = raw.favorites.filter((id: any): id is string => typeof id === 'string');
  }

  return {
    items,
    favoritedItemIds,
  };
}

/**
 * Determine if a produce item is rainbow/gold by checking its properties
 */
function determineProduceRarity(item: InventoryItem): 'normal' | 'gold' | 'rainbow' {
  const raw = item.raw as any;
  if (!raw) return 'normal';

  // Check mutations array (like the harvest event: ['Rainbow', 'Ambercharged', 'Frozen'])
  if (Array.isArray(raw.mutations)) {
    const mutationStr = raw.mutations.join(' ').toLowerCase();
    if (mutationStr.includes('rainbow')) return 'rainbow';
    if (mutationStr.includes('gold') || mutationStr.includes('golden')) return 'gold';
  }

  // Check rarity property
  if (raw.rarity) {
    const rarityLower = String(raw.rarity).toLowerCase();
    if (rarityLower.includes('rainbow')) return 'rainbow';
    if (rarityLower.includes('gold')) return 'gold';
  }

  // Check boolean flags
  if (raw.isRainbow === true) return 'rainbow';
  if (raw.isGold === true || raw.isGolden === true) return 'gold';

  // Check targetScale
  if (raw.targetScale !== undefined && typeof raw.targetScale === 'number') {
    if (raw.targetScale >= 1.25) return 'rainbow'; // 1.25x or higher is rainbow
    if (raw.targetScale >= 1.1) return 'gold'; // 1.1x to 1.24x is gold
  }

  // Check cropSlot (for harvested items)
  if (raw.cropSlot && typeof raw.cropSlot === 'object') {
    const cropSlot = raw.cropSlot;

    // Check targetScale in cropSlot
    if (cropSlot.targetScale !== undefined && typeof cropSlot.targetScale === 'number') {
      if (cropSlot.targetScale >= 1.25) return 'rainbow';
      if (cropSlot.targetScale >= 1.1) return 'gold';
    }

    // Check mutations in cropSlot
    if (Array.isArray(cropSlot.mutations)) {
      const mutationStr = cropSlot.mutations.join(' ').toLowerCase();
      if (mutationStr.includes('rainbow')) return 'rainbow';
      if (mutationStr.includes('gold') || mutationStr.includes('golden')) return 'gold';
    }
  }

  return 'normal';
}

function updateCache(raw: any): void {
  const data = normalizeInventoryData(raw);
  if (data) {
    const newItems = data.items;
    const currentIds = new Set(newItems.map(item => item.id));

    // Detect newly added items (skip on first update)
    if (!isFirstInventoryUpdate) {
      for (const item of newItems) {
        if (!previousInventoryIds.has(item.id)) {
          // New item detected! Check if it's produce and if it's rainbow/gold
          const itemType = (item.itemType?.toLowerCase() || '').toLowerCase();

          // Check if it's a crop/produce item
          if (itemType.includes('crop') || itemType.includes('produce') ||
              item.species || (item.raw as any)?.species) {
            const rarity = determineProduceRarity(item);

            if (rarity !== 'normal') {
              log(`✨ Detected new ${rarity} produce in inventory: ${item.displayName || item.name || item.species} (${item.id})`);
              autoFavoriteIfNeeded(item.id, 'produce', rarity);
            }
          }
        }
      }
    } else {
      isFirstInventoryUpdate = false;
    }

    cachedInventory = newItems;
    cachedFavorites = new Set(data.favoritedItemIds ?? []);
    previousInventoryIds = currentIds;
  } else {
    cachedInventory = [];
    cachedFavorites = new Set();
    previousInventoryIds = new Set();
  }
}

export async function startInventoryStore(): Promise<void> {
  if (unsubscribe || initializing) {
    return;
  }

  initializing = true;
  try {
    // Try myInventoryAtom first (full inventory)
    let atom = getAtomByLabel(INVENTORY_ATOM_LABEL);

    // Fallback to myCropInventoryAtom if myInventoryAtom not found
    if (!atom) {
      log('⚠️ myInventoryAtom not found, trying myCropInventoryAtom');
      atom = getAtomByLabel(CROP_INVENTORY_ATOM_LABEL);
    }

    if (!atom) {
      log('⚠️ Inventory atom not found');
      initializing = false;
      return;
    }

    unsubscribe = await subscribeAtom(atom, (value: any) => {
      updateCache(value);
    });

    log('✅ Inventory store initialized');
  } catch (error) {
    log('❌ Failed to initialize inventory store', error);
  } finally {
    initializing = false;
  }
}

export function stopInventoryStore(): void {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  cachedInventory = [];
  cachedFavorites = new Set();
  previousInventoryIds = new Set();
  isFirstInventoryUpdate = true;
}

/**
 * Get current inventory items (synchronous)
 * Returns cached data from the subscribed atom
 */
export function getInventoryItems(): InventoryItem[] {
  return [...cachedInventory];
}

/**
 * Get current favorited item IDs (synchronous)
 */
export function getFavoritedItemIds(): Set<string> {
  return new Set(cachedFavorites);
}

/**
 * Check if inventory store is running
 */
export function isInventoryStoreActive(): boolean {
  return unsubscribe !== null;
}

/**
 * Read inventory directly from atom (async, bypasses cache)
 * Useful for one-time reads without subscribing
 */
export async function readInventoryDirect(): Promise<InventoryData | null> {
  try {
    let atom = getAtomByLabel(INVENTORY_ATOM_LABEL);

    if (!atom) {
      atom = getAtomByLabel(CROP_INVENTORY_ATOM_LABEL);
    }

    if (!atom) {
      log('⚠️ Inventory atom not found');
      return null;
    }

    const raw = await readAtomValue(atom);
    return normalizeInventoryData(raw);
  } catch (error) {
    log('❌ Failed to read inventory atom', error);
    return null;
  }
}
