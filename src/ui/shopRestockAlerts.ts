// src/ui/shopRestockAlerts.ts
// Reactive pinned-item restock alerts with one-click Buy All.

import {
  getShopStockState,
  onShopStock,
  startShopStockStore,
  type ShopStockItem,
  type ShopStockState,
} from '../store/shopStock';
import {
  onInventoryChange,
  startInventoryStore,
  type InventoryData,
  type InventoryItem,
} from '../store/inventory';
import { getAtomByLabel, subscribeAtom } from '../core/jotaiBridge';
import { sendRoomAction } from '../websocket/api';
import { canonicalItemId, getItemIdVariants } from '../utils/restockDataService';
import { storage } from '../utils/storage';
import { log } from '../utils/logger';
import type { ShopCategory } from '../types/shops';

const TRACKED_KEY = 'qpm.restock.tracked';
const TRACKED_UPDATED_EVENT = 'qpm:restock-tracked-updated';
const ALERT_ROOT_ID = 'qpm-restock-alert-root';
const ALERT_STYLE_ID = 'qpm-restock-alert-style';
const ALERT_SUCCESS_HIDE_MS = 1_300;
const BUY_SEND_DELAY_MS = 55;
const MY_DATA_ATOM_LABEL = 'myDataAtom';
const SEED_SILO_STORAGE_ID = 'seedsilo';

type RestockShopType = 'seed' | 'egg' | 'decor' | 'tool';

interface AlertModel {
  key: string;
  shopType: RestockShopType;
  itemId: string;
  label: string;
  quantity: number;
}

interface ActiveAlert {
  model: AlertModel;
  root: HTMLDivElement;
  qtyEl: HTMLSpanElement;
  statusEl: HTMLDivElement;
  buyBtn: HTMLButtonElement;
  dismissBtn: HTMLButtonElement;
  closeBtn: HTMLButtonElement;
  busy: boolean;
}

interface BuyAllResult {
  purchased: number;
  storedInSilo: boolean;
  error: string | null;
}

let started = false;
let stopStockListener: (() => void) | null = null;
let stopInventoryListener: (() => void) | null = null;
let stopMyDataListener: (() => void) | null = null;
let trackedChangedHandler: ((event: Event) => void) | null = null;

const activeAlerts = new Map<string, ActiveAlert>();
const dismissedInStockKeys = new Set<string>();
let inventoryKeyCounts = new Map<string, number>();
let seedSiloKeyCounts = new Map<string, number>();
let hasInventoryBaseline = false;
let hasSeedSiloBaseline = false;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function loadTrackedSet(): Set<string> {
  const saved = storage.get<string[] | null>(TRACKED_KEY, null);
  return new Set(Array.isArray(saved) ? saved : []);
}

function categoryToShopType(category: ShopCategory): RestockShopType | null {
  switch (category) {
    case 'seeds':
      return 'seed';
    case 'eggs':
      return 'egg';
    case 'decor':
      return 'decor';
    case 'tools':
      return 'tool';
    default:
      return null;
  }
}

function toLowerTrimmed(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const next = value.trim().toLowerCase();
  return next.length > 0 ? next : null;
}

function toNonNegativeInteger(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return Math.max(0, Math.floor(value));
}

function asNonNegativeQuantity(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return Math.max(0, Math.floor(value));
}

function getPurchaseLimitedQuantity(item: ShopStockItem): number | null {
  const initialStock = asNonNegativeQuantity(item.initialStock);
  if (initialStock == null) {
    return null;
  }
  const purchased = asNonNegativeQuantity(item.purchased) ?? 0;
  return Math.max(0, initialStock - purchased);
}

function toCanonicalKey(shopType: RestockShopType, itemId: string): string {
  const canonicalId = canonicalItemId(shopType, itemId);
  return `${shopType}:${canonicalId}`;
}

function addCount(map: Map<string, number>, key: string, amount: number): void {
  if (amount <= 0 || !Number.isFinite(amount)) return;
  map.set(key, (map.get(key) ?? 0) + amount);
}

function normalizeShopType(rawType: unknown): RestockShopType | null {
  const type = toLowerTrimmed(rawType);
  if (!type) return null;
  if (type === 'seed' || type === 'seeds') return 'seed';
  if (type === 'egg' || type === 'eggs') return 'egg';
  if (type === 'decor' || type === 'decoration' || type === 'decorations') return 'decor';
  if (type === 'tool' || type === 'tools') return 'tool';
  return null;
}

function firstString(values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

function getInventoryItemKey(item: InventoryItem): string | null {
  const raw = item.raw && typeof item.raw === 'object' ? item.raw as Record<string, unknown> : null;
  const inferredType =
    normalizeShopType(item.itemType) ??
    normalizeShopType(raw?.itemType) ??
    normalizeShopType(raw?.type);

  const eggId = firstString([raw?.eggId, item.itemId]);
  if (eggId) return toCanonicalKey('egg', eggId);

  const toolId = firstString([raw?.toolId, item.itemId]);
  if (toolId && inferredType !== 'seed') return toCanonicalKey('tool', toolId);

  const decorId = firstString([raw?.decorId, item.itemId]);
  if (decorId && inferredType !== 'seed') return toCanonicalKey('decor', decorId);

  const seedId = firstString([item.species, raw?.species, raw?.seedName, item.itemId]);
  if (seedId && (inferredType === 'seed' || inferredType == null)) {
    return toCanonicalKey('seed', seedId);
  }

  if (inferredType === 'egg' && eggId) return toCanonicalKey('egg', eggId);
  if (inferredType === 'tool' && toolId) return toCanonicalKey('tool', toolId);
  if (inferredType === 'decor' && decorId) return toCanonicalKey('decor', decorId);
  return null;
}

function buildInventoryKeyCounts(data: InventoryData): Map<string, number> {
  const next = new Map<string, number>();
  const items = Array.isArray(data.items) ? data.items : [];
  for (const item of items) {
    const key = getInventoryItemKey(item);
    if (!key) continue;
    const quantity = toNonNegativeInteger(item.quantity) ?? 1;
    addCount(next, key, Math.max(1, quantity));
  }
  return next;
}

function isSeedSiloStorage(entry: unknown): boolean {
  if (!entry || typeof entry !== 'object') return false;
  const row = entry as Record<string, unknown>;
  const fields = [row.storageId, row.decorId, row.id, row.type, row.name];
  return fields.some((value) => toLowerTrimmed(value) === SEED_SILO_STORAGE_ID);
}

function buildSeedSiloKeyCounts(myDataValue: unknown): Map<string, number> {
  const next = new Map<string, number>();
  if (!myDataValue || typeof myDataValue !== 'object') return next;
  const inventory = (myDataValue as Record<string, unknown>).inventory;
  if (!inventory || typeof inventory !== 'object') return next;

  const rawStorages = (inventory as Record<string, unknown>).storages;
  const storages = Array.isArray(rawStorages)
    ? rawStorages
    : rawStorages && typeof rawStorages === 'object'
      ? Object.values(rawStorages)
      : [];
  const seedSilo = storages.find((entry) => isSeedSiloStorage(entry));
  if (!seedSilo || typeof seedSilo !== 'object') return next;

  const items = Array.isArray((seedSilo as Record<string, unknown>).items)
    ? ((seedSilo as Record<string, unknown>).items as unknown[])
    : [];
  for (const rawItem of items) {
    if (!rawItem || typeof rawItem !== 'object') continue;
    const row = rawItem as Record<string, unknown>;
    const species = firstString([row.species, row.seedName, row.itemId, row.id]);
    if (!species) continue;
    const quantity = toNonNegativeInteger(row.quantity ?? row.qty ?? row.count ?? row.amount ?? row.stackSize) ?? 1;
    addCount(next, toCanonicalKey('seed', species), Math.max(1, quantity));
  }
  return next;
}

function combinedOwnedCount(
  key: string,
  inventoryCounts: Map<string, number>,
  siloCounts: Map<string, number>,
): number {
  const inventoryQty = inventoryCounts.get(key) ?? 0;
  if (!key.startsWith('seed:')) return inventoryQty;
  return inventoryQty + (siloCounts.get(key) ?? 0);
}

function applyOwnershipDelta(
  prevInventoryCounts: Map<string, number>,
  prevSiloCounts: Map<string, number>,
  nextInventoryCounts: Map<string, number>,
  nextSiloCounts: Map<string, number>,
): void {
  if (activeAlerts.size === 0) return;
  for (const key of Array.from(activeAlerts.keys())) {
    const previous = combinedOwnedCount(key, prevInventoryCounts, prevSiloCounts);
    const next = combinedOwnedCount(key, nextInventoryCounts, nextSiloCounts);
    if (next <= previous) continue;
    dismissedInStockKeys.add(key);
    removeAlert(key);
  }
}

function handleInventorySnapshot(data: InventoryData): void {
  const nextCounts = buildInventoryKeyCounts(data);
  if (!hasInventoryBaseline) {
    inventoryKeyCounts = nextCounts;
    hasInventoryBaseline = true;
    return;
  }
  const prevCounts = inventoryKeyCounts;
  inventoryKeyCounts = nextCounts;
  applyOwnershipDelta(prevCounts, seedSiloKeyCounts, inventoryKeyCounts, seedSiloKeyCounts);
}

function handleMyDataSnapshot(value: unknown): void {
  const nextCounts = buildSeedSiloKeyCounts(value);
  if (!hasSeedSiloBaseline) {
    seedSiloKeyCounts = nextCounts;
    hasSeedSiloBaseline = true;
    return;
  }
  const prevCounts = seedSiloKeyCounts;
  seedSiloKeyCounts = nextCounts;
  applyOwnershipDelta(inventoryKeyCounts, prevCounts, inventoryKeyCounts, seedSiloKeyCounts);
}

function getItemQuantity(item: ShopStockItem): number {
  const liveStock = asNonNegativeQuantity(item.currentStock);
  const derivedRemaining = asNonNegativeQuantity(item.remaining);
  const purchaseLimited = getPurchaseLimitedQuantity(item);

  let quantity: number | null = null;
  for (const candidate of [liveStock, derivedRemaining, purchaseLimited]) {
    if (candidate == null) continue;
    quantity = quantity == null ? candidate : Math.min(quantity, candidate);
  }
  if (quantity != null) return quantity;

  return item.isAvailable ? 1 : 0;
}

function isTrackedItem(tracked: Set<string>, shopType: RestockShopType, itemId: string): boolean {
  const variants = getItemIdVariants(shopType, itemId);
  for (const variant of variants) {
    if (tracked.has(`${shopType}:${variant}`)) return true;
  }
  const canonical = canonicalItemId(shopType, itemId);
  return tracked.has(`${shopType}:${canonical}`);
}

function ensureAlertStyles(): void {
  if (document.getElementById(ALERT_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = ALERT_STYLE_ID;
  style.textContent = [
    '#qpm-restock-alert-root{position:fixed;top:18px;right:18px;z-index:2147483600;display:flex;flex-direction:column;gap:10px;max-width:min(88vw,360px);max-height:90vh;overflow-y:auto;pointer-events:none;}',
    '.qpm-restock-alert{pointer-events:auto;border:1px solid rgba(143,130,255,0.35);border-radius:12px;background:rgba(18,20,28,0.96);backdrop-filter:blur(2px);box-shadow:0 8px 22px rgba(0,0,0,0.35);padding:10px 12px;display:flex;flex-direction:column;gap:8px;}',
    '.qpm-restock-alert__top{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;}',
    '.qpm-restock-alert__title{font-size:11px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;color:rgba(200,192,255,0.72);}',
    '.qpm-restock-alert__item{font-size:14px;font-weight:700;color:#e9e7ff;line-height:1.25;}',
    '.qpm-restock-alert__qty{font-size:12px;color:rgba(229,231,235,0.8);}',
    '.qpm-restock-alert__status{min-height:16px;font-size:11px;color:rgba(200,192,255,0.72);}',
    '.qpm-restock-alert__actions{display:flex;gap:8px;align-items:center;}',
    '.qpm-restock-alert__btn{border:1px solid rgba(143,130,255,0.35);background:rgba(143,130,255,0.14);color:#ddd7ff;border-radius:8px;padding:5px 10px;font-size:12px;font-weight:600;cursor:pointer;}',
    '.qpm-restock-alert__btn:hover{background:rgba(143,130,255,0.24);}',
    '.qpm-restock-alert__btn--ghost{background:rgba(255,255,255,0.04);border-color:rgba(229,231,235,0.18);color:rgba(229,231,235,0.72);}',
    '.qpm-restock-alert__close{border:none;background:none;color:rgba(229,231,235,0.7);font-size:16px;line-height:1;cursor:pointer;padding:0 2px;}',
    '.qpm-restock-alert__close:hover{color:#ffffff;}',
    '.qpm-restock-alert__btn:disabled,.qpm-restock-alert__close:disabled{opacity:0.55;cursor:default;}',
  ].join('');
  document.head.appendChild(style);
}

function getAlertRoot(): HTMLDivElement {
  let root = document.getElementById(ALERT_ROOT_ID) as HTMLDivElement | null;
  if (root) return root;
  root = document.createElement('div');
  root.id = ALERT_ROOT_ID;
  document.body.appendChild(root);
  return root;
}

function removeAlertRootIfEmpty(): void {
  if (activeAlerts.size > 0) return;
  document.getElementById(ALERT_ROOT_ID)?.remove();
}

function removeAlert(key: string): void {
  const active = activeAlerts.get(key);
  if (!active) return;
  active.root.remove();
  activeAlerts.delete(key);
  removeAlertRootIfEmpty();
}

function dismissAlertForCurrentStock(key: string): void {
  dismissedInStockKeys.add(key);
  removeAlert(key);
}

function setAlertBusy(active: ActiveAlert, busy: boolean): void {
  active.busy = busy;
  active.buyBtn.disabled = busy;
  active.dismissBtn.disabled = busy;
  active.closeBtn.disabled = busy;
}

function updateAlertQuantity(active: ActiveAlert, quantity: number): void {
  active.model.quantity = quantity;
  active.qtyEl.textContent = `${quantity} available`;
}

function hasSeedSiloStorage(): boolean {
  const win = window as Window & { myData?: unknown };
  const myData = win.myData;
  if (!myData || typeof myData !== 'object') return false;
  const inventory = (myData as Record<string, unknown>).inventory;
  if (!inventory || typeof inventory !== 'object') return false;
  const rawStorages = (inventory as Record<string, unknown>).storages;
  const entries = Array.isArray(rawStorages)
    ? rawStorages
    : (rawStorages && typeof rawStorages === 'object' ? Object.values(rawStorages) : []);

  return entries.some((entry) => {
    if (!entry || typeof entry !== 'object') return false;
    const row = entry as Record<string, unknown>;
    const fields = [row.storageId, row.decorId, row.id, row.type, row.name]
      .filter((v): v is string => typeof v === 'string')
      .map((v) => v.toLowerCase());
    return fields.some((v) => v.includes('seedsilo') || v.includes('seed silo'));
  });
}

function sendPurchase(shopType: RestockShopType, itemId: string): boolean {
  switch (shopType) {
    case 'seed':
      return sendRoomAction('PurchaseSeed', { species: itemId }, { throttleMs: 0, skipThrottle: true }).ok;
    case 'egg':
      return sendRoomAction('PurchaseEgg', { eggId: itemId }, { throttleMs: 0, skipThrottle: true }).ok;
    case 'decor':
      return sendRoomAction('PurchaseDecor', { decorId: itemId }, { throttleMs: 0, skipThrottle: true }).ok;
    case 'tool':
      return sendRoomAction('PurchaseTool', { toolId: itemId }, { throttleMs: 0, skipThrottle: true }).ok;
    default:
      return false;
  }
}

function sendSeedToSilo(itemId: string, quantity: number | null): boolean {
  const payload: Record<string, unknown> = {
    itemId,
    storageId: 'SeedSilo',
  };
  if (quantity != null && quantity > 0) {
    payload.quantity = quantity;
  }
  return sendRoomAction('PutItemInStorage', payload, { throttleMs: 0, skipThrottle: true }).ok;
}

async function maybeAutoStoreSeeds(itemId: string, quantity: number): Promise<boolean> {
  if (quantity <= 0 || !hasSeedSiloStorage()) return false;
  await sleep(240);
  if (sendSeedToSilo(itemId, quantity)) return true;
  await sleep(420);
  return sendSeedToSilo(itemId, null);
}

async function buyAllForAlert(model: AlertModel): Promise<BuyAllResult> {
  const requested = Math.max(1, Math.floor(model.quantity));
  let purchased = 0;
  for (let i = 0; i < requested; i++) {
    const ok = sendPurchase(model.shopType, model.itemId);
    if (!ok) {
      break;
    }
    purchased += 1;
    if (i < requested - 1) {
      await sleep(BUY_SEND_DELAY_MS);
    }
  }

  if (purchased <= 0) {
    return {
      purchased: 0,
      storedInSilo: false,
      error: 'Purchase request failed',
    };
  }

  let storedInSilo = false;
  if (model.shopType === 'seed') {
    storedInSilo = await maybeAutoStoreSeeds(model.itemId, purchased);
  }

  return {
    purchased,
    storedInSilo,
    error: null,
  };
}

function createAlert(model: AlertModel): ActiveAlert {
  ensureAlertStyles();
  const root = getAlertRoot();
  const card = document.createElement('div');
  card.className = 'qpm-restock-alert';

  const top = document.createElement('div');
  top.className = 'qpm-restock-alert__top';
  const titleWrap = document.createElement('div');
  const title = document.createElement('div');
  title.className = 'qpm-restock-alert__title';
  title.textContent = 'Pinned item restocked';
  const itemEl = document.createElement('div');
  itemEl.className = 'qpm-restock-alert__item';
  itemEl.textContent = model.label;
  titleWrap.append(title, itemEl);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'qpm-restock-alert__close';
  closeBtn.textContent = '×';
  closeBtn.title = 'Dismiss';
  top.append(titleWrap, closeBtn);

  const qtyEl = document.createElement('span');
  qtyEl.className = 'qpm-restock-alert__qty';
  qtyEl.textContent = `${model.quantity} available`;

  const statusEl = document.createElement('div');
  statusEl.className = 'qpm-restock-alert__status';
  statusEl.textContent = 'Ready to buy';

  const actions = document.createElement('div');
  actions.className = 'qpm-restock-alert__actions';
  const buyBtn = document.createElement('button');
  buyBtn.type = 'button';
  buyBtn.className = 'qpm-restock-alert__btn';
  buyBtn.textContent = 'Buy All';
  const dismissBtn = document.createElement('button');
  dismissBtn.type = 'button';
  dismissBtn.className = 'qpm-restock-alert__btn qpm-restock-alert__btn--ghost';
  dismissBtn.textContent = 'Dismiss';
  actions.append(buyBtn, dismissBtn);

  card.append(top, qtyEl, statusEl, actions);
  card.addEventListener('click', (e) => { e.stopPropagation(); }, true);
  root.prepend(card);

  const active: ActiveAlert = {
    model,
    root: card,
    qtyEl,
    statusEl,
    buyBtn,
    dismissBtn,
    closeBtn,
    busy: false,
  };

  dismissBtn.addEventListener('click', (e) => { e.stopPropagation(); dismissAlertForCurrentStock(model.key); });
  closeBtn.addEventListener('click', (e) => { e.stopPropagation(); dismissAlertForCurrentStock(model.key); });
  buyBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (active.busy) return;
    setAlertBusy(active, true);
    active.statusEl.style.color = 'rgba(200,192,255,0.72)';
    active.statusEl.textContent = 'Buying...';
    void buyAllForAlert(active.model).then((result) => {
      if (result.error || result.purchased <= 0) {
        active.statusEl.style.color = '#fca5a5';
        active.statusEl.textContent = result.error ?? 'Purchase failed';
        setAlertBusy(active, false);
        return;
      }

      const storedNote = active.model.shopType === 'seed' && result.storedInSilo ? ' + moved to Seed Silo' : '';
      active.statusEl.style.color = '#86efac';
      active.statusEl.textContent = `Purchased ${result.purchased}${storedNote}`;
      dismissedInStockKeys.add(active.model.key);
      window.setTimeout(() => {
        removeAlert(active.model.key);
      }, ALERT_SUCCESS_HIDE_MS);
    }).catch((error) => {
      log('[ShopRestockAlerts] Buy-all failed', error);
      active.statusEl.style.color = '#fca5a5';
      active.statusEl.textContent = 'Purchase failed';
      setAlertBusy(active, false);
    });
  });

  activeAlerts.set(model.key, active);
  return active;
}

function upsertAlert(model: AlertModel): void {
  const existing = activeAlerts.get(model.key);
  if (existing) {
    existing.model.itemId = model.itemId;
    existing.model.label = model.label;
    updateAlertQuantity(existing, model.quantity);
    if (!existing.busy) {
      existing.statusEl.style.color = 'rgba(200,192,255,0.72)';
      existing.statusEl.textContent = 'Ready to buy';
    }
    return;
  }
  createAlert(model);
}

function processShopStock(state: ShopStockState): void {
  const tracked = loadTrackedSet();
  const seenKeys = new Set<string>();
  const categories: ShopCategory[] = ['seeds', 'eggs', 'decor', 'tools'];

  for (const category of categories) {
    const shopType = categoryToShopType(category);
    if (!shopType) continue;
    const bucket = state.categories[category];
    const items = Array.isArray(bucket?.items) ? bucket.items : [];
    for (const item of items) {
      const canonicalId = canonicalItemId(shopType, item.id);
      const canonicalKey = `${shopType}:${canonicalId}`;
      seenKeys.add(canonicalKey);

      const trackedNow = isTrackedItem(tracked, shopType, item.id);
      const currentQty = getItemQuantity(item);

      if (!trackedNow) {
        dismissedInStockKeys.delete(canonicalKey);
        removeAlert(canonicalKey);
        continue;
      }

      if (currentQty <= 0) {
        // Once item is out of stock, clear dismiss lock so next stock-up can alert again.
        dismissedInStockKeys.delete(canonicalKey);
        removeAlert(canonicalKey);
        continue;
      }

      if (dismissedInStockKeys.has(canonicalKey)) {
        // User dismissed this stock cycle; keep it hidden until quantity drops to zero.
        removeAlert(canonicalKey);
        continue;
      }

      upsertAlert({
        key: canonicalKey,
        shopType,
        itemId: item.id,
        label: item.label || canonicalId,
        quantity: currentQty,
      });

      const active = activeAlerts.get(canonicalKey);
      if (active) {
        if (currentQty <= 0 && !active.busy) {
          removeAlert(canonicalKey);
        } else {
          updateAlertQuantity(active, currentQty);
        }
      }
    }
  }

  // Clean stale keys that no longer exist in the latest stock snapshot.
  for (const key of Array.from(dismissedInStockKeys.keys())) {
    if (seenKeys.has(key)) continue;
    dismissedInStockKeys.delete(key);
  }
  for (const key of Array.from(activeAlerts.keys())) {
    if (seenKeys.has(key)) continue;
    removeAlert(key);
  }
}

export function startShopRestockAlerts(): void {
  if (started) return;
  try {
    started = true;
    dismissedInStockKeys.clear();
    inventoryKeyCounts = new Map<string, number>();
    seedSiloKeyCounts = new Map<string, number>();
    hasInventoryBaseline = false;
    hasSeedSiloBaseline = false;

    void startShopStockStore().then(() => {
      if (!started) return;
      stopStockListener = onShopStock((state) => {
        processShopStock(state);
      }, true);
    }).catch((error) => {
      log('[ShopRestockAlerts] Failed to start shop stock store', error);
    });

    void startInventoryStore().then(() => {
      if (!started) return;
      stopInventoryListener = onInventoryChange((data) => {
        handleInventorySnapshot(data);
      }, true);
    }).catch((error) => {
      log('[ShopRestockAlerts] Failed to start inventory store', error);
    });

    const myDataAtom = getAtomByLabel(MY_DATA_ATOM_LABEL);
    if (myDataAtom) {
      void subscribeAtom<unknown>(myDataAtom, (value) => {
        handleMyDataSnapshot(value);
      }).then((unsubscribe) => {
        if (!started) {
          unsubscribe();
          return;
        }
        stopMyDataListener = unsubscribe;
      }).catch((error) => {
        log('[ShopRestockAlerts] Failed to subscribe to myDataAtom', error);
      });
    }

    trackedChangedHandler = () => {
      processShopStock(getShopStockState());
    };
    window.addEventListener(TRACKED_UPDATED_EVENT, trackedChangedHandler as EventListener);
  } catch (error) {
    started = false;
    log('[ShopRestockAlerts] start failed', error);
  }
}

export function stopShopRestockAlerts(): void {
  if (!started) return;
  started = false;

  stopStockListener?.();
  stopStockListener = null;
  stopInventoryListener?.();
  stopInventoryListener = null;
  stopMyDataListener?.();
  stopMyDataListener = null;
  if (trackedChangedHandler) {
    window.removeEventListener(TRACKED_UPDATED_EVENT, trackedChangedHandler as EventListener);
    trackedChangedHandler = null;
  }

  dismissedInStockKeys.clear();
  inventoryKeyCounts = new Map<string, number>();
  seedSiloKeyCounts = new Map<string, number>();
  hasInventoryBaseline = false;
  hasSeedSiloBaseline = false;
  for (const key of Array.from(activeAlerts.keys())) {
    removeAlert(key);
  }
  document.getElementById(ALERT_STYLE_ID)?.remove();
}
