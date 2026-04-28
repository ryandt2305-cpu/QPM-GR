// src/features/tileValueIndicator.ts
// Injects the sell price of the currently viewed fruit into the game's crop tooltip.
//
// Data sources (same approach as Aries mod):
//   1. myCurrentGardenObjectAtom — the tile object with its slots[] array.
//      Fires when the player moves to a new tile.
//   2. mySelectedSlotIdAtom — the selected slot ID (primitive atom).
//      Fires when the player presses C/X to cycle fruits on multi-harvest plants.
// We subscribe to both and resolve the current slot ourselves.

import { getPlantSpecies, getAllPlantSpecies, areCatalogsReady } from '../catalogs/gameCatalogs';
import { computeMutationMultiplier } from '../utils/cropMultipliers';
import { getAnySpriteDataUrl } from '../sprite-v2/compat';
import { getAtomByLabel, readAtomValue, subscribeAtom } from '../core/jotaiBridge';
import { onAdded, onRemoved, watch } from '../utils/dom';
import { formatCoins } from '../utils/formatters';

import { storage } from '../utils/storage';
import { log } from '../utils/logger';
import { getFriendBonusMultiplier, onFriendBonusChange } from '../store/friendBonus';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'qpm.tileValue.v1';
const STYLE_ID = 'qpm-tile-value-style';
const ROW_ATTR = 'data-qpm-tile-value';
const CONTENT_ID_ATTR = 'data-qpm-tile-value-id';
const TOOLTIP_SELECTOR = '.McFlex.css-fsggty';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

interface TileValueConfig {
  enabled: boolean;
}

const DEFAULT_CONFIG: TileValueConfig = { enabled: true };
let config: TileValueConfig = { ...DEFAULT_CONFIG };

function loadConfig(): void {
  const saved = storage.get<TileValueConfig>(STORAGE_KEY, DEFAULT_CONFIG);
  config = { ...DEFAULT_CONFIG, ...saved };
}

export function getTileValueConfig(): TileValueConfig {
  return { ...config };
}

export function setTileValueConfig(updates: Partial<TileValueConfig>): void {
  config = { ...config, ...updates };
  storage.set(STORAGE_KEY, config);
  if (config.enabled) {
    startTileValueIndicator();
  } else {
    stopTileValueIndicator();
  }
}

// ---------------------------------------------------------------------------
// Coin sprite (cached)
// ---------------------------------------------------------------------------

let coinSpriteUrl: string | null | undefined;

function getCoinSpriteUrl(): string | null {
  if (coinSpriteUrl !== undefined) return coinSpriteUrl;
  const url = getAnySpriteDataUrl('sprite/ui/Coin') || getAnySpriteDataUrl('ui/Coin') || null;
  coinSpriteUrl = url;
  return coinSpriteUrl;
}

// ---------------------------------------------------------------------------
// Sell price calculation (pure)
// ---------------------------------------------------------------------------

function findPlantEntry(species: string): ReturnType<typeof getPlantSpecies> {
  // 1. Direct match (exact catalog key)
  const direct = getPlantSpecies(species);
  if (direct?.crop) return direct;

  // 2. Suffix match: atom species may include a variant prefix
  //    e.g. "OrangeTulip" → catalog key "Tulip", "PinkRose" → "Rose"
  //    Find the longest catalog key that matches the end of the species name.
  const speciesLower = species.toLowerCase();
  let bestKey: string | null = null;
  for (const key of getAllPlantSpecies()) {
    const keyLower = key.toLowerCase();
    if (keyLower.length >= speciesLower.length) continue; // must be a proper suffix
    if (speciesLower.endsWith(keyLower)) {
      if (!bestKey || key.length > bestKey.length) bestKey = key;
    }
  }
  if (bestKey) {
    const entry = getPlantSpecies(bestKey);
    if (entry?.crop) return entry;
  }

  return null;
}

function calculateSellPrice(species: string, scale: number, mutations: string[]): number | null {
  if (!areCatalogsReady()) return null;

  const plantEntry = findPlantEntry(species);
  const baseSellPrice = plantEntry?.crop?.baseSellPrice;
  if (typeof baseSellPrice !== 'number' || baseSellPrice <= 0) return null;

  const { totalMultiplier } = computeMutationMultiplier(mutations);
  const basePrice = Math.round(baseSellPrice * scale * totalMultiplier);
  return Math.round(basePrice * getFriendBonusMultiplier());
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    [${ROW_ATTR}] {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      margin-top: 2px;
      pointer-events: none;
    }
    [${ROW_ATTR}] img {
      width: 16px;
      height: 16px;
      image-rendering: pixelated;
      flex-shrink: 0;
    }
    [${ROW_ATTR}] span {
      color: #FFD700;
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 0.02em;
      text-shadow: 0 1px 2px rgba(0,0,0,0.4);
    }
  `.trim();

  document.head.appendChild(style);
}

function removeStyles(): void {
  document.getElementById(STYLE_ID)?.remove();
}

// ---------------------------------------------------------------------------
// DOM injection
// ---------------------------------------------------------------------------

function ensureValueRow(container: Element, price: number, contentId: string): void {
  ensureStyles();

  let row = container.querySelector(`:scope > [${ROW_ATTR}]`) as HTMLElement | null;
  if (!row) {
    row = document.createElement('span');
    row.setAttribute(ROW_ATTR, 'true');

    const coinUrl = getCoinSpriteUrl();
    if (coinUrl) {
      const img = document.createElement('img');
      img.src = coinUrl;
      img.alt = 'coin';
      img.draggable = false;
      row.appendChild(img);
    }

    const text = document.createElement('span');
    row.appendChild(text);

    // Position after other QPM rows (crop size row, Aries value row) if present
    const sizeRow = container.querySelector('[data-qpm-tooltip-row="size"]');
    if (sizeRow) {
      sizeRow.insertAdjacentElement('afterend', row);
    } else {
      const ariesRow = container.querySelector('[data-aries-value-row]');
      if (ariesRow) {
        ariesRow.insertAdjacentElement('afterend', row);
      } else {
        container.appendChild(row);
      }
    }
  }

  // Update text content
  const textEl = row.querySelector('span');
  if (textEl) {
    textEl.textContent = formatCoins(price);
  }
  row.setAttribute(CONTENT_ID_ATTR, contentId);
}

function removeValueRow(root: Element | null): void {
  if (!root) return;
  // Search full subtree — the row may be in a nested container, not a direct child
  root.querySelector(`[${ROW_ATTR}]`)?.remove();
}

// ---------------------------------------------------------------------------
// Current grow slot data (resolved from garden object + selected slot ID)
// ---------------------------------------------------------------------------

interface SlotData {
  species: string;
  targetScale: number;
  mutations: string[];
  slotId: number;
}

let cachedSlotData: SlotData | null = null;
let cachedGardenObject: Record<string, unknown> | null = null;
let cachedSelectedSlotId: number = 0;

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function parseSlotData(raw: unknown): SlotData | null {
  if (!isRecord(raw)) return null;

  const species = raw.species;
  if (typeof species !== 'string' || !species) return null;

  const targetScale = raw.targetScale ?? raw.scale;
  if (typeof targetScale !== 'number') return null;

  const slotId = typeof raw.slotId === 'number' ? raw.slotId : 0;

  const mutations = Array.isArray(raw.mutations)
    ? raw.mutations.filter((m): m is string => typeof m === 'string')
    : [];

  return { species, targetScale, mutations, slotId };
}

/** Resolve the currently selected slot from the garden object + selected slot ID. */
function resolveCurrentSlot(): SlotData | null {
  if (!cachedGardenObject) return null;
  if (cachedGardenObject.objectType !== 'plant') return null;

  const slots = cachedGardenObject.slots;
  if (!Array.isArray(slots) || slots.length === 0) return null;

  // Find slot matching the selected slot ID (C/X key cycling)
  for (const raw of slots) {
    if (!isRecord(raw)) continue;
    if (raw.slotId === cachedSelectedSlotId) {
      return parseSlotData(raw);
    }
  }

  // Fallback: first slot (no match means single-harvest or initial state)
  return parseSlotData(slots[0]);
}

// ---------------------------------------------------------------------------
// Mutation prefix stripping
// ---------------------------------------------------------------------------

const MUTATION_PREFIXES = [
  'Rainbow', 'Gold', 'Golden', 'Frozen', 'Amber', 'Wet', 'Chilled',
  'Dawnlit', 'Dawnbound', 'Amberbound', 'Thunderstruck',
  'Ambershine', 'Ambercharged', 'Dawncharged',
];

function stripMutationPrefix(species: string): string {
  for (const prefix of MUTATION_PREFIXES) {
    if (species.startsWith(prefix + ' ')) {
      return species.slice(prefix.length + 1);
    }
  }
  return species;
}

// ---------------------------------------------------------------------------
// Tooltip watcher
// ---------------------------------------------------------------------------

const cleanups: Array<() => void> = [];
const tooltipWatchers = new Map<Element, { disconnect: () => void }>();
let started = false;

function buildContentId(data: SlotData, price: number): string {
  return `${data.slotId}:${data.targetScale.toFixed(4)}:${price}`;
}

function injectValueIntoTooltip(tooltip: Element): void {
  if (!config.enabled) return;
  if (tooltip.classList.contains('qpm-window') || tooltip.closest('.qpm-window')) return;

  // Atom data is the authority — if no slot data, we're not on a plant tile
  const data = cachedSlotData;
  if (!data) {
    removeValueRow(tooltip);
    return;
  }

  // Find a text element to locate the tooltip content container
  const cropNameElement =
    tooltip.querySelector('p.chakra-text.css-1jc0opy') ??
    tooltip.querySelector('p.chakra-text') ??
    Array.from(tooltip.querySelectorAll('p')).find(p => {
      const text = p.textContent?.trim();
      return text && text.length > 0 && text.length < 50;
    }) ??
    null;

  if (!cropNameElement) {
    removeValueRow(tooltip);
    return;
  }

  const container =
    (cropNameElement.closest('.chakra-stack') as Element | null) ??
    (cropNameElement.parentElement as Element | null) ??
    tooltip;

  // Use atom species directly (no tooltip text matching needed)
  const baseSpecies = stripMutationPrefix(data.species);

  const price = calculateSellPrice(baseSpecies, data.targetScale, data.mutations);
  if (price === null || price <= 0) {
    removeValueRow(container);
    return;
  }

  // Skip if identical content is already rendered (prevents watch→inject loop)
  const contentId = buildContentId(data, price);
  const existing = container.querySelector(`:scope > [${ROW_ATTR}]`);
  if (existing && existing.getAttribute(CONTENT_ID_ATTR) === contentId) {
    return;
  }

  ensureValueRow(container, price, contentId);
}

function reinjectAllTooltips(): void {
  for (const tooltip of tooltipWatchers.keys()) {
    injectValueIntoTooltip(tooltip);
  }
}

function attachTooltipWatcher(tooltip: Element): void {
  if (tooltipWatchers.has(tooltip)) return;

  let rafId: number | null = null;

  const runInjection = () => {
    rafId = null;
    injectValueIntoTooltip(tooltip);
  };

  const scheduleInjection = () => {
    if (rafId !== null) return;
    rafId = window.requestAnimationFrame(runInjection);
  };

  // Initial run
  runInjection();

  const observerHandle = watch(tooltip, scheduleInjection);

  tooltipWatchers.set(tooltip, {
    disconnect: () => {
      observerHandle.disconnect();
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
        rafId = null;
      }
    },
  });
}

function detachTooltipWatcher(tooltip: Element): void {
  const handle = tooltipWatchers.get(tooltip);
  if (handle) {
    handle.disconnect();
    tooltipWatchers.delete(tooltip);
  }
}

// ---------------------------------------------------------------------------
// Atom subscriptions (garden object + selected slot ID)
// ---------------------------------------------------------------------------

const RETRY_DELAY_MS = 2500;
const MAX_RETRIES = 8;
let retryCount = 0;
let retryTimer: number | null = null;

function onSlotDataChanged(): void {
  cachedSlotData = resolveCurrentSlot();
  reinjectAllTooltips();
}

async function startAtomSubscriptions(): Promise<void> {
  // 1. Garden object atom — provides the tile's slots[] array
  //    Aries uses 'myCurrentGardenObjectAtom'; cropSizeIndicator uses 'myOwnCurrentGardenObjectAtom'
  const gardenAtom =
    getAtomByLabel('myCurrentGardenObjectAtom') ??
    getAtomByLabel('myOwnCurrentGardenObjectAtom');

  // 2. Selected slot ID atom — fires on C/X key press
  //    Confirmed findable by instaHarvest.ts
  const slotIdAtom = getAtomByLabel('mySelectedSlotIdAtom');

  if (!gardenAtom) {
    if (retryCount < MAX_RETRIES) {
      retryCount++;
      retryTimer = window.setTimeout(() => {
        retryTimer = null;
        startAtomSubscriptions().catch(() => {});
      }, RETRY_DELAY_MS);
    } else {
      log('💰 ⚠️ Garden object atom not found after retries');
    }
    return;
  }

  log('💰 ✅ Found garden object atom');

  // Read initial values
  try {
    const initial = await readAtomValue<unknown>(gardenAtom);
    cachedGardenObject = isRecord(initial) ? initial : null;
  } catch { /* ignore */ }

  if (slotIdAtom) {
    try {
      const initial = await readAtomValue<unknown>(slotIdAtom);
      cachedSelectedSlotId = typeof initial === 'number' ? initial : 0;
    } catch { /* ignore */ }
    log('💰 ✅ Found mySelectedSlotIdAtom');
  }

  // Resolve initial slot
  cachedSlotData = resolveCurrentSlot();

  // Subscribe to garden object changes (tile change)
  const gardenUnsub = await subscribeAtom(gardenAtom, (value: unknown) => {
    cachedGardenObject = isRecord(value) ? value : null;
    onSlotDataChanged();
  });
  cleanups.push(gardenUnsub);

  // Subscribe to selected slot ID changes (C/X key)
  if (slotIdAtom) {
    const slotIdUnsub = await subscribeAtom(slotIdAtom, (value: unknown) => {
      cachedSelectedSlotId = typeof value === 'number' ? value : 0;
      onSlotDataChanged();
    });
    cleanups.push(slotIdUnsub);
  }
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

function startTileValueIndicator(): void {
  if (started) return;
  started = true;

  log('💰 Tile Value Indicator: Starting');

  // Subscribe to garden object + selected slot ID atoms
  startAtomSubscriptions().catch(() => {});

  // Re-render when friend bonus changes
  const unsubBonus = onFriendBonusChange(() => reinjectAllTooltips());
  cleanups.push(unsubBonus);

  // Watch for tooltip DOM
  const addedHandle = onAdded(TOOLTIP_SELECTOR, attachTooltipWatcher);
  const removedHandle = onRemoved(TOOLTIP_SELECTOR, detachTooltipWatcher);

  cleanups.push(() => {
    addedHandle.disconnect();
    removedHandle.disconnect();
    tooltipWatchers.forEach(handle => handle.disconnect());
    tooltipWatchers.clear();
    if (retryTimer !== null) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  });
}

function stopTileValueIndicator(): void {
  if (!started) return;

  for (const cleanup of cleanups) {
    try { cleanup(); } catch { /* ignore */ }
  }
  cleanups.length = 0;
  cachedSlotData = null;
  cachedGardenObject = null;
  cachedSelectedSlotId = 0;
  retryCount = 0;
  if (retryTimer !== null) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }

  removeStyles();
  started = false;
  log('💰 Tile Value Indicator: Stopped');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function initTileValueIndicator(): void {
  loadConfig();
  if (config.enabled) {
    startTileValueIndicator();
  }
}

export { startTileValueIndicator, stopTileValueIndicator };
