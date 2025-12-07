// src/store/saleWindow.ts
// Tracks crop sale windows using sell-all snapshot and crop sale logs

import { getAtomByLabel, subscribeAtom } from '../core/jotaiBridge';
import { log } from '../utils/logger';
import { InventoryItem } from './inventory';
import { subscribeSellSnapshot } from './sellSnapshot';

const LOG_ATOM_LABEL = 'newCropLogsFromSellingAtom';
const WINDOW_60S = 60_000;
const WINDOW_10M = 10 * 60_000;

type SaleEvent = {
  timestamp: number;
  species: Set<string>;
};

type SaleWindowCounts = {
  unique60s: number;
  unique10m: number;
};

let events: SaleEvent[] = [];
let logUnsubscribe: (() => void) | null = null;
let snapshotUnsubscribe: (() => void) | null = null;
let started = false;

function normalizeSpecies(raw: unknown): string | null {
  if (!raw) return null;
  const str = `${raw}`.trim();
  if (!str) return null;
  return str.toLowerCase();
}

function extractSpeciesFromItem(item: InventoryItem): string | null {
  const candidates: Array<unknown> = [
    item.species,
    item.displayName,
    item.name,
    item.itemId,
    item.id,
    (item as any)?.raw?.species,
    (item as any)?.raw?.name,
    (item as any)?.raw?.displayName,
  ];
  for (const candidate of candidates) {
    const normalized = normalizeSpecies(candidate);
    if (normalized) return normalized;
  }
  return null;
}

function recordSale(species: Set<string>, timestamp: number): void {
  if (!species.size) return;
  events.push({ timestamp, species });
  prune(timestamp);
}

function recordSaleFromItems(items: InventoryItem[], timestamp: number): void {
  const species = new Set<string>();
  items.forEach((item) => {
    const s = extractSpeciesFromItem(item);
    if (s) species.add(s);
  });
  recordSale(species, timestamp);
}

function recordSaleFromLog(logValue: any, timestamp: number): void {
  if (!logValue || typeof logValue !== 'object') return;
  const species = new Set<string>();
  // logValue is expected to be an object keyed by species id
  Object.keys(logValue).forEach((key) => {
    const normalized = normalizeSpecies(key);
    if (normalized) species.add(normalized);
  });
  recordSale(species, timestamp);
}

function prune(now: number): void {
  events = events.filter((evt) => now - evt.timestamp <= WINDOW_10M);
}

export function getSaleWindowCounts(now: number = Date.now()): SaleWindowCounts {
  prune(now);
  const uniq60 = new Set<string>();
  const uniq10 = new Set<string>();
  events.forEach((evt) => {
    const age = now - evt.timestamp;
    if (age <= WINDOW_10M) {
      evt.species.forEach((s) => uniq10.add(s));
      if (age <= WINDOW_60S) {
        evt.species.forEach((s) => uniq60.add(s));
      }
    }
  });
  return {
    unique60s: uniq60.size,
    unique10m: uniq10.size,
  };
}

export async function startSellWindowTracking(onUpdate: () => void): Promise<void> {
  if (started) return;
  started = true;

  snapshotUnsubscribe = subscribeSellSnapshot(({ items, timestamp }) => {
    recordSaleFromItems(items, timestamp);
    onUpdate();
  });

  try {
    const atom = getAtomByLabel(LOG_ATOM_LABEL);
    if (atom) {
      log('🧾 Sell window: subscribing to crop sale logs');
      logUnsubscribe = await subscribeAtom(atom, (value: any) => {
        recordSaleFromLog(value, Date.now());
        onUpdate();
      });
    } else {
      log('⚠️ Sell window: log atom not found');
    }
  } catch (error) {
    log('⚠️ Sell window: failed to subscribe to logs', error);
  }
}

export function stopSellWindowTracking(): void {
  if (logUnsubscribe) {
    logUnsubscribe();
    logUnsubscribe = null;
  }
  if (snapshotUnsubscribe) {
    snapshotUnsubscribe();
    snapshotUnsubscribe = null;
  }
  events = [];
  started = false;
}
