// src/utils/restockDataService.ts
// Shared Supabase restock data fetcher + cache for shop window and dashboard.

import { storage } from './storage';
import { log } from './logger';

const RESTOCK_ENDPOINT = 'https://xjuvryjgrjchbhjixwzh.supabase.co/rest/v1/restock_predictions';
const RESTOCK_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhqdXZyeWpncmpjaGJoaml4d3poIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxMDYyODMsImV4cCI6MjA4NTY4MjI4M30.MqQCBG-UMR4HYJU44Tz2orHUj9gMgJTMJtxpb_MHeps';
const RESTOCK_COLUMNS = [
  'item_id',
  'shop_type',
  'current_probability',
  'base_rate',
  'estimated_next_timestamp',
  'median_interval_ms',
  'expected_interval_ms',
  'last_seen',
  'average_quantity',
  'total_quantity',
  'total_occurrences',
] as const;
const RESTOCK_QUERY = `select=${RESTOCK_COLUMNS.join(',')}`;
const RESTOCK_URL = `${RESTOCK_ENDPOINT}?${RESTOCK_QUERY}`;

// v3 key separates cache from the prior weather-inclusive payload.
const CACHE_KEY = 'qpm.restockCache.v3';
const REFRESH_BUDGET_KEY = 'qpm.restock.refreshBudget.v1';
const ALLOWED_SHOP_TYPES = new Set(['seed', 'egg', 'decor']);

export const RESTOCK_REFRESH_WINDOW_MS = 2 * 60 * 60 * 1000;
export const RESTOCK_REFRESH_MAX = 5;
export const RESTOCK_DATA_UPDATED_EVENT = 'qpm:restock-data-updated';

// Keys to search when unwrapping the API response envelope.
const ENVELOPE_KEYS = ['items', 'data', 'rows', 'results'] as const;

export interface RestockItem {
  item_id: string;
  shop_type: string;
  current_probability: number | null;
  appearance_rate: number | null;
  estimated_next_timestamp: number | null;
  median_interval_ms: number | null;
  last_seen: number | null;
  average_quantity: number | null;
  total_quantity: number | null;
  total_occurrences: number | null;
}

export interface RestockRefreshBudgetState {
  max: number;
  used: number;
  remaining: number;
  windowStartedAt: number;
  resetAt: number;
  blocked: boolean;
  windowMs: number;
}

export interface RestockDataUpdatedDetail {
  fetchedAt: number;
  count: number;
}

export type FetchStatus = 'idle' | 'fetching' | 'ok' | 'error';

interface CacheEntry {
  data: RestockItem[];
  fetchedAt: number;
}

interface RefreshBudgetEntry {
  used: number;
  windowStartedAt: number;
}

type GmXhr = (details: {
  method: 'GET' | 'POST';
  url: string;
  headers?: Record<string, string>;
  onload?: (res: { status: number; responseText: string }) => void;
  onerror?: (err: unknown) => void;
  ontimeout?: () => void;
  timeout?: number;
}) => void;

function resolveGmXhr(): GmXhr | null {
  if (typeof GM_xmlhttpRequest === 'function') return GM_xmlhttpRequest as unknown as GmXhr;
  const gm = (globalThis as any).GM;
  if (gm?.xmlHttpRequest) return gm.xmlHttpRequest.bind(gm) as GmXhr;
  return null;
}

function getRestockRequestConfig(): { url: string; key: string } | null {
  const url = (RESTOCK_URL || '').trim();
  const key = (RESTOCK_ANON_KEY || '').trim();
  const validUrl = /^https:\/\/[^ ]+$/i.test(url);
  if (!validUrl || key.length < 16) {
    if (!invalidConfigLogged) {
      log('[RestockData] Invalid restock API configuration. Network fetch disabled.');
      invalidConfigLogged = true;
    }
    return null;
  }
  return { url, key };
}

/** Promisified GM XHR GET -> resolves with response text or null on failure. */
function gmGet(gm: GmXhr, url: string, apiKey: string): Promise<string | null> {
  return new Promise((resolve) => {
    gm({
      method: 'GET',
      url,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        apikey: apiKey,
        'Content-Type': 'application/json',
      },
      timeout: 15_000,
      onload: (res) => resolve(res.status >= 200 && res.status < 300 ? res.responseText : null),
      onerror: () => resolve(null),
      ontimeout: () => resolve(null),
    });
  });
}

/** Convert a raw Supabase timestamp value to Unix ms regardless of format. */
function toMs(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
    const d = new Date(v).getTime();
    if (Number.isFinite(d)) return d;
  }
  return null;
}

/** Same as toMs but for duration/interval columns (ms). */
function toMsDuration(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Safely parse a float from a raw value (probability, rate, quantity). */
function toFloat(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

let fetchingPromise: Promise<RestockItem[]> | null = null;
let weatherDisabledLogged = false;
let invalidConfigLogged = false;

function emitRestockDataUpdated(detail: RestockDataUpdatedDetail): void {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  window.dispatchEvent(new CustomEvent<RestockDataUpdatedDetail>(RESTOCK_DATA_UPDATED_EVENT, { detail }));
}

function sanitizeItems(items: RestockItem[]): RestockItem[] {
  return items.filter((item) => !!item.item_id && ALLOWED_SHOP_TYPES.has(item.shop_type));
}

/** Load cache from storage (may be stale). */
function readCache(): CacheEntry | null {
  const cached = storage.get<CacheEntry | null>(CACHE_KEY, null);
  if (!cached || !Array.isArray(cached.data)) return null;
  return { ...cached, data: sanitizeItems(cached.data) };
}

function readRefreshBudgetRaw(): RefreshBudgetEntry | null {
  const saved = storage.get<RefreshBudgetEntry | null>(REFRESH_BUDGET_KEY, null);
  if (!saved || typeof saved !== 'object') return null;
  const used = Number(saved.used);
  const windowStartedAt = Number(saved.windowStartedAt);
  if (!Number.isFinite(used) || !Number.isFinite(windowStartedAt)) return null;
  return {
    used: Math.max(0, Math.floor(used)),
    windowStartedAt: Math.max(0, Math.floor(windowStartedAt)),
  };
}

function normalizeRefreshBudget(now: number): { entry: RefreshBudgetEntry; changed: boolean } {
  const raw = readRefreshBudgetRaw();
  if (!raw || raw.windowStartedAt <= 0 || now - raw.windowStartedAt >= RESTOCK_REFRESH_WINDOW_MS) {
    return {
      entry: { used: 0, windowStartedAt: now },
      changed: true,
    };
  }

  const clampedUsed = Math.min(RESTOCK_REFRESH_MAX, Math.max(0, raw.used));
  return {
    entry: {
      used: clampedUsed,
      windowStartedAt: raw.windowStartedAt,
    },
    changed: clampedUsed !== raw.used,
  };
}

function writeRefreshBudget(entry: RefreshBudgetEntry): void {
  storage.set(REFRESH_BUDGET_KEY, entry);
}

function toRefreshBudgetState(entry: RefreshBudgetEntry): RestockRefreshBudgetState {
  const used = Math.min(RESTOCK_REFRESH_MAX, Math.max(0, entry.used));
  const remaining = Math.max(0, RESTOCK_REFRESH_MAX - used);
  const resetAt = entry.windowStartedAt + RESTOCK_REFRESH_WINDOW_MS;
  return {
    max: RESTOCK_REFRESH_MAX,
    used,
    remaining,
    windowStartedAt: entry.windowStartedAt,
    resetAt,
    blocked: remaining <= 0,
    windowMs: RESTOCK_REFRESH_WINDOW_MS,
  };
}

export function getRestockRefreshBudget(now = Date.now()): RestockRefreshBudgetState {
  const normalized = normalizeRefreshBudget(now);
  if (normalized.changed) {
    writeRefreshBudget(normalized.entry);
  }
  return toRefreshBudgetState(normalized.entry);
}

export function tryConsumeRestockRefresh(now = Date.now()): RestockRefreshBudgetState {
  const normalized = normalizeRefreshBudget(now);
  const entry = normalized.entry;
  if (entry.used < RESTOCK_REFRESH_MAX) {
    entry.used += 1;
  }
  writeRefreshBudget(entry);
  return toRefreshBudgetState(entry);
}

export function onRestockDataUpdated(listener: (detail: RestockDataUpdatedDetail) => void): () => void {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return () => {};

  const handler = (event: Event): void => {
    const detail = (event as CustomEvent<RestockDataUpdatedDetail>).detail;
    if (!detail || typeof detail.fetchedAt !== 'number' || typeof detail.count !== 'number') return;
    listener(detail);
  };

  window.addEventListener(RESTOCK_DATA_UPDATED_EVENT, handler as EventListener);
  return () => {
    window.removeEventListener(RESTOCK_DATA_UPDATED_EVENT, handler as EventListener);
  };
}

/** Return effective probability from either field. */
export function getItemProbability(item: RestockItem): number | null {
  return item.current_probability ?? item.appearance_rate ?? null;
}

// Fields present on any legitimate RestockItem row (snake_case and camelCase variants).
const RESTOCK_ITEM_FIELDS = new Set([
  'item_id',
  'itemId',
  'shop_type',
  'shopType',
  'estimated_next_timestamp',
  'estimatedNextTimestamp',
  'current_probability',
  'currentProbability',
  'appearance_rate',
  'appearanceRate',
  'base_rate',
  'baseRate',
  'median_interval_ms',
  'medianIntervalMs',
  'expected_interval_ms',
  'expectedIntervalMs',
  'averageIntervalMs',
  'last_seen',
  'lastSeen',
  'average_quantity',
  'averageQuantity',
  'total_quantity',
  'totalQuantity',
  'total_occurrences',
  'totalOccurrences',
]);

/** Return true if value looks like a RestockItem (has at least one known field). */
function looksLikeRestockItem(v: unknown): boolean {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  return Object.keys(v as object).some((k) => RESTOCK_ITEM_FIELDS.has(k));
}

/**
 * Try extracting an array of RestockItems from a dict.
 * Filters out any non-object or non-RestockItem-like values (e.g. numeric metadata).
 */
function dictToItems(val: unknown): RestockItem[] | null {
  if (!val || typeof val !== 'object' || Array.isArray(val)) return null;
  const items = Object.values(val as Record<string, unknown>).filter(looksLikeRestockItem);
  return items.length > 0 ? (items as RestockItem[]) : null;
}

/**
 * Normalize a raw API object (camelCase or snake_case) to the RestockItem interface (snake_case).
 */
function normalizeRestockItem(raw: Record<string, unknown>): RestockItem {
  return {
    item_id: String(raw.item_id ?? raw.itemId ?? ''),
    shop_type: String(raw.shop_type ?? raw.shopType ?? ''),
    current_probability: toFloat(raw.current_probability ?? raw.currentProbability),
    appearance_rate: toFloat(
      raw.appearance_rate
      ?? raw.appearanceRate
      ?? raw.base_rate
      ?? raw.baseRate
    ),
    estimated_next_timestamp: toMs(raw.estimated_next_timestamp ?? raw.estimatedNextTimestamp),
    median_interval_ms: toMsDuration(
      raw.median_interval_ms
      ?? raw.medianIntervalMs
      ?? raw.expected_interval_ms
      ?? raw.expectedIntervalMs
      ?? raw.averageIntervalMs
    ),
    last_seen: toMs(raw.last_seen ?? raw.lastSeen),
    average_quantity: toFloat(raw.average_quantity ?? raw.averageQuantity),
    total_quantity: toFloat(raw.total_quantity ?? raw.totalQuantity),
    total_occurrences: toFloat(raw.total_occurrences ?? raw.totalOccurrences),
  };
}

// Extra sub-keys to try when doing a nested pass.
const NESTED_KEYS = [...ENVELOPE_KEYS, 'list', 'records', 'entries'] as const;

/**
 * Walk a parsed JSON value looking for the first array of restock items.
 */
function extractItemsArray(raw: unknown): RestockItem[] | null {
  if (Array.isArray(raw)) return raw as RestockItem[];

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;

  // First pass: check each envelope key at the top level - both array and dict formats.
  for (const key of ENVELOPE_KEYS) {
    const val = obj[key];
    if (Array.isArray(val)) return val as RestockItem[];
    const fromDict = dictToItems(val);
    if (fromDict) return fromDict;
  }

  // Second pass: one level deeper.
  for (const key of ENVELOPE_KEYS) {
    const val = obj[key];
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      const nested = val as Record<string, unknown>;
      for (const nk of NESTED_KEYS) {
        const nval = nested[nk];
        if (Array.isArray(nval)) return nval as RestockItem[];
        const fromDict = dictToItems(nval);
        if (fromDict) return fromDict;
      }
    }
  }

  // Last resort: treat the entire top-level object as a dict of items.
  const fromRoot = dictToItems(obj);
  if (fromRoot) return fromRoot;

  return null;
}

/** Safe cache fallback - only returns the cached array, never a wrapped object. */
function safeCacheFallback(cache: CacheEntry | null): RestockItem[] {
  return Array.isArray(cache?.data) ? sanitizeItems(cache.data) : [];
}

/**
 * Fetch restock data from Supabase.
 * Non-force mode is cache-only once cache exists.
 * Force mode consumes refresh budget and fetches network when allowed.
 */
export async function fetchRestockData(force = false): Promise<RestockItem[]> {
  const cache = readCache();

  // Treat empty cache as a miss so clients can self-heal from older bad snapshots.
  if (!force && cache && Array.isArray(cache.data) && cache.data.length > 0) {
    return cache.data;
  }

  // Deduplicate concurrent fetches.
  if (fetchingPromise) return fetchingPromise;

  if (force) {
    const budget = getRestockRefreshBudget();
    if (budget.blocked) {
      log('[RestockData] Refresh blocked by 2h quota.');
      return safeCacheFallback(cache);
    }
    tryConsumeRestockRefresh();
  }

  fetchingPromise = (async (): Promise<RestockItem[]> => {
    const reqConfig = getRestockRequestConfig();
    if (!reqConfig) {
      return safeCacheFallback(cache);
    }

    const gm = resolveGmXhr();
    if (!gm) {
      log('[RestockData] GM_xmlhttpRequest unavailable, returning cache');
      return safeCacheFallback(cache);
    }

    if (!weatherDisabledLogged) {
      log('[RestockData] Weather disabled until unified API is available.');
      weatherDisabledLogged = true;
    }

    // Weather is intentionally disabled for this interim mode.
    const mainText = await gmGet(gm, reqConfig.url, reqConfig.key);

    if (!mainText) {
      log('[RestockData] Main fetch failed');
      return safeCacheFallback(cache);
    }

    let normalized: RestockItem[] = [];
    try {
      const raw: unknown = JSON.parse(mainText);
      const items = extractItemsArray(raw);
      if (!items || items.length === 0) {
        const shape = raw && typeof raw === 'object' ? Object.keys(raw as object).slice(0, 8) : typeof raw;
        log('[RestockData] Unexpected response shape', shape);
        return safeCacheFallback(cache);
      }
      normalized = items
        .map((item) => normalizeRestockItem(item as unknown as Record<string, unknown>))
        .filter((item) => item.shop_type !== 'tool');
    } catch (err) {
      log('[RestockData] JSON parse error (main)', err);
      return safeCacheFallback(cache);
    }

    normalized = sanitizeItems(normalized);

    const entry: CacheEntry = { data: normalized, fetchedAt: Date.now() };
    storage.set(CACHE_KEY, entry);
    emitRestockDataUpdated({ fetchedAt: entry.fetchedAt, count: normalized.length });
    log(`[RestockData] Fetched ${normalized.length} items`);
    return normalized;
  })();

  try {
    return await fetchingPromise;
  } finally {
    fetchingPromise = null;
  }
}

/** Get stale-or-miss cached data synchronously (for dashboard use). */
export function getRestockDataSync(): RestockItem[] | null {
  const data = readCache()?.data;
  return Array.isArray(data) ? sanitizeItems(data) : null;
}

/** Get when data was last fetched (ms timestamp), or null. */
export function getRestockFetchedAt(): number | null {
  return readCache()?.fetchedAt ?? null;
}

/** Clear the restock cache (forces a fresh fetch on next call). */
export function clearRestockCache(): void {
  storage.remove('qpm.restockCache.v2');
  storage.remove(CACHE_KEY);
}
