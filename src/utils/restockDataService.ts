// src/utils/restockDataService.ts
// Shared Supabase restock data fetcher + cache for shop window and dashboard.

import { storage } from './storage';
import { log } from './logger';
import {
  canonicalItemId,
  getItemIdVariants,
  deduplicateItems,
  normalizeRestockItem,
  extractItemsArray,
} from './restockParser';
import type {
  RestockItem,
  RestockRefreshBudgetState,
  RestockDataUpdatedDetail,
  FetchStatus,
  CacheEntry,
  RefreshBudgetEntry,
  GmXhr,
  FetchTextResult,
} from './restockTypes';

// Re-export parser utilities and types so existing callers work unchanged.
export { canonicalItemId, getItemIdVariants } from './restockParser';
export type {
  RestockItem,
  RestockRefreshBudgetState,
  RestockDataUpdatedDetail,
  FetchStatus,
  GmXhr,
} from './restockTypes';

const RESTOCK_ENDPOINT = 'https://xjuvryjgrjchbhjixwzh.supabase.co/rest/v1/restock_predictions';
export const RESTOCK_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhqdXZyeWpncmpjaGJoaml4d3poIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxMDYyODMsImV4cCI6MjA4NTY4MjI4M30.MqQCBG-UMR4HYJU44Tz2orHUj9gMgJTMJtxpb_MHeps';
// Base columns — known to exist in the live restock_predictions view.
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
// Extended columns added by the 20260416000003 migration (prediction logging).
// Requested as a secondary enrichment when the server supports them.
const RESTOCK_EXTENDED_COLUMNS = [
  ...RESTOCK_COLUMNS,
  'recent_intervals_ms',
  'empirical_weight',
  'empirical_probability',
  'fallback_rate',
  'baseline_interval_ms',
  'ema_interval_ms',
  'weather_intervals',
  'is_dormant',
] as const;
const RESTOCK_QUERY = `select=${RESTOCK_COLUMNS.join(',')}`;
const RESTOCK_EXTENDED_QUERY = `select=${RESTOCK_EXTENDED_COLUMNS.join(',')}`;
const RESTOCK_URL = `${RESTOCK_ENDPOINT}?${RESTOCK_QUERY}`;
const RESTOCK_URL_EXTENDED = `${RESTOCK_ENDPOINT}?${RESTOCK_EXTENDED_QUERY}`;
// Track whether the server supports extended columns (auto-detected on first success).
let serverSupportsExtended: boolean | null = null;

// v4 key forces a fresh fetch after the WateringCans/WateringCan DB dedup migration.
const CACHE_KEY = 'qpm.restockCache.v4';
const REFRESH_BUDGET_KEY = 'qpm.restock.refreshBudget.v1';
const ALLOWED_SHOP_TYPES = new Set(['seed', 'egg', 'decor', 'tool']);

export const RESTOCK_REFRESH_WINDOW_MS = 2 * 60 * 60 * 1000;
export const RESTOCK_REFRESH_MAX = 5;
export const RESTOCK_DATA_UPDATED_EVENT = 'qpm:restock-data-updated';

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

export function resolveGmXhr(): GmXhr | null {
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
      return { ok: false, status: 0, text: null, error: `Timeout after ${timeoutMs}ms` };
    }
    return { ok: false, status: 0, text: null, error: `Fetch error: ${message}` };
  } finally {
    globalThis.clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let fetchingPromise: Promise<RestockItem[]> | null = null;
let fetchingIsForce = false;
let weatherDisabledLogged = false;
let invalidConfigLogged = false;

// ---------------------------------------------------------------------------
// Event emission
// ---------------------------------------------------------------------------

function emitRestockDataUpdated(detail: RestockDataUpdatedDetail): void {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  window.dispatchEvent(new CustomEvent<RestockDataUpdatedDetail>(RESTOCK_DATA_UPDATED_EVENT, { detail }));
}

// ---------------------------------------------------------------------------
// Cache management
// ---------------------------------------------------------------------------

function sanitizeItems(items: RestockItem[]): RestockItem[] {
  const filtered = items.filter((item) => !!item.item_id && ALLOWED_SHOP_TYPES.has(item.shop_type));
  return deduplicateItems(filtered);
}

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
    return { entry: { used: 0, windowStartedAt: now }, changed: true };
  }
  const clampedUsed = Math.min(RESTOCK_REFRESH_MAX, Math.max(0, raw.used));
  return {
    entry: { used: clampedUsed, windowStartedAt: raw.windowStartedAt },
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

/** Safe cache fallback — only returns the cached array, never a wrapped object. */
function safeCacheFallback(cache: CacheEntry | null): RestockItem[] {
  return Array.isArray(cache?.data) ? sanitizeItems(cache.data) : [];
}

function withCacheBust(url: string, _force: boolean): string {
  // PostgREST treats unknown query params as filters and returns HTTP 400.
  // Keep cache-busting header-only for force refresh.
  return url;
}

// ---------------------------------------------------------------------------
// Main fetch
// ---------------------------------------------------------------------------

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

    // Try extended columns first if we know the server supports them.
    // Otherwise use the base URL — never probe speculatively (avoids 400s).
    let mainText: string | null = null;
    const fetchErrors: string[] = [];

    if (serverSupportsExtended === true) {
      const extUrl = withCacheBust(RESTOCK_URL_EXTENDED, force);
      const ext = await requestText(extUrl);
      mainText = ext.text;
      if (!mainText) {
        // Server may have reverted — fall back to base and reset flag.
        serverSupportsExtended = null;
        fetchErrors.push(...ext.errors);
      }
    }

    if (!mainText) {
      const baseUrl = withCacheBust(reqConfig.url, force);
      const base = await requestText(baseUrl);
      mainText = base.text;
      fetchErrors.push(...base.errors);
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
        .map((item) => normalizeRestockItem(item as unknown as Record<string, unknown>));
    } catch (err) {
      if (force) throw err instanceof Error ? err : new Error(String(err));
      log('[RestockData] JSON parse error (main)', err);
      return safeCacheFallback(cache);
    }

    normalized = sanitizeItems(normalized);

    // Auto-detect extended column support from response data.
    if (serverSupportsExtended === null) {
      serverSupportsExtended = normalized.some(
        (item) => item.recent_intervals_ms != null || item.empirical_weight != null,
      );
    }

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

// ---------------------------------------------------------------------------
// Sync reads
// ---------------------------------------------------------------------------

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
