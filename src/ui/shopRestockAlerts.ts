// src/ui/shopRestockAlerts.ts
// Reactive pinned-item restock alerts with one-click Buy All.

import {
  getShopStockState,
  onShopStock,
  startShopStockStore,
  type ShopStockItem,
  type ShopStockState,
} from '../store/shopStock';
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

type RestockShopType = 'seed' | 'egg' | 'decor';

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
let trackedChangedHandler: ((event: Event) => void) | null = null;

const activeAlerts = new Map<string, ActiveAlert>();
const dismissedInStockKeys = new Set<string>();

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
    default:
      return null;
  }
}

function getItemQuantity(item: ShopStockItem): number {
  if (typeof item.currentStock === 'number' && Number.isFinite(item.currentStock)) {
    return Math.max(0, Math.floor(item.currentStock));
  }
  if (typeof item.remaining === 'number' && Number.isFinite(item.remaining)) {
    return Math.max(0, Math.floor(item.remaining));
  }
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

  dismissBtn.addEventListener('click', () => dismissAlertForCurrentStock(model.key));
  closeBtn.addEventListener('click', () => dismissAlertForCurrentStock(model.key));
  buyBtn.addEventListener('click', () => {
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
  const categories: ShopCategory[] = ['seeds', 'eggs', 'decor'];

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

    void startShopStockStore().then(() => {
      if (!started) return;
      stopStockListener = onShopStock((state) => {
        processShopStock(state);
      }, true);
    }).catch((error) => {
      log('[ShopRestockAlerts] Failed to start shop stock store', error);
    });

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
  if (trackedChangedHandler) {
    window.removeEventListener(TRACKED_UPDATED_EVENT, trackedChangedHandler as EventListener);
    trackedChangedHandler = null;
  }

  dismissedInStockKeys.clear();
  for (const key of Array.from(activeAlerts.keys())) {
    removeAlert(key);
  }
  document.getElementById(ALERT_STYLE_ID)?.remove();
}
