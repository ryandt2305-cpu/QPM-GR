// src/utils/restockDataService.ts
// Shared Supabase restock data fetcher + cache for shop window and dashboard.

import { storage } from './storage';
import { log } from './logger';

const RESTOCK_ENDPOINT = 'https://xjuvryjgrjchbhjixwzh.supabase.co/rest/v1/restock_predictions';
export const RESTOCK_ANON_KEY =
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
  'algorithm_version',
  'algorithm_updated_at_ms',
] as const;
const RESTOCK_LEGACY_COLUMNS = RESTOCK_COLUMNS.filter(
  (c) => c !== 'algorithm_version' && c !== 'algorithm_updated_at_ms',
);
const RESTOCK_QUERY = `select=${RESTOCK_COLUMNS.join(',')}`;
const RESTOCK_LEGACY_QUERY = `select=${RESTOCK_LEGACY_COLUMNS.join(',')}`;
const RESTOCK_URL = `${RESTOCK_ENDPOINT}?${RESTOCK_QUERY}`;
const RESTOCK_URL_LEGACY = `${RESTOCK_ENDPOINT}?${RESTOCK_LEGACY_QUERY}`;

// v3 key separates cache from the prior weather-inclusive payload.
const CACHE_KEY = 'qpm.restockCache.v3';
const REFRESH_BUDGET_KEY = 'qpm.restock.refreshBudget.v1';
const ALLOWED_SHOP_TYPES = new Set(['seed', 'egg', 'decor']);

// Known item ID aliases for deduplication (legacy → canonical).
// Scoped to "shop_type:oldId" to avoid cross-shop confusion.
const ITEM_ID_ALIASES: Record<string, string> = {
  'seed:Dawnbinder': 'DawnbinderPod',
  'seed:DawnCelestial': 'DawnbinderPod',
  'seed:Moonbinder': 'MoonbinderPod',
  'seed:MoonCelestial': 'MoonbinderPod',
  'seed:Starweaver': 'StarweaverPod',
};

/** Resolve canonical item_id for known aliases within a shop_type. */
export function canonicalItemId(shopType: string, itemId: string): string {
  return ITEM_ID_ALIASES[`${shopType}:${itemId}`] ?? itemId;
}

/** Get all known item_id variants for a (shopType, itemId) pair. */
export function getItemIdVariants(shopType: string, itemId: string): string[] {
  const canonical = canonicalItemId(shopType, itemId);
  const variants = new Set<string>([itemId, canonical]);
  for (const [key, target] of Object.entries(ITEM_ID_ALIASES)) {
    if (target === canonical) {
      const alias = key.split(':')[1];
      if (alias && key.startsWith(`${shopType}:`)) variants.add(alias);
    }
  }
  return Array.from(variants);
}

function numOrNegInf(value: number | null | undefined): number {
  return value == null || !Number.isFinite(value) ? Number.NEGATIVE_INFINITY : value;
}

function pickPreferredRow(a: RestockItem, b: RestockItem): RestockItem {
  const aLast = numOrNegInf(a.last_seen);
  const bLast = numOrNegInf(b.last_seen);
  if (aLast !== bLast) return bLast > aLast ? b : a;

  const aOcc = numOrNegInf(a.total_occurrences);
  const bOcc = numOrNegInf(b.total_occurrences);
  if (aOcc !== bOcc) return bOcc > aOcc ? b : a;

  return b;
}

function mergeDuplicateItemRows(existing: RestockItem, incoming: RestockItem): RestockItem {
  const preferred = pickPreferredRow(existing, incoming);
  const fallback = preferred === existing ? incoming : existing;
  const mergedLastSeen = Math.max(numOrNegInf(existing.last_seen), numOrNegInf(incoming.last_seen));
  const mergedAlgorithmUpdatedAt = Math.max(
    numOrNegInf(existing.algorithm_updated_at),
    numOrNegInf(incoming.algorithm_updated_at),
  );

  return {
    item_id: preferred.item_id,
    shop_type: preferred.shop_type,
    current_probability: preferred.current_probability ?? fallback.current_probability ?? null,
    appearance_rate: preferred.appearance_rate ?? fallback.appearance_rate ?? null,
    estimated_next_timestamp: preferred.estimated_next_timestamp ?? fallback.estimated_next_timestamp ?? null,
    median_interval_ms: preferred.median_interval_ms ?? fallback.median_interval_ms ?? null,
    last_seen: Number.isFinite(mergedLastSeen) ? mergedLastSeen : null,
    average_quantity: preferred.average_quantity ?? fallback.average_quantity ?? null,
    total_quantity: Math.max(numOrNegInf(existing.total_quantity), numOrNegInf(incoming.total_quantity)),
    total_occurrences: Math.max(numOrNegInf(existing.total_occurrences), numOrNegInf(incoming.total_occurrences)),
    algorithm_version: preferred.algorithm_version ?? fallback.algorithm_version ?? null,
    algorithm_updated_at: Number.isFinite(mergedAlgorithmUpdatedAt) ? mergedAlgorithmUpdatedAt : null,
  };
}

/** Merge duplicate items (same canonical ID + shop_type), preserving freshest last_seen data. */
function deduplicateItems(items: RestockItem[]): RestockItem[] {
  const map = new Map<string, RestockItem>();
  for (const item of items) {
    const canonical = canonicalItemId(item.shop_type, item.item_id);
    const key = `${item.shop_type}:${canonical}`;
    const normalized = canonical !== item.item_id ? { ...item, item_id: canonical } : item;
    const existing = map.get(key);
    map.set(key, existing ? mergeDuplicateItemRows(existing, normalized) : normalized);
  }
  return Array.from(map.values()).map((row) => ({
    ...row,
    total_quantity: Number.isFinite(row.total_quantity ?? NaN) ? row.total_quantity : null,
    total_occurrences: Number.isFinite(row.total_occurrences ?? NaN) ? row.total_occurrences : null,
  }));
}

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
  algorithm_version: string | null;
  algorithm_updated_at: number | null;
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
  items?: RestockItem[];
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

export type GmXhr = (details: {
  method: 'GET' | 'POST';
  url: string;
  data?: string;
  headers?: Record<string, string>;
  onload?: (res: { status: number; responseText: string }) => void;
  onerror?: (err: unknown) => void;
  ontimeout?: () => void;
  timeout?: number;
}) => void;

interface FetchTextResult {
  ok: boolean;
  status: number;
  text: string | null;
  error: string | null;
}

function resolveGmXhr(): GmXhr | null {
  if (typeof GM_xmlhttpRequest === 'function') return GM_xmlhttpRequest as unknown as GmXhr;
  const gm = (globalThis as { GM?: { xmlHttpRequest?: GmXhr } }).GM;
  if (typeof gm?.xmlHttpRequest === 'function') return gm.xmlHttpRequest.bind(gm) as GmXhr;
  return null;
}

function toErrorText(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function bodySnippet(text: string, max = 180): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
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

/** Promisified GM XHR GET with status/error details. */
export function gmGet(
  gm: GmXhr,
  url: string,
  apiKey: string,
  timeoutMs = 15_000,
  extraHeaders?: Record<string, string>,
): Promise<FetchTextResult> {
  return new Promise((resolve) => {
    gm({
      method: 'GET',
      url,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        apikey: apiKey,
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, max-age=0',
        Pragma: 'no-cache',
        ...extraHeaders,
      },
      timeout: timeoutMs,
      onload: (res) => {
        if (res.status >= 200 && res.status < 300) {
          resolve({ ok: true, status: res.status, text: res.responseText, error: null });
          return;
        }
        const snippet = bodySnippet(res.responseText);
        resolve({
          ok: false,
          status: res.status,
          text: null,
          error: snippet ? `HTTP ${res.status}: ${snippet}` : `HTTP ${res.status}`,
        });
      },
      onerror: (err) =>
        resolve({
          ok: false,
          status: 0,
          text: null,
          error: `Network error: ${toErrorText(err)}`,
        }),
      ontimeout: () =>
        resolve({
          ok: false,
          status: 0,
          text: null,
          error: `Timeout after ${timeoutMs}ms`,
        }),
    });
  });
}

async function webGet(
  url: string,
  apiKey: string,
  timeoutMs = 15_000,
  extraHeaders?: Record<string, string>,
): Promise<FetchTextResult> {
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        apikey: apiKey,
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, max-age=0',
        Pragma: 'no-cache',
        ...extraHeaders,
      },
    });
    const text = await response.text();
    if (!response.ok) {
      const snippet = bodySnippet(text);
      return {
        ok: false,
        status: response.status,
        text: null,
        error: snippet ? `HTTP ${response.status}: ${snippet}` : `HTTP ${response.status}`,
      };
    }
    return { ok: true, status: response.status, text, error: null };
  } catch (err) {
    const name = err instanceof Error ? err.name : '';
    const message = toErrorText(err);
    if (name === 'AbortError') {
      return {
        ok: false,
        status: 0,
        text: null,
        error: `Timeout after ${timeoutMs}ms`,
      };
    }
    return {
      ok: false,
      status: 0,
      text: null,
      error: `Fetch error: ${message}`,
    };
  } finally {
    globalThis.clearTimeout(timer);
  }
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
let fetchingIsForce = false;
let weatherDisabledLogged = false;
let invalidConfigLogged = false;

function emitRestockDataUpdated(detail: RestockDataUpdatedDetail): void {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  window.dispatchEvent(new CustomEvent<RestockDataUpdatedDetail>(RESTOCK_DATA_UPDATED_EVENT, { detail }));
}

function sanitizeItems(items: RestockItem[]): RestockItem[] {
  const filtered = items.filter((item) => !!item.item_id && ALLOWED_SHOP_TYPES.has(item.shop_type));
  return deduplicateItems(filtered);
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
  'algorithm_version',
  'algorithmVersion',
  'algorithm_updated_at_ms',
  'algorithmUpdatedAtMs',
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
    algorithm_version: typeof (raw.algorithm_version ?? raw.algorithmVersion) === 'string'
      ? String(raw.algorithm_version ?? raw.algorithmVersion)
      : null,
    algorithm_updated_at: toMs(raw.algorithm_updated_at_ms ?? raw.algorithmUpdatedAtMs),
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

function withCacheBust(url: string, force: boolean): string {
  if (force) {
    // PostgREST treats unknown query params as filters and returns HTTP 400.
    // Keep cache-busting header-only for force refresh.
  }
  return url;
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
  if (fetchingPromise) {
    // If a force refresh is requested while a non-force fetch is in-flight,
    // wait for the first request and then continue with a true force fetch.
    if (force && !fetchingIsForce) {
      try {
        await fetchingPromise;
      } catch {
        // Ignore and continue to force fetch path.
      }
    } else {
      return fetchingPromise;
    }
  }

  if (force) {
    const budget = getRestockRefreshBudget();
    if (budget.blocked) {
      log('[RestockData] Refresh blocked by 2h quota.');
      return safeCacheFallback(cache);
    }
  }

  fetchingIsForce = force;
  fetchingPromise = (async (): Promise<RestockItem[]> => {
    const reqConfig = getRestockRequestConfig();
    if (!reqConfig) {
      return safeCacheFallback(cache);
    }

    const gm = resolveGmXhr();

    if (!weatherDisabledLogged) {
      log('[RestockData] Weather disabled until unified API is available.');
      weatherDisabledLogged = true;
    }

    // Weather is intentionally disabled for this interim mode.
    const forceMarker = force ? String(Date.now()) : '';
    const forceHeaders = force
      ? { 'X-QPM-Force-Refresh': forceMarker, Prefer: 'count=none' }
      : undefined;
    const requestText = async (
      url: string,
    ): Promise<{ text: string | null; errors: string[] }> => {
      const errors: string[] = [];
      if (gm) {
        const gmResult = await gmGet(gm, url, reqConfig.key, 15_000, forceHeaders);
        if (gmResult.ok && gmResult.text !== null) {
          return { text: gmResult.text, errors };
        }
        errors.push(`[gm] ${gmResult.error ?? `HTTP ${gmResult.status}`}`);
      }
      const webResult = await webGet(url, reqConfig.key, 15_000, forceHeaders);
      if (webResult.ok && webResult.text !== null) {
        return { text: webResult.text, errors };
      }
      errors.push(`[web] ${webResult.error ?? `HTTP ${webResult.status}`}`);
      return { text: null, errors };
    };

    const primaryUrl = withCacheBust(reqConfig.url, force);
    const primary = await requestText(primaryUrl);
    let mainText = primary.text;
    const fetchErrors = [...primary.errors];
    if (!mainText) {
      // Compatibility fallback for older DB views that don't yet expose new metadata columns.
      const legacyUrl = withCacheBust(RESTOCK_URL_LEGACY, force);
      const legacy = await requestText(legacyUrl);
      mainText = legacy.text;
      fetchErrors.push(...legacy.errors);
    }

    if (!mainText) {
      const reason = fetchErrors.length ? ` :: ${fetchErrors.join(' | ')}` : '';
      const msg = `[RestockData] Main fetch failed (force=${force}, gm=${gm ? 'yes' : 'no'})${reason}`;
      if (force) throw new Error(msg);
      log(msg);
      return safeCacheFallback(cache);
    }

    let normalized: RestockItem[] = [];
    try {
      const raw: unknown = JSON.parse(mainText);
      const items = extractItemsArray(raw);
      if (!items || items.length === 0) {
        const shape = raw && typeof raw === 'object' ? Object.keys(raw as object).slice(0, 8) : typeof raw;
        if (force) throw new Error(`[RestockData] Unexpected response shape: ${JSON.stringify(shape)}`);
        log('[RestockData] Unexpected response shape', shape);
        return safeCacheFallback(cache);
      }
      normalized = items
        .map((item) => normalizeRestockItem(item as unknown as Record<string, unknown>))
        .filter((item) => item.shop_type !== 'tool');
    } catch (err) {
      if (force) throw err instanceof Error ? err : new Error(String(err));
      log('[RestockData] JSON parse error (main)', err);
      return safeCacheFallback(cache);
    }

    normalized = sanitizeItems(normalized);

    if (force) {
      tryConsumeRestockRefresh();
    }

    const entry: CacheEntry = { data: normalized, fetchedAt: Date.now() };
    storage.set(CACHE_KEY, entry);
    emitRestockDataUpdated({
      fetchedAt: entry.fetchedAt,
      count: normalized.length,
      items: normalized,
    });
    log(`[RestockData] Fetched ${normalized.length} items`);
    return normalized;
  })();

  try {
    return await fetchingPromise;
  } catch (err) {
    console.error('[QPM][RestockData] fetchRestockData failed', err);
    throw err;
  } finally {
    fetchingPromise = null;
    fetchingIsForce = false;
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

/**
 * Patch last_seen for a cached item row (and aliases) when we observe fresher raw events.
 * Keeps QPM display in sync even if a stale row won deduplication previously.
 */
export function patchCachedItemLastSeen(shopType: string, itemId: string, lastSeenMs: number): boolean {
  if (!shopType || !itemId || !Number.isFinite(lastSeenMs) || lastSeenMs <= 0) return false;
  const cached = readCache();
  if (!cached || !Array.isArray(cached.data) || cached.data.length === 0) return false;

  const canonical = canonicalItemId(shopType, itemId);
  let changed = false;
  const nextData = cached.data.map((row) => {
    if (row.shop_type !== shopType) return row;
    if (canonicalItemId(row.shop_type, row.item_id) !== canonical) return row;
    const prev = row.last_seen ?? 0;
    if (lastSeenMs <= prev) return row;
    changed = true;
    return { ...row, last_seen: lastSeenMs };
  });

  if (!changed) return false;
  const merged = sanitizeItems(nextData);
  const entry: CacheEntry = { data: merged, fetchedAt: cached.fetchedAt };
  storage.set(CACHE_KEY, entry);
  emitRestockDataUpdated({
    fetchedAt: entry.fetchedAt,
    count: merged.length,
    items: merged,
  });
  return true;
}
