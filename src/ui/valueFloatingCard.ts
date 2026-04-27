// src/ui/valueFloatingCard.ts
// Detached, draggable floating cards for economy values (balances + asset values).

import { storage } from '../utils/storage';
import { log } from '../utils/logger';
import { onGardenSnapshot, getGardenSnapshot } from '../features/gardenBridge';
import { onInventoryChange } from '../store/inventory';
import { onActivePetInfos } from '../store/pets';
import { computeGardenValueFromCatalog, formatCoinsAbbreviated } from '../features/valueCalculator';
import { computeInventoryValue, computeAllStoragesValue, computeActivePetsValue } from '../features/storageValue';
import { getAnySpriteDataUrl, getCropSpriteDataUrl, getProduceSpriteDataUrl } from '../sprite-v2/compat';
import { debounceCancelable } from '../utils/debounce';
import { subscribeEconomy, getEconomySnapshot, type EconomySnapshot } from '../store/economyTracker';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'qpm.valueFloatingCards.v1';

export type ValueCardType = 'coins' | 'credits' | 'dust' | 'garden' | 'inventory' | 'netWorth';
const VALID_TYPES = new Set<string>(['coins', 'credits', 'dust', 'garden', 'inventory', 'netWorth']);

const CARD_LABELS: Record<ValueCardType, string> = {
  coins: 'Coins',
  credits: 'Credits',
  dust: 'Magic Dust',
  garden: 'Garden Value',
  inventory: 'Inventory Value',
  netWorth: 'Net Worth',
};

const CARD_COLORS: Record<ValueCardType, string> = {
  coins: '#ffd600',
  credits: '#42a5f5',
  dust: '#ab47bc',
  garden: '#ffd600',
  inventory: '#ffd600',
  netWorth: '#8f82ff',
};

// ---------------------------------------------------------------------------
// Styles (matching petFloatingCard.ts theme)
// ---------------------------------------------------------------------------

const STYLES = `
.qpm-value-card {
  position: fixed;
  background: rgba(18,20,26,0.96);
  border: 1px solid rgba(143,130,255,0.45);
  border-radius: 9px;
  width: 172px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.55);
  z-index: 999990;
  font-family: inherit;
  user-select: none;
  overflow: hidden;
}
.qpm-value-card__header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  cursor: grab;
  background: rgba(143,130,255,0.08);
  border-bottom: 1px solid rgba(143,130,255,0.18);
}
.qpm-value-card__header:active { cursor: grabbing; }
.qpm-value-card__label {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  font-weight: 500;
  color: #e0e0e0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.qpm-value-card__close {
  width: 18px;
  height: 18px;
  background: none;
  border: none;
  color: rgba(224,224,224,0.45);
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 3px;
  flex-shrink: 0;
  padding: 0;
  line-height: 1;
  transition: color 0.12s, background 0.12s;
}
.qpm-value-card__close:hover { color: #e0e0e0; background: rgba(255,255,255,0.1); }
.qpm-value-card__body {
  padding: 8px 10px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.qpm-value-card__icon {
  width: 28px;
  height: 28px;
  image-rendering: pixelated;
  object-fit: contain;
  flex-shrink: 0;
}
.qpm-value-card__amount {
  font-size: 18px;
  font-weight: 800;
  line-height: 1;
}
.qpm-value-card__rate {
  font-size: 10px;
  font-weight: 600;
  margin-top: 2px;
}
`;

// ---------------------------------------------------------------------------
// Persistence types
// ---------------------------------------------------------------------------

interface PersistedCard {
  type: ValueCardType;
  x: number;
  y: number;
}

interface PersistedState {
  cards: PersistedCard[];
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

interface FloatingCardEntry {
  type: ValueCardType;
  el: HTMLElement;
  destroy: () => void;
}

const registry = new Map<ValueCardType, FloatingCardEntry>();
let stylesInjected = false;
let initialized = false;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensureStyles(): void {
  if (stylesInjected) return;
  const el = document.createElement('style');
  el.id = 'qpm-value-card-styles';
  el.textContent = STYLES;
  document.head.appendChild(el);
  stylesInjected = true;
}

function clampPosition(x: number, y: number): { x: number; y: number } {
  const maxX = Math.max(0, window.innerWidth - 200);
  const maxY = Math.max(0, window.innerHeight - 100);
  return {
    x: Math.max(0, Math.min(maxX, Math.round(x))),
    y: Math.max(0, Math.min(maxY, Math.round(y))),
  };
}

const TYPE_INDEX: Record<ValueCardType, number> = {
  coins: 0, credits: 1, dust: 2, garden: 3, inventory: 4, netWorth: 5,
};

function getDefaultPosition(type: ValueCardType): { x: number; y: number } {
  const offset = TYPE_INDEX[type] * 18;
  const x = window.innerWidth - 220 - offset;
  const y = Math.max(16, window.innerHeight - 120 - offset);
  return clampPosition(x, y);
}

function getCurrentPosition(el: HTMLElement): { x: number; y: number } {
  const rect = el.getBoundingClientRect();
  return clampPosition(rect.left, rect.top);
}

function applyPosition(el: HTMLElement, x: number, y: number): void {
  const clamped = clampPosition(x, y);
  el.style.left = `${clamped.x}px`;
  el.style.top = `${clamped.y}px`;
  el.style.right = '';
  el.style.bottom = '';
}

function loadPersistedState(): PersistedState {
  const stored = storage.get<PersistedState>(STORAGE_KEY, { cards: [] });
  if (!stored || typeof stored !== 'object' || !Array.isArray(stored.cards)) {
    return { cards: [] };
  }
  const cards = stored.cards
    .filter((c): c is PersistedCard =>
      !!c && typeof c === 'object' &&
      VALID_TYPES.has(c.type) &&
      Number.isFinite(c.x) && Number.isFinite(c.y),
    );
  return { cards };
}

function persistRegistryState(): void {
  const cards: PersistedCard[] = [];
  for (const entry of registry.values()) {
    const pos = getCurrentPosition(entry.el);
    cards.push({ type: entry.type, x: pos.x, y: pos.y });
  }
  storage.set(STORAGE_KEY, { cards } satisfies PersistedState);
}

/** Resolve an egg sprite URL, trying multiple key patterns. */
function resolveEggSpriteUrl(): string {
  const prefixes = ['sprite/egg/', 'egg/', 'sprite/pet/', 'pet/'];
  const ids = ['CommonEgg', 'UncommonEgg'];
  for (const id of ids) {
    for (const prefix of prefixes) {
      const url = getAnySpriteDataUrl(`${prefix}${id}`);
      if (url) return url;
    }
  }
  return '';
}

/** Build overlapping circular sprites (avatar-group style). */
function overlappingIcons(urls: string[], size: number): HTMLElement {
  const valid = urls.filter(Boolean);
  if (valid.length <= 1) {
    if (valid.length === 1) {
      const img = document.createElement('img');
      img.src = valid[0];
      img.alt = '';
      img.style.cssText = `width:${size}px;height:${size}px;object-fit:contain;image-rendering:pixelated;display:block;flex-shrink:0;`;
      return img;
    }
    const span = document.createElement('span');
    span.style.cssText = `font-size:${Math.round(size * 0.6)}px;width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;flex-shrink:0;`;
    span.textContent = '📦';
    return span;
  }

  const count = valid.length;
  const itemSize = Math.round(size * 0.72);
  const overlap = Math.round(itemSize * 0.35);
  const totalWidth = itemSize + (count - 1) * (itemSize - overlap);

  const wrap = document.createElement('div');
  wrap.style.cssText = `position:relative;width:${totalWidth}px;height:${size}px;flex-shrink:0;`;

  for (let i = 0; i < count; i++) {
    const img = document.createElement('img');
    img.src = valid[i];
    img.alt = '';
    const left = i * (itemSize - overlap);
    img.style.cssText = [
      `position:absolute`,
      `left:${left}px`,
      `top:${Math.round((size - itemSize) / 2)}px`,
      `width:${itemSize}px`,
      `height:${itemSize}px`,
      `object-fit:contain`,
      `image-rendering:pixelated`,
      `border-radius:50%`,
      `border:1.5px solid rgba(18,20,26,0.9)`,
      `z-index:${count - i}`,
    ].join(';');
    wrap.appendChild(img);
  }

  return wrap;
}

/** Build a sprite icon element for the floating card body. */
function buildCardIcon(type: ValueCardType, size: number): HTMLElement {
  if (type === 'garden') {
    const url = getCropSpriteDataUrl('Carrot') || getProduceSpriteDataUrl('Carrot');
    if (url) {
      const img = document.createElement('img');
      img.style.cssText = `width:${size}px;height:${size}px;object-fit:contain;image-rendering:pixelated;display:block;flex-shrink:0;`;
      img.src = url;
      img.alt = 'garden';
      return img;
    }
  }

  if (type === 'inventory') {
    const coinUrl = getAnySpriteDataUrl('sprite/ui/Coin') || getAnySpriteDataUrl('ui/Coin') || '';
    const cropUrl = getProduceSpriteDataUrl('Carrot') || getCropSpriteDataUrl('Carrot') || '';
    const eggUrl = resolveEggSpriteUrl();
    const urls = [coinUrl, cropUrl, eggUrl].filter(Boolean);
    if (urls.length > 1) return overlappingIcons(urls, size);
    if (urls.length === 1) {
      const img = document.createElement('img');
      img.style.cssText = `width:${size}px;height:${size}px;object-fit:contain;image-rendering:pixelated;display:block;flex-shrink:0;`;
      img.src = urls[0];
      img.alt = 'inventory';
      return img;
    }
  }

  if (type === 'netWorth') {
    // Same as coins icon — gold coin represents total value
    const coinUrl = getAnySpriteDataUrl('sprite/ui/Coin') || getAnySpriteDataUrl('ui/Coin');
    if (coinUrl) {
      const img = document.createElement('img');
      img.style.cssText = `width:${size}px;height:${size}px;object-fit:contain;image-rendering:pixelated;display:block;flex-shrink:0;`;
      img.src = coinUrl;
      img.alt = 'net worth';
      return img;
    }
  }

  // Currency types (coins/credits/dust) — single sprite
  const urlMap: Record<string, () => string | null> = {
    coins: () => getAnySpriteDataUrl('sprite/ui/Coin') || getAnySpriteDataUrl('ui/Coin') || null,
    credits: () => getAnySpriteDataUrl('sprite/ui/Donut') || getAnySpriteDataUrl('ui/Donut') || null,
    dust: () => getAnySpriteDataUrl('sprite/item/MagicDust') || getAnySpriteDataUrl('item/MagicDust') || null,
  };
  const url = urlMap[type]?.() ?? null;
  if (url) {
    const img = document.createElement('img');
    img.style.cssText = `width:${size}px;height:${size}px;object-fit:contain;image-rendering:pixelated;display:block;flex-shrink:0;`;
    img.src = url;
    img.alt = type;
    return img;
  }

  // Fallback emoji
  const fallbacks: Record<string, string> = { coins: '🪙', credits: '💎', dust: '✨', garden: '🌿', inventory: '📦', netWorth: '🪙' };
  const span = document.createElement('span');
  span.style.cssText = `font-size:${Math.round(size * 0.6)}px;width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;flex-shrink:0;`;
  span.textContent = fallbacks[type] ?? '📦';
  return span;
}

// ---------------------------------------------------------------------------
// Card factory
// ---------------------------------------------------------------------------

function createValueCard(type: ValueCardType, initialPos?: { x: number; y: number }): FloatingCardEntry {
  ensureStyles();

  const cleanups: Array<() => void> = [];
  const card = document.createElement('div');
  card.className = 'qpm-value-card';

  const resolvedPos = initialPos ? clampPosition(initialPos.x, initialPos.y) : getDefaultPosition(type);
  applyPosition(card, resolvedPos.x, resolvedPos.y);

  // Header
  const header = document.createElement('div');
  header.className = 'qpm-value-card__header';

  const labelEl = document.createElement('div');
  labelEl.className = 'qpm-value-card__label';
  labelEl.textContent = CARD_LABELS[type];
  header.appendChild(labelEl);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'qpm-value-card__close';
  closeBtn.textContent = 'x';
  closeBtn.title = `Close ${CARD_LABELS[type]} card`;
  header.appendChild(closeBtn);

  card.appendChild(header);

  // Body
  const body = document.createElement('div');
  body.className = 'qpm-value-card__body';

  body.appendChild(buildCardIcon(type, 28));

  const textCol = document.createElement('div');
  textCol.style.cssText = 'display:flex;flex-direction:column;';

  const amountEl = document.createElement('div');
  amountEl.className = 'qpm-value-card__amount';
  amountEl.style.color = CARD_COLORS[type];
  amountEl.textContent = '\u2014';
  textCol.appendChild(amountEl);

  const rateEl = document.createElement('div');
  rateEl.className = 'qpm-value-card__rate';
  rateEl.style.display = 'none';
  textCol.appendChild(rateEl);

  body.appendChild(textCol);
  card.appendChild(body);
  document.body.appendChild(card);

  let destroyed = false;

  function updateAmount(value: number): void {
    amountEl.textContent = formatCoinsAbbreviated(value);
  }

  function updateRate(rate: number | null): void {
    if (rate == null || Math.abs(rate) < 1) {
      rateEl.style.display = 'none';
      return;
    }
    rateEl.style.display = '';
    const sign = rate >= 0 ? '+' : '';
    const color = rate >= 0 ? '#4caf50' : '#ef5350';
    rateEl.style.color = color;
    rateEl.textContent = `${sign}${formatCoinsAbbreviated(Math.round(rate))}/hr`;
  }

  // Subscribe to appropriate reactive source
  if (type === 'coins' || type === 'credits' || type === 'dust') {
    function applyEconomy(snap: EconomySnapshot): void {
      if (destroyed) return;
      const cur = snap[type as 'coins' | 'credits' | 'dust'];
      if (!cur.connected) {
        amountEl.textContent = '\u2014';
        amountEl.style.color = 'rgba(224,224,224,0.4)';
        updateRate(null);
        return;
      }
      amountEl.style.color = CARD_COLORS[type];
      updateAmount(cur.balance);
      updateRate('rate' in cur ? cur.rate : null);
    }
    const unsub = subscribeEconomy(applyEconomy);
    cleanups.push(unsub);
  } else if (type === 'garden') {
    const debouncedUpdate = debounceCancelable(() => {
      if (destroyed) return;
      updateAmount(computeGardenValueFromCatalog(getGardenSnapshot()));
    }, 200);
    cleanups.push(debouncedUpdate.cancel);

    const unsub = onGardenSnapshot(() => debouncedUpdate(), false);
    cleanups.push(unsub);
    updateAmount(computeGardenValueFromCatalog(getGardenSnapshot()));
  } else if (type === 'netWorth') {
    function computeNetWorth(): number {
      return getEconomySnapshot().coins.balance
        + computeGardenValueFromCatalog(getGardenSnapshot())
        + computeInventoryValue()
        + computeAllStoragesValue()
        + computeActivePetsValue();
    }
    const debouncedUpdate = debounceCancelable(() => {
      if (destroyed) return;
      updateAmount(computeNetWorth());
    }, 200);
    cleanups.push(debouncedUpdate.cancel);

    // React to coins, garden, inventory, and pet changes
    cleanups.push(subscribeEconomy(() => debouncedUpdate()));
    cleanups.push(onGardenSnapshot(() => debouncedUpdate(), false));
    cleanups.push(onInventoryChange(() => debouncedUpdate()));
    cleanups.push(onActivePetInfos(() => debouncedUpdate()));
    updateAmount(computeNetWorth());
  } else {
    const debouncedUpdate = debounceCancelable(() => {
      if (destroyed) return;
      updateAmount(computeInventoryValue());
    }, 200);
    cleanups.push(debouncedUpdate.cancel);

    const unsub = onInventoryChange(() => debouncedUpdate());
    cleanups.push(unsub);
    updateAmount(computeInventoryValue());
  }

  // Drag
  let dragStartX = 0;
  let dragStartY = 0;
  let cardStartLeft = 0;
  let cardStartTop = 0;
  let isDragging = false;

  const onMouseDown = (event: MouseEvent): void => {
    if ((event.target as Element).closest('.qpm-value-card__close')) return;

    const rect = card.getBoundingClientRect();
    applyPosition(card, rect.left, rect.top);

    isDragging = true;
    dragStartX = event.clientX;
    dragStartY = event.clientY;
    cardStartLeft = rect.left;
    cardStartTop = rect.top;
    event.preventDefault();
  };

  const onMouseMove = (event: MouseEvent): void => {
    if (!isDragging) return;
    const dx = event.clientX - dragStartX;
    const dy = event.clientY - dragStartY;
    applyPosition(card, cardStartLeft + dx, cardStartTop + dy);
  };

  const onMouseUp = (): void => {
    if (!isDragging) return;
    isDragging = false;
    persistRegistryState();
  };

  header.addEventListener('mousedown', onMouseDown);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
  cleanups.push(() => {
    header.removeEventListener('mousedown', onMouseDown);
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  });

  // Destroy
  const destroy = (): void => {
    if (destroyed) return;
    destroyed = true;
    cleanups.forEach((fn) => fn());
    card.remove();
    registry.delete(type);
    persistRegistryState();
  };

  closeBtn.addEventListener('click', destroy);

  return { type, el: card, destroy };
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

function openCardInternal(type: ValueCardType, initialPos?: { x: number; y: number }): void {
  if (registry.has(type)) {
    const existing = registry.get(type)!;
    existing.el.style.border = '1px solid rgba(143,130,255,0.9)';
    window.setTimeout(() => {
      if (existing.el.isConnected) {
        existing.el.style.border = '1px solid rgba(143,130,255,0.45)';
      }
    }, 450);
    return;
  }

  const entry = createValueCard(type, initialPos);
  registry.set(type, entry);
  persistRegistryState();
  log(`[ValueFloatingCard] Opened ${type} card`);
}

function restorePersistedCards(): void {
  const persisted = loadPersistedState();
  for (const card of persisted.cards) {
    openCardInternal(card.type, { x: card.x, y: card.y });
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function initValueFloatingCards(): void {
  if (initialized) return;
  initialized = true;
  restorePersistedCards();
}

export function toggleValueCard(type: ValueCardType): void {
  initValueFloatingCards();
  if (registry.has(type)) {
    registry.get(type)!.destroy();
  } else {
    openCardInternal(type);
  }
}

export function closeValueCard(type: ValueCardType): void {
  registry.get(type)?.destroy();
}

export function isValueCardOpen(type: ValueCardType): boolean {
  return registry.has(type);
}

export function closeAllValueCards(): void {
  for (const entry of Array.from(registry.values())) {
    entry.destroy();
  }
}
