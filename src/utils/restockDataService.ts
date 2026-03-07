// src/utils/restockDataService.ts
// Shared Supabase restock data fetcher + cache for shop window and dashboard.

import { storage } from './storage';
import { log } from './logger';

const SUPABASE_URL = 'https://xjuvryjgrjchbhjixwzh.supabase.co/functions/v1/restock-history';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhqdXZyeWpncmpjaGJoaml4d3poIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxMDYyODMsImV4cCI6MjA4NTY4MjI4M30.MqQCBG-UMR4HYJU44Tz2orHUj9gMgJTMJtxpb_MHeps';

const CACHE_KEY = 'qpm.restockCache';
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 min
const MIN_REFETCH_MS = 5 * 60 * 1000; // 5 min

export interface RestockItem {
  item_id: string;
  shop_type: string;
  current_probability: number | null;
  appearance_rate: number | null;
  estimated_next_timestamp: number | null;
  median_interval_ms: number | null;
  last_seen: number | null;
  average_quantity: number | null;
  total_occurrences: number | null;
}

export type FetchStatus = 'idle' | 'fetching' | 'ok' | 'error';

interface CacheEntry {
  data: RestockItem[];
  fetchedAt: number;
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

let fetchingPromise: Promise<RestockItem[]> | null = null;

/** Load cache from storage (may be stale). */
function readCache(): CacheEntry | null {
  return storage.get<CacheEntry | null>(CACHE_KEY, null);
}

/** Return effective probability from either field. */
export function getItemProbability(item: RestockItem): number | null {
  return item.current_probability ?? item.appearance_rate ?? null;
}

/**
 * Fetch restock data from Supabase. Respects 5-min min re-fetch and 30-min TTL.
 * Returns cached data if still fresh. Deduplicates concurrent calls.
 */
export async function fetchRestockData(force = false): Promise<RestockItem[]> {
  const cache = readCache();
  const now = Date.now();

  if (!force && cache) {
    const age = now - cache.fetchedAt;
    if (age < CACHE_TTL_MS) return cache.data;
    // stale but within min-refetch guard
    if (age < MIN_REFETCH_MS) return cache.data;
  }

  // Deduplicate concurrent fetches
  if (fetchingPromise) return fetchingPromise;

  fetchingPromise = (async (): Promise<RestockItem[]> => {
    const gm = resolveGmXhr();
    if (!gm) {
      log('⚠️ [RestockData] GM_xmlhttpRequest unavailable, returning cache');
      return cache?.data ?? [];
    }

    return new Promise<RestockItem[]>((resolve) => {
      gm({
        method: 'GET',
        url: SUPABASE_URL,
        headers: {
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          apikey: SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        timeout: 15_000,
        onload: (res) => {
          if (res.status >= 200 && res.status < 300) {
            try {
              const parsed = JSON.parse(res.responseText) as RestockItem[];
              const entry: CacheEntry = { data: parsed, fetchedAt: Date.now() };
              storage.set(CACHE_KEY, entry);
              log(`✅ [RestockData] Fetched ${parsed.length} items from Supabase`);
              resolve(parsed);
            } catch (err) {
              log('⚠️ [RestockData] JSON parse error', err);
              resolve(cache?.data ?? []);
            }
          } else {
            log(`⚠️ [RestockData] HTTP ${res.status}`);
            resolve(cache?.data ?? []);
          }
        },
        onerror: (err) => {
          log('⚠️ [RestockData] Network error', err);
          resolve(cache?.data ?? []);
        },
        ontimeout: () => {
          log('⚠️ [RestockData] Request timed out');
          resolve(cache?.data ?? []);
        },
      });
    });
  })();

  try {
    const result = await fetchingPromise;
    return result;
  } finally {
    fetchingPromise = null;
  }
}

/** Get stale-or-miss cached data synchronously (for dashboard use). */
export function getRestockDataSync(): RestockItem[] | null {
  return readCache()?.data ?? null;
}

/** Get when data was last fetched (ms timestamp), or null. */
export function getRestockFetchedAt(): number | null {
  return readCache()?.fetchedAt ?? null;
}
