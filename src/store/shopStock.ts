// src/store/shopStock.ts
// Normalized view of shop atom data and restock timers.

import { readAtomValue, subscribeAtomValue } from '../core/atomRegistry';
import { log } from '../utils/logger';
import type {
  ShopInventoryEntry,
  ShopCategorySnapshot,
  ShopsAtomSnapshot,
  ShopPurchasesAtomSnapshot,
} from '../types/gameAtoms';
import { SHOP_CATEGORIES, type ShopCategory } from '../types/shops';

const ATOM_KEY_BY_CATEGORY: Record<ShopCategory, 'seed' | 'egg' | 'tool' | 'decor'> = {
  seeds: 'seed',
  eggs: 'egg',
  tools: 'tool',
  decor: 'decor',
};

const ITEM_TYPE_BY_CATEGORY: Record<ShopCategory, 'Seed' | 'Egg' | 'Tool' | 'Decor'> = {
  seeds: 'Seed',
  eggs: 'Egg',
  tools: 'Tool',
  decor: 'Decor',
};

export interface ShopStockItem {
  category: ShopCategory;
  id: string;
  label: string;
  orderIndex: number;
  initialStock: number | null;
  currentStock: number | null;
  remaining: number | null;
  purchased: number;
  canSpawn: boolean;
  isAvailable: boolean;
  priceCoins: number | null;
  priceCredits: number | null;
  quantityPerPurchase: number;
  raw: ShopInventoryEntry;
}

export interface ShopStockCategoryState {
  category: ShopCategory;
  secondsUntilRestock: number | null;
  nextRestockAt: number | null;
  restockIntervalMs: number | null;
  items: ShopStockItem[];
  availableCount: number;
  signature: string;
  updatedAt: number;
  raw: ShopCategorySnapshot | null;
}

export interface ShopStockState {
  updatedAt: number;
  categories: Record<ShopCategory, ShopStockCategoryState>;
}

const listeners = new Set<(state: ShopStockState) => void>();
let shopsSnapshot: ShopsAtomSnapshot | null = null;
let purchasesSnapshot: ShopPurchasesAtomSnapshot | null = null;
let cachedState: ShopStockState = createEmptyState();
let startPromise: Promise<void> | null = null;
let shopsUnsubscribe: (() => void) | null = null;
let purchasesUnsubscribe: (() => void) | null = null;

function createEmptyState(): ShopStockState {
  const categories = Object.create(null) as Record<ShopCategory, ShopStockCategoryState>;
  const now = Date.now();
  for (const category of SHOP_CATEGORIES) {
    categories[category] = {
      category,
      secondsUntilRestock: null,
      nextRestockAt: null,
      restockIntervalMs: null,
      items: [],
      availableCount: 0,
      signature: '',
      updatedAt: now,
      raw: null,
    };
  }
  return { updatedAt: now, categories };
}

function notifyState(): void {
  for (const listener of listeners) {
    try {
      listener(cachedState);
    } catch (error) {
      log('⚠️ ShopStock listener error', error);
    }
  }
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const match = value.match(/-?\d+(?:\.\d+)?/);
    if (match) {
      const parsed = Number(match[0]);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return null;
}

function toPositiveInteger(value: unknown): number | null {
  const numeric = toNumber(value);
  if (numeric == null) {
    return null;
  }
  const rounded = Math.round(numeric);
  return rounded > 0 ? rounded : null;
}

function deriveItemId(category: ShopCategory, entry: ShopInventoryEntry): string | null {
  switch (category) {
    case 'seeds':
      return entry.species != null ? String(entry.species) : entry.id != null ? String(entry.id) : null;
    case 'eggs':
      return entry.eggId != null ? String(entry.eggId) : entry.id != null ? String(entry.id) : null;
    case 'tools':
      return entry.toolId != null ? String(entry.toolId) : entry.id != null ? String(entry.id) : null;
    case 'decor':
      return entry.decorId != null ? String(entry.decorId) : entry.id != null ? String(entry.id) : null;
    default:
      return entry.id != null ? String(entry.id) : null;
  }
}

function deriveItemLabel(entry: ShopInventoryEntry): string {
  const label =
    entry.name ??
    entry.displayName ??
    entry.species ??
    entry.petSpecies ??
    entry.toolId ??
    entry.decorId ??
    entry.eggId ??
    entry.id ??
    'Item';
  return String(label).trim();
}

function extractInitialStock(entry: ShopInventoryEntry): number | null {
  const candidates = [
    entry.initialStock,
    entry.stock,
    entry.availableStock,
    entry.quantity,
    entry.count,
    entry.amount,
  ];
  for (const candidate of candidates) {
    const numeric = toPositiveInteger(candidate);
    if (numeric != null) {
      return numeric;
    }
  }
  if (entry.initialStock === 0) {
    return 0;
  }
  return null;
}

function extractQuantityPerPurchase(entry: ShopInventoryEntry): number {
  const candidates = [
    entry.quantityPerPurchase,
    entry.bundleSize,
    entry.quantityPerClick,
    entry.quantity,
  ];
  for (const candidate of candidates) {
    const numeric = toPositiveInteger(candidate);
    if (numeric != null) {
      return numeric;
    }
  }
  return 1;
}

function extractPrice(entry: ShopInventoryEntry): { coins: number | null; credits: number | null } {
  const coinsCandidates = [entry.priceCoins, entry.coins, entry.price, entry.cost];
  const creditsCandidates = [entry.priceCredits, entry.credits, entry.creditCost];
  let coins: number | null = null;
  let credits: number | null = null;
  for (const candidate of coinsCandidates) {
    const numeric = toPositiveInteger(candidate);
    if (numeric != null) {
      coins = numeric;
      break;
    }
  }
  for (const candidate of creditsCandidates) {
    const numeric = toPositiveInteger(candidate);
    if (numeric != null) {
      credits = numeric;
      break;
    }
  }
  return { coins, credits };
}

function getPurchaseCount(category: ShopCategory, rawId: string, purchases: ShopPurchasesAtomSnapshot | null): number {
  const key = ATOM_KEY_BY_CATEGORY[category];
  const bucket = purchases?.[key]?.purchases;
  if (!bucket || typeof bucket !== 'object') {
    return 0;
  }
  const direct = bucket[rawId];
  if (direct != null && Number.isFinite(Number(direct))) {
    return Number(direct);
  }
  const numericKey = Number(rawId);
  if (Number.isFinite(numericKey) && bucket[numericKey] != null && Number.isFinite(Number(bucket[numericKey]))) {
    return Number(bucket[numericKey]);
  }
  return 0;
}

function computeRemaining(initialStock: number | null, purchased: number, canSpawn: boolean): number | null {
  if (initialStock == null) {
    return canSpawn ? null : 0;
  }
  const bought = Number.isFinite(purchased) ? Math.max(0, Math.round(purchased)) : 0;
  const remaining = Math.max(0, initialStock - bought);
  return canSpawn ? remaining : 0;
}

function normalizeEntry(
  category: ShopCategory,
  entry: ShopInventoryEntry,
  purchases: ShopPurchasesAtomSnapshot | null,
  orderIndex: number,
): ShopStockItem | null {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const id = deriveItemId(category, entry);
  if (!id) {
    return null;
  }

  const label = deriveItemLabel(entry);
  const initialStock = extractInitialStock(entry);
  const currentStock = toPositiveInteger(entry.stock ?? entry.availableStock ?? entry.remaining);
  const quantityPerPurchase = extractQuantityPerPurchase(entry);
  const { coins: priceCoins, credits: priceCredits } = extractPrice(entry);
  // NOTE: canSpawnHere was removed from the game in Nov 2025 update
  // Treat all items as spawnable (default true for backward compatibility)
  const canSpawn = entry.canSpawnHere !== false;
  const purchased = getPurchaseCount(category, String(id), purchases);
  let remaining = computeRemaining(initialStock, purchased, canSpawn);

  if (currentStock != null) {
    // Prefer the live stock snapshot when available; purchases data can lag restocks.
    remaining = currentStock;
  }

  let isAvailable = false;
  if (!canSpawn) {
    isAvailable = false;
  } else if (currentStock != null) {
    isAvailable = currentStock > 0;
  } else if (remaining != null) {
    isAvailable = remaining > 0;
  } else {
    isAvailable = true;
  }

  return {
    category,
    id: String(id),
    label,
    orderIndex,
    initialStock,
    currentStock,
    remaining,
    purchased,
    canSpawn,
    isAvailable,
    priceCoins,
    priceCredits,
    quantityPerPurchase,
    raw: entry,
  };
}

function normalizeCategory(
  category: ShopCategory,
  snapshot: ShopCategorySnapshot | null,
  purchases: ShopPurchasesAtomSnapshot | null,
): ShopStockCategoryState {
  const now = Date.now();
  const inventory = Array.isArray(snapshot?.inventory) ? snapshot!.inventory : [];
  const items: ShopStockItem[] = [];
  inventory.forEach((entry, index) => {
    const normalized = normalizeEntry(category, entry, purchases, index);
    if (normalized) {
      items.push(normalized);
    }
  });

  const availableCount = items.filter((item) => item.isAvailable).length;
  const signature = items
    .map((item) => `${item.id}:${item.remaining ?? 'x'}:${item.currentStock ?? 'x'}:${item.purchased}`)
    .join('|');

  const secondsUntilRestock = typeof snapshot?.secondsUntilRestock === 'number' ? snapshot!.secondsUntilRestock! : null;
  const nextRestockAt = typeof snapshot?.nextRestockAt === 'number' ? snapshot!.nextRestockAt! : null;
  const restockIntervalMs = typeof snapshot?.restockIntervalMs === 'number' ? snapshot!.restockIntervalMs! : null;

  return {
    category,
    secondsUntilRestock,
    nextRestockAt,
    restockIntervalMs,
    items,
    availableCount,
    signature,
    updatedAt: now,
    raw: snapshot ?? null,
  };
}

function rebuildState(): void {
  const now = Date.now();
  const categories = Object.create(null) as Record<ShopCategory, ShopStockCategoryState>;
  for (const category of SHOP_CATEGORIES) {
    const atomKey = ATOM_KEY_BY_CATEGORY[category];
    const snapshot = shopsSnapshot?.[atomKey] ?? null;
    categories[category] = normalizeCategory(category, snapshot, purchasesSnapshot);
  }
  cachedState = { updatedAt: now, categories };
  notifyState();
}

export async function startShopStockStore(): Promise<void> {
  if (startPromise) {
    return startPromise;
  }
  startPromise = (async () => {
    try {
      shopsSnapshot = await readAtomValue('shops');
    } catch (error) {
      log('⚠️ Failed to read shops atom initially', error);
      shopsSnapshot = null;
    }

    try {
      purchasesSnapshot = await readAtomValue('shopPurchases');
    } catch (error) {
      log('⚠️ Failed to read shop purchases atom initially', error);
      purchasesSnapshot = null;
    }

    rebuildState();

    try {
      shopsUnsubscribe = await subscribeAtomValue('shops', (value) => {
        shopsSnapshot = value;
        rebuildState();
      });
    } catch (error) {
      log('⚠️ Failed to subscribe to shops atom', error);
    }

    try {
      purchasesUnsubscribe = await subscribeAtomValue('shopPurchases', (value) => {
        purchasesSnapshot = value;
        rebuildState();
      });
    } catch (error) {
      log('⚠️ Failed to subscribe to shop purchases atom', error);
    }
  })().catch((error) => {
    log('⚠️ startShopStockStore error', error);
    startPromise = null;
  });
  return startPromise;
}

export function stopShopStockStore(): void {
  try {
    shopsUnsubscribe?.();
  } catch {}
  try {
    purchasesUnsubscribe?.();
  } catch {}
  shopsUnsubscribe = null;
  purchasesUnsubscribe = null;
  startPromise = null;
  shopsSnapshot = null;
  purchasesSnapshot = null;
  cachedState = createEmptyState();
}

export function getShopStockState(): ShopStockState {
  return cachedState;
}

export function onShopStock(
  callback: (state: ShopStockState) => void,
  fireImmediately = true,
): () => void {
  listeners.add(callback);
  if (fireImmediately) {
    try {
      callback(cachedState);
    } catch (error) {
      log('⚠️ ShopStock immediate listener error', error);
    }
  }
  return () => {
    listeners.delete(callback);
  };
}

export function getAvailableItems(category: ShopCategory): ShopStockItem[] {
  const state = cachedState.categories[category];
  return state ? state.items.filter((item) => item.isAvailable) : [];
}

export function describeItemForLog(item: ShopStockItem): string {
  const pieces = [ITEM_TYPE_BY_CATEGORY[item.category], item.label];
  if (item.remaining != null) {
    if (item.initialStock != null) {
      pieces.push(`${item.remaining}/${item.initialStock}`);
    } else {
      pieces.push(`${item.remaining} left`);
    }
  } else if (item.currentStock != null) {
    pieces.push(`${item.currentStock} stock`);
  }
  if (item.priceCoins != null) {
    pieces.push(`${item.priceCoins}c`);
  }
  if (item.priceCredits != null) {
    pieces.push(`${item.priceCredits}★`);
  }
  return pieces.join(' • ');
}
