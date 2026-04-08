// src/ui/shopRestockWindow.ts
// Shop Restock Tracker -- pixel-perfect parity with reference viz

import { toggleWindow } from './modalWindow';
import { openItemRestockDetail } from './itemRestockDetailWindow';
import { log } from '../utils/logger';
import {
  fetchRestockData,
  getRestockDataSync,
  getRestockFetchedAt,
  getRestockRefreshBudget,
  getItemIdVariants,
  getItemProbability,
  onRestockDataUpdated,
  type RestockItem,
} from '../utils/restockDataService';
import { visibleInterval } from '../utils/timerManager';
import { getAnySpriteDataUrl, getCropSpriteCanvas, getPetSpriteCanvas, onSpritesReady } from '../sprite-v2/compat';
import { canvasToDataUrl } from '../utils/canvasHelpers';
import { storage } from '../utils/storage';

// ---------------------------------------------------------------------------
// Static data
// ---------------------------------------------------------------------------

// Time-limited seasonal items -- hidden from history after expiry.
// Key: "shopType:itemId"  Value: expiry timestamp (ms UTC)
// Items permanently hidden from the list (stale/bad data entries).
const ITEM_HIDDEN = new Set([
  'seed:StoneBirdbath',
  'seed:StoneGnome',
  'seed:WoodBirdhouse',
  'seed:WoodOwl',
]);

const ITEM_EXPIRY: Record<string, number> = {
  'seed:PineTree':             1768179600000,
  'seed:Poinsettia':           1768179600000,
  'egg:WinterEgg':             1768179600000,
  'decor:Cauldron':            1762477200000,
  'decor:ColoredStringLights': 1768179600000,
  'decor:LargeGravestone':     1762477200000,
  'decor:MarbleCaribou':       1768179600000,
  'decor:MediumGravestone':    1762477200000,
  'decor:SmallGravestone':     1762477200000,
  'decor:StoneCaribou':        1768179600000,
  'decor:WoodCaribou':         1768179600000,
};

const RARITY_COLORS: Record<string, string> = {
  common:    '#E7E7E7',
  uncommon:  '#67BD4D',
  rare:      '#0071C6',
  legendary: '#FFC734',
  mythic:    '#9944A7',
  mythical:  '#9944A7',
  divine:    '#FF7835',
  celestial: '#FF00FF',
};

const RARITY_GLOW: Record<string, string> = {
  legendary: '0 0 8px rgba(255,199,52,0.3)',
  mythic:    '0 0 10px rgba(153,68,167,0.4)',
  mythical:  '0 0 10px rgba(153,68,167,0.4)',
  divine:    '0 0 12px rgba(255,120,53,0.5)',
  celestial: '0 0 12px rgba(255,0,255,0.5)',
};

const SHOP_ORDER: Record<string, number> = { seed: 0, egg: 1, decor: 2 };

const SHOP_CYCLE_INTERVALS: Record<string, number> = {
  seed:  5  * 60 * 1000,
  egg:   15 * 60 * 1000,
  decor: 60 * 60 * 1000,
};

const TRACKED_KEY    = 'qpm.restock.tracked';
const UI_STATE_KEY   = 'qpm.restock.ui.v1';
const ARIEDAM_KEY    = 'qpm.ariedam.gamedata';
const ARIEDAM_TTL_MS = 24 * 60 * 60 * 1000;
const SEARCH_DEBOUNCE_MS = 140;
const UI_STATE_SAVE_DEBOUNCE_MS = 180;
const HISTORY_CHUNK_SIZE = 40;

const CELESTIAL_IDS = new Set([
  'Starweaver', 'StarweaverPod',
  'Moonbinder', 'MoonbinderPod', 'MoonCelestial',
  'Dawnbinder', 'DawnbinderPod', 'DawnCelestial',
  'SunCelestial', 'MythicalEgg',
]);

const SHOP_FILTERS = [
  { label: 'All', value: 'all' },
  { label: 'Celestial', value: 'celestial' },
  { label: 'Seeds', value: 'seed' },
  { label: 'Eggs', value: 'egg' },
  { label: 'Decor', value: 'decor' },
] as const;

const CATEGORY_LABELS: Record<string, string> = {
  seed: 'Seeds',
  egg: 'Eggs',
  decor: 'Decor',
};

// ---------------------------------------------------------------------------
// Item meta cache (populated by Ariedam /data)
// ---------------------------------------------------------------------------

interface ItemMeta { name: string; rarity: string; price: number }
const itemMetaCache = new Map<string, ItemMeta>();
const itemCatalogOrder = new Map<string, number>();
const toolItemIds   = new Set<string>();

type GmXhr = (details: {
  method: 'GET';
  url: string;
  timeout?: number;
  onload?: (res: { status: number; responseText: string }) => void;
  onerror?: (err: unknown) => void;
  ontimeout?: () => void;
}) => void;

function resolveGmXhr(): GmXhr | null {
  if (typeof GM_xmlhttpRequest === 'function') return GM_xmlhttpRequest as unknown as GmXhr;
  const gm = (globalThis as any).GM;
  if (typeof gm?.xmlHttpRequest === 'function') return gm.xmlHttpRequest as GmXhr;
  return null;
}

function gmFetch(url: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const xhr = resolveGmXhr();
    if (!xhr) return reject(new Error('GM_xmlhttpRequest unavailable'));
    xhr({
      method: 'GET',
      url,
      timeout: 10_000,
      onload: (res) => {
        if (res.status >= 200 && res.status < 300) {
          try { resolve(JSON.parse(res.responseText)); }
          catch { reject(new Error('JSON parse failed')); }
        } else {
          reject(new Error(`HTTP ${res.status}`));
        }
      },
      onerror:   () => reject(new Error('Network error')),
      ontimeout: () => reject(new Error('Timeout')),
    });
  });
}

function buildItemMetaCache(gameData: any): void {
  itemMetaCache.clear();
  itemCatalogOrder.clear();
  toolItemIds.clear();

  let seedOrder = 0;
  for (const [plantId, plantData] of Object.entries<any>(gameData.plants ?? {})) {
    const seed = plantData.seed;
    if (!seed) continue;
    const key = `seed:${plantId}`;
    itemMetaCache.set(key, {
      name:   seed.name  || `${plantId} Seed`,
      rarity: (seed.rarity ?? 'common').toLowerCase(),
      price:  seed.coinPrice ?? 0,
    });
    itemCatalogOrder.set(key, seedOrder++);
  }

  let eggOrder = 0;
  for (const [eggId, eggData] of Object.entries<any>(gameData.eggs ?? {})) {
    const key = `egg:${eggId}`;
    itemMetaCache.set(key, {
      name:   eggData.name || eggId,
      rarity: (eggData.rarity ?? 'common').toLowerCase(),
      price:  eggData.coinPrice ?? 0,
    });
    itemCatalogOrder.set(key, eggOrder++);
  }

  let decorOrder = 0;
  for (const [decorId, decorData] of Object.entries<any>(gameData.decor ?? {})) {
    const key = `decor:${decorId}`;
    itemMetaCache.set(key, {
      name:   decorData.name || decorId,
      rarity: (decorData.rarity ?? 'common').toLowerCase(),
      price:  decorData.coinPrice ?? 0,
    });
    itemCatalogOrder.set(key, decorOrder++);
  }
  for (const [itemId] of Object.entries<any>(gameData.items ?? {})) {
    toolItemIds.add(itemId);
    toolItemIds.add(itemId + 's');
  }
}

async function initGameData(): Promise<void> {
  const cached = storage.get<{ data: unknown; timestamp: number } | null>(ARIEDAM_KEY, null);
  if (cached && typeof cached.timestamp === 'number' && Date.now() - cached.timestamp < ARIEDAM_TTL_MS) {
    buildItemMetaCache(cached.data);
    return;
  }

  try {
    const gameData = await gmFetch('https://mg-api.ariedam.fr/data');
    storage.set(ARIEDAM_KEY, { data: gameData, timestamp: Date.now() });
    buildItemMetaCache(gameData);
  } catch (err) {
    log('[ShopRestock] Ariedam /data fetch failed', err);
    // If we have stale cache, use it rather than nothing
    const stale = storage.get<{ data: unknown; timestamp: number } | null>(ARIEDAM_KEY, null);
    if (stale?.data) buildItemMetaCache(stale.data);
  }
}

function getItemMeta(itemId: string, shopType: string): ItemMeta | null {
  return itemMetaCache.get(`${shopType}:${itemId}`) ?? null;
}

function getItemName(itemId: string, shopType: string): string {
  const meta = getItemMeta(itemId, shopType);
  if (meta?.name) return meta.name;
  // Fallback: convert camelCase ID to title case
  return (itemId ?? '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function getItemRarity(itemId: string, shopType: string): string {
  return getItemMeta(itemId, shopType)?.rarity ?? 'common';
}

function getItemPrice(itemId: string, shopType: string): number {
  return getItemMeta(itemId, shopType)?.price ?? 0;
}

function getCatalogOrder(itemId: string, shopType: string): number | null {
  const order = itemCatalogOrder.get(`${shopType}:${itemId}`);
  return Number.isFinite(order) ? (order as number) : null;
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatETA(ts: number | null | undefined): string {
  if (!ts) return '--';
  const diff = ts - Date.now();
  if (diff <= 0) return 'Overdue';
  const min = Math.ceil(diff / 60_000);
  if (min < 60) return `~${min}m`;
  const hr = Math.ceil(min / 60);
  if (hr < 24) return `~${hr}h`;
  return `~${Math.ceil(hr / 24)}d`;
}

function etaColor(ts: number | null | undefined): string {
  if (!ts) return 'rgba(224,224,224,0.4)';
  const diff = ts - Date.now();
  if (diff <= 0)  return '#10b981';  // overdue
  const h = diff / 3_600_000;
  if (h < 1)  return '#22c55e';
  if (h < 6)  return '#84cc16';
  if (h < 24) return '#eab308';
  const d = diff / 86_400_000;
  if (d < 7)  return '#f97316';
  if (d < 14) return '#f87171';
  return '#ef4444';
}

function ratePercent(rate: number | null): string {
  if (rate === null || rate === undefined) return '--';
  if (rate >= 1) return '100%';
  if (rate <= 0) return '0%';
  const pct = rate * 100;
  let formatted: string;
  if (pct > 99) {
    formatted = pct.toString().slice(0, 5);
    if (parseFloat(formatted) >= 100) formatted = '99.99';
  } else if (pct < 0.01) {
    formatted = '< 0.01';
  } else {
    const decimals = pct >= 10 ? 1 : 2;
    formatted = pct.toFixed(decimals);
  }
  if (parseFloat(formatted) >= 100) formatted = '99.9';
  if (parseFloat(formatted) === 0)  formatted = '0.01';
  return `${formatted}%`;
}

function rateColor(rate: number | null): string {
  if (rate === null || rate === undefined) return '#f87171';
  const pct = rate * 100;
  if (pct >= 80) return '#4ade80';
  if (pct >= 40) return '#fbbf24';
  return '#f87171';
}

function formatFrequency(rate: number | null, shopType: string): string {
  if (rate === null || rate === undefined || rate <= 0) return '';
  const interval = SHOP_CYCLE_INTERVALS[shopType];
  if (!interval) return '';
  if (rate >= 0.95) return 'Every restock';
  const expectedMs = interval / rate;
  const min = Math.round(expectedMs / 60_000);
  if (min < 60) return `Every ~${min}m`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `Every ~${hr}h`;
  return `Every ~${Math.round(hr / 24)}d`;
}

function formatAvgQty(qty: number | null): string {
  if (!qty || qty <= 0) return '';
  if (qty >= 10) return `~${Math.round(qty)} avg`;
  if (Number.isInteger(qty)) return `~${qty} avg`;
  return `~${qty.toFixed(1)} avg`;
}

function formatPrice(value: number): string {
  if (!value || value < 1000) return `${value}`;
  const units = ['K', 'M', 'B', 'T', 'Q'];
  let v = value;
  let idx = -1;
  while (v >= 1000 && idx < units.length - 1) { v /= 1000; idx++; }
  const rounded = v >= 10 ? Math.round(v) : Math.round(v * 10) / 10;
  return `${rounded}${units[idx]}`;
}

function formatRelative(ms: number | null): string {
  if (!ms) return '--';
  const diff = Date.now() - ms;
  if (diff < 0) return 'just now';
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

function formatClock(ms: number | null): string {
  if (!ms) return '--';
  return new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });
}

function formatWindowCountdown(ms: number): string {
  const safeMs = Math.max(0, ms);
  const totalMinutes = Math.floor(safeMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}hr ${minutes}min`;
}

function formatRelativeDay(ms: number | null): string | null {
  if (!ms) return null;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const dayMs = 86_400_000;
  const target = new Date(ms);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((startOfToday.getTime() - target.getTime()) / dayMs);
  if (!Number.isFinite(diffDays) || diffDays <= 0) return null;
  return new Intl.RelativeTimeFormat(undefined, { numeric: 'always' }).format(-diffDays, 'day');
}

function rarityColor(rarity: string): string {
  return RARITY_COLORS[rarity] ?? RARITY_COLORS['common']!;
}

function rarityBorderStyle(rarity: string): string {
  const color = rarityColor(rarity);
  const glow  = RARITY_GLOW[rarity] ?? '';
  return `border:2px solid ${color};${glow ? `box-shadow:${glow};` : ''}`;
}

// ---------------------------------------------------------------------------
// Sprite helper
// ---------------------------------------------------------------------------

const spriteUrlCache = new Map<string, string | null>();
let coinSpriteUrlCache: string | null = null;

function getCoinSpriteUrl(): string | null {
  if (coinSpriteUrlCache) return coinSpriteUrlCache;
  const url = getAnySpriteDataUrl('sprite/ui/Coin');
  if (url) coinSpriteUrlCache = url;
  return coinSpriteUrlCache;
}

function getSpriteUrl(item: RestockItem): string | null {
  const id = item.item_id;
  if (!id) return null;
  const cacheKey = `${item.shop_type}:${id}`;
  if (spriteUrlCache.has(cacheKey)) return spriteUrlCache.get(cacheKey)!;

  const tryResolve = (candidateId: string): string | null => {
    let resolved: string | null = null;
    try { resolved = canvasToDataUrl(getPetSpriteCanvas(candidateId)) || null; } catch { /* */ }
    if (!resolved) {
      try { resolved = canvasToDataUrl(getCropSpriteCanvas(candidateId)) || null; } catch { /* */ }
    }
    return resolved;
  };

  const directUrl = tryResolve(id);
  if (directUrl) {
    spriteUrlCache.set(cacheKey, directUrl);
    return directUrl;
  }

  for (const variantId of getItemIdVariants(item.shop_type, id)) {
    if (!variantId || variantId === id) continue;
    const variantUrl = tryResolve(variantId);
    if (variantUrl) {
      spriteUrlCache.set(cacheKey, variantUrl);
      return variantUrl;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

function loadTracked(): Set<string> {
  const saved = storage.get<string[] | null>(TRACKED_KEY, null);
  return new Set(Array.isArray(saved) ? saved : []);
}

function saveTracked(set: Set<string>): void {
  storage.set(TRACKED_KEY, Array.from(set));
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent('qpm:restock-tracked-updated', {
      detail: { count: set.size },
    }));
  }
}

type SortColumn = 'item' | 'qty' | 'last' | null;
type SortDirection = 'asc' | 'desc';

interface ShopRestockUiState {
  filter: string;
  search: string;
  predCollapsed: boolean;
  sortColumn: SortColumn;
  sortDirection: SortDirection;
  historyScrollTop: number;
}

function loadUiState(): ShopRestockUiState {
  const saved = storage.get<Partial<ShopRestockUiState> | null>(UI_STATE_KEY, null);
  const sortColumn = saved?.sortColumn === 'item' || saved?.sortColumn === 'qty' || saved?.sortColumn === 'last'
    ? saved.sortColumn
    : null;
  const sortDirection: SortDirection = saved?.sortDirection === 'desc' ? 'desc' : 'asc';
  const historyScrollTop = Number.isFinite(saved?.historyScrollTop)
    ? Math.max(0, Math.floor(saved!.historyScrollTop!))
    : 0;
  return {
    filter: typeof saved?.filter === 'string' ? saved.filter : 'all',
    search: typeof saved?.search === 'string' ? saved.search : '',
    predCollapsed: !!saved?.predCollapsed,
    sortColumn,
    sortDirection,
    historyScrollTop,
  };
}

function isCelestial(itemId: string | null | undefined): boolean {
  return !!itemId && CELESTIAL_IDS.has(itemId);
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function renderShopRestockWindow(root: HTMLElement): void {
  root.innerHTML = '';
  root.style.cssText = 'display:flex;flex-direction:column;flex:1;min-height:0;';

  // Inject scoped styles for tooltip hover and rarity text
  const styleEl = document.createElement('style');
  styleEl.textContent = `
    .qpm-sr-metric[data-tooltip]:hover::after {
      content: attr(data-tooltip);
      position: absolute;
      bottom: 100%;
      right: 0;
      margin-bottom: 10px;
      padding: 10px 14px;
      background: rgba(14,16,24,0.97);
      border: 1px solid rgba(148,163,184,0.25);
      border-radius: 8px;
      color: #e5e7eb;
      font-size: 13px;
      font-weight: 500;
      line-height: 1.5;
      white-space: pre-line;
      z-index: 100;
      box-shadow: 0 4px 16px rgba(0,0,0,0.4);
      pointer-events: none;
    }
    .qpm-sr-th { cursor:pointer; user-select:none; }
    .qpm-sr-th:hover { opacity:1 !important; }
    .qpm-sr-tr { cursor:pointer; transition:background 0.12s; }
    .qpm-sr-tr:hover { background:rgba(143,130,255,0.06); }
  `;
  root.appendChild(styleEl);
  const persistedUi = loadUiState();


  // -- Toolbar --
  const toolbar = document.createElement('div');
  toolbar.style.cssText = [
    'display:flex', 'align-items:center', 'gap:6px',
    'padding:10px 14px 8px',
    'border-bottom:1px solid rgba(143,130,255,0.2)',
    'flex-shrink:0', 'flex-wrap:wrap',
  ].join(';');

  const filterGroup = document.createElement('div');
  filterGroup.style.cssText = 'display:flex;gap:4px;flex-shrink:0;flex-wrap:wrap;';

  let currentFilter = persistedUi.filter;
  const filterBtns: HTMLButtonElement[] = [];

  const styleFilter = (btn: HTMLButtonElement, active: boolean): void => {
    btn.style.background    = active ? 'rgba(143,130,255,0.22)' : 'rgba(255,255,255,0.05)';
    btn.style.color         = active ? '#c8c0ff' : 'rgba(224,224,224,0.65)';
    btn.style.borderColor   = active ? 'rgba(143,130,255,0.55)' : 'rgba(143,130,255,0.25)';
  };

  for (const f of SHOP_FILTERS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = f.label;
    btn.dataset.filter = f.value;
    btn.style.cssText = [
      'padding:3px 8px', 'font-size:11px', 'border-radius:5px', 'cursor:pointer',
      'border:1px solid rgba(143,130,255,0.25)',
      'background:rgba(255,255,255,0.05)', 'color:rgba(224,224,224,0.65)', 'transition:all 0.12s',
    ].join(';');
    filterBtns.push(btn);
    filterGroup.appendChild(btn);
  }
  const saveUiState = (): void => {
    storage.set(UI_STATE_KEY, {
      filter: currentFilter,
      search: searchInput.value.trim(),
      predCollapsed,
      sortColumn,
      sortDirection,
      historyScrollTop,
    });
  };
  let saveUiTimer: number | null = null;
  const scheduleSaveUiState = (): void => {
    if (saveUiTimer !== null) window.clearTimeout(saveUiTimer);
    saveUiTimer = window.setTimeout(() => {
      saveUiTimer = null;
      saveUiState();
    }, UI_STATE_SAVE_DEBOUNCE_MS);
  };

  const setFilter = (value: string): void => {
    if (currentFilter === value) return;
    currentFilter = value;
    filterBtns.forEach(b => styleFilter(b, b.dataset.filter === value));
    scheduleSaveUiState();
    scheduleRender(false, true);
  };
  filterBtns.forEach(btn => btn.addEventListener('click', () => setFilter(btn.dataset.filter!)));
  const activeFilterBtn = filterBtns.find(b => b.dataset.filter === currentFilter) ?? filterBtns[0]!;
  if (activeFilterBtn.dataset.filter !== currentFilter) currentFilter = activeFilterBtn.dataset.filter!;
  filterBtns.forEach(btn => styleFilter(btn, btn === activeFilterBtn));

  // Search
  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.placeholder = 'Search items...';
  searchInput.style.cssText = [
    'padding:4px 10px', 'font-size:12px', 'border-radius:5px', 'flex:1', 'min-width:100px',
    'background:rgba(255,255,255,0.06)', 'border:1px solid rgba(143,130,255,0.25)',
    'color:#e0e0e0', 'outline:none',
  ].join(';');
  searchInput.value = persistedUi.search;
  let searchDebounceTimer: number | null = null;
  searchInput.addEventListener('input', () => {
    if (searchDebounceTimer !== null) window.clearTimeout(searchDebounceTimer);
    searchDebounceTimer = window.setTimeout(() => {
      searchDebounceTimer = null;
      scheduleSaveUiState();
      scheduleRender(false, true);
    }, SEARCH_DEBOUNCE_MS);
  });


  // Refresh + quota + last updated
  const refreshBtn = document.createElement('button');
  refreshBtn.type = 'button';
  refreshBtn.textContent = 'Refresh';
  refreshBtn.title = 'Refresh data';
  refreshBtn.style.cssText = [
    'padding:4px 10px', 'font-size:13px',
    'background:rgba(143,130,255,0.15)', 'border:1px solid rgba(143,130,255,0.35)',
    'border-radius:5px', 'color:#c8c0ff', 'cursor:pointer', 'flex-shrink:0',
  ].join(';');

  const refreshBudgetEl = document.createElement('span');
  refreshBudgetEl.style.cssText = 'font-size:11px;color:rgba(200,192,255,0.72);white-space:nowrap;flex-shrink:0;';

  const lastUpdatedEl = document.createElement('span');
  lastUpdatedEl.style.cssText = 'font-size:11px;color:rgba(224,224,224,0.35);white-space:nowrap;flex-shrink:0;';

  toolbar.append(filterGroup, searchInput, refreshBtn, refreshBudgetEl, lastUpdatedEl);
  root.appendChild(toolbar);

  const updateLastUpdated = (): void => {
    const t = getRestockFetchedAt();
    if (!t) { lastUpdatedEl.textContent = ''; return; }
    const m = Math.round((Date.now() - t) / 60_000);
    lastUpdatedEl.textContent = m < 1 ? 'Updated now' : `Updated ${m}m ago`;
  };

  const updateRefreshBudgetUi = (): void => {
    const budget = getRestockRefreshBudget();
    const noun = budget.remaining === 1 ? 'refresh' : 'refreshes';
    const resetInMs = Math.max(0, budget.resetAt - Date.now());
    refreshBudgetEl.textContent = `${budget.remaining} ${noun} left - ${formatWindowCountdown(resetInMs)}`;
    refreshBtn.disabled = isLoading || budget.blocked;
    refreshBtn.style.opacity = refreshBtn.disabled ? '0.55' : '1';
    refreshBtn.style.cursor = refreshBtn.disabled ? 'not-allowed' : 'pointer';
  };


  // -- Scrollable body --
  const body = document.createElement('div');
  body.style.cssText = 'flex:1;overflow-y:auto;min-height:0;display:flex;flex-direction:column;';
  root.appendChild(body);

  // -- Predictions section --
  const predSection = document.createElement('div');
  predSection.style.cssText = 'flex-shrink:0;border-bottom:1px solid rgba(143,130,255,0.15);';

  const predHeaderRow = document.createElement('div');
  predHeaderRow.style.cssText = [
    'display:flex', 'align-items:center', 'justify-content:space-between',
    'padding:7px 14px', 'cursor:pointer', 'user-select:none',
    'background:rgba(143,130,255,0.04)',
  ].join(';');
  const predTitle = document.createElement('span');
  predTitle.style.cssText = 'font-size:12px;font-weight:700;color:rgba(224,224,224,0.75);';
  predTitle.textContent = 'Pinned';
  const predChevron = document.createElement('span');
  predChevron.style.cssText = 'font-size:9px;color:rgba(200,192,255,0.4);';
  predChevron.textContent = 'v';
  predHeaderRow.append(predTitle, predChevron);

  const predBody = document.createElement('div');
  predBody.style.cssText = 'padding:6px 10px 8px;display:flex;flex-direction:column;gap:2px;';

  let predCollapsed = persistedUi.predCollapsed;
  predBody.style.display = predCollapsed ? 'none' : '';
  predChevron.textContent = predCollapsed ? '>' : 'v';
  predHeaderRow.addEventListener('click', () => {
    predCollapsed = !predCollapsed;
    predBody.style.display = predCollapsed ? 'none' : '';
    predChevron.textContent = predCollapsed ? '>' : 'v';
    scheduleSaveUiState();
  });
  predSection.append(predHeaderRow, predBody);
  body.appendChild(predSection);

  // -- History section --
  const histSection = document.createElement('div');
  histSection.style.cssText = 'flex:1;display:flex;flex-direction:column;min-height:0;overflow:hidden;';

  const histHeader = document.createElement('div');
  histHeader.style.cssText = [
    'display:flex', 'align-items:center', 'padding:7px 14px',
    'border-bottom:1px solid rgba(255,255,255,0.06)',
    'background:rgba(0,0,0,0.15)', 'flex-shrink:0',
  ].join(';');
  const histTitle = document.createElement('span');
  histTitle.style.cssText = 'font-size:11px;font-weight:700;color:rgba(224,224,224,0.5);text-transform:uppercase;letter-spacing:0.5px;flex:1;';
  histTitle.textContent = 'Items - click to pin';
  const resetSortBtn = document.createElement('button');
  resetSortBtn.type = 'button';
  resetSortBtn.textContent = 'Default order';
  resetSortBtn.style.cssText = [
    'padding:2px 8px',
    'margin-right:8px',
    'font-size:10px',
    'font-weight:600',
    'border-radius:999px',
    'cursor:pointer',
    'border:1px solid rgba(143,130,255,0.35)',
    'background:rgba(143,130,255,0.12)',
    'color:rgba(200,192,255,0.85)',
    'display:none',
  ].join(';');
  const itemCountEl = document.createElement('span');
  itemCountEl.style.cssText = 'font-size:11px;color:rgba(224,224,224,0.3);';
  histHeader.append(histTitle, resetSortBtn, itemCountEl);

  const tableWrap = document.createElement('div');
  tableWrap.style.cssText = 'flex:1;overflow-y:auto;min-height:0;';
  histSection.append(histHeader, tableWrap);
  body.appendChild(histSection);

  // -- Shared state --
  let allData: RestockItem[] = [];
  let trackedItems = loadTracked();
  let isLoading = false;
  updateRefreshBudgetUi();
  let sortColumn: SortColumn = persistedUi.sortColumn;
  let sortDirection: SortDirection = persistedUi.sortDirection;
  let historyScrollTop = persistedUi.historyScrollTop;
  let historyChunkRaf: number | null = null;
  let historyRenderToken = 0;

  const updateResetSortButton = (): void => {
    resetSortBtn.style.display = sortColumn ? '' : 'none';
    resetSortBtn.title = sortColumn ? 'Back to default shop/catalog order' : '';
  };

  let renderQueued = false;
  let wantsPredictionsRender = false;
  let wantsHistoryRender = false;
  const scheduleRender = (predictions: boolean, history: boolean): void => {
    wantsPredictionsRender ||= predictions;
    wantsHistoryRender ||= history;
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      if (wantsPredictionsRender) {
        wantsPredictionsRender = false;
        renderPredictions();
      }
      if (wantsHistoryRender) {
        wantsHistoryRender = false;
        renderHistory();
      }
    });
  };

  const persistTrackedAndRender = (preserveHistoryScroll = true): void => {
    if (preserveHistoryScroll) {
      historyScrollTop = tableWrap.scrollTop;
    }
    saveTracked(trackedItems);
    scheduleRender(true, true);
  };

  resetSortBtn.addEventListener('click', () => {
    if (!sortColumn) return;
    sortColumn = null;
    sortDirection = 'asc';
    updateResetSortButton();
    scheduleSaveUiState();
    scheduleRender(false, true);
  });

  tableWrap.addEventListener('scroll', () => {
    historyScrollTop = tableWrap.scrollTop;
    scheduleSaveUiState();
  }, { passive: true });

  const stopRestockDataUpdates = onRestockDataUpdated((detail) => {
    const updated = Array.isArray(detail.items) && detail.items.length > 0
      ? detail.items
      : getRestockDataSync();
    if (!updated || updated.length === 0) return;
    allData = updated;
    scheduleRender(true, true);
    updateLastUpdated();
  });

  // ETA DOM refs for live countdown
  type EtaRef = { el: HTMLElement; ts: number };
  let histEtaRefs: EtaRef[] = [];
  let predEtaRefs: EtaRef[] = [];

  // -- Icon wrap element (42x42, rarity border) --
  function makeIconWrap(item: RestockItem, size = 42): HTMLElement {
    const rarity  = getItemRarity(item.item_id, item.shop_type);
    const wrap    = document.createElement('div');
    const spriteSize = Math.round(size * 0.76);
    wrap.style.cssText = [
      `width:${size}px`, `height:${size}px`, 'border-radius:10px',
      'background:rgba(229,231,235,0.05)',
      rarityBorderStyle(rarity),
      'display:flex', 'align-items:center', 'justify-content:center',
      'flex-shrink:0', 'transition:border-color 0.2s',
    ].join(';');

    const url = getSpriteUrl(item);
    if (url) {
      const img = document.createElement('img');
      img.src = url;
      img.style.cssText = `width:${spriteSize}px;height:${spriteSize}px;image-rendering:pixelated;object-fit:contain;`;
      wrap.appendChild(img);
    }
    return wrap;
  }

  // -- Predictions row --
  function buildPredRow(item: RestockItem, key: string): { row: HTMLElement; etaRef: EtaRef } {
    const ts       = item.estimated_next_timestamp ?? 0;
    const hasData  = (item.total_occurrences ?? 0) >= 2 && ts > 0;
    const rate     = getItemProbability(item);
    const rarity   = getItemRarity(item.item_id, item.shop_type);
    const cel      = isCelestial(item.item_id);

    const row = document.createElement('div');
    row.style.cssText = [
      'display:flex', 'align-items:center', 'justify-content:space-between', 'gap:12px',
      'padding:10px 12px', 'min-height:52px',
      `border:1px solid ${cel ? 'rgba(255,215,0,0.22)' : 'transparent'}`,
      `background:${cel ? 'rgba(255,215,0,0.04)' : 'color-mix(in srgb, rgba(30,30,40,0.5) 50%, transparent)'}`,
      'border-radius:10px', 'cursor:pointer',
      'transition:transform 0.15s, background 0.15s',
    ].join(';');
    row.title = 'Click to unpin';
    row.addEventListener('mouseenter', () => {
      row.style.transform  = 'scale(1.01)';
      row.style.background = cel ? 'rgba(255,215,0,0.09)' : 'rgba(255,255,255,0.06)';
    });
    row.addEventListener('mouseleave', () => {
      row.style.transform  = '';
      row.style.background = cel ? 'rgba(255,215,0,0.04)' : '';
    });

    // Left: icon-wrap + text
    const left = document.createElement('div');
    left.style.cssText = 'display:flex;align-items:center;gap:12px;min-width:0;flex:1;max-width:calc(100% - 220px);';
    left.appendChild(makeIconWrap(item, 42));

    const textBlock = document.createElement('div');
    textBlock.style.cssText = 'display:flex;flex-direction:column;gap:3px;min-width:0;';

    const nameEl = document.createElement('div');
    nameEl.style.cssText = `font-size:14px;font-weight:700;color:${rarityColor(rarity)};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;`;
    nameEl.textContent = getItemName(item.item_id, item.shop_type);
    textBlock.appendChild(nameEl);

    const subEl = document.createElement('div');
    subEl.style.cssText = 'font-size:12px;opacity:0.7;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
    if (!hasData) {
      const seen = item.total_occurrences ?? 0;
      subEl.textContent = seen > 0
        ? `${seen} sighting${seen !== 1 ? 's' : ''} recorded`
        : 'Not enough data';
    } else {
      subEl.textContent = item.last_seen ? `Seen ${formatRelative(item.last_seen)}` : 'Tracked';
    }
    textBlock.appendChild(subEl);
    left.appendChild(textBlock);
    row.appendChild(left);

    // Right: metrics
    const metrics = document.createElement('div');
    metrics.style.cssText = 'display:flex;gap:18px;align-items:center;flex-shrink:0;';

    const detailBtn = document.createElement('button');
    detailBtn.type = 'button';
    detailBtn.textContent = '\uD83D\uDCCA';
    detailBtn.title = 'View restock history';
    detailBtn.style.cssText = [
      'background:none',
      'border:none',
      'cursor:pointer',
      'font-size:14px',
      'padding:2px 4px',
      'opacity:0.72',
      'border-radius:4px',
      'line-height:1',
      'flex-shrink:0',
    ].join(';');
    detailBtn.addEventListener('mouseenter', () => { detailBtn.style.opacity = '1'; });
    detailBtn.addEventListener('mouseleave', () => { detailBtn.style.opacity = '0.72'; });
    detailBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openItemRestockDetail(item, getItemName(item.item_id, item.shop_type));
    });
    metrics.appendChild(detailBtn);

    if (!hasData) {
      const dash = document.createElement('div');
      dash.style.cssText = 'font-size:20px;color:#f87171;';
      dash.textContent = '--';
      metrics.appendChild(dash);
    } else {
      const etaLabel = formatETA(ts);
      const etaCol   = etaColor(ts);

      // ETA metric
      const etaWrap = document.createElement('div');
      etaWrap.style.cssText = 'display:flex;flex-direction:column;align-items:flex-end;min-width:68px;width:68px;position:relative;';
      const etaEl = document.createElement('div');
      etaEl.style.cssText = `font-size:19px;font-weight:700;color:${etaCol};font-variant-numeric:tabular-nums;letter-spacing:-0.3px;line-height:1.15;white-space:nowrap;`;
      etaEl.textContent = etaLabel;
      const etaLbl = document.createElement('div');
      etaLbl.style.cssText = 'font-size:10px;opacity:0.5;text-transform:uppercase;letter-spacing:0.5px;';
      etaLbl.textContent = 'next';
      etaWrap.append(etaEl, etaLbl);
      metrics.appendChild(etaWrap);

      // Rate metric with tooltip
      const freqLine  = formatFrequency(rate, item.shop_type);
      const avgLine   = formatAvgQty(item.average_quantity);
      const tooltipTx = [avgLine, freqLine].filter(Boolean).join('\n');

      const rateWrap = document.createElement('div');
      rateWrap.className = 'qpm-sr-metric';
      rateWrap.style.cssText = 'display:flex;flex-direction:column;align-items:flex-end;min-width:70px;width:70px;position:relative;cursor:help;';
      if (tooltipTx) rateWrap.dataset.tooltip = tooltipTx;
      const rateEl = document.createElement('div');
      rateEl.style.cssText = `font-size:19px;font-weight:700;color:${rateColor(rate)};font-variant-numeric:tabular-nums;letter-spacing:-0.3px;line-height:1.15;white-space:nowrap;`;
      rateEl.textContent = ratePercent(rate);
      const rateLbl = document.createElement('div');
      rateLbl.style.cssText = 'font-size:10px;opacity:0.5;text-transform:uppercase;letter-spacing:0.5px;';
      rateLbl.textContent = 'rate';
      rateWrap.append(rateEl, rateLbl);
      metrics.appendChild(rateWrap);

      row.appendChild(metrics);
      row.addEventListener('click', () => {
        trackedItems.delete(key);
        persistTrackedAndRender(false);
      });
      return { row, etaRef: { el: etaEl, ts } };
    }

    row.addEventListener('click', () => {
      trackedItems.delete(key);
      persistTrackedAndRender(false);
    });
    row.appendChild(metrics);
    return { row, etaRef: { el: document.createElement('span'), ts: 0 } };
  }

  // -- History table row --
  function buildHistRow(item: RestockItem, key: string): { row: HTMLElement } {
    const rarity = getItemRarity(item.item_id, item.shop_type);
    const price  = getItemPrice(item.item_id, item.shop_type);
    const cel    = isCelestial(item.item_id);

    const tr = document.createElement('tr');
    tr.className = 'qpm-sr-tr';
    tr.title = 'Click to pin to predictions';
    if (cel) tr.style.background = 'rgba(255,215,0,0.025)';

    // Item cell: icon-wrap (42px) + name (rarity color) + price
    const itemTd = document.createElement('td');
    itemTd.style.cssText = 'padding:8px 12px;';
    const itemCell = document.createElement('div');
    itemCell.style.cssText = 'display:flex;align-items:center;gap:12px;padding:4px 0;';
    itemCell.appendChild(makeIconWrap(item, 42));

    const itemInfo = document.createElement('div');
    itemInfo.style.cssText = 'display:flex;flex-direction:column;justify-content:center;gap:3px;min-width:0;';
    const nameEl = document.createElement('div');
    nameEl.style.cssText = `font-weight:700;font-size:14px;color:${rarityColor(rarity)};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.2;`;
    nameEl.textContent = getItemName(item.item_id, item.shop_type);
    itemInfo.appendChild(nameEl);

    if (price > 0) {
      const priceRow = document.createElement('div');
      priceRow.style.cssText = 'font-size:12px;opacity:0.9;display:flex;align-items:center;gap:3px;line-height:1;';
      const coinSrc = getCoinSpriteUrl();
      const coinSpan = coinSrc ? document.createElement('img') : document.createElement('span');
      if (coinSrc && coinSpan instanceof HTMLImageElement) {
        coinSpan.src = coinSrc;
        coinSpan.alt = 'Coin';
        coinSpan.style.cssText = 'width:11px;height:11px;object-fit:contain;image-rendering:auto;opacity:0.95;';
      } else {
        coinSpan.style.cssText = `color:${RARITY_COLORS['legendary']};font-weight:700;font-size:11px;`;
        coinSpan.textContent = 'C';
      }
      const priceSpan = document.createElement('span');
      priceSpan.style.cssText = `color:${RARITY_COLORS['legendary']};font-weight:700;`;
      priceSpan.textContent = formatPrice(price);
      priceRow.append(coinSpan, priceSpan);
      itemInfo.appendChild(priceRow);
    }
    itemCell.appendChild(itemInfo);
    itemTd.appendChild(itemCell);

    // Qty cell
    const qtyTd = document.createElement('td');
    qtyTd.style.cssText = 'padding:8px 12px;text-align:center;font-variant-numeric:tabular-nums;font-weight:600;opacity:0.9;';
    qtyTd.textContent = formatPrice(item.total_quantity ?? 0);

    // Last seen cell
    const lastTd = document.createElement('td');
    lastTd.title = item.last_seen ? new Date(item.last_seen).toLocaleString() : '--';
    const timeCell = document.createElement('div');
    timeCell.style.cssText = 'display:flex;flex-direction:column;align-items:flex-end;font-variant-numeric:tabular-nums;font-weight:600;opacity:0.9;line-height:1.1;white-space:nowrap;padding:8px 12px;';
    const clockEl = document.createElement('div');
    clockEl.textContent = formatClock(item.last_seen);
    const relDay = formatRelativeDay(item.last_seen);
    timeCell.appendChild(clockEl);
    if (relDay) {
      const relEl = document.createElement('div');
      relEl.style.cssText = 'opacity:0.7;font-size:11px;';
      relEl.textContent = relDay;
      timeCell.appendChild(relEl);
    }
    lastTd.appendChild(timeCell);

    const detailTd = document.createElement('td');
    detailTd.style.cssText = 'padding:8px 6px;text-align:center;';
    const detailBtn = document.createElement('button');
    detailBtn.textContent = '\uD83D\uDCCA';
    detailBtn.title = 'View restock history';
    detailBtn.style.cssText = 'background:none;border:none;cursor:pointer;font-size:14px;padding:2px 4px;opacity:0.6;border-radius:4px;line-height:1;';
    detailBtn.addEventListener('mouseenter', () => { detailBtn.style.opacity = '1'; });
    detailBtn.addEventListener('mouseleave', () => { detailBtn.style.opacity = '0.6'; });
    detailBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openItemRestockDetail(item, getItemName(item.item_id, item.shop_type));
    });
    detailTd.appendChild(detailBtn);

    tr.append(itemTd, qtyTd, lastTd, detailTd);
    tr.addEventListener('click', () => {
      trackedItems.add(key);
      persistTrackedAndRender(true);
    });

    return { row: tr };
  }

  // -- Render predictions --
  function renderPredictions(): void {
    predBody.innerHTML = '';
    predEtaRefs = [];
    const frag = document.createDocumentFragment();

    const pinned = allData
      .filter(item => trackedItems.has(`${item.shop_type}:${item.item_id}`)
        && !toolItemIds.has(item.item_id))
      .sort((a, b) => {
        const aEmpty = (a.total_occurrences ?? 0) < 2 || !(a.estimated_next_timestamp ?? 0);
        const bEmpty = (b.total_occurrences ?? 0) < 2 || !(b.estimated_next_timestamp ?? 0);
        if (aEmpty && !bEmpty) return 1;
        if (!aEmpty && bEmpty) return -1;
        return (getItemProbability(b) ?? -1) - (getItemProbability(a) ?? -1);
      });

    if (!pinned.length) {
      const empty = document.createElement('div');
      empty.style.cssText = 'padding:8px 4px;font-size:12px;color:rgba(224,224,224,0.35);font-style:italic;';
      empty.textContent = 'Click an item below to pin it here.';
      frag.appendChild(empty);
      predBody.appendChild(frag);
      return;
    }

    for (const item of pinned) {
      const key = `${item.shop_type}:${item.item_id}`;
      const { row, etaRef } = buildPredRow(item, key);
      frag.appendChild(row);
      predEtaRefs.push(etaRef);
    }

    const hint = document.createElement('div');
    hint.style.cssText = 'padding:6px 12px 2px;font-size:11px;opacity:0.5;';
    hint.textContent = 'Click to deselect the item in Active Predictions';
    frag.appendChild(hint);
    predBody.appendChild(frag);
  }

  // -- Sort state helpers --
  function setSortColumn(col: Exclude<SortColumn, null>): void {
    if (sortColumn !== col) {
      sortColumn = col;
      sortDirection = 'asc';
    } else if (sortDirection === 'asc') {
      sortDirection = 'desc';
    } else {
      // Third click resets to default shop/catalog order.
      sortColumn = null;
      sortDirection = 'asc';
    }
    updateResetSortButton();
    scheduleSaveUiState();
    scheduleRender(false, true);
  }

  // -- Render history --
  function renderHistory(): void {
    if (historyChunkRaf !== null) {
      cancelAnimationFrame(historyChunkRaf);
      historyChunkRaf = null;
    }
    const renderToken = ++historyRenderToken;
    const previousScrollTop = tableWrap.scrollTop;
    if (tableWrap.childElementCount > 0 || previousScrollTop > 0) {
      historyScrollTop = previousScrollTop;
    }
    tableWrap.innerHTML = '';
    updateResetSortButton();
    histEtaRefs = [];
    const search = searchInput.value.trim().toLowerCase();
    const now    = Date.now();

    let filtered = allData.filter(item => {
      const key = `${item.shop_type}:${item.item_id}`;
      if (trackedItems.has(key)) return false;           // pinned items not shown in history
      if (item.shop_type === 'tool') return false;
      if (toolItemIds.has(item.item_id)) return false;   // tools/potions from API

      const expiryMs = ITEM_EXPIRY[key] ?? null;
      if (expiryMs && expiryMs <= now) return false;     // expired seasonal items
      if (ITEM_HIDDEN.has(key)) return false;             // manually hidden entries

      if (currentFilter === 'celestial') {
        if (!isCelestial(item.item_id)) return false;
      } else if (currentFilter !== 'all') {
        if (item.shop_type !== currentFilter) return false;
      }

      if (search) {
        const name = getItemName(item.item_id, item.shop_type).toLowerCase();
        if (!name.includes(search) && !(item.item_id ?? '').toLowerCase().includes(search)) return false;
      }
      return true;
    });

    // Sort
    if (sortColumn) {
      filtered = filtered.slice().sort((a, b) => {
        let aVal: unknown;
        let bVal: unknown;
        if (sortColumn === 'item') {
          aVal = getItemName(a.item_id, a.shop_type).toLowerCase();
          bVal = getItemName(b.item_id, b.shop_type).toLowerCase();
        } else if (sortColumn === 'qty') {
          aVal = a.total_quantity ?? (a.total_occurrences ?? 0);
          bVal = b.total_quantity ?? (b.total_occurrences ?? 0);
        } else { // last
          aVal = a.last_seen ?? 0;
          bVal = b.last_seen ?? 0;
        }
        if (aVal === bVal) return 0;
        const cmp = (aVal as any) > (bVal as any) ? 1 : -1;
        return sortDirection === 'asc' ? cmp : -cmp;
      });
    } else {
      // Default: shop type (Seeds/Eggs/Decor) -> in-game catalog order -> name fallback
      filtered = filtered.slice().sort((a, b) => {
        const shopA = SHOP_ORDER[a.shop_type] ?? 99;
        const shopB = SHOP_ORDER[b.shop_type] ?? 99;
        if (shopA !== shopB) return shopA - shopB;

        const orderA = getCatalogOrder(a.item_id, a.shop_type);
        const orderB = getCatalogOrder(b.item_id, b.shop_type);
        if (orderA !== null || orderB !== null) {
          if (orderA === null) return 1;
          if (orderB === null) return -1;
          if (orderA !== orderB) return orderA - orderB;
        }

        return getItemName(a.item_id, a.shop_type)
          .localeCompare(getItemName(b.item_id, b.shop_type), undefined, { sensitivity: 'base' });
      });
    }

    itemCountEl.textContent = `${filtered.length} item${filtered.length !== 1 ? 's' : ''}`;

    if (!filtered.length) {
      const empty = document.createElement('div');
      empty.style.cssText = 'padding:40px;text-align:center;color:rgba(224,224,224,0.35);font-size:13px;';
      empty.textContent = isLoading ? 'Loading restock data...' : 'No items found.';
      tableWrap.appendChild(empty);
      historyScrollTop = 0;
      tableWrap.scrollTop = 0;
      return;
    }

    // Regular table
    const sortIndicator = (col: 'item' | 'qty' | 'last'): string => {
      if (sortColumn !== col) return '';
      return sortDirection === 'asc' ? ' ^' : ' v';
    };

    const table = document.createElement('table');
    table.style.cssText = 'width:100%;border-collapse:separate;border-spacing:0 2px;font-size:12px;';

    const thead = document.createElement('thead');
    const hr = document.createElement('tr');
    const TH_BASE = 'padding:8px 12px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:rgba(224,224,224,0.6);position:sticky;top:0;background:rgba(12,12,22,0.98);z-index:1;';

    const thItem = document.createElement('th');
    thItem.className = 'qpm-sr-th';
    thItem.style.cssText = TH_BASE + 'text-align:left;width:60%;';
    thItem.textContent = `Item${sortIndicator('item')}`;
    thItem.addEventListener('click', () => setSortColumn('item'));

    const thQty = document.createElement('th');
    thQty.className = 'qpm-sr-th';
    thQty.style.cssText = TH_BASE + 'text-align:center;width:20%;';
    thQty.textContent = `Qty${sortIndicator('qty')}`;
    thQty.addEventListener('click', () => setSortColumn('qty'));

    const thLast = document.createElement('th');
    thLast.className = 'qpm-sr-th';
    thLast.style.cssText = TH_BASE + 'text-align:right;width:20%;';
    thLast.textContent = `Seen${sortIndicator('last')}`;
    thLast.addEventListener('click', () => setSortColumn('last'));

    const thDetail = document.createElement('th');
    thDetail.style.cssText = TH_BASE + 'text-align:center;width:48px;';

    hr.append(thItem, thQty, thLast, thDetail);
    thead.appendChild(hr);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    table.appendChild(tbody);
    tableWrap.appendChild(table);
    tableWrap.scrollTop = historyScrollTop;

    let idx = 0;
    const appendChunk = (): void => {
      if (renderToken !== historyRenderToken) return;
      const frag = document.createDocumentFragment();
      for (let i = 0; i < HISTORY_CHUNK_SIZE && idx < filtered.length; i++, idx++) {
        const item = filtered[idx]!;
        const key = `${item.shop_type}:${item.item_id}`;
        const { row } = buildHistRow(item, key);
        frag.appendChild(row);
      }
      tbody.appendChild(frag);
      if (idx < filtered.length) {
        historyChunkRaf = requestAnimationFrame(appendChunk);
        return;
      }
      historyChunkRaf = null;
      tableWrap.scrollTop = historyScrollTop;
    };
    appendChunk();
  }

  const isWindowVisible = (): boolean => {
    if (!root.isConnected || root.style.display === 'none') return false;
    const win = root.closest('.qpm-window') as HTMLElement | null;
    return !win || win.style.display !== 'none';
  };

  // -- Live ETA countdown (30s -- ~Xm/~Xh granularity is fine) --
  const stopTicker = visibleInterval('shop-restock-countdown', () => {
    if (!isWindowVisible()) return;
    for (const ref of predEtaRefs) {
      ref.el.textContent = formatETA(ref.ts);
      ref.el.style.color  = etaColor(ref.ts);
    }
    for (const ref of histEtaRefs) {
      ref.el.textContent = formatETA(ref.ts);
      ref.el.style.color  = etaColor(ref.ts);
    }
    updateRefreshBudgetUi();
    updateLastUpdated();
  }, 30_000);

  const stopSpritesReady = onSpritesReady(() => {
    // Rebuild rows once UI atlas sprites (including sprite/ui/Coin) are available.
    scheduleRender(true, true);
  });

  // -- Cleanup when window is removed --
  const obs = new MutationObserver(() => {
    if (!root.isConnected) {
      obs.disconnect();
      if (searchDebounceTimer !== null) window.clearTimeout(searchDebounceTimer);
      if (saveUiTimer !== null) {
        window.clearTimeout(saveUiTimer);
        saveUiTimer = null;
      }
      if (historyChunkRaf !== null) {
        cancelAnimationFrame(historyChunkRaf);
        historyChunkRaf = null;
      }
      saveUiState();
      stopTicker();
      stopSpritesReady();
      stopRestockDataUpdates();
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });

  // -- Load data --
  const load = async (force = false): Promise<void> => {
    if (isLoading) return;

    if (force) {
      const budget = getRestockRefreshBudget();
      if (budget.blocked) {
        updateRefreshBudgetUi();
        return;
      }
    }

    isLoading = true;
    refreshBtn.textContent = 'Loading...';
    updateRefreshBudgetUi();

    const cached = getRestockDataSync();
    if (!force && cached?.length) {
      allData = cached;
      scheduleRender(true, true);
      updateLastUpdated();
    }

    try {
      allData = await fetchRestockData(force);
      scheduleRender(true, true);
      updateLastUpdated();
    } catch (err) {
      console.error('[QPM][ShopRestock] Refresh failed', err);
      log('[ShopRestock] Fetch failed', err);
      if (force) {
        const message = err instanceof Error ? err.message : String(err);
        const inline = message.length > 64 ? `${message.slice(0, 64)}…` : message;
        lastUpdatedEl.textContent = `Refresh failed: ${inline}`;
        lastUpdatedEl.title = message;
      }
    } finally {
      isLoading = false;
      refreshBtn.textContent = 'Refresh';
      updateRefreshBudgetUi();
    }
  };

  refreshBtn.addEventListener('click', () => load(true));

  // Kick off both in parallel -- game data load doesn't block restock data
  void initGameData().then(() => {
    scheduleRender(true, true);
  });
  void load(false);
}

// ---------------------------------------------------------------------------
// Public entry
// ---------------------------------------------------------------------------

export function openShopRestockWindow(): void {
  toggleWindow('shop-restock', 'Shop Restock', renderShopRestockWindow, '880px', '88vh');
}
