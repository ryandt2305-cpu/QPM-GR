// src/ui/shopRestockWindow.ts
// Shop Restock Tracker — Supabase-powered restock probability table

import { toggleWindow } from './modalWindow';
import { log } from '../utils/logger';
import { fetchRestockData, getRestockDataSync, getRestockFetchedAt, getItemProbability, type RestockItem } from '../utils/restockDataService';
import { visibleInterval } from '../utils/timerManager';
import { getCropSpriteCanvas, getPetSpriteCanvas } from '../sprite-v2/compat';
import { canvasToDataUrl } from '../utils/canvasHelpers';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SortKey = 'next' | 'prob' | 'last_seen' | 'name';

const SHOP_FILTER_OPTIONS: Array<{ label: string; value: string }> = [
  { label: 'All Shops', value: 'all' },
  { label: 'Starweaver', value: 'Starweaver' },
  { label: 'Dawnbinder', value: 'Dawnbinder' },
  { label: 'Moonbinder', value: 'Moonbinder' },
  { label: 'Mythical Eggs', value: 'Mythical Eggs' },
];

const SORT_OPTIONS: Array<{ label: string; value: SortKey }> = [
  { label: 'Next Restock', value: 'next' },
  { label: 'Probability', value: 'prob' },
  { label: 'Last Seen', value: 'last_seen' },
  { label: 'Item Name', value: 'name' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCountdown(ms: number): string {
  if (ms <= 0) return 'Soon';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatAge(ts: number | null): string {
  if (!ts) return '—';
  const diff = Date.now() - ts;
  const h = Math.floor(diff / 3600_000);
  const m = Math.floor((diff % 3600_000) / 60_000);
  if (h > 48) return `${Math.floor(h / 24)}d ago`;
  if (h > 0) return `${h}h ${m}m ago`;
  return `${m}m ago`;
}

function getSpriteUrl(item: RestockItem): string | null {
  const id = item.item_id;
  if (!id) return null;
  try {
    const petCanvas = getPetSpriteCanvas(id);
    const petUrl = canvasToDataUrl(petCanvas);
    if (petUrl) return petUrl;
  } catch {}
  try {
    const cropCanvas = getCropSpriteCanvas(id);
    const cropUrl = canvasToDataUrl(cropCanvas);
    if (cropUrl) return cropUrl;
  } catch {}
  return null;
}

function selectElement(tag: string, style: string): HTMLSelectElement {
  const el = document.createElement(tag) as unknown as HTMLSelectElement;
  el.style.cssText = style;
  return el;
}

function sortItems(items: RestockItem[], key: SortKey): RestockItem[] {
  return [...items].sort((a, b) => {
    if (key === 'next') {
      const at = a.estimated_next_timestamp ?? Infinity;
      const bt = b.estimated_next_timestamp ?? Infinity;
      return at - bt;
    }
    if (key === 'prob') {
      const ap = getItemProbability(a) ?? -1;
      const bp = getItemProbability(b) ?? -1;
      return bp - ap;
    }
    if (key === 'last_seen') {
      const al = a.last_seen ?? 0;
      const bl = b.last_seen ?? 0;
      return bl - al;
    }
    // name
    return (a.item_id ?? '').localeCompare(b.item_id ?? '');
  });
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function renderShopRestockWindow(root: HTMLElement): void {
  root.innerHTML = '';
  root.style.cssText = 'display:flex;flex-direction:column;height:100%;min-height:0;';

  // ── Toolbar ──
  const toolbar = document.createElement('div');
  toolbar.style.cssText = [
    'display:flex',
    'align-items:center',
    'gap:8px',
    'padding:10px 14px',
    'border-bottom:1px solid rgba(143,130,255,0.2)',
    'flex-shrink:0',
    'flex-wrap:wrap',
  ].join(';');

  const filterSelect = selectElement('select', [
    'background:rgba(255,255,255,0.06)',
    'border:1px solid rgba(143,130,255,0.3)',
    'border-radius:5px',
    'color:#e0e0e0',
    'padding:5px 8px',
    'font-size:12px',
    'cursor:pointer',
  ].join(';'));

  for (const opt of SHOP_FILTER_OPTIONS) {
    const o = document.createElement('option');
    o.value = opt.value;
    o.textContent = opt.label;
    filterSelect.appendChild(o);
  }

  const sortSelect = selectElement('select', [
    'background:rgba(255,255,255,0.06)',
    'border:1px solid rgba(143,130,255,0.3)',
    'border-radius:5px',
    'color:#e0e0e0',
    'padding:5px 8px',
    'font-size:12px',
    'cursor:pointer',
  ].join(';'));

  for (const opt of SORT_OPTIONS) {
    const o = document.createElement('option');
    o.value = opt.value;
    o.textContent = opt.label;
    sortSelect.appendChild(o);
  }

  const refreshBtn = document.createElement('button');
  refreshBtn.type = 'button';
  refreshBtn.textContent = '↺ Refresh';
  refreshBtn.style.cssText = [
    'padding:5px 12px',
    'font-size:12px',
    'background:rgba(143,130,255,0.15)',
    'border:1px solid rgba(143,130,255,0.35)',
    'border-radius:5px',
    'color:#c8c0ff',
    'cursor:pointer',
  ].join(';');

  const lastUpdatedEl = document.createElement('span');
  lastUpdatedEl.style.cssText = 'font-size:11px;color:rgba(224,224,224,0.4);margin-left:auto;';
  lastUpdatedEl.textContent = 'Loading...';

  toolbar.append(filterSelect, sortSelect, refreshBtn, lastUpdatedEl);
  root.appendChild(toolbar);

  // ── Table container ──
  const tableWrap = document.createElement('div');
  tableWrap.style.cssText = 'flex:1;overflow-y:auto;min-height:0;';
  root.appendChild(tableWrap);

  // ── State ──
  let currentData: RestockItem[] = [];
  let filter = 'all';
  let sort: SortKey = 'next';
  let isLoading = false;

  const updateLastUpdated = (): void => {
    const fetchedAt = getRestockFetchedAt();
    if (!fetchedAt) {
      lastUpdatedEl.textContent = '';
      return;
    }
    const diff = Math.round((Date.now() - fetchedAt) / 60_000);
    lastUpdatedEl.textContent = diff < 1 ? 'Updated just now' : `Updated ${diff}m ago`;
  };

  const renderTable = (): void => {
    tableWrap.innerHTML = '';

    let items = currentData;
    if (filter !== 'all') {
      items = items.filter(i => (i.shop_type ?? '').toLowerCase() === filter.toLowerCase());
    }
    items = sortItems(items, sort);

    if (!items.length) {
      const empty = document.createElement('div');
      empty.style.cssText = 'padding:40px;text-align:center;color:rgba(224,224,224,0.4);font-size:13px;';
      empty.textContent = isLoading ? '⏳ Loading restock data...' : '📭 No restock data found.';
      tableWrap.appendChild(empty);
      return;
    }

    const table = document.createElement('table');
    table.style.cssText = 'width:100%;border-collapse:collapse;font-size:12px;';

    const thead = document.createElement('thead');
    thead.innerHTML = `
      <tr style="background:rgba(143,130,255,0.08);color:rgba(224,224,224,0.6);font-size:11px;text-transform:uppercase;letter-spacing:0.4px;">
        <th style="padding:8px 12px;text-align:left;position:sticky;top:0;background:rgba(18,20,26,0.96);">Item</th>
        <th style="padding:8px 12px;text-align:left;position:sticky;top:0;background:rgba(18,20,26,0.96);">Shop</th>
        <th style="padding:8px 12px;text-align:right;position:sticky;top:0;background:rgba(18,20,26,0.96);">Prob</th>
        <th style="padding:8px 12px;text-align:right;position:sticky;top:0;background:rgba(18,20,26,0.96);" class="qpm-col-next">Next</th>
        <th style="padding:8px 12px;text-align:right;position:sticky;top:0;background:rgba(18,20,26,0.96);">Qty Avg</th>
        <th style="padding:8px 12px;text-align:right;position:sticky;top:0;background:rgba(18,20,26,0.96);">Last Seen</th>
      </tr>`;
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    const now = Date.now();

    for (const item of items) {
      const tr = document.createElement('tr');
      tr.style.cssText = 'border-bottom:1px solid rgba(255,255,255,0.05);transition:background 0.1s;';
      tr.addEventListener('mouseenter', () => { tr.style.background = 'rgba(143,130,255,0.06)'; });
      tr.addEventListener('mouseleave', () => { tr.style.background = ''; });

      // Sprite
      const spriteUrl = getSpriteUrl(item);
      const spriteHtml = spriteUrl
        ? `<img src="${spriteUrl}" width="22" height="22" style="image-rendering:pixelated;object-fit:contain;vertical-align:middle;margin-right:6px;">`
        : `<span style="display:inline-block;width:22px;height:22px;margin-right:6px;"></span>`;

      const prob = getItemProbability(item);
      const probText = prob != null ? `${prob.toFixed(1)}%` : '—';
      const probColor = prob != null && prob >= 60 ? '#64ff96' : prob != null && prob >= 30 ? '#ffeb3b' : '#e0e0e0';

      const nextTs = item.estimated_next_timestamp;
      let nextText = '—';
      let nextEl: HTMLTableCellElement;
      if (nextTs) {
        const remaining = nextTs - now;
        nextText = formatCountdown(remaining);
      }

      const qty = item.average_quantity;
      const qtyText = qty != null ? qty.toFixed(1) : '—';

      tr.innerHTML = `
        <td style="padding:8px 12px;">${spriteHtml}<span style="vertical-align:middle;">${item.item_id ?? '—'}</span></td>
        <td style="padding:8px 12px;color:rgba(224,224,224,0.6);">${item.shop_type ?? '—'}</td>
        <td style="padding:8px 12px;text-align:right;color:${probColor};font-weight:600;">${probText}</td>
        <td style="padding:8px 12px;text-align:right;" class="qpm-next-cell" data-ts="${nextTs ?? ''}">${nextText}</td>
        <td style="padding:8px 12px;text-align:right;color:rgba(224,224,224,0.6);">${qtyText}</td>
        <td style="padding:8px 12px;text-align:right;color:rgba(224,224,224,0.5);">${formatAge(item.last_seen)}</td>
      `;

      tbody.appendChild(tr);
    }

    table.appendChild(tbody);
    tableWrap.appendChild(table);
  };

  const load = async (force = false): Promise<void> => {
    if (isLoading) return;
    isLoading = true;
    refreshBtn.disabled = true;
    refreshBtn.textContent = '⏳';

    // Show cached data immediately while fetching
    const cached = getRestockDataSync();
    if (cached) {
      currentData = cached;
      renderTable();
      updateLastUpdated();
    }

    try {
      currentData = await fetchRestockData(force);
      renderTable();
      updateLastUpdated();
    } catch (err) {
      log('⚠️ [ShopRestock] Fetch failed', err);
    } finally {
      isLoading = false;
      refreshBtn.disabled = false;
      refreshBtn.textContent = '↺ Refresh';
    }
  };

  // ── Live countdown ticker ──
  const stopTicker = visibleInterval('shop-restock-countdown', () => {
    const cells = tableWrap.querySelectorAll<HTMLElement>('.qpm-next-cell');
    const now = Date.now();
    for (const cell of cells) {
      const ts = parseInt(cell.dataset.ts ?? '0', 10);
      if (!ts) { cell.textContent = '—'; continue; }
      const remaining = ts - now;
      cell.textContent = formatCountdown(remaining);
    }
    updateLastUpdated();
  }, 1000);

  // Cleanup ticker when root is removed
  const obs = new MutationObserver(() => {
    if (!root.isConnected) {
      obs.disconnect();
      stopTicker();
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });

  // ── Event wiring ──
  filterSelect.addEventListener('change', () => {
    filter = filterSelect.value;
    renderTable();
  });
  sortSelect.addEventListener('change', () => {
    sort = sortSelect.value as SortKey;
    renderTable();
  });
  refreshBtn.addEventListener('click', () => load(true));

  // Initial load
  load(false);
}

// ---------------------------------------------------------------------------
// Public entry
// ---------------------------------------------------------------------------

export function openShopRestockWindow(): void {
  toggleWindow('shop-restock', '🏪 Shop Restock', renderShopRestockWindow, '900px', '88vh');
}
