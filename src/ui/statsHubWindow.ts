// src/ui/statsHubWindow.ts
// Garden & Hatch Stats hub window — Garden mutation progress + Eggs hatching history.

import { toggleWindow } from './modalWindow';
import { storage } from '../utils/storage';
import { onGardenSnapshot, getGardenSnapshot, type GardenSnapshot } from '../features/gardenBridge';
import {
  subscribeHatchStats,
  seedLifetimeFromPets,
  type HatchStatsState,
  type HatchEvent,
  type SpeciesCounts,
  type PetSeedInput,
} from '../store/hatchStatsStore';
import { getAtomByLabel, readAtomValue } from '../core/jotaiBridge';
import {
  getMutationMultiplier,
  getMutationCatalog,
  getPlantSpecies,
} from '../catalogs/gameCatalogs';
import { getAbilityDefinition, type AbilityCategory } from '../data/petAbilities';
import {
  getProduceSpriteDataUrlWithMutations,
  getMultiHarvestSpriteDataUrlWithMutations,
  getPetSpriteDataUrl,
  getAnySpriteDataUrl,
} from '../sprite-v2/compat';
import { computeMutationMultiplier, resolveMutation } from '../utils/cropMultipliers';
import { visibleInterval } from '../utils/timerManager';
import { findVariantBadge, getVariantChipColors } from '../data/variantBadges';
import { log } from '../utils/logger';
import { formatCoinsAbbreviated } from '../features/valueCalculator';
import { setStatsHubSpeciesOverride, setStatsHubExcludeMutationsOverride, setStatsHubTileOverride, setStatsHubExcludeMutationsAllMode } from '../features/gardenFilters';
import { lookupMaxScale } from '../utils/plantScales';
import { normalizeSpeciesKey } from '../utils/helpers';

let coinSpriteUrlCache: string | null | undefined;
function getCoinSpriteUrl(): string | null {
  if (coinSpriteUrlCache !== undefined) return coinSpriteUrlCache;
  coinSpriteUrlCache = getAnySpriteDataUrl('sprite/ui/Coin') || getAnySpriteDataUrl('ui/Coin') || null;
  return coinSpriteUrlCache;
}

// ---------------------------------------------------------------------------
// Mutation badge helper — uses variantBadges (canonical in-game colors)
// ---------------------------------------------------------------------------

function mutBadge(mutId: string, grayed = false): HTMLElement {
  const span = document.createElement('span');
  span.style.cssText = [
    'border-radius:4px',
    'padding:2px 7px',
    'font-size:11px',
    'font-weight:700',
    'display:inline-flex',
    'align-items:center',
    'white-space:nowrap',
    'flex-shrink:0',
  ].join(';');

  if (grayed) {
    span.style.cssText += ';background:rgba(255,255,255,0.06);color:rgba(224,224,224,0.28);text-decoration:line-through;';
    span.textContent = mutId;
    return span;
  }

  const badge = findVariantBadge(mutId);
  if (badge?.gradient) {
    span.style.background = badge.gradient;
    span.style.color = '#111';
  } else if (badge?.color) {
    span.style.background = badge.color + '33'; // 20% opacity bg
    span.style.color = badge.color;
    span.style.border = `1px solid ${badge.color}66`;
  } else {
    const { bg, text } = getVariantChipColors(mutId, true);
    span.style.background = bg;
    span.style.color = text;
  }

  span.textContent = mutId;
  return span;
}

// ---------------------------------------------------------------------------
// Sprite helper — renders as <img> with proper aspect ratio
// ---------------------------------------------------------------------------

function makeSprite(dataUrl: string, size: number): HTMLImageElement {
  const img = document.createElement('img');
  img.src = dataUrl;
  img.alt = '';
  img.style.cssText = [
    `width:${size}px`,
    `height:${size}px`,
    'object-fit:contain',
    'image-rendering:pixelated',
    'display:block',
    'flex-shrink:0',
  ].join(';');
  return img;
}

/**
 * Render a plant sprite.
 * isMultiHarvest=false → plant-first lookup (shows bush/tree sprite).
 * isMultiHarvest=true  → crop-first lookup (shows fruit sprite; used in slot detail popover).
 */
function plantSprite(species: string, mutations: string[], size: number, isMultiHarvest = false): HTMLElement {
  const wrap = document.createElement('div');
  wrap.style.cssText = `width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;flex-shrink:0;`;
  try {
    // Multi-harvest card tiles show the plant/bush (plant-first); individual slot popovers show the fruit (crop-first).
    const url = isMultiHarvest
      ? getMultiHarvestSpriteDataUrlWithMutations(species, mutations)
      : getProduceSpriteDataUrlWithMutations(species, mutations);
    if (url) {
      wrap.appendChild(makeSprite(url, size));
      return wrap;
    }
  } catch { /* fall through */ }
  wrap.textContent = '🌱';
  (wrap as HTMLElement).style.fontSize = `${Math.round(size * 0.55)}px`;
  return wrap;
}

function petSprite(species: string, size: number): HTMLElement {
  const wrap = document.createElement('div');
  wrap.style.cssText = `width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;flex-shrink:0;`;
  try {
    const url = getPetSpriteDataUrl(species);
    if (url) {
      wrap.appendChild(makeSprite(url, size));
      return wrap;
    }
  } catch { /* fall through */ }
  wrap.textContent = '🥚';
  (wrap as HTMLElement).style.fontSize = `${Math.round(size * 0.55)}px`;
  return wrap;
}

// ---------------------------------------------------------------------------
// Rarity styling
// ---------------------------------------------------------------------------

const RAINBOW_GRADIENT = 'linear-gradient(90deg,#e11d48,#f97316,#eab308,#22c55e,#3b82f6,#a855f7)';

function rarityBadgeStyle(rarity: 'normal' | 'gold' | 'rainbow'): string {
  const styles: Record<string, string> = {
    normal: 'background:rgba(255,255,255,0.1);color:rgba(224,224,224,0.65)',
    gold: 'background:#ffd600;color:#111',
    rainbow: `background:${RAINBOW_GRADIENT};color:#fff`,
  };
  return [
    styles[rarity] ?? styles.normal,
    'border-radius:4px',
    'padding:1px 6px',
    'font-size:10px',
    'font-weight:700',
    'white-space:nowrap',
    'text-transform:capitalize',
  ].join(';');
}

// ---------------------------------------------------------------------------
// Ability category colors
// ---------------------------------------------------------------------------

const ABILITY_CATEGORY_COLORS: Record<AbilityCategory, string> = {
  plantGrowth: '#66bb6a',
  eggGrowth:   '#ab47bc',
  xp:          '#42a5f5',
  coins:       '#ffd600',
  misc:        '#78909c',
};

// ---------------------------------------------------------------------------
// Time helpers
// ---------------------------------------------------------------------------

function formatAge(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

function timeAgo(ts: number): string {
  return formatAge(Date.now() - ts) + ' ago';
}

// ---------------------------------------------------------------------------
// Pill button style
// ---------------------------------------------------------------------------

function pillBtnCss(active: boolean): string {
  return [
    'padding:5px 11px',
    'border-radius:20px',
    'font-size:12px',
    'font-weight:600',
    'cursor:pointer',
    'border:1px solid',
    'transition:background 0.12s,border-color 0.12s',
    active
      ? 'background:rgba(143,130,255,0.25);border-color:rgba(143,130,255,0.6);color:#c8c0ff'
      : 'background:rgba(255,255,255,0.04);border-color:rgba(255,255,255,0.12);color:rgba(224,224,224,0.55)',
  ].join(';');
}

// ---------------------------------------------------------------------------
// Mutation compatibility — faithfully models game's updateMutationList.ts
// ---------------------------------------------------------------------------

// Canonical lowercase names for each mutation tier (after resolveMutation normalization)
const BASE_WATER_MUTS     = new Set(['wet', 'chilled']);
const UPGRADED_WATER_MUTS = new Set(['frozen']);
const UPGRADED_DAWN_MUTS  = new Set(['dawncharged']); // display: Dawnbound
const UPGRADED_AMBER_MUTS = new Set(['ambercharged']); // display: Amberbound

/** Resolve any display name or alias to its canonical lowercase name. */
const normalizeCanonical = (m: string): string =>
  resolveMutation(m)?.name.toLowerCase() ?? m.toLowerCase();

/**
 * Alias-aware comparison: 'Dawnbound' matches 'Dawncharged', 'Amberlit' matches 'Ambershine', etc.
 */
function mutsMatch(a: string, b: string): boolean {
  if (a.toLowerCase() === b.toLowerCase()) return true;
  const defA = resolveMutation(a);
  const defB = resolveMutation(b);
  return !!(defA && defB && defA.name === defB.name);
}

/**
 * Returns true if `mutationName` can be applied to a slot with `existingCanonical` mutations.
 * `existingCanonical` must be an array of canonical lowercase names.
 * Directly mirrors game's updateMutationList.ts switch/return logic.
 *
 * Key upgrade paths allowed by the game:
 *   Dawnlit → Dawnbound (Dawncharged replaces Dawnlit)
 *   Amberlit (Ambershine) → Amberbound (Ambercharged replaces Ambershine)
 *   Wet + Chilled → Frozen (adding either base water when the other exists upgrades to Frozen)
 */
function canApplyMutation(mutationName: string, existingCanonical: string[]): boolean {
  const ml = normalizeCanonical(mutationName);
  if (existingCanonical.includes(ml)) return false; // Already has it

  switch (ml) {
    case 'wet':
    case 'chilled':
      // Blocked by Frozen or Thunderstruck
      return !existingCanonical.includes('frozen') && !existingCanonical.includes('thunderstruck');
    case 'frozen':
      // Blocked by Thunderstruck or existing Frozen
      return !existingCanonical.includes('thunderstruck') && !existingCanonical.includes('frozen');
    case 'thunderstruck':
      // Blocked by any water mutation (Wet, Chilled, or Frozen)
      return !existingCanonical.some((m) => BASE_WATER_MUTS.has(m) || UPGRADED_WATER_MUTS.has(m));
    case 'dawnlit':
    case 'ambershine':
      // Base sun/moon: blocked by ANY existing sun/moon (base or upgraded)
      return !existingCanonical.some(
        (m) => m === 'dawnlit' || m === 'ambershine' || UPGRADED_DAWN_MUTS.has(m) || UPGRADED_AMBER_MUTS.has(m),
      );
    case 'dawncharged':
      // Upgrade from Dawnlit is allowed (Dawnlit will be replaced).
      // Blocked by: any upgraded sun/moon, OR Ambershine (wrong sun/moon base).
      return (
        !existingCanonical.some((m) => UPGRADED_DAWN_MUTS.has(m) || UPGRADED_AMBER_MUTS.has(m)) &&
        !existingCanonical.includes('ambershine')
      );
    case 'ambercharged':
      // Upgrade from Ambershine is allowed (Ambershine will be replaced).
      // Blocked by: any upgraded sun/moon, OR Dawnlit (wrong sun/moon base).
      return (
        !existingCanonical.some((m) => UPGRADED_DAWN_MUTS.has(m) || UPGRADED_AMBER_MUTS.has(m)) &&
        !existingCanonical.includes('dawnlit')
      );
    case 'rainbow':
    case 'gold':
      // Only one growth mutation allowed
      return !existingCanonical.some((m) => m === 'rainbow' || m === 'gold');
    default:
      return true; // Unknown mutation — don't block
  }
}

/**
 * Simulate the resulting canonical mutation list after applying `toAdd` in sequence.
 * Handles game upgrade mechanics:
 *   Wet + Chilled → Frozen  (adding either base water when the other exists)
 *   Dawnlit → Dawnbound     (Dawncharged replaces Dawnlit)
 *   Amberlit → Amberbound   (Ambercharged replaces Ambershine)
 * Returns canonical lowercase names so they work with computeMutationMultiplier.
 */
function simulateMutationsAfterApplying(existing: string[], toAdd: string[]): string[] {
  let state = existing.map(normalizeCanonical);
  for (const m of toAdd) {
    const ml = normalizeCanonical(m);
    if (!canApplyMutation(m, state)) continue;
    switch (ml) {
      case 'wet':
        state = state.includes('chilled')
          ? [...state.filter((e) => e !== 'chilled'), 'frozen']
          : [...state, 'wet'];
        break;
      case 'chilled':
        state = state.includes('wet')
          ? [...state.filter((e) => e !== 'wet'), 'frozen']
          : [...state, 'chilled'];
        break;
      case 'frozen':
        state = [...state.filter((e) => !BASE_WATER_MUTS.has(e)), 'frozen'];
        break;
      case 'dawncharged':
        state = [...state.filter((e) => e !== 'dawnlit'), 'dawncharged'];
        break;
      case 'ambercharged':
        state = [...state.filter((e) => e !== 'ambershine'), 'ambercharged'];
        break;
      default:
        state = [...state, ml];
    }
  }
  return state;
}

/**
 * Filter `toAdd` mutations to only those that can be applied to `existing` mutations.
 * Correctly handles upgrade paths (Dawnlit plant CAN receive Dawnbound; Chilled plant CAN receive Wet).
 * Resolves intra-`toAdd` conflicts sequentially (first compatible wins).
 */
function filterCompatibleMutations(existing: string[], toAdd: string[]): string[] {
  let state = existing.map(normalizeCanonical);
  const result: string[] = [];
  for (const m of toAdd) {
    if (canApplyMutation(m, state)) {
      result.push(m);
      state = simulateMutationsAfterApplying(state, [m]);
    }
  }
  return result;
}

/**
 * Returns true if at least one slot in the tile can receive at least one of the selected mutations.
 * Used to determine whether a tile belongs in "Remaining" vs "Complete/N/A".
 */
function isTileActionable(tile: TileEntry, selected: string[]): boolean {
  if (selected.length === 0) return false;
  return tile.slots.some((slot) => {
    const slotMissing = selected.filter((sel) => !slot.mutations.some((m) => mutsMatch(m, sel)));
    return filterCompatibleMutations(slot.mutations, slotMissing).length > 0;
  });
}

/**
 * Sum of fruitCount across all slots that can still receive at least one selected mutation.
 * For multi-harvest crops (e.g. Moonbinder with 3 pods), each actionable pod contributes its
 * fruitCount rather than the whole tile counting as 1.
 */
function countActionableFruits(tiles: TileEntry[], selected: string[]): number {
  if (selected.length === 0) return tiles.reduce((s, t) => s + tileFruitCount(t), 0);
  let total = 0;
  for (const tile of tiles) {
    for (const slot of tile.slots) {
      const slotMissing = selected.filter((sel) => !slot.mutations.some((m) => mutsMatch(m, sel)));
      if (filterCompatibleMutations(slot.mutations, slotMissing).length > 0) {
        total += slot.fruitCount;
      }
    }
  }
  return total;
}

/** Fruitcount of slots that haven't yet reached max size. */
function countMaxSizeRemainingFruits(tiles: TileEntry[]): number {
  return tiles.reduce(
    (s, t) => s + t.slots.reduce((ss, sl) => ss + (sl.sizePercent < 100 ? sl.fruitCount : 0), 0),
    0,
  );
}

// ---------------------------------------------------------------------------
// Garden: tile grouping
// ---------------------------------------------------------------------------

interface SlotEntry {
  species: string;
  mutations: string[];
  endTime: number | null;
  fruitCount: number;
  /** In-garden targetScale (becomes scale at harvest). Defaults to 1 if absent. */
  targetScale: number;
  /** Species-specific maximum scale (from slot data, catalog lookup, or 2.0 fallback). */
  maxScale: number;
  /** Size percent 50–100, where 100 = max size (targetScale >= maxScale for this species). */
  sizePercent: number;
}

interface TileEntry {
  tileKey: string;
  plantedAt: number | null;
  slots: SlotEntry[];
}

function extractTiles(snapshot: GardenSnapshot): TileEntry[] {
  if (!snapshot) return [];
  const tiles: TileEntry[] = [];
  const collections: Array<[Record<string, unknown> | undefined, string]> = [
    [snapshot.tileObjects as Record<string, unknown> | undefined, 'g'],
    [snapshot.boardwalkTileObjects as Record<string, unknown> | undefined, 'b'],
  ];

  for (const [col, prefix] of collections) {
    if (!col || typeof col !== 'object') continue;
    for (const [tileKey, rawTile] of Object.entries(col)) {
      if (!rawTile || typeof rawTile !== 'object') continue;
      const tile = rawTile as Record<string, unknown>;
      if (tile.objectType !== 'plant') continue;

      const plantedAt = typeof tile.plantedAt === 'number' ? tile.plantedAt : null;
      const rawSlots = Array.isArray(tile.slots) ? tile.slots : [];
      const slots: SlotEntry[] = [];

      if (rawSlots.length === 0) {
        // Simple tile without slots array
        const species = typeof tile.species === 'string' ? tile.species : null;
        if (species) {
          const mutationsRaw = Array.isArray(tile.mutations) ? tile.mutations : [];
          const mutations = (mutationsRaw as unknown[]).filter((v): v is string => typeof v === 'string');
          const endTime = typeof tile.maturedAt === 'number' ? tile.maturedAt :
                         typeof tile.endTime === 'number' ? tile.endTime : null;
          slots.push({ species, mutations, endTime, fruitCount: 1, targetScale: 1, maxScale: 2.0, sizePercent: 50 });
        }
      } else {
        for (const rawSlot of rawSlots) {
          if (!rawSlot || typeof rawSlot !== 'object') continue;
          const slot = rawSlot as Record<string, unknown>;
          const species = typeof slot.species === 'string' ? slot.species : null;
          if (!species) continue;
          const rawSlotMuts = Array.isArray(slot.mutations) ? slot.mutations : [];
          const rawTileMuts = Array.isArray(tile.mutations) ? tile.mutations : [];
          const mutationsRaw = rawSlotMuts.length > 0 ? rawSlotMuts : rawTileMuts;
          const mutations = (mutationsRaw as unknown[]).filter((v): v is string => typeof v === 'string');
          const endTimeRaw = slot.endTime ?? slot.readyAt ?? slot.harvestReadyAt;
          const endTime = typeof endTimeRaw === 'number' ? endTimeRaw :
                         (endTimeRaw != null ? Number(endTimeRaw) : null);
          // Fruit count for multi-harvest
          const fruitKeys = ['fruitCount','remainingFruitCount','remainingFruits','totalFruitCount','totalFruits','totalFruit'];
          let fruitCount = 1;
          for (const k of fruitKeys) {
            const v = Number(slot[k]);
            if (Number.isFinite(v) && v >= 1) { fruitCount = Math.min(v, 64); break; }
          }
          const targetScaleRaw = typeof slot.targetScale === 'number' ? slot.targetScale : 1;
          const targetScale = targetScaleRaw > 0 ? targetScaleRaw : 1;
          // Resolve maxScale: slot field → catalog lookup → hardcoded fallback
          const slotMaxScaleRaw = slot.maxScale ?? slot.targetMaxScale ?? slot.maxTargetScale;
          const slotMaxScale = typeof slotMaxScaleRaw === 'number' && slotMaxScaleRaw > 1 ? slotMaxScaleRaw : null;
          const catalogMaxScale = slotMaxScale ?? lookupMaxScale(normalizeSpeciesKey(species));
          const maxScale = catalogMaxScale !== null ? catalogMaxScale : 2.0;
          const clamped = Math.min(Math.max(targetScale, 1), maxScale);
          const ratio = maxScale > 1 ? (clamped - 1) / (maxScale - 1) : 1;
          const sizePercent = 50 + ratio * 50;
          slots.push({ species, mutations, endTime, fruitCount, targetScale, maxScale, sizePercent });
        }
      }

      if (slots.length > 0) {
        tiles.push({ tileKey: `${prefix}:${tileKey}`, plantedAt, slots });
      }
    }
  }
  return tiles;
}

/** Representative species for a tile (first slot's species) */
function tileSpecies(tile: TileEntry): string {
  return tile.slots[0]?.species ?? 'Unknown';
}

/** Union of all mutations across all slots of a tile */
function tileMutations(tile: TileEntry): string[] {
  const all = new Set<string>();
  for (const slot of tile.slots) {
    for (const m of slot.mutations) all.add(m);
  }
  return Array.from(all);
}

/** Total fruit count across slots */
function tileFruitCount(tile: TileEntry): number {
  return tile.slots.reduce((s, slot) => s + slot.fruitCount, 0);
}

/** Current sell value of a tile (all slots × base × multiplier) */
function tileValue(tile: TileEntry): number {
  try {
    const plantSpec = getPlantSpecies(tileSpecies(tile));
    const base = typeof plantSpec?.crop?.baseSellPrice === 'number' ? plantSpec.crop.baseSellPrice : 0;
    if (base <= 0) return 0;
    return tile.slots.reduce((sum, slot) => {
      return sum + Math.round(base * slot.targetScale * computeMutationMultiplier(slot.mutations).totalMultiplier);
    }, 0);
  } catch { return 0; }
}

/**
 * Convert a list of TileEntry objects to global tile indices (x + y * cols).
 * Used to drive the per-tile garden highlight override.
 */
function tilesToKeys(tiles: TileEntry[]): string[] {
  return tiles.map(t => t.tileKey);
}

// ---------------------------------------------------------------------------
// Floating popover — used for tile slot detail on multi-harvest cards
// ---------------------------------------------------------------------------

let _activePopover: HTMLElement | null = null;
let _popoverCleanup: (() => void) | null = null;

function closePopover(): void {
  _activePopover?.remove();
  _activePopover = null;
  _popoverCleanup?.();
  _popoverCleanup = null;
}

function openPopover(anchor: HTMLElement, content: HTMLElement): void {
  closePopover();

  const pop = document.createElement('div');
  pop.style.cssText = [
    'position:fixed',
    'z-index:99999',
    'background:rgba(14,16,22,0.98)',
    'border:1px solid rgba(143,130,255,0.45)',
    'border-radius:10px',
    'padding:10px 12px',
    'min-width:180px',
    'max-width:260px',
    'box-shadow:0 8px 32px rgba(0,0,0,0.7)',
    'backdrop-filter:blur(6px)',
  ].join(';');
  pop.appendChild(content);
  document.body.appendChild(pop);
  _activePopover = pop;

  // Position: prefer below-right of anchor, flip if near viewport edge
  const r = anchor.getBoundingClientRect();
  const gap = 8;
  const popW = 260;
  const spaceBelow = window.innerHeight - r.bottom;
  const spaceRight = window.innerWidth - r.right;

  pop.style.top  = spaceBelow >= 120 ? `${r.bottom + gap}px` : '';
  pop.style.bottom = spaceBelow < 120 ? `${window.innerHeight - r.top + gap}px` : '';
  pop.style.left  = spaceRight >= popW ? `${r.left}px` : '';
  pop.style.right = spaceRight < popW ? `${window.innerWidth - r.right}px` : '';

  const onOutside = (e: MouseEvent) => {
    if (!pop.contains(e.target as Node) && !anchor.contains(e.target as Node)) {
      closePopover();
    }
  };
  const onEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape') closePopover();
  };

  // Slight delay so this click doesn't immediately close the popover
  const t = setTimeout(() => {
    document.addEventListener('click', onOutside, true);
    document.addEventListener('keydown', onEscape);
  }, 0);

  _popoverCleanup = () => {
    clearTimeout(t);
    document.removeEventListener('click', onOutside, true);
    document.removeEventListener('keydown', onEscape);
  };
}

// ---------------------------------------------------------------------------
// Garden: tile card
// ---------------------------------------------------------------------------

function buildSlotDetailContent(tile: TileEntry, selectedMutations: string[] = []): HTMLElement {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;flex-direction:column;gap:6px;';

  // When filtering, only show slots that are missing at least one compatible filter mutation
  const visibleSlots = selectedMutations.length === 0
    ? tile.slots
    : tile.slots.filter((slot) => {
        const missing = selectedMutations.filter((sel) => !slot.mutations.some((m) => mutsMatch(m, sel)));
        return filterCompatibleMutations(slot.mutations, missing).length > 0;
      });

  const title = document.createElement('div');
  title.style.cssText = 'font-size:11px;font-weight:700;color:rgba(224,224,224,0.55);margin-bottom:2px;';
  title.textContent = selectedMutations.length > 0
    ? `${visibleSlots.length} of ${tile.slots.length} slot${tile.slots.length > 1 ? 's' : ''} eligible`
    : `${tile.slots.length} slot${tile.slots.length > 1 ? 's' : ''}`;
  wrap.appendChild(title);

  if (visibleSlots.length === 0) {
    const none = document.createElement('div');
    none.style.cssText = 'font-size:11px;color:rgba(224,224,224,0.3);padding:2px 0;';
    none.textContent = 'All slots already have the selected mutations.';
    wrap.appendChild(none);
    return wrap;
  }

  for (const slot of visibleSlots) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:flex-start;gap:8px;';
    row.appendChild(plantSprite(slot.species, slot.mutations, 32, true));

    const info = document.createElement('div');
    info.style.cssText = 'flex:1;min-width:0;';

    const nameEl = document.createElement('div');
    nameEl.style.cssText = 'font-size:11px;color:#e0e0e0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
    nameEl.textContent = slot.fruitCount > 1 ? `${slot.species} ×${slot.fruitCount}` : slot.species;
    info.appendChild(nameEl);

    if (slot.mutations.length > 0) {
      const mutRow = document.createElement('div');
      mutRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:2px;margin-top:3px;';
      for (const m of slot.mutations) {
        const b = mutBadge(m);
        b.style.fontSize = '9px';
        b.style.padding = '1px 5px';
        mutRow.appendChild(b);
      }
      info.appendChild(mutRow);
    }

    // Current slot value (always shown)
    try {
      const plantSpec = getPlantSpecies(slot.species);
      const baseSell = typeof plantSpec?.crop?.baseSellPrice === 'number' ? plantSpec.crop.baseSellPrice : 0;
      if (baseSell > 0) {
        const slotVal = Math.round(baseSell * slot.targetScale * computeMutationMultiplier(slot.mutations).totalMultiplier);
        if (slotVal > 0) {
          const valEl = makeCoinValueEl(slotVal, '', 'font-size:10px;color:rgba(255,215,0,0.7);margin-top:3px;');
          info.appendChild(valEl);
        }

        // Per-slot gain hint — only when a mutation filter is active and slot is missing it
        if (selectedMutations.length > 0) {
          const missing = selectedMutations.filter(
            (sel) => !slot.mutations.some((m) => mutsMatch(m, sel)),
          );
          if (missing.length > 0) {
            const toAdd = filterCompatibleMutations(slot.mutations, missing);
            if (toAdd.length > 0) {
              const withMissing = simulateMutationsAfterApplying(slot.mutations, toAdd);
              const potentialVal = Math.round(baseSell * slot.targetScale * computeMutationMultiplier(withMissing).totalMultiplier);
              const slotGain = potentialVal - slotVal;
              if (slotGain > 0) {
                info.appendChild(makeWhenCompleteHint(slotGain, 'margin-top:2px;'));
              }
            }
          }
        }
      }
    } catch { /* ignore */ }

    row.appendChild(info);
    wrap.appendChild(row);
  }
  return wrap;
}

function buildTileCard(
  tile: TileEntry,
  selectedMutations: string[],
  isComplete: boolean,
  tileFilter: { active: boolean; onFilter: () => void } = { active: false, onFilter: () => {} },
): HTMLElement {
  const species = tileSpecies(tile);
  const mutations = tileMutations(tile);
  const fruitCount = tileFruitCount(tile);
  const isMulti = tile.slots.length > 1 || fruitCount > 1;

  const outer = document.createElement('div');
  outer.style.cssText = [
    'display:flex',
    'flex-direction:column',
    'align-items:center',
    'border-radius:10px',
    'border:1px solid rgba(143,130,255,0.14)',
    'background:rgba(255,255,255,0.03)',
    'overflow:hidden',
    'width:100%',   // fills the CSS grid cell — grid sets column width
    'cursor:pointer',
    'transition:border-color 0.12s,background 0.12s,box-shadow 0.12s',
  ].join(';');

  if (tileFilter.active) {
    outer.style.borderColor = 'rgba(143,130,255,0.6)';
    outer.style.background = 'rgba(143,130,255,0.1)';
    outer.style.boxShadow = '0 0 0 2px rgba(143,130,255,0.35)';
  }

  outer.addEventListener('mouseenter', () => {
    if (!tileFilter.active) {
      outer.style.borderColor = 'rgba(143,130,255,0.35)';
      outer.style.background = 'rgba(143,130,255,0.07)';
    }
  });
  outer.addEventListener('mouseleave', () => {
    if (!tileFilter.active) {
      outer.style.borderColor = 'rgba(143,130,255,0.14)';
      outer.style.background = 'rgba(255,255,255,0.03)';
    }
  });
  // Single-harvest cards: full card click = highlight toggle in stats window (no in-game garden filter)
  if (!isMulti) {
    outer.addEventListener('click', (e) => {
      e.stopPropagation();
      tileFilter.onFilter();
    });
  }

  // Store earliest ready time for live badge updates
  const earliestReady = tile.slots.reduce<number>(
    (min, s) => s.endTime !== null && s.endTime < min ? s.endTime : min,
    Infinity,
  );
  if (Number.isFinite(earliestReady)) {
    outer.dataset.readyAt = String(earliestReady);
  }

  // Card content
  const header = document.createElement('div');
  header.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:5px;padding:10px 8px;text-align:center;';

  // Ready badge — set initial state immediately so it doesn't flash on render
  const readyBadge = document.createElement('div');
  readyBadge.dataset.readyBadge = '1';
  const isAlreadyReady = Number.isFinite(earliestReady) && earliestReady <= Date.now();
  readyBadge.style.cssText = [
    isAlreadyReady ? 'display:flex' : 'display:none',
    'align-items:center',
    'gap:4px',
    'padding:2px 8px',
    'border-radius:20px',
    'font-size:10px',
    'font-weight:700',
    'background:rgba(74,222,128,0.18)',
    'border:1px solid rgba(74,222,128,0.45)',
    'color:#4ade80',
    'white-space:nowrap',
  ].join(';');
  readyBadge.textContent = '✓ Ready';
  header.appendChild(readyBadge);

  // Sprite: use plant-first (bush/tree) for the tile card.
  // Individual slot popovers use crop-first (fruit) — see buildSlotDetailContent.
  header.appendChild(plantSprite(species, mutations, 56, false));

  const nameEl = document.createElement('div');
  nameEl.style.cssText = 'font-size:11px;font-weight:600;color:#e0e0e0;word-break:break-word;';
  nameEl.textContent = species;
  header.appendChild(nameEl);

  if (isMulti) {
    const countEl = document.createElement('div');
    countEl.style.cssText = 'font-size:10px;font-weight:600;color:rgba(143,130,255,0.75);';
    countEl.textContent = `×${fruitCount} slots · tap`;
    header.appendChild(countEl);
  }

  // Tile value
  const val = tileValue(tile);
  if (val > 0) {
    const valEl = makeCoinValueEl(val, '', 'font-size:10px;color:rgba(255,215,0,0.65);');
    header.appendChild(valEl);
  }

  if (mutations.length > 0) {
    const mutRow = document.createElement('div');
    mutRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:3px;justify-content:center;';
    for (const m of mutations) mutRow.appendChild(mutBadge(m));
    header.appendChild(mutRow);
  }

  if (!isComplete && selectedMutations.length > 0) {
    const missing = selectedMutations.filter(
      (sel) => !mutations.some((m) => mutsMatch(m, sel)),
    );
    if (missing.length > 0) {
      const misRow = document.createElement('div');
      misRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:3px;justify-content:center;';
      for (const m of missing) misRow.appendChild(mutBadge(m, true));
      header.appendChild(misRow);

      try {
        const plantSpec = getPlantSpecies(species);
        const baseSell = typeof plantSpec?.crop?.baseSellPrice === 'number' ? plantSpec.crop.baseSellPrice : 0;
        if (baseSell > 0) {
          // Sum the proper multiplier differential across every slot (accounts for existing mutations + multi-slot)
          let gain = 0;
          for (const slotData of tile.slots) {
            const currentMult = computeMutationMultiplier(slotData.mutations).totalMultiplier;
            const slotMissing = missing.filter(
              (sel) => !slotData.mutations.some((m) => mutsMatch(m, sel)),
            );
            const toAdd = filterCompatibleMutations(slotData.mutations, slotMissing);
            if (toAdd.length === 0) continue;
            // Use game's upgrade mechanics for accurate value (e.g. Dawnlit→Dawnbound removes Dawnlit)
            const withAll = simulateMutationsAfterApplying(slotData.mutations, toAdd);
            const potentialMult = computeMutationMultiplier(withAll).totalMultiplier;
            gain += Math.round(baseSell * slotData.targetScale * potentialMult) - Math.round(baseSell * slotData.targetScale * currentMult);
          }
          if (gain > 0) {
            header.appendChild(makeWhenCompleteHint(gain));
          }
        }
      } catch { /* ignore */ }
    }
  }

  // Multi-harvest: small garden filter button in header corner
  if (isMulti) {
    header.style.position = 'relative';
    const filterBtn = document.createElement('button');
    filterBtn.type = 'button';
    filterBtn.title = tileFilter.active ? 'Clear garden filter' : 'Filter garden to this species';
    filterBtn.textContent = '◎';
    filterBtn.style.cssText = [
      'position:absolute', 'top:4px', 'right:4px',
      'background:none', 'border:none', 'cursor:pointer',
      'font-size:11px', 'padding:2px', 'line-height:1',
      tileFilter.active ? 'opacity:1;color:#8f82ff' : 'opacity:0.3;color:inherit',
    ].join(';');
    filterBtn.addEventListener('mouseenter', () => { filterBtn.style.opacity = '0.8'; });
    filterBtn.addEventListener('mouseleave', () => { filterBtn.style.opacity = tileFilter.active ? '1' : '0.3'; });
    filterBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      tileFilter.onFilter();
    });
    header.appendChild(filterBtn);
  }

  outer.appendChild(header);

  // Multi-harvest: open floating popover on click
  if (isMulti) {
    outer.addEventListener('click', (e) => {
      e.stopPropagation();
      // If this card's popover is already open, close it
      if (_activePopover && outer.dataset.popoverOpen === '1') {
        closePopover();
        outer.dataset.popoverOpen = '0';
        return;
      }
      outer.dataset.popoverOpen = '1';
      const prev = _popoverCleanup;
      openPopover(outer, buildSlotDetailContent(tile, selectedMutations));
      // Track when our popover closes
      const origCleanup = _popoverCleanup;
      _popoverCleanup = () => {
        outer.dataset.popoverOpen = '0';
        origCleanup?.();
        prev?.();
      };
    });
  }

  return outer;
}

// ---------------------------------------------------------------------------
// Garden value computation
// ---------------------------------------------------------------------------

function computeGardenValue(
  tiles: TileEntry[],
  selectedMutations: string[],
  maxSizeOnly = false,
): { current: number; potential: number } {
  let current = 0;
  let potential = 0;
  for (const tile of tiles) {
    const plantSpec = getPlantSpecies(tileSpecies(tile));
    const base = typeof plantSpec?.crop?.baseSellPrice === 'number'
      ? plantSpec.crop.baseSellPrice : 0;
    if (base <= 0) continue;

    // Tiles where no mutations can be applied contribute no gain.
    const tileIsComplete = selectedMutations.length > 0 ? !isTileActionable(tile, selectedMutations) : true;

    for (const slot of tile.slots) {
      const mutMult = computeMutationMultiplier(slot.mutations).totalMultiplier;
      const slotCurrent = Math.round(base * slot.targetScale * mutMult);
      current += slotCurrent;

      // Scale potential: use maxScale if filter active and slot hasn't reached it yet
      const potentialScale = (maxSizeOnly && slot.sizePercent < 100) ? slot.maxScale : slot.targetScale;

      // Mutation potential: add all compatible selected mutations the slot is still missing
      let potentialMutMult = mutMult;
      if (selectedMutations.length > 0 && !tileIsComplete) {
        const slotMissing = selectedMutations.filter(
          (sel) => !slot.mutations.some((m) => mutsMatch(m, sel)),
        );
        const toAdd = filterCompatibleMutations(slot.mutations, slotMissing);
        const withSelected = simulateMutationsAfterApplying(slot.mutations, toAdd);
        potentialMutMult = computeMutationMultiplier(withSelected).totalMultiplier;
      }

      // Combined: full potential is max scale × best reachable mutation set
      potential += Math.round(base * potentialScale * potentialMutMult);
    }
  }
  return { current, potential };
}

// ---------------------------------------------------------------------------
// Coin value inline element (module scope — used in tile cards + value bar)
// ---------------------------------------------------------------------------

function makeCoinValueEl(coins: number, prefix: string, cssExtra: string): HTMLElement {
  const wrap = document.createElement('span');
  wrap.style.cssText = `display:inline-flex;align-items:center;gap:3px;${cssExtra}`;
  wrap.title = `${prefix ? prefix + ' ' : ''}${coins.toLocaleString()}`;

  const coinUrl = getCoinSpriteUrl();
  if (coinUrl) {
    const img = document.createElement('img');
    img.src = coinUrl;
    img.alt = '';
    img.style.cssText = 'width:13px;height:13px;image-rendering:pixelated;flex-shrink:0;vertical-align:middle;';
    wrap.appendChild(img);
  } else {
    const dollar = document.createElement('span');
    dollar.textContent = '$';
    wrap.appendChild(dollar);
  }

  const numEl = document.createElement('span');
  numEl.style.fontWeight = '700';
  numEl.textContent = `${prefix ? prefix + ' ' : ''}${formatCoinsAbbreviated(coins)}`;
  wrap.appendChild(numEl);
  return wrap;
}

/** "+X when complete" hint element — coin sprite + abbreviated value, tight spacing. */
function makeWhenCompleteHint(gain: number, extraCss = ''): HTMLElement {
  const el = document.createElement('span');
  el.style.cssText = `display:inline-flex;align-items:center;gap:2px;font-size:10px;font-weight:700;color:#FFD700;${extraCss}`;
  el.title = `+${gain.toLocaleString()} when complete`;
  const url = getCoinSpriteUrl();
  if (url) {
    const img = document.createElement('img');
    img.src = url;
    img.alt = '';
    img.style.cssText = 'width:11px;height:11px;image-rendering:pixelated;flex-shrink:0;';
    el.appendChild(img);
  }
  const txt = document.createElement('span');
  txt.textContent = `+${formatCoinsAbbreviated(gain)} when complete`;
  el.appendChild(txt);
  return el;
}

// ---------------------------------------------------------------------------
// Garden: toggle switch helper
// ---------------------------------------------------------------------------

function buildToggleSwitch(active: boolean, onChange: (active: boolean) => void, toggleLabel = 'Filter garden'): HTMLElement {
  const label = document.createElement('label');
  label.style.cssText = 'display:inline-flex;align-items:center;gap:6px;cursor:pointer;font-size:10px;color:rgba(224,224,224,0.45);';
  label.title = 'Show/hide these crops in the game garden';

  const track = document.createElement('div');
  const applyTrack = (on: boolean) => {
    track.style.cssText = [
      'width:28px', 'height:16px', 'border-radius:8px',
      'position:relative', 'transition:background 0.15s',
      on ? 'background:#8f82ff' : 'background:rgba(255,255,255,0.12)',
    ].join(';');
  };

  const thumb = document.createElement('div');
  const applyThumb = (on: boolean) => {
    thumb.style.cssText = [
      'width:12px', 'height:12px', 'border-radius:50%',
      'background:#fff', 'position:absolute', 'top:2px',
      'transition:left 0.15s',
      on ? 'left:14px' : 'left:2px',
    ].join(';');
  };

  let state = active;
  applyTrack(state);
  applyThumb(state);
  track.appendChild(thumb);
  label.appendChild(track);

  const txt = document.createElement('span');
  txt.textContent = toggleLabel;
  label.appendChild(txt);

  label.addEventListener('click', (e) => {
    e.stopPropagation();
    state = !state;
    applyTrack(state);
    applyThumb(state);
    onChange(state);
  });

  return label;
}

// ---------------------------------------------------------------------------
// Garden tab
// ---------------------------------------------------------------------------

// Hardcoded fallback — used when the mutation catalog isn't loaded yet
const FILTER_MUTATIONS_FALLBACK: readonly string[] = [
  'Frozen', 'Wet', 'Chilled', 'Thunderstruck',
  'Dawnlit', 'Dawnbound', 'Amberlit', 'Amberbound',
  'Rainbow', 'Gold',
];

/**
 * Returns the list of mutation display names for the filter pills.
 * Prefers the runtime mutation catalog so new game mutations appear automatically.
 * Falls back to the hardcoded list when the catalog isn't ready.
 */
function getFilterMutations(): string[] {
  const catalog = getMutationCatalog();
  if (!catalog) return [...FILTER_MUTATIONS_FALLBACK];

  const names: string[] = [];
  for (const [id, entry] of Object.entries(catalog)) {
    const displayName = typeof entry.name === 'string' && entry.name ? entry.name : id;
    names.push(displayName);
  }
  return names.length > 0 ? names : [...FILTER_MUTATIONS_FALLBACK];
}

// ---------------------------------------------------------------------------
// Stats Hub filter persistence (species + mutation pills + max-size + eggs view)
// ---------------------------------------------------------------------------

const STATS_HUB_FILTERS_KEY = 'qpm.statsHub.filters.v1';

interface StatsHubFilters {
  speciesFilters?: string[];
  mutationFilters?: string[];
  maxSizeOnly?: boolean;
  eggsView?: 'session' | 'lifetime';
}

function loadStatsHubFilters(): StatsHubFilters {
  return storage.get<StatsHubFilters>(STATS_HUB_FILTERS_KEY, {}) ?? {};
}

function saveStatsHubFilters(patch: Partial<StatsHubFilters>): void {
  const current = loadStatsHubFilters();
  storage.set(STATS_HUB_FILTERS_KEY, { ...current, ...patch });
}

function buildGardenTab(container: HTMLElement): () => void {
  container.style.cssText = 'display:flex;flex-direction:column;flex:1;min-height:0;';

  // Restore persisted filter state
  const savedFilters = loadStatsHubFilters();

  // Stats-window-only species filter (does NOT affect in-game garden filter)
  const activeSpeciesFilters = new Set<string>(savedFilters.speciesFilters ?? []);

  // Section filter state: which section is driving the in-game garden filter
  type SectionFilterSource = 'remaining' | 'complete' | null;
  let activeSectionFilterSource: SectionFilterSource = null;

  // Active per-tile garden filter key (TileEntry.tileKey, null = no filter)
  let activeTileFilterKey: string | null = null;

  // Clear any stale override from a previous session — never touches the main Garden Filters config
  setStatsHubSpeciesOverride(null);
  setStatsHubExcludeMutationsOverride(null);
  setStatsHubTileOverride(null);

  let filterRemainingActive = false;
  let filterRemainingAllMode = false;

  function applyFilterRemaining(on: boolean): void {
    filterRemainingActive = on;
    if (on) {
      // Deactivate species-based section filter when switching to exclude mode
      activeSectionFilterSource = null;
      activeTileFilterKey = null;
      setStatsHubTileOverride(null);
      setStatsHubSpeciesOverride(null);
      setStatsHubExcludeMutationsOverride(Array.from(activeFilters));
    } else {
      filterRemainingAllMode = false;
      setStatsHubExcludeMutationsAllMode(false);
      setStatsHubExcludeMutationsOverride(null);
    }
  }

  // Pre-built array of ready-badge entries — populated at the end of renderContent() so the
  // 1s interval tick doesn't need to do a querySelectorAll DOM scan every second.
  let readyBadgeEntries: Array<{ endTime: number; badge: HTMLElement }> = [];

  function disableGardenFilter(): void {
    setStatsHubTileOverride(null);
    setStatsHubSpeciesOverride(null);
  }

  function setTileFilter(tile: TileEntry): void {
    filterRemainingActive = false;
    setStatsHubExcludeMutationsOverride(null);
    activeSectionFilterSource = null;
    activeTileFilterKey = tile.tileKey;
    setStatsHubSpeciesOverride(null);
    setStatsHubTileOverride([tile.tileKey]);
  }

  function clearTileFilter(): void {
    activeTileFilterKey = null;
    if (activeSectionFilterSource === null) disableGardenFilter();
  }

  function applySectionFilter(source: SectionFilterSource, tilesInSection: TileEntry[]): void {
    if (source !== null && filterRemainingActive) {
      filterRemainingActive = false;
      filterRemainingAllMode = false;
      setStatsHubExcludeMutationsOverride(null);
    }
    activeSectionFilterSource = source;
    activeTileFilterKey = null;
    setStatsHubSpeciesOverride(null);
    setStatsHubTileOverride(source !== null ? tilesToKeys(tilesInSection) : null);
  }

  // ---- Plants dropdown ----
  const plantFilterBtn = document.createElement('button');
  plantFilterBtn.type = 'button';
  plantFilterBtn.style.cssText = pillBtnCss(false);
  plantFilterBtn.textContent = 'All plants ▾';

  let plantDropdownEl: HTMLElement | null = null;

  function closePlantDropdown(): void {
    plantDropdownEl?.remove();
    plantDropdownEl = null;
  }

  function updatePlantFilterBtn(): void {
    plantFilterBtn.textContent = activeSpeciesFilters.size > 0
      ? `Plants (${activeSpeciesFilters.size}) ▾`
      : 'All plants ▾';
    plantFilterBtn.style.cssText = pillBtnCss(activeSpeciesFilters.size > 0);
  }

  function buildSpeciesCheckRow(
    label: string,
    checked: boolean,
    onChange: (checked: boolean) => void,
    species?: string,
  ): HTMLElement {
    const row = document.createElement('label');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:4px 6px;border-radius:6px;cursor:pointer;font-size:12px;color:#e0e0e0;';
    row.addEventListener('mouseenter', () => { row.style.background = 'rgba(143,130,255,0.1)'; });
    row.addEventListener('mouseleave', () => { row.style.background = ''; });

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = checked;
    cb.style.cssText = 'accent-color:#8f82ff;cursor:pointer;flex-shrink:0;';
    cb.addEventListener('change', () => onChange(cb.checked));
    row.appendChild(cb);

    if (species) {
      const spriteWrap = plantSprite(species, [], 20, false);
      spriteWrap.style.flexShrink = '0';
      row.appendChild(spriteWrap);
    }

    const txt = document.createElement('span');
    txt.textContent = label;
    row.appendChild(txt);
    return row;
  }

  plantFilterBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (plantDropdownEl) { closePlantDropdown(); return; }

    // Build species list from the current tiles (not a hardcoded catalog)
    const currentTiles = extractTiles(currentSnapshot);
    const speciesInGarden = Array.from(new Set(currentTiles.map(tileSpecies))).sort();

    const dropdown = document.createElement('div');
    dropdown.style.cssText = [
      'position:fixed', 'z-index:99998',
      'background:rgba(14,16,22,0.98)',
      'border:1px solid rgba(143,130,255,0.35)',
      'border-radius:10px', 'padding:8px',
      'min-width:180px', 'max-width:240px',
      'max-height:300px', 'overflow-y:auto',
      'box-shadow:0 8px 32px rgba(0,0,0,0.7)',
      'display:flex', 'flex-direction:column', 'gap:2px',
    ].join(';');

    const allRow = buildSpeciesCheckRow('All plants', activeSpeciesFilters.size === 0, (checked) => {
      if (checked) { activeSpeciesFilters.clear(); renderContent(); updatePlantFilterBtn(); }
    });
    dropdown.appendChild(allRow);

    if (speciesInGarden.length > 0) {
      const divider = document.createElement('div');
      divider.style.cssText = 'border-top:1px solid rgba(255,255,255,0.08);margin:4px 0;';
      dropdown.appendChild(divider);

      for (const sp of speciesInGarden) {
        const row = buildSpeciesCheckRow(sp, activeSpeciesFilters.has(sp), (checked) => {
          if (checked) activeSpeciesFilters.add(sp);
          else activeSpeciesFilters.delete(sp);
          renderContent();
          updatePlantFilterBtn();
        }, sp);
        dropdown.appendChild(row);
      }
    }

    document.body.appendChild(dropdown);
    plantDropdownEl = dropdown;

    const r = plantFilterBtn.getBoundingClientRect();
    dropdown.style.top = `${r.bottom + 4}px`;
    dropdown.style.left = `${r.left}px`;

    const onOutside = (ev: MouseEvent) => {
      if (!dropdown.contains(ev.target as Node) && ev.target !== plantFilterBtn) {
        closePlantDropdown();
        document.removeEventListener('click', onOutside, true);
      }
    };
    setTimeout(() => document.addEventListener('click', onOutside, true), 0);
  });

  // ---- Top bar: Plants dropdown ----
  const topBar = document.createElement('div');
  topBar.style.cssText = [
    'display:flex',
    'align-items:center',
    'gap:8px',
    'padding:8px 14px 6px',
    'flex-shrink:0',
  ].join(';');
  topBar.appendChild(plantFilterBtn);
  container.appendChild(topBar);

  // ---- Mutation filter bar ----
  const filterBar = document.createElement('div');
  filterBar.style.cssText = [
    'display:flex',
    'flex-wrap:wrap',
    'gap:5px',
    'padding:0 14px 8px',
    'border-bottom:1px solid rgba(143,130,255,0.12)',
    'flex-shrink:0',
    'align-items:center',
  ].join(';');

  const filterLabel = document.createElement('span');
  filterLabel.style.cssText = 'font-size:11px;color:rgba(224,224,224,0.38);white-space:nowrap;';
  filterLabel.textContent = 'Mutations:';
  filterBar.appendChild(filterLabel);

  const activeFilters = new Set<string>(savedFilters.mutationFilters ?? []);
  const pillButtons = new Map<string, HTMLButtonElement>();

  const updatePills = () => {
    for (const [id, btn] of pillButtons) {
      btn.style.cssText = pillBtnCss(activeFilters.has(id));
    }
    maxSizePillBtn.style.cssText = pillBtnCss(maxSizeOnly);
  };

  for (const mutId of getFilterMutations()) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.style.cssText = pillBtnCss(activeFilters.has(mutId));
    btn.textContent = mutId;
    btn.addEventListener('click', () => {
      if (activeFilters.has(mutId)) activeFilters.delete(mutId);
      else activeFilters.add(mutId);
      updatePills();
      renderContent();
    });
    pillButtons.set(mutId, btn);
    filterBar.appendChild(btn);
  }

  // Separator between mutation pills and special filters
  const filterSep = document.createElement('span');
  filterSep.style.cssText = 'width:1px;height:16px;background:rgba(255,255,255,0.12);align-self:center;margin:0 2px;flex-shrink:0;';
  filterBar.appendChild(filterSep);

  let maxSizeOnly = savedFilters.maxSizeOnly ?? false;
  const maxSizePillBtn = document.createElement('button');
  maxSizePillBtn.type = 'button';
  maxSizePillBtn.style.cssText = pillBtnCss(maxSizeOnly);
  maxSizePillBtn.textContent = 'Max Size';
  maxSizePillBtn.title = 'Show only plants where at least one slot has reached its maximum size';
  maxSizePillBtn.addEventListener('click', () => {
    maxSizeOnly = !maxSizeOnly;
    updatePills();
    renderContent();
  });
  filterBar.appendChild(maxSizePillBtn);

  container.appendChild(filterBar);

  // Value summary bar
  const valueSummaryBar = document.createElement('div');
  valueSummaryBar.style.cssText = [
    'display:none',
    'padding:6px 14px',
    'border-bottom:1px solid rgba(143,130,255,0.08)',
    'flex-shrink:0',
    'background:rgba(255,255,255,0.02)',
    'gap:10px',
    'align-items:center',
  ].join(';');
  container.appendChild(valueSummaryBar);

  // Scrollable content
  const content = document.createElement('div');
  content.style.cssText = 'flex:1;overflow-y:auto;padding:14px 16px;display:flex;flex-direction:column;gap:16px;';
  container.appendChild(content);

  // Seeded immediately from the bridge cache; kept in sync by the subscription below.
  // renderContent() is only triggered by explicit user actions, not by subscription updates,
  // so this always holds the latest data for the next user-triggered render.
  let currentSnapshot: GardenSnapshot = getGardenSnapshot();

  function updateValueSummary(tiles: TileEntry[], selected: string[], maxSize = false): void {
    const { current, potential } = computeGardenValue(tiles, selected, maxSize);
    if (current === 0) {
      valueSummaryBar.style.display = 'none';
      return;
    }
    valueSummaryBar.style.display = 'flex';
    valueSummaryBar.innerHTML = '';

    valueSummaryBar.appendChild(
      makeCoinValueEl(current, 'Current:', 'font-size:13px;font-weight:700;color:#FFD700;')
    );

    if ((selected.length > 0 || maxSize) && potential > current) {
      const gain = potential - current;
      const arrowSep = document.createElement('span');
      arrowSep.style.cssText = 'color:rgba(255,255,255,0.18);font-size:12px;';
      arrowSep.textContent = '→';
      valueSummaryBar.appendChild(arrowSep);
      valueSummaryBar.appendChild(
        makeCoinValueEl(gain, '+', 'font-size:13px;font-weight:700;color:rgba(100,230,150,0.9);')
      );
      const gainLbl = document.createElement('span');
      gainLbl.style.cssText = 'font-size:11px;color:rgba(224,224,224,0.38);';
      gainLbl.textContent = 'if completed';
      valueSummaryBar.appendChild(gainLbl);
    }
  }

  function renderContent(): void {
    // Persist filter state on every re-render (triggered by any filter change)
    saveStatsHubFilters({
      speciesFilters: activeSpeciesFilters.size > 0 ? Array.from(activeSpeciesFilters) : [],
      mutationFilters: activeFilters.size > 0 ? Array.from(activeFilters) : [],
      maxSizeOnly,
    });
    content.innerHTML = '';
    readyBadgeEntries = []; // Clear stale refs whenever cards are rebuilt
    const allTiles = extractTiles(currentSnapshot);
    const selected = Array.from(activeFilters);

    // Keep exclude override in sync if filter remaining is active
    if (filterRemainingActive) {
      if (selected.length > 0) {
        setStatsHubExcludeMutationsOverride(selected);
      } else {
        filterRemainingActive = false;
        setStatsHubExcludeMutationsOverride(null);
      }
    }

    // Apply stats-window species filter
    const tiles = activeSpeciesFilters.size > 0
      ? allTiles.filter((t) => activeSpeciesFilters.has(tileSpecies(t)))
      : allTiles;

    if (tiles.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'color:rgba(224,224,224,0.3);font-size:13px;padding:32px 0;text-align:center;';
      empty.textContent = allTiles.length === 0 ? 'No plants in garden yet.' : 'No plants match the current filter.';
      content.appendChild(empty);
      updateValueSummary([], selected);
      return;
    }

    if (selected.length === 0 && !maxSizeOnly) {
      const hint = document.createElement('div');
      hint.style.cssText = 'color:rgba(224,224,224,0.32);font-size:12px;padding:8px 0 4px;';
      hint.textContent = 'Select mutations above to split plants into Remaining / Complete.';
      content.appendChild(hint);
    }

    const gardenHint = document.createElement('div');
    gardenHint.style.cssText = 'color:rgba(224,224,224,0.25);font-size:11px;padding:0 0 4px;';
    gardenHint.textContent = 'Click a plant to highlight that specific tile in your garden.';
    content.appendChild(gardenHint);

    const remaining: TileEntry[] = [];
    const complete: TileEntry[] = [];
    const isAnyFilterActive = selected.length > 0 || maxSizeOnly;

    for (const tile of tiles) {
      if (!isAnyFilterActive) {
        complete.push(tile);
      } else {
        // A tile is "remaining" if it can receive a selected mutation OR hasn't reached max size.
        // Mutation-blocked tiles (e.g. Amberbound + Amberlit filter) are not actionable → complete.
        const needsMutation = selected.length > 0 && isTileActionable(tile, selected);
        const needsSize = maxSizeOnly && tile.slots.some((s) => s.sizePercent < 100);
        (needsMutation || needsSize ? remaining : complete).push(tile);
      }
    }

    const tileFilterProps = {
      activeTileFilterKey,
      onFilter: (tile: TileEntry) => {
        if (activeTileFilterKey === tile.tileKey) {
          clearTileFilter();
        } else {
          setTileFilter(tile);
        }
        renderContent();
      },
    };

    if (isAnyFilterActive) {
      const remainingFruits = (maxSizeOnly && selected.length === 0)
        ? countMaxSizeRemainingFruits(remaining)
        : countActionableFruits(remaining, selected);
      const fruitWord = remainingFruits === 1 ? 'fruit' : 'fruits';
      const remainingLabel = remainingFruits !== remaining.length
        ? `Remaining — ${remainingFruits} ${fruitWord} · ${remaining.length} plants`
        : `Remaining — ${remaining.length} plants`;
      content.appendChild(buildTileSection(
        remainingLabel, remaining, selected, false,
        {
          active: activeSectionFilterSource === 'remaining',
          onToggle: (on) => {
            applySectionFilter(on ? 'remaining' : null, remaining);
            renderContent();
          },
        },
        tileFilterProps,
        selected.length > 0 ? {
          label: 'Filter Remaining',
          active: filterRemainingActive,
          onToggle: (on) => {
            applyFilterRemaining(on);
            renderContent();
          },
          subToggle: (filterRemainingActive || activeSectionFilterSource === 'remaining') ? {
            label: 'Match ALL',
            active: filterRemainingAllMode,
            onToggle: (on) => {
              filterRemainingAllMode = on;
              setStatsHubExcludeMutationsAllMode(on);
              renderContent();
            },
          } : null,
        } : null,
      ));

      // Visual divider between Remaining and Complete
      const divider = document.createElement('div');
      divider.style.cssText = 'height:1px;background:rgba(143,130,255,0.18);margin:20px 0 16px;flex-shrink:0;';
      content.appendChild(divider);
    }
    content.appendChild(buildTileSection(
      isAnyFilterActive ? `Complete — ${complete.length} plants` : `All plants — ${complete.length}`,
      complete, selected, true,
      {
        active: activeSectionFilterSource === 'complete',
        onToggle: (on) => {
          applySectionFilter(on ? 'complete' : null, complete);
          renderContent();
        },
      },
      tileFilterProps,
    ));

    updateValueSummary(tiles, selected, maxSizeOnly);

    // Collect ready-badge elements from the freshly-built DOM (once per render, not every 1s)
    for (const el of content.querySelectorAll<HTMLElement>('[data-ready-at]')) {
      const t = parseInt(el.dataset.readyAt ?? '0', 10);
      const badge = el.querySelector<HTMLElement>('[data-ready-badge]');
      if (t > 0 && badge) readyBadgeEntries.push({ endTime: t, badge });
    }
  }

  // Keep currentSnapshot in sync with the atom — but do NOT trigger renderContent() here.
  // The atom fires on any game-tick change (plant timers, etc.), which would constantly
  // destroy hover state and break multi-harvest popover interactions.
  // User actions (filter pills, tile clicks, section toggles) call renderContent() directly.
  // The "✓ Ready" badge visibility is handled by the separate 1s interval — no rebuild needed.
  const unsubscribe = onGardenSnapshot((snap) => {
    currentSnapshot = snap;
  }, false); // fireImmediately=false: snapshot already seeded via getGardenSnapshot() above

  // Live readiness badges — iterate the pre-built array instead of a DOM scan every second
  const readyCleanup = visibleInterval('garden-ready-badges', () => {
    const now = Date.now();
    for (const { endTime, badge } of readyBadgeEntries) {
      badge.style.display = endTime <= now ? 'flex' : 'none';
    }
  }, 1000);

  renderContent();
  return () => {
    unsubscribe();
    readyCleanup();
    closePlantDropdown();
    disableGardenFilter(); // clears both tile and species overrides
    setStatsHubExcludeMutationsOverride(null);
  };
}

function buildTileSection(
  title: string,
  tiles: TileEntry[],
  selectedMutations: string[],
  isComplete: boolean,
  sectionFilterProps: {
    active: boolean;
    onToggle: (active: boolean) => void;
  } | null = null,
  tileFilterProps: {
    activeTileFilterKey: string | null;
    onFilter: (tile: TileEntry) => void;
  } | null = null,
  extraSectionFilterProps: {
    label: string;
    active: boolean;
    onToggle: (active: boolean) => void;
    subToggle?: {
      label: string;
      active: boolean;
      onToggle: (active: boolean) => void;
    } | null;
  } | null = null,
): HTMLElement {
  const section = document.createElement('div');

  const hdr = document.createElement('div');
  hdr.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;';

  const hdrText = document.createElement('div');
  hdrText.style.cssText = 'font-size:13px;font-weight:700;color:rgba(224,224,224,0.85);';
  hdrText.textContent = title;
  hdr.appendChild(hdrText);

  if (sectionFilterProps || extraSectionFilterProps) {
    const togglesGroup = document.createElement('div');
    togglesGroup.style.cssText = 'display:flex;align-items:center;gap:12px;';
    if (extraSectionFilterProps) {
      if (extraSectionFilterProps.subToggle) {
        const subTog = buildToggleSwitch(
          extraSectionFilterProps.subToggle.active,
          extraSectionFilterProps.subToggle.onToggle,
          extraSectionFilterProps.subToggle.label,
        );
        togglesGroup.appendChild(subTog);
      }
      const extraToggle = buildToggleSwitch(
        extraSectionFilterProps.active,
        extraSectionFilterProps.onToggle,
        extraSectionFilterProps.label,
      );
      togglesGroup.appendChild(extraToggle);
    }
    if (sectionFilterProps) {
      const toggle = buildToggleSwitch(sectionFilterProps.active, (active) => {
        sectionFilterProps.onToggle(active);
      });
      togglesGroup.appendChild(toggle);
    }
    hdr.appendChild(togglesGroup);
  }
  section.appendChild(hdr);

  if (tiles.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'font-size:12px;color:rgba(224,224,224,0.3);padding:4px 0;';
    empty.textContent = isComplete ? 'No tiles match all selected mutations yet.' : 'All tiles complete!';
    section.appendChild(empty);
    return section;
  }

  // Sort: species alphabetically, then by tile value descending within each species
  const sorted = [...tiles].sort((a, b) => {
    const spA = tileSpecies(a);
    const spB = tileSpecies(b);
    if (spA !== spB) return spA.localeCompare(spB);
    return tileValue(b) - tileValue(a);
  });

  const grid = document.createElement('div');
  grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px;';
  for (const tile of sorted) {
    const isFilterActive = tileFilterProps?.activeTileFilterKey === tile.tileKey;
    grid.appendChild(buildTileCard(tile, selectedMutations, isComplete, {
      active: isFilterActive,
      onFilter: () => tileFilterProps?.onFilter(tile),
    }));
  }
  section.appendChild(grid);
  return section;
}

// ---------------------------------------------------------------------------
// Eggs tab
// ---------------------------------------------------------------------------

function buildSpeciesCard(species: string, counts: SpeciesCounts): HTMLElement {
  const card = document.createElement('div');
  card.style.cssText = [
    'display:flex',
    'flex-direction:column',
    'align-items:center',
    'gap:5px',
    'padding:10px 8px',
    'border-radius:10px',
    'border:1px solid rgba(143,130,255,0.14)',
    'background:rgba(255,255,255,0.03)',
    'min-width:90px',
    'max-width:120px',
    'text-align:center',
  ].join(';');

  card.appendChild(petSprite(species, 52));

  const nameEl = document.createElement('div');
  nameEl.style.cssText = 'font-size:11px;font-weight:600;color:#e0e0e0;word-break:break-word;';
  nameEl.textContent = species;
  card.appendChild(nameEl);

  const countEl = document.createElement('div');
  countEl.style.cssText = 'font-size:11px;color:rgba(224,224,224,0.65);line-height:1.5;';
  const parts = [`${counts.total} total`];
  if (counts.rainbow > 0) parts.push(`${counts.rainbow}🌈`);
  if (counts.gold > 0) parts.push(`${counts.gold}⭐`);
  countEl.textContent = parts.join(' · ');
  card.appendChild(countEl);

  return card;
}

function buildAbilityChip(abilityId: string, count: number): HTMLElement {
  const chip = document.createElement('div');
  chip.style.cssText = [
    'display:inline-flex',
    'align-items:center',
    'gap:5px',
    'padding:4px 9px',
    'border-radius:20px',
    'background:rgba(255,255,255,0.05)',
    'border:1px solid rgba(255,255,255,0.1)',
    'font-size:11px',
    'color:#e0e0e0',
    'white-space:nowrap',
  ].join(';');

  const def = getAbilityDefinition(abilityId);
  const color = def ? ABILITY_CATEGORY_COLORS[def.category] : '#78909c';
  const name = def ? def.name : abilityId;

  const dot = document.createElement('span');
  dot.style.cssText = `width:7px;height:7px;border-radius:50%;background:${color};flex-shrink:0;`;
  chip.appendChild(dot);

  const label = document.createElement('span');
  label.textContent = name;
  chip.appendChild(label);

  const countBadge = document.createElement('span');
  countBadge.style.cssText = 'font-size:10px;color:rgba(224,224,224,0.55);font-weight:700;';
  countBadge.textContent = `×${count}`;
  chip.appendChild(countBadge);

  return chip;
}

function buildEventRow(event: HatchEvent): HTMLElement {
  const row = document.createElement('div');
  row.style.cssText = [
    'display:flex',
    'align-items:center',
    'gap:8px',
    'padding:5px 2px',
    'border-bottom:1px solid rgba(255,255,255,0.04)',
  ].join(';');

  row.appendChild(petSprite(event.species, 24));

  const nameEl = document.createElement('span');
  nameEl.style.cssText = 'font-size:12px;color:#e0e0e0;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
  nameEl.textContent = event.species;
  row.appendChild(nameEl);

  if (event.rarity !== 'normal') {
    const rarBadge = document.createElement('span');
    rarBadge.style.cssText = rarityBadgeStyle(event.rarity);
    rarBadge.textContent = event.rarity;
    row.appendChild(rarBadge);
  }

  if (event.abilities.length > 0) {
    const abilWrap = document.createElement('div');
    abilWrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:3px;max-width:200px;';
    for (const abilId of event.abilities.slice(0, 3)) {
      const def = getAbilityDefinition(abilId);
      const color = def ? ABILITY_CATEGORY_COLORS[def.category] : '#78909c';
      const chip = document.createElement('span');
      chip.style.cssText = `background:${color}22;border:1px solid ${color}55;color:${color};border-radius:3px;padding:1px 5px;font-size:10px;white-space:nowrap;`;
      chip.textContent = def ? def.name : abilId;
      abilWrap.appendChild(chip);
    }
    if (event.abilities.length > 3) {
      const more = document.createElement('span');
      more.style.cssText = 'font-size:10px;color:rgba(224,224,224,0.4);';
      more.textContent = `+${event.abilities.length - 3}`;
      abilWrap.appendChild(more);
    }
    row.appendChild(abilWrap);
  }

  const timeEl = document.createElement('span');
  timeEl.style.cssText = 'font-size:10px;color:rgba(224,224,224,0.35);white-space:nowrap;flex-shrink:0;';
  timeEl.textContent = timeAgo(event.timestamp);
  row.appendChild(timeEl);

  return row;
}

function buildEggsTab(container: HTMLElement): () => void {
  container.style.cssText = 'display:flex;flex-direction:column;flex:1;min-height:0;';

  // Session/Lifetime toggle
  const toggleBar = document.createElement('div');
  toggleBar.style.cssText = [
    'display:flex',
    'align-items:center',
    'gap:8px',
    'padding:10px 14px',
    'border-bottom:1px solid rgba(143,130,255,0.12)',
    'flex-shrink:0',
  ].join(';');

  const toggleLabel = document.createElement('span');
  toggleLabel.style.cssText = 'font-size:11px;color:rgba(224,224,224,0.45);margin-right:4px;';
  toggleLabel.textContent = 'View:';
  toggleBar.appendChild(toggleLabel);

  const eggsViewSaved = loadStatsHubFilters().eggsView;
  let activeView: 'session' | 'lifetime' = eggsViewSaved === 'lifetime' ? 'lifetime' : 'session';
  const sessionBtn = document.createElement('button');
  sessionBtn.type = 'button';
  sessionBtn.textContent = 'Session';
  const lifetimeBtn = document.createElement('button');
  lifetimeBtn.type = 'button';
  lifetimeBtn.textContent = 'Lifetime';

  const updateToggle = () => {
    sessionBtn.style.cssText = pillBtnCss(activeView === 'session');
    lifetimeBtn.style.cssText = pillBtnCss(activeView === 'lifetime');
  };
  updateToggle();

  sessionBtn.addEventListener('click', () => { activeView = 'session'; saveStatsHubFilters({ eggsView: 'session' }); updateToggle(); renderEggs(); });
  lifetimeBtn.addEventListener('click', () => { activeView = 'lifetime'; saveStatsHubFilters({ eggsView: 'lifetime' }); updateToggle(); renderEggs(); });
  toggleBar.append(sessionBtn, lifetimeBtn);

  // Spacer
  const spacer = document.createElement('div');
  spacer.style.cssText = 'flex:1;';
  toggleBar.appendChild(spacer);

  // Seed from inventory button
  const seedBtn = document.createElement('button');
  seedBtn.type = 'button';
  seedBtn.title = 'Seed lifetime stats from all pets you currently own (inventory + hutch). Runs once per pet — safe to repeat.';
  seedBtn.textContent = '⬆ Seed pets';
  seedBtn.style.cssText = [
    'padding:4px 10px',
    'border-radius:20px',
    'font-size:11px',
    'font-weight:600',
    'cursor:pointer',
    'border:1px solid rgba(255,255,255,0.14)',
    'background:rgba(255,255,255,0.04)',
    'color:rgba(224,224,224,0.5)',
    'transition:background 0.12s,color 0.12s,border-color 0.12s',
    'white-space:nowrap',
  ].join(';');
  seedBtn.addEventListener('mouseenter', () => {
    seedBtn.style.background = 'rgba(255,255,255,0.09)';
    seedBtn.style.color = 'rgba(224,224,224,0.8)';
    seedBtn.style.borderColor = 'rgba(255,255,255,0.25)';
  });
  seedBtn.addEventListener('mouseleave', () => {
    if (!seedBtn.disabled) {
      seedBtn.style.background = 'rgba(255,255,255,0.04)';
      seedBtn.style.color = 'rgba(224,224,224,0.5)';
      seedBtn.style.borderColor = 'rgba(255,255,255,0.14)';
    }
  });
  seedBtn.addEventListener('click', () => {
    seedBtn.disabled = true;
    seedBtn.textContent = '⏳ Seeding…';
    seedBtn.style.opacity = '0.6';

    try {
      const allPets: PetSeedInput[] = [];
      for (const label of ['myPetInventoryAtom', 'myPetHutchPetItemsAtom']) {
        try {
          const atom = getAtomByLabel(label);
          if (atom) {
            const items = readAtomValue<unknown[]>(atom);
            if (Array.isArray(items)) {
              allPets.push(...(items as PetSeedInput[]));
            }
          }
        } catch { /* atom not ready */ }
      }

      const { added } = seedLifetimeFromPets(allPets);

      // Switch to lifetime view so the user sees the result
      activeView = 'lifetime';
      updateToggle();
      renderEggs();

      seedBtn.textContent = added > 0 ? `✓ +${added} added` : '✓ Up to date';
      seedBtn.style.color = 'rgba(143,230,143,0.8)';
      seedBtn.style.borderColor = 'rgba(143,230,143,0.35)';
      seedBtn.style.background = 'rgba(143,230,143,0.08)';
      seedBtn.style.opacity = '1';
      setTimeout(() => {
        seedBtn.disabled = false;
        seedBtn.textContent = '⬆ Seed pets';
        seedBtn.style.background = 'rgba(255,255,255,0.04)';
        seedBtn.style.color = 'rgba(224,224,224,0.5)';
        seedBtn.style.borderColor = 'rgba(255,255,255,0.14)';
        seedBtn.style.opacity = '1';
      }, 3000);
    } catch (err) {
      log('[StatsHub] Seed error', err);
      seedBtn.disabled = false;
      seedBtn.textContent = '✗ Failed';
      seedBtn.style.color = 'rgba(255,100,100,0.7)';
      seedBtn.style.opacity = '1';
      setTimeout(() => {
        seedBtn.textContent = '⬆ Seed pets';
        seedBtn.style.color = 'rgba(224,224,224,0.5)';
      }, 2500);
    }
  });
  toggleBar.appendChild(seedBtn);

  container.appendChild(toggleBar);

  const content = document.createElement('div');
  content.style.cssText = 'flex:1;overflow-y:auto;padding:12px 14px;display:flex;flex-direction:column;gap:14px;';
  container.appendChild(content);

  let currentStats: HatchStatsState | null = null;

  function renderEggs(): void {
    content.innerHTML = '';
    if (!currentStats) {
      appendEmptyNote(content, 'No hatch data yet. Hatch a pet to see stats here.');
      return;
    }

    const bucket = activeView === 'session' ? currentStats.session : currentStats.lifetime;

    if (bucket.totalHatched === 0) {
      appendEmptyNote(content, activeView === 'session' ? 'No hatches this session yet.' : 'No lifetime hatch data yet.');
      return;
    }

    const goldTotal    = Object.values(bucket.bySpecies).reduce((s, c) => s + c.gold, 0);
    const rainbowTotal = Object.values(bucket.bySpecies).reduce((s, c) => s + c.rainbow, 0);

    // Stat chips
    const chipsRow = document.createElement('div');
    chipsRow.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;';
    const chipData = [
      { label: 'Total Hatched', value: bucket.totalHatched, bg: 'rgba(255,255,255,0.07)', color: '#e0e0e0' },
      { label: 'Gold', value: goldTotal, bg: '#ffd600', color: '#111' },
      { label: 'Rainbow', value: rainbowTotal, bg: RAINBOW_GRADIENT, color: '#fff' },
    ];
    for (const c of chipData) {
      const el = document.createElement('div');
      el.style.cssText = `background:${c.bg};color:${c.color};border-radius:8px;padding:8px 14px;display:flex;flex-direction:column;align-items:center;min-width:80px;`;
      const num = document.createElement('div');
      num.style.cssText = 'font-size:22px;font-weight:800;line-height:1;';
      num.textContent = String(c.value);
      const lbl = document.createElement('div');
      lbl.style.cssText = 'font-size:10px;font-weight:600;margin-top:3px;opacity:0.85;';
      lbl.textContent = c.label;
      el.append(num, lbl);
      chipsRow.appendChild(el);
    }
    content.appendChild(chipsRow);

    // Species grid
    const speciesEntries = Object.entries(bucket.bySpecies).sort((a, b) => b[1].total - a[1].total);
    if (speciesEntries.length > 0) {
      appendSectionHeader(content, 'By Species');
      const grid = document.createElement('div');
      grid.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;';
      for (const [sp, counts] of speciesEntries) grid.appendChild(buildSpeciesCard(sp, counts));
      content.appendChild(grid);
    }

    // Ability summary
    const abilityEntries = Object.entries(bucket.byAbility).sort((a, b) => b[1] - a[1]);
    if (abilityEntries.length > 0) {
      appendSectionHeader(content, 'Abilities');
      const ORDER: AbilityCategory[] = ['plantGrowth', 'eggGrowth', 'xp', 'coins', 'misc'];
      const grouped = new Map<string, Array<[string, number]>>();
      for (const cat of [...ORDER, 'unknown']) grouped.set(cat, []);
      for (const [id, count] of abilityEntries) {
        const def = getAbilityDefinition(id);
        const cat = def ? def.category : 'unknown';
        grouped.get(cat)!.push([id, count]);
      }
      const chipWrap = document.createElement('div');
      chipWrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;';
      for (const entries of grouped.values()) {
        for (const [id, count] of entries) chipWrap.appendChild(buildAbilityChip(id, count));
      }
      content.appendChild(chipWrap);
    }

    // Recent hatch log (collapsible)
    const events = currentStats.recentEvents.slice(0, 50);
    if (events.length > 0) {
      const logSection = document.createElement('div');
      const logHdr = document.createElement('div');
      logHdr.style.cssText = 'display:flex;align-items:center;justify-content:space-between;cursor:pointer;padding:4px 0;';
      const logTitle = document.createElement('span');
      logTitle.style.cssText = 'font-size:12px;font-weight:700;color:rgba(224,224,224,0.7);';
      logTitle.textContent = `Recent Hatches (${events.length})`;
      const arrow = document.createElement('span');
      arrow.style.cssText = 'font-size:11px;color:rgba(224,224,224,0.4);';
      arrow.textContent = '▼ show';
      logHdr.append(logTitle, arrow);
      logSection.appendChild(logHdr);

      const logBody = document.createElement('div');
      logBody.style.display = 'none';
      for (const ev of events) logBody.appendChild(buildEventRow(ev));
      logSection.appendChild(logBody);

      let expanded = false;
      logHdr.addEventListener('click', () => {
        expanded = !expanded;
        logBody.style.display = expanded ? 'block' : 'none';
        arrow.textContent = expanded ? '▲ hide' : '▼ show';
      });
      content.appendChild(logSection);
    }
  }

  const unsubscribe = subscribeHatchStats((s) => {
    currentStats = s;
    renderEggs();
  });

  return unsubscribe;
}

function appendEmptyNote(parent: HTMLElement, text: string): void {
  const el = document.createElement('div');
  el.style.cssText = 'color:rgba(224,224,224,0.35);font-size:13px;padding:30px 20px;text-align:center;';
  el.textContent = text;
  parent.appendChild(el);
}

function appendSectionHeader(parent: HTMLElement, text: string): void {
  const el = document.createElement('div');
  el.style.cssText = 'font-size:12px;font-weight:700;color:rgba(224,224,224,0.7);';
  el.textContent = text;
  parent.appendChild(el);
}

// ---------------------------------------------------------------------------
// Hub window
// ---------------------------------------------------------------------------

export function openStatsHubWindow(): void {
  toggleWindow('stats-hub', '📊 Garden & Hatch Stats', renderStatsHub, '920px', '85vh');
}

export function renderStatsHub(root: HTMLElement): void {
  root.style.cssText = 'display:flex;flex-direction:column;flex:1;min-height:0;';

  let activeTab: 'garden' | 'eggs' = 'garden';
  let gardenCleanup: (() => void) | null = null;
  let eggsCleanup: (() => void) | null = null;

  // Tab bar
  const tabBar = document.createElement('div');
  tabBar.style.cssText = [
    'display:flex',
    'gap:4px',
    'padding:10px 14px 0',
    'border-bottom:1px solid rgba(143,130,255,0.2)',
    'flex-shrink:0',
  ].join(';');

  function makeTab(label: string): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    btn.style.cssText = [
      'padding:7px 16px',
      'font-size:13px',
      'font-weight:600',
      'border:none',
      'border-bottom:3px solid transparent',
      'background:transparent',
      'cursor:pointer',
      'color:rgba(224,224,224,0.55)',
      'transition:color 0.12s,border-color 0.12s',
    ].join(';');
    return btn;
  }

  const gardenBtn = makeTab('🌿 Garden');
  // Eggs tab disabled until complete
  tabBar.append(gardenBtn);
  // Hide the tab bar while only Garden is available (re-show when Eggs is re-enabled)
  tabBar.style.display = 'none';
  root.appendChild(tabBar);

  const tabContent = document.createElement('div');
  tabContent.style.cssText = 'display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden;';
  root.appendChild(tabContent);

  function setActiveTab(tab: 'garden' | 'eggs'): void {
    activeTab = tab;
    tabContent.innerHTML = '';
    gardenCleanup?.(); gardenCleanup = null;
    eggsCleanup?.();   eggsCleanup   = null;

    gardenBtn.style.color = tab === 'garden' ? '#c8c0ff' : 'rgba(224,224,224,0.55)';
    gardenBtn.style.borderBottomColor = tab === 'garden' ? '#8f82ff' : 'transparent';

    const panel = document.createElement('div');
    panel.style.cssText = 'display:flex;flex-direction:column;flex:1;min-height:0;';
    tabContent.appendChild(panel);

    try {
      if (tab === 'garden') {
        gardenCleanup = buildGardenTab(panel);
      } else {
        eggsCleanup = buildEggsTab(panel);
      }
    } catch (error) {
      log('[StatsHub] Tab build error', error);
      panel.innerHTML = '<div style="padding:20px;color:rgba(224,224,224,0.4);font-size:13px;">Failed to load tab content.</div>';
    }
  }

  gardenBtn.addEventListener('click', () => setActiveTab('garden'));

  // Cleanup subscriptions when window is removed from DOM
  const observer = new MutationObserver(() => {
    if (!document.contains(root)) {
      gardenCleanup?.();
      eggsCleanup?.();
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  setActiveTab('garden');
}
