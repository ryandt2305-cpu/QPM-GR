// src/utils/restockTypes.ts
// Shared type definitions for the restock data service.
// Imported by both restockParser.ts and restockDataService.ts.

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

export interface CacheEntry {
  data: RestockItem[];
  fetchedAt: number;
}

export interface RefreshBudgetEntry {
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

export interface FetchTextResult {
  ok: boolean;
  status: number;
  text: string | null;
  error: string | null;
}

// Fields present on any legitimate RestockItem row (snake_case and camelCase variants).
export const RESTOCK_ITEM_FIELDS = new Set([
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
