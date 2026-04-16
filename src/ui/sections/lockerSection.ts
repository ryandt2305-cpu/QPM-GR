// src/ui/sections/lockerSection.ts
// Compact config UI for the Locker — tabbed layout with sprite grids.
// Tile clicks update in-place (no full re-render) for zero-lag interaction.

import { createCard } from '../panelHelpers';
import { getLockerConfig, updateLockerConfig, type LockerConfig } from '../../features/locker/index';
import type { CustomRule } from '../../features/locker/types';
import {
  areCatalogsReady, getEggCatalog, getAllPlantSpecies, getPlantSpecies,
  getAllDecor, getDecor, getAllMutations, getMutation,
} from '../../catalogs/gameCatalogs';
import { getCropSpriteDataUrl, getCropSpriteDataUrlWithMutations, getAnySpriteDataUrl } from '../../sprite-v2/compat';
import { RARITY_COLORS } from '../shopRestockWindowConstants';
import { findVariantBadge } from '../../data/variantBadges';
import {
  getSellAllPetsSettings, setSellAllPetsProtectionRules, SELL_ALL_PET_RARITY_OPTIONS,
} from '../../features/sellAllPets';
import { getGardenSnapshot } from '../../features/gardenBridge';
import { getInventoryItems } from '../../store/inventory';

// ── Constants ───────────────────────────────────────────────────────────────

const TILE_SIZE = 56;
const SPRITE_SIZE = 36;
const RARITY_ORDER = ['celestial', 'divine', 'mythical', 'mythic', 'legendary', 'rare', 'uncommon', 'common'];

// ── Style tokens ────────────────────────────────────────────────────────────

const LOCKED_BG = 'rgba(143,130,255,0.12)';
const LOCKED_BORDER = 'rgba(143,130,255,0.6)';
const UNLOCKED_BG = 'rgba(255,255,255,0.03)';
const UNLOCKED_BORDER = 'rgba(255,255,255,0.08)';
const HOVER_BG = 'rgba(143,130,255,0.06)';
const HOVER_BORDER = 'rgba(143,130,255,0.25)';
const ACCENT = 'var(--qpm-accent,#8f82ff)';
const TEXT_MUTED = 'var(--qpm-text-muted,rgba(232,224,255,0.6))';

const LABEL_CSS = 'font-size:13px;font-weight:600;color:var(--qpm-text,#fff);';
const MUTED_CSS = 'font-size:11px;color:var(--qpm-text-muted,rgba(232,224,255,0.6));line-height:1.4;';
const TOGGLE_ROW_CSS = `display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 10px;border-radius:8px;border:1px solid ${UNLOCKED_BORDER};background:${UNLOCKED_BG};cursor:pointer`;
const CHECKBOX_CSS = `width:18px;height:18px;cursor:pointer;accent-color:${ACCENT}`;

// ── Sprite resolution ───────────────────────────────────────────────────────

function resolveEggSprite(eggId: string): string {
  return getCropSpriteDataUrl(eggId) || getAnySpriteDataUrl(`egg/${eggId}`) || getAnySpriteDataUrl(eggId) || '';
}

function resolveDecorSprite(decorId: string): string {
  return getAnySpriteDataUrl(`decor/${decorId}`) || getAnySpriteDataUrl(decorId) || '';
}

function getPlantRarity(species: string): string {
  const entry = getPlantSpecies(species);
  if (!entry?.seed) return 'common';
  const raw = (entry.seed as Record<string, unknown>).rarity;
  return typeof raw === 'string' ? raw.toLowerCase() : 'common';
}

// ── Eligible species/mutations from garden + inventory ──────────────────────

interface EligibleData {
  species: Set<string>;   // plants in garden or seeds in inventory
  mutations: Set<string>; // mutations present on garden plants
  eggs: Set<string>;      // egg IDs in garden or inventory
  decor: Set<string>;     // decor IDs in garden or inventory
}

function getEligibleData(): EligibleData {
  const species = new Set<string>();
  const mutations = new Set<string>();
  const eggs = new Set<string>();
  const decor = new Set<string>();

  // Garden: scan all tile objects for plants, eggs, and decor
  const snapshot = getGardenSnapshot();
  const tileGroups = [snapshot?.tileObjects, snapshot?.boardwalkTileObjects];
  for (const tiles of tileGroups) {
    if (!tiles || typeof tiles !== 'object') continue;
    for (const tile of Object.values(tiles)) {
      const t = tile as Record<string, unknown>;
      const objType = t.objectType;

      if (objType === 'plant' && Array.isArray(t.slots)) {
        for (const slot of t.slots) {
          const s = slot as Record<string, unknown>;
          if (typeof s.species === 'string' && s.species.length > 0) {
            species.add(s.species);
          }
          if (Array.isArray(s.mutations)) {
            for (const m of s.mutations) {
              if (typeof m === 'string' && m.length > 0) mutations.add(m);
            }
          }
        }
      } else if (objType === 'egg') {
        const eggId = t.eggType ?? t.species;
        if (typeof eggId === 'string' && eggId.length > 0) eggs.add(eggId);
      } else if (objType === 'decor') {
        const decorId = t.decorId ?? t.species;
        if (typeof decorId === 'string' && decorId.length > 0) decor.add(decorId as string);
      }
    }
  }

  // Inventory: seeds, eggs, decor
  try {
    for (const item of getInventoryItems()) {
      const raw = item.raw as Record<string, unknown> | null;
      if (typeof item.species === 'string' && item.species.length > 0) {
        species.add(item.species);
      }
      if (item.itemType === 'egg' || (raw && typeof raw.eggId === 'string')) {
        const eggId = (raw?.eggId ?? raw?.eggType ?? item.id) as string;
        if (eggId) eggs.add(eggId);
      }
      if (item.itemType === 'decor' || (raw && typeof raw.decorId === 'string')) {
        const decorId = (raw?.decorId ?? item.id) as string;
        if (decorId) decor.add(decorId);
      }
    }
  } catch { /* inventory store may not be running yet */ }

  return { species, mutations, eggs, decor };
}

// ── Primitive helpers ───────────────────────────────────────────────────────

function makeToggleRow(label: string, checked: boolean, onChange: (v: boolean) => void): HTMLElement {
  const row = document.createElement('label');
  row.style.cssText = TOGGLE_ROW_CSS;
  const text = document.createElement('div');
  text.style.cssText = LABEL_CSS;
  text.textContent = label;
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = checked;
  input.style.cssText = CHECKBOX_CSS;
  input.addEventListener('change', () => onChange(input.checked));
  row.append(text, input);
  return row;
}

function makeBlockAllCheckbox(label: string, checked: boolean, onChange: (v: boolean) => void): HTMLElement {
  const row = document.createElement('label');
  row.style.cssText = 'display:flex;align-items:center;gap:6px;cursor:pointer;padding:2px 0';
  row.addEventListener('click', (e) => e.stopPropagation()); // prevent header collapse trigger
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = checked;
  input.style.cssText = `width:14px;height:14px;cursor:pointer;accent-color:${ACCENT}`;
  input.addEventListener('change', () => onChange(input.checked));
  const text = document.createElement('span');
  text.style.cssText = `font-size:11px;color:${TEXT_MUTED}`;
  text.textContent = label;
  row.append(input, text);
  return row;
}

function makeHint(text: string): HTMLElement {
  const el = document.createElement('div');
  el.style.cssText = MUTED_CSS + ';padding:4px 2px 0';
  el.textContent = text;
  return el;
}

function makeGrid(): HTMLElement {
  const g = document.createElement('div');
  g.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;padding:4px 0;justify-content:center';
  return g;
}

function makeShowAllToggle(onChange: (showAll: boolean) => void): HTMLElement {
  let showAll = false;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = 'Show All';
  btn.style.cssText = `background:none;border:none;color:${TEXT_MUTED};font-size:10px;cursor:pointer;padding:0;text-decoration:underline;text-align:left;display:block`;
  btn.addEventListener('click', () => {
    showAll = !showAll;
    btn.textContent = showAll ? 'Show Eligible' : 'Show All';
    onChange(showAll);
  });
  return btn;
}

// ── Lock tile (in-place toggle) ─────────────────────────────────────────────

function makeLockTile(
  label: string,
  spriteUrl: string,
  initialLocked: boolean,
  onToggle: (locked: boolean) => void,
): HTMLElement {
  let locked = initialLocked;

  const tile = document.createElement('div');
  tile.title = label;
  tile.style.cssText = `min-width:${TILE_SIZE}px;min-height:${TILE_SIZE + 18}px;display:flex;flex-direction:column;align-items:center;gap:2px;padding:6px 4px 4px;border-radius:8px;cursor:pointer;transition:background .12s,border-color .12s;border:1.5px solid ${locked ? LOCKED_BORDER : UNLOCKED_BORDER};background:${locked ? LOCKED_BG : UNLOCKED_BG}`;

  // Sprite wrapper
  const spriteWrap = document.createElement('div');
  spriteWrap.style.cssText = `position:relative;width:${SPRITE_SIZE}px;height:${SPRITE_SIZE}px;flex-shrink:0`;

  if (spriteUrl) {
    const img = document.createElement('img');
    img.alt = label;
    img.src = spriteUrl;
    img.style.cssText = `width:${SPRITE_SIZE}px;height:${SPRITE_SIZE}px;image-rendering:pixelated;object-fit:contain`;
    spriteWrap.appendChild(img);
  } else {
    const fb = document.createElement('div');
    fb.textContent = label.slice(0, 3).toUpperCase();
    fb.style.cssText = `width:${SPRITE_SIZE}px;height:${SPRITE_SIZE}px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:${TEXT_MUTED};background:rgba(255,255,255,0.06);border-radius:4px`;
    spriteWrap.appendChild(fb);
  }

  // Lock badge
  const badge = document.createElement('div');
  badge.textContent = locked ? '🔒' : '🔓';
  badge.style.cssText = 'position:absolute;top:0;right:-4px;font-size:13px;line-height:1;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.7))';
  spriteWrap.appendChild(badge);

  // Name
  const name = document.createElement('div');
  name.textContent = label;
  name.style.cssText = `font-size:9px;text-align:center;line-height:1.2;white-space:nowrap;color:${locked ? ACCENT : TEXT_MUTED}`;

  tile.append(spriteWrap, name);

  const applyState = (): void => {
    tile.style.borderColor = locked ? LOCKED_BORDER : UNLOCKED_BORDER;
    tile.style.background = locked ? LOCKED_BG : UNLOCKED_BG;
    badge.textContent = locked ? '🔒' : '🔓';
    name.style.color = locked ? ACCENT : TEXT_MUTED as string;
  };

  tile.addEventListener('mouseenter', () => { if (!locked) { tile.style.background = HOVER_BG; tile.style.borderColor = HOVER_BORDER; } });
  tile.addEventListener('mouseleave', () => { if (!locked) { tile.style.background = UNLOCKED_BG; tile.style.borderColor = UNLOCKED_BORDER; } });
  tile.addEventListener('click', () => { locked = !locked; onToggle(locked); applyState(); });

  return tile;
}

// ── Mutation tile (in-place toggle) ─────────────────────────────────────────

function makeMutationTile(
  mutId: string,
  initialLocked: boolean,
  onToggle: (locked: boolean) => void,
): HTMLElement {
  let locked = initialLocked;
  const vb = findVariantBadge(mutId);
  const color = vb?.color ?? '#888';
  const gradient = vb?.gradient;
  const displayName = getMutation(mutId)?.name ?? mutId;

  const tile = document.createElement('div');
  tile.title = displayName;
  tile.style.cssText = `padding:6px 10px;border-radius:8px;cursor:pointer;display:flex;align-items:center;gap:6px;transition:background .15s,border-color .15s,color .15s;border:1.5px solid ${locked ? color : UNLOCKED_BORDER};background:${locked ? (gradient ?? color) : UNLOCKED_BG}`;

  const dot = document.createElement('div');
  dot.style.cssText = `width:10px;height:10px;border-radius:50%;flex-shrink:0;transition:background .15s;background:${locked ? 'rgba(0,0,0,0.2)' : (gradient ?? color)}`;

  const label = document.createElement('div');
  label.textContent = displayName;
  label.style.cssText = `font-size:11px;font-weight:600;white-space:nowrap;transition:color .15s;color:${locked ? '#111' : TEXT_MUTED}`;

  tile.append(dot, label);

  const applyState = (): void => {
    tile.style.borderColor = locked ? color : UNLOCKED_BORDER;
    tile.style.background = locked ? (gradient ?? color) : UNLOCKED_BG;
    dot.style.background = locked ? 'rgba(0,0,0,0.2)' : (gradient ?? color);
    label.style.color = locked ? '#111' : TEXT_MUTED as string;
  };

  tile.addEventListener('mouseenter', () => { if (!locked) { tile.style.background = `${color}18`; tile.style.borderColor = `${color}55`; } });
  tile.addEventListener('mouseleave', () => { if (!locked) { tile.style.background = UNLOCKED_BG; tile.style.borderColor = UNLOCKED_BORDER; } });
  tile.addEventListener('click', () => { locked = !locked; onToggle(locked); applyState(); });

  return tile;
}

// ── Rarity group ────────────────────────────────────────────────────────────

function makeRarityGroup(rarity: string, tiles: HTMLElement[]): HTMLElement {
  const color = RARITY_COLORS[rarity] ?? RARITY_COLORS.common ?? '#E7E7E7';
  const wrap = document.createElement('div');
  wrap.style.cssText = `border-radius:8px;padding:6px 8px;border:1px solid ${color}25;background:${color}08`;

  const header = document.createElement('div');
  header.textContent = rarity;
  header.style.cssText = `font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:${color};padding:0 2px 4px;text-align:center`;

  const grid = makeGrid();
  for (const t of tiles) grid.appendChild(t);

  wrap.append(header, grid);
  return wrap;
}

// ── Build rarity-grouped sprite grid ────────────────────────────────────────

function buildRarityGrid(
  speciesList: string[],
  locks: Record<string, boolean>,
  lockKey: 'plantLocks' | 'cropSellLocks',
): HTMLElement {
  const container = document.createElement('div');
  container.style.cssText = 'display:flex;flex-direction:column;gap:6px';

  const groups = new Map<string, string[]>();
  for (const sp of speciesList) {
    const r = getPlantRarity(sp);
    const list = groups.get(r) ?? [];
    list.push(sp);
    groups.set(r, list);
  }

  const buildTiles = (list: string[]): HTMLElement[] =>
    list.sort().map(sp => {
      const locked = locks[sp] === true;
      const spriteUrl = getCropSpriteDataUrl(sp);
      return makeLockTile(sp, spriteUrl, locked, (next) => {
        const cur = getLockerConfig();
        const curLocks = { ...cur[lockKey], [sp]: next };
        if (!next) delete curLocks[sp];
        updateLockerConfig({ [lockKey]: curLocks });
      });
    });

  for (const rarity of RARITY_ORDER) {
    const list = groups.get(rarity);
    if (!list?.length) continue;
    container.appendChild(makeRarityGroup(rarity, buildTiles(list)));
  }
  for (const [rarity, list] of groups) {
    if (RARITY_ORDER.includes(rarity) || !list.length) continue;
    container.appendChild(makeRarityGroup(rarity, buildTiles(list)));
  }

  return container;
}

// ── Custom plant sprite picker (dropdown) ───────────────────────────────────

const PICKER_TILE = 44;
const PICKER_SPRITE = 30;

function makePickerSpriteTile(
  species: string,
  spriteUrl: string,
  onClick: () => void,
): HTMLElement {
  const tile = document.createElement('div');
  tile.title = species;
  tile.style.cssText = `width:${PICKER_TILE}px;height:${PICKER_TILE + 14}px;display:flex;flex-direction:column;align-items:center;gap:1px;padding:4px 2px 2px;border-radius:6px;cursor:pointer;border:1.5px solid ${UNLOCKED_BORDER};background:${UNLOCKED_BG};transition:background .1s,border-color .1s`;

  if (spriteUrl) {
    const img = document.createElement('img');
    img.alt = species;
    img.src = spriteUrl;
    img.style.cssText = `width:${PICKER_SPRITE}px;height:${PICKER_SPRITE}px;image-rendering:pixelated;object-fit:contain`;
    tile.appendChild(img);
  } else {
    const fb = document.createElement('div');
    fb.textContent = species.slice(0, 3).toUpperCase();
    fb.style.cssText = `width:${PICKER_SPRITE}px;height:${PICKER_SPRITE}px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:${TEXT_MUTED};background:rgba(255,255,255,0.06);border-radius:4px`;
    tile.appendChild(fb);
  }

  const name = document.createElement('div');
  name.textContent = species;
  name.style.cssText = `font-size:8px;text-align:center;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:${PICKER_TILE}px;color:${TEXT_MUTED}`;
  tile.appendChild(name);

  tile.addEventListener('mouseenter', () => { tile.style.background = HOVER_BG; tile.style.borderColor = HOVER_BORDER; });
  tile.addEventListener('mouseleave', () => { tile.style.background = UNLOCKED_BG; tile.style.borderColor = UNLOCKED_BORDER; });
  tile.addEventListener('click', onClick);

  return tile;
}

/** Builds rarity-grouped sprite tiles for the plant picker dropdown. */
function buildPickerDropdownContent(
  dropdown: HTMLElement,
  speciesList: string[],
  onPick: (sp: string) => void,
): void {
  dropdown.innerHTML = '';
  if (speciesList.length === 0) {
    dropdown.appendChild(makeHint('No plants available.'));
    return;
  }
  const groups = new Map<string, string[]>();
  for (const sp of speciesList) {
    const r = getPlantRarity(sp);
    const list = groups.get(r) ?? [];
    list.push(sp);
    groups.set(r, list);
  }
  const renderGroup = (rarity: string, list: string[]): void => {
    const color = RARITY_COLORS[rarity] ?? RARITY_COLORS.common ?? '#E7E7E7';
    const groupWrap = document.createElement('div');
    groupWrap.style.cssText = `border-radius:6px;padding:4px 6px;margin-bottom:4px;border:1px solid ${color}20;background:${color}06`;
    const hdr = document.createElement('div');
    hdr.textContent = rarity;
    hdr.style.cssText = `font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:${color};padding:0 2px 3px;text-align:center`;
    groupWrap.appendChild(hdr);
    const grid = document.createElement('div');
    grid.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;justify-content:center';
    for (const sp of list.sort()) {
      grid.appendChild(makePickerSpriteTile(sp, getCropSpriteDataUrl(sp), () => onPick(sp)));
    }
    groupWrap.appendChild(grid);
    dropdown.appendChild(groupWrap);
  };
  for (const rarity of RARITY_ORDER) {
    const list = groups.get(rarity);
    if (list?.length) renderGroup(rarity, list);
  }
  for (const [rarity, list] of groups) {
    if (!RARITY_ORDER.includes(rarity) && list.length) renderGroup(rarity, list);
  }
}

function buildPlantPicker(
  selected: string | null,
  eligible: Set<string>,
  onSelect: (species: string | null) => void,
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:relative';

  let showAll = false;

  // Trigger button
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.style.cssText = `display:flex;align-items:center;gap:6px;padding:5px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:rgba(0,0,0,0.3);color:#fff;font-size:11px;cursor:pointer;min-width:120px;text-align:left`;

  const updateTrigger = (sp: string | null): void => {
    trigger.innerHTML = '';
    if (sp) {
      const url = getCropSpriteDataUrl(sp);
      if (url) {
        const img = document.createElement('img');
        img.src = url;
        img.alt = sp;
        img.style.cssText = 'width:24px;height:24px;image-rendering:pixelated;object-fit:contain;flex-shrink:0';
        trigger.appendChild(img);
      }
      const lbl = document.createElement('span');
      lbl.textContent = sp;
      trigger.appendChild(lbl);
    } else {
      const lbl = document.createElement('span');
      lbl.textContent = 'Select plant...';
      lbl.style.color = TEXT_MUTED as string;
      trigger.appendChild(lbl);
    }
    const chev = document.createElement('span');
    chev.textContent = '\u25BE';
    chev.style.cssText = `margin-left:auto;color:${TEXT_MUTED};font-size:10px`;
    trigger.appendChild(chev);
  };
  updateTrigger(selected);

  // Dropdown panel
  const dropdown = document.createElement('div');
  dropdown.style.cssText = `display:none;position:absolute;top:100%;left:0;right:0;z-index:100;margin-top:4px;max-height:320px;overflow-y:auto;border-radius:8px;border:1px solid rgba(143,130,255,0.4);background:rgba(18,20,26,0.97);padding:8px;box-shadow:0 8px 24px rgba(0,0,0,0.5)`;

  // Content container (below show-all toggle)
  const contentSlot = document.createElement('div');

  // Show All toggle inside dropdown
  const toggleRow = document.createElement('div');
  toggleRow.style.cssText = 'display:flex;justify-content:flex-end;padding:0 0 4px';
  const showAllBtn = document.createElement('button');
  showAllBtn.type = 'button';
  showAllBtn.textContent = 'Show All';
  showAllBtn.style.cssText = `background:none;border:none;color:${TEXT_MUTED};font-size:10px;cursor:pointer;padding:2px 4px;text-decoration:underline`;
  showAllBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    showAll = !showAll;
    showAllBtn.textContent = showAll ? 'Show Eligible' : 'Show All';
    rebuildContent();
  });
  toggleRow.appendChild(showAllBtn);
  dropdown.append(toggleRow, contentSlot);

  const pickHandler = (sp: string): void => {
    onSelect(sp);
    updateTrigger(sp);
    closeDropdown();
  };

  function rebuildContent(): void {
    if (!areCatalogsReady()) {
      contentSlot.innerHTML = '';
      contentSlot.appendChild(makeHint('Plant catalog not loaded.'));
      return;
    }
    const all = getAllPlantSpecies();
    const filtered = showAll ? all : all.filter(sp => eligible.has(sp));
    buildPickerDropdownContent(contentSlot, filtered, pickHandler);
  }

  rebuildContent();

  let isOpen = false;
  const closeDropdown = (): void => { dropdown.style.display = 'none'; isOpen = false; };

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    if (isOpen) { closeDropdown(); return; }
    dropdown.style.display = 'block';
    isOpen = true;
  });

  const onDocClick = (e: MouseEvent): void => {
    if (isOpen && !wrap.contains(e.target as Node)) closeDropdown();
  };
  document.addEventListener('click', onDocClick, true);

  wrap.append(trigger, dropdown);
  return wrap;
}

// ── Custom mutation toggle grid (multi-select, same style as garden tiles) ──

function renderMutationTiles(
  container: HTMLElement,
  mutationIds: string[],
  selectedMuts: Set<string>,
  onChange: () => void,
): void {
  container.innerHTML = '';
  if (mutationIds.length === 0) {
    container.appendChild(makeHint('No mutations available.'));
    return;
  }
  for (const mutId of mutationIds) {
    const vb = findVariantBadge(mutId);
    const color = vb?.color ?? '#888';
    const gradient = vb?.gradient;
    const displayName = getMutation(mutId)?.name ?? mutId;

    const tile = document.createElement('div');
    tile.title = displayName;

    const isSelected = (): boolean => selectedMuts.has(mutId);

    tile.style.cssText = `padding:6px 10px;border-radius:8px;cursor:pointer;display:flex;align-items:center;gap:6px;transition:background .15s,border-color .15s,color .15s;border:1.5px solid ${isSelected() ? color : UNLOCKED_BORDER};background:${isSelected() ? (gradient ?? color) : UNLOCKED_BG}`;

    const dot = document.createElement('div');
    dot.style.cssText = `width:10px;height:10px;border-radius:50%;flex-shrink:0;transition:background .15s;background:${isSelected() ? 'rgba(0,0,0,0.2)' : (gradient ?? color)}`;

    const label = document.createElement('div');
    label.textContent = displayName;
    label.style.cssText = `font-size:11px;font-weight:600;white-space:nowrap;transition:color .15s;color:${isSelected() ? '#111' : TEXT_MUTED}`;

    tile.append(dot, label);

    const applyStyle = (): void => {
      const sel = isSelected();
      tile.style.borderColor = sel ? color : UNLOCKED_BORDER;
      tile.style.background = sel ? (gradient ?? color) : UNLOCKED_BG;
      dot.style.background = sel ? 'rgba(0,0,0,0.2)' : (gradient ?? color);
      label.style.color = sel ? '#111' : TEXT_MUTED as string;
    };

    tile.addEventListener('mouseenter', () => { if (!isSelected()) { tile.style.background = `${color}18`; tile.style.borderColor = `${color}55`; } });
    tile.addEventListener('mouseleave', () => { if (!isSelected()) { tile.style.background = UNLOCKED_BG; tile.style.borderColor = UNLOCKED_BORDER; } });
    tile.addEventListener('click', () => {
      if (selectedMuts.has(mutId)) selectedMuts.delete(mutId);
      else selectedMuts.add(mutId);
      applyStyle();
      onChange();
    });

    container.appendChild(tile);
  }
}

// ── Custom Rules card ───────────────────────────────────────────────────────

function buildCustomRulesCard(config: LockerConfig): HTMLElement {
  const { root, body } = createCard('Custom Rules', { collapsible: true });

  const eligible = getEligibleData();

  // State for the add-rule builder
  let selectedSpecies: string | null = null;
  const selectedMutations = new Set<string>();

  // ── Plant picker ──
  const plantLabel = document.createElement('div');
  plantLabel.textContent = 'Plant';
  plantLabel.style.cssText = LABEL_CSS + ';font-size:12px;padding:2px 0';
  body.appendChild(plantLabel);

  const plantPicker = buildPlantPicker(null, eligible.species, (sp) => {
    selectedSpecies = sp;
    updateAddBtn();
  });
  body.appendChild(plantPicker);

  // ── Mutation picker ──
  const mutLabelEl = document.createElement('div');
  mutLabelEl.textContent = 'Mutations';
  mutLabelEl.style.cssText = LABEL_CSS + ';font-size:12px;padding:6px 0 2px';
  body.appendChild(mutLabelEl);

  const mutGrid = document.createElement('div');
  mutGrid.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;padding:4px 0';

  function rebuildMutGrid(): void {
    if (!areCatalogsReady()) {
      mutGrid.innerHTML = '';
      mutGrid.appendChild(makeHint('Mutation catalog not loaded.'));
      return;
    }
    renderMutationTiles(mutGrid, getAllMutations().sort(), selectedMutations, () => { updateAddBtn(); });
  }
  rebuildMutGrid();
  body.appendChild(mutGrid);

  // ── Add button ──
  const addBtn = document.createElement('button');
  addBtn.textContent = '+ Add Rules';
  addBtn.style.cssText = `padding:6px 14px;border-radius:6px;border:1px solid rgba(143,130,255,0.5);background:rgba(143,130,255,0.15);color:#8f82ff;font-size:11px;font-weight:600;cursor:pointer;align-self:flex-start;margin-top:2px`;
  addBtn.disabled = true;
  addBtn.style.opacity = '0.5';

  function ruleKey(species: string, mutations: string[]): string {
    return `${species}\0${[...mutations].sort().join('\0')}`;
  }

  const updateAddBtn = (): void => {
    if (!selectedSpecies || selectedMutations.size === 0) {
      addBtn.disabled = true;
      addBtn.style.opacity = '0.5';
      return;
    }
    const cur = getLockerConfig();
    const existing = new Set(cur.customRules.map(r => ruleKey(r.species, r.mutations)));
    const key = ruleKey(selectedSpecies, [...selectedMutations]);
    const isNew = !existing.has(key);
    addBtn.disabled = !isNew;
    addBtn.style.opacity = isNew ? '1' : '0.5';
  };

  addBtn.addEventListener('click', () => {
    if (!selectedSpecies || selectedMutations.size === 0) return;
    const cur = getLockerConfig();
    const existing = new Set(cur.customRules.map(r => ruleKey(r.species, r.mutations)));
    const muts = [...selectedMutations].sort();
    const key = ruleKey(selectedSpecies, muts);
    if (existing.has(key)) return;
    const newRules = [...cur.customRules, { species: selectedSpecies, mutations: muts }];
    updateLockerConfig({ customRules: newRules });
    selectedMutations.clear();
    rebuildMutGrid();
    refreshRuleList();
  });
  body.appendChild(addBtn);

  // ── Divider ──
  const divider = document.createElement('div');
  divider.style.cssText = 'height:1px;background:rgba(255,255,255,0.08);margin:4px 0';
  body.appendChild(divider);

  // ── Rule list ──
  const ruleListLabel = document.createElement('div');
  ruleListLabel.textContent = 'Active Rules';
  ruleListLabel.style.cssText = LABEL_CSS + ';font-size:12px;padding:2px 0';
  body.appendChild(ruleListLabel);

  const ruleList = document.createElement('div');
  ruleList.style.cssText = 'display:flex;flex-direction:column;gap:4px';

  function renderRuleRow(rule: CustomRule, index: number): HTMLElement {
    const row = document.createElement('div');
    row.style.cssText = `display:flex;align-items:center;gap:8px;padding:4px 8px;border-radius:6px;background:${UNLOCKED_BG};border:1px solid ${UNLOCKED_BORDER}`;

    // Sprite reflects all mutations in the rule
    const spriteUrl = getCropSpriteDataUrlWithMutations(rule.species, rule.mutations) || getCropSpriteDataUrl(rule.species);
    if (spriteUrl) {
      const img = document.createElement('img');
      img.src = spriteUrl;
      img.alt = rule.species;
      img.style.cssText = 'width:24px;height:24px;image-rendering:pixelated;object-fit:contain;flex-shrink:0';
      row.appendChild(img);
    }

    const speciesLabel = document.createElement('span');
    speciesLabel.textContent = rule.species;
    speciesLabel.style.cssText = 'font-size:12px;color:var(--qpm-text,#fff);flex-shrink:0';
    row.appendChild(speciesLabel);

    const sep = document.createElement('span');
    sep.textContent = '\u00d7';
    sep.style.cssText = `font-size:12px;color:${TEXT_MUTED};flex-shrink:0`;
    row.appendChild(sep);

    // All mutation dots + names inline
    const mutsWrap = document.createElement('div');
    mutsWrap.style.cssText = 'display:flex;align-items:center;gap:4px;flex-wrap:wrap;flex:1;min-width:0';
    for (let i = 0; i < rule.mutations.length; i++) {
      const mut = rule.mutations[i];
      const vb = findVariantBadge(mut);
      const dotColor = vb?.color ?? '#888';
      const dotGradient = vb?.gradient;

      if (i > 0) {
        const plus = document.createElement('span');
        plus.textContent = '+';
        plus.style.cssText = `font-size:10px;color:${TEXT_MUTED}`;
        mutsWrap.appendChild(plus);
      }

      const chip = document.createElement('span');
      chip.style.cssText = `display:inline-flex;align-items:center;gap:3px`;

      const dot = document.createElement('div');
      dot.style.cssText = `width:8px;height:8px;border-radius:50%;flex-shrink:0;background:${dotGradient ?? dotColor}`;
      chip.appendChild(dot);

      const name = document.createElement('span');
      name.textContent = getMutation(mut)?.name ?? mut;
      name.style.cssText = 'font-size:11px;color:var(--qpm-text,#fff);white-space:nowrap';
      chip.appendChild(name);

      mutsWrap.appendChild(chip);
    }
    row.appendChild(mutsWrap);

    const delBtn = document.createElement('button');
    delBtn.textContent = '\ud83d\uddd1\ufe0f';
    delBtn.title = 'Remove rule';
    delBtn.style.cssText = 'background:none;border:none;cursor:pointer;font-size:14px;padding:0 2px;line-height:1;opacity:0.6;flex-shrink:0';
    delBtn.addEventListener('mouseenter', () => { delBtn.style.opacity = '1'; });
    delBtn.addEventListener('mouseleave', () => { delBtn.style.opacity = '0.6'; });
    delBtn.addEventListener('click', () => {
      const cur = getLockerConfig();
      const next = cur.customRules.filter((_, i) => i !== index);
      updateLockerConfig({ customRules: next });
      refreshRuleList();
    });
    row.appendChild(delBtn);

    return row;
  }

  function refreshRuleList(): void {
    ruleList.innerHTML = '';
    const cur = getLockerConfig();
    if (cur.customRules.length === 0) {
      ruleList.appendChild(makeHint('No custom rules yet.'));
    } else {
      for (let i = 0; i < cur.customRules.length; i++) {
        ruleList.appendChild(renderRuleRow(cur.customRules[i], i));
      }
    }
    updateAddBtn();
  }

  body.appendChild(ruleList);
  refreshRuleList();

  if (!config.enabled) root.style.opacity = '0.55';
  return root;
}

// ── Tab panel builders ──────────────────────────────────────────────────────

function buildPlantsPanel(config: LockerConfig, eligible: EligibleData): HTMLElement {
  const panel = document.createElement('div');
  panel.style.cssText = 'display:flex;flex-direction:column;gap:10px';

  // ── Plant Locker card ──
  const blockAllCb = makeBlockAllCheckbox('Block All', config.harvestLock, (v) => {
    updateLockerConfig({ harvestLock: v });
  });

  const { root: lockerRoot, body: lockerBody } = createCard('Plant Locker', {
    collapsible: true,
    headerActions: [blockAllCb],
  });

  const showAllBtn = makeShowAllToggle((showAll) => rebuildPlantGrid(showAll));
  lockerBody.appendChild(showAllBtn);

  const plantGridSlot = document.createElement('div');

  function rebuildPlantGrid(showAll: boolean): void {
    plantGridSlot.innerHTML = '';
    if (!areCatalogsReady()) {
      plantGridSlot.appendChild(makeHint('Plant catalog not loaded. Reload page.'));
      return;
    }
    const all = getAllPlantSpecies();
    const filtered = showAll ? all : all.filter(sp => eligible.species.has(sp));
    if (filtered.length > 0) {
      plantGridSlot.appendChild(buildRarityGrid(filtered, config.plantLocks, 'plantLocks'));
    } else {
      plantGridSlot.appendChild(makeHint('No plants in garden or inventory.'));
    }
  }

  rebuildPlantGrid(false);
  lockerBody.appendChild(plantGridSlot);

  // Mutations sub-section (always show all)
  if (areCatalogsReady()) {
    const mutations = getAllMutations();
    if (mutations.length > 0) {
      const divider = document.createElement('div');
      divider.style.cssText = 'height:1px;background:rgba(255,255,255,0.08);margin:4px 0';
      lockerBody.appendChild(divider);

      const mutHeader = document.createElement('div');
      mutHeader.textContent = 'Mutations';
      mutHeader.style.cssText = LABEL_CSS + ';font-size:12px;padding:2px 0 2px';
      lockerBody.appendChild(mutHeader);

      lockerBody.appendChild(makeHint('Block harvesting any plant with these mutations.'));

      const mutGrid = makeGrid();
      for (const mutId of mutations.sort()) {
        mutGrid.appendChild(makeMutationTile(mutId, config.mutationLocks[mutId] === true, (next) => {
          const cur = getLockerConfig();
          const locks = { ...cur.mutationLocks, [mutId]: next };
          if (!next) delete locks[mutId];
          updateLockerConfig({ mutationLocks: locks });
        }));
      }
      lockerBody.appendChild(mutGrid);
    }
  }

  if (!config.enabled) lockerRoot.style.opacity = '0.55';
  panel.appendChild(lockerRoot);

  // Custom Rules card
  panel.appendChild(buildCustomRulesCard(config));

  return panel;
}

function buildEggsPanel(config: LockerConfig, eligible: EligibleData): HTMLElement {
  const panel = document.createElement('div');
  panel.style.cssText = 'display:flex;flex-direction:column;gap:10px';

  // ── Egg Locker card ──
  const blockAllCb = makeBlockAllCheckbox('Block All', config.hatchLock, (v) => {
    updateLockerConfig({ hatchLock: v });
  });

  const { root: lockerRoot, body: lockerBody } = createCard('Egg Locker', {
    collapsible: true,
    headerActions: [blockAllCb],
  });

  const showAllBtn = makeShowAllToggle((showAll) => rebuildEggGrid(showAll));
  lockerBody.appendChild(showAllBtn);

  const eggGridSlot = document.createElement('div');

  function rebuildEggGrid(showAll: boolean): void {
    eggGridSlot.innerHTML = '';
    if (!areCatalogsReady()) {
      eggGridSlot.appendChild(makeHint('Egg catalog not loaded. Reload page.'));
      return;
    }
    const catalog = getEggCatalog();
    if (!catalog || Object.keys(catalog).length === 0) {
      eggGridSlot.appendChild(makeHint('No eggs found in catalog.'));
      return;
    }
    const allIds = Object.keys(catalog).sort();
    const filtered = showAll ? allIds : allIds.filter(id => eligible.eggs.has(id));
    if (filtered.length === 0) {
      eggGridSlot.appendChild(makeHint('No eggs in garden or inventory.'));
      return;
    }
    const grid = makeGrid();
    for (const eggId of filtered) {
      const entry = catalog[eggId];
      grid.appendChild(makeLockTile(entry?.name ?? eggId, resolveEggSprite(eggId), config.eggLocks[eggId] === true, (next) => {
        const cur = getLockerConfig();
        const locks = { ...cur.eggLocks, [eggId]: next };
        if (!next) delete locks[eggId];
        updateLockerConfig({ eggLocks: locks });
      }));
    }
    eggGridSlot.appendChild(grid);
  }

  rebuildEggGrid(false);
  lockerBody.appendChild(eggGridSlot);

  if (!config.enabled) lockerRoot.style.opacity = '0.55';
  panel.appendChild(lockerRoot);

  return panel;
}

function buildDecorPanel(config: LockerConfig, eligible: EligibleData): HTMLElement {
  const panel = document.createElement('div');
  panel.style.cssText = 'display:flex;flex-direction:column;gap:10px';

  // ── Decor Locker card ──
  const blockAllCb = makeBlockAllCheckbox('Block All', config.decorPickupLock, (v) => {
    updateLockerConfig({ decorPickupLock: v });
  });

  const { root: lockerRoot, body: lockerBody } = createCard('Decor Locker', {
    collapsible: true,
    headerActions: [blockAllCb],
  });

  const showAllBtn = makeShowAllToggle((showAll) => rebuildDecorGrid(showAll));
  lockerBody.appendChild(showAllBtn);

  const decorGridSlot = document.createElement('div');

  function rebuildDecorGrid(showAll: boolean): void {
    decorGridSlot.innerHTML = '';
    if (!areCatalogsReady()) {
      decorGridSlot.appendChild(makeHint('Decor catalog not loaded. Reload page.'));
      return;
    }
    const allIds = getAllDecor();
    if (allIds.length === 0) {
      decorGridSlot.appendChild(makeHint('No decor items found in catalog.'));
      return;
    }
    const sorted = allIds.sort();
    const filtered = showAll ? sorted : sorted.filter(id => eligible.decor.has(id));
    if (filtered.length === 0) {
      decorGridSlot.appendChild(makeHint('No decor in garden or inventory.'));
      return;
    }
    const grid = makeGrid();
    for (const id of filtered) {
      const entry = getDecor(id);
      grid.appendChild(makeLockTile(entry?.name ?? id, resolveDecorSprite(id), config.decorLocks[id] === true, (next) => {
        const cur = getLockerConfig();
        const locks = { ...cur.decorLocks, [id]: next };
        if (!next) delete locks[id];
        updateLockerConfig({ decorLocks: locks });
      }));
    }
    decorGridSlot.appendChild(grid);
  }

  rebuildDecorGrid(false);
  lockerBody.appendChild(decorGridSlot);

  if (!config.enabled) lockerRoot.style.opacity = '0.55';
  panel.appendChild(lockerRoot);

  return panel;
}

function buildSellPanel(config: LockerConfig, eligible: EligibleData): HTMLElement {
  const panel = document.createElement('div');
  panel.style.cssText = 'display:flex;flex-direction:column;gap:10px';

  // ── Crop Sell Protection card ──
  const cropBlockAllCb = makeBlockAllCheckbox('Block All', config.sellAllCropsLock, (v) => {
    updateLockerConfig({ sellAllCropsLock: v });
  });

  const { root: cropSellRoot, body: cropSellBody } = createCard('Crop Sell Protection', {
    collapsible: true,
    headerActions: [cropBlockAllCb],
  });

  const cropShowAllBtn = makeShowAllToggle((showAll) => rebuildCropSellGrid(showAll));
  cropSellBody.appendChild(cropShowAllBtn);
  cropSellBody.appendChild(makeHint('Lock specific crops to block Sell All Crops.'));

  const cropSellGridSlot = document.createElement('div');

  function rebuildCropSellGrid(showAll: boolean): void {
    cropSellGridSlot.innerHTML = '';
    if (!areCatalogsReady()) {
      cropSellGridSlot.appendChild(makeHint('Plant catalog not loaded. Reload page.'));
      return;
    }
    const all = getAllPlantSpecies();
    const filtered = showAll ? all : all.filter(sp => eligible.species.has(sp));
    if (filtered.length > 0) {
      cropSellGridSlot.appendChild(buildRarityGrid(filtered, config.cropSellLocks, 'cropSellLocks'));
    } else {
      cropSellGridSlot.appendChild(makeHint('No plants in garden or inventory.'));
    }
  }

  rebuildCropSellGrid(false);
  cropSellBody.appendChild(cropSellGridSlot);

  if (!config.enabled) cropSellRoot.style.opacity = '0.55';
  panel.appendChild(cropSellRoot);

  // ── Sell All Pets Protections card ──
  panel.appendChild(buildSellAllPetsCard());

  return panel;
}

// ── Cross-cutting cards (always visible below tabs) ─────────────────────────

function buildInventoryReserveCard(config: LockerConfig): HTMLElement {
  const { root, body } = createCard('Inventory Reserve', { collapsible: true, startCollapsed: true });

  body.appendChild(makeHint('Blocks actions when your inventory (cap: 100) would drop below the reserved slots.'));

  body.appendChild(makeToggleRow('Enable Inventory Reserve', config.inventoryReserve.enabled, (v) => {
    updateLockerConfig({ inventoryReserve: { ...getLockerConfig().inventoryReserve, enabled: v } });
  }));

  // Min free slots
  const sliderWrap = document.createElement('div');
  sliderWrap.style.cssText = `display:flex;flex-direction:column;gap:4px;padding:6px 10px;border-radius:8px;border:1px solid ${UNLOCKED_BORDER};background:${UNLOCKED_BG}`;

  const sliderHeader = document.createElement('div');
  sliderHeader.style.cssText = 'display:flex;align-items:center;justify-content:space-between';
  const sliderLabel = document.createElement('div');
  sliderLabel.style.cssText = 'font-size:12px;color:var(--qpm-text,#fff)';
  sliderLabel.textContent = 'Min Free Slots';
  const sliderValue = document.createElement('div');
  sliderValue.style.cssText = `font-size:12px;color:${ACCENT};font-weight:600`;
  sliderValue.textContent = String(config.inventoryReserve.minFreeSlots);
  sliderHeader.append(sliderLabel, sliderValue);

  const slider = document.createElement('input');
  slider.type = 'range'; slider.min = '0'; slider.max = '50'; slider.step = '1';
  slider.value = String(config.inventoryReserve.minFreeSlots);
  slider.style.cssText = 'width:100%;cursor:pointer';
  slider.addEventListener('input', () => { sliderValue.textContent = slider.value; });
  slider.addEventListener('change', () => {
    updateLockerConfig({ inventoryReserve: { ...getLockerConfig().inventoryReserve, minFreeSlots: Number(slider.value) } });
  });
  sliderWrap.append(sliderHeader, slider);
  body.appendChild(sliderWrap);

  if (!config.enabled) root.style.opacity = '0.55';
  return root;
}

function buildSellAllPetsCard(): HTMLElement {
  const { root, body } = createCard('Sell All Pets Protections', { collapsible: true });
  const rules = getSellAllPetsSettings().protections;

  body.appendChild(makeToggleRow('Enable Protections', rules.enabled, (v) => { setSellAllPetsProtectionRules({ enabled: v }); }));
  body.appendChild(makeToggleRow('Protect Gold', rules.protectGold, (v) => { setSellAllPetsProtectionRules({ protectGold: v }); }));
  body.appendChild(makeToggleRow('Protect Rainbow', rules.protectRainbow, (v) => { setSellAllPetsProtectionRules({ protectRainbow: v }); }));
  body.appendChild(makeToggleRow('Protect Max STR', rules.protectMaxStr, (v) => { setSellAllPetsProtectionRules({ protectMaxStr: v }); }));

  // STR threshold
  const strWrap = document.createElement('div');
  strWrap.style.cssText = `display:flex;flex-direction:column;gap:4px;padding:6px 10px;border-radius:8px;border:1px solid ${UNLOCKED_BORDER};background:${UNLOCKED_BG}`;
  const strHeader = document.createElement('div');
  strHeader.style.cssText = 'display:flex;align-items:center;justify-content:space-between';
  const strLabel = document.createElement('div');
  strLabel.style.cssText = 'font-size:12px;color:var(--qpm-text,#fff)';
  strLabel.textContent = 'Max STR Threshold';
  const strValue = document.createElement('div');
  strValue.style.cssText = `font-size:12px;color:${ACCENT};font-weight:600`;
  strValue.textContent = `${rules.maxStrThreshold}%`;
  strHeader.append(strLabel, strValue);

  const strSlider = document.createElement('input');
  strSlider.type = 'range'; strSlider.min = '0'; strSlider.max = '100'; strSlider.step = '5';
  strSlider.value = String(rules.maxStrThreshold);
  strSlider.style.cssText = 'width:100%;cursor:pointer';
  strSlider.addEventListener('input', () => { strValue.textContent = `${strSlider.value}%`; });
  strSlider.addEventListener('change', () => { setSellAllPetsProtectionRules({ maxStrThreshold: Number(strSlider.value) }); });
  strWrap.append(strHeader, strSlider);
  body.appendChild(strWrap);

  // Protected rarities
  const rarityWrap = document.createElement('div');
  rarityWrap.style.cssText = `display:flex;flex-direction:column;gap:4px;padding:6px 10px;border-radius:8px;border:1px solid ${UNLOCKED_BORDER};background:${UNLOCKED_BG}`;
  const rarityLabel = document.createElement('div');
  rarityLabel.style.cssText = 'font-size:12px;color:var(--qpm-text,#fff);margin-bottom:2px';
  rarityLabel.textContent = 'Protected Rarities';
  rarityWrap.appendChild(rarityLabel);

  const currentProtected = new Set(rules.protectedRarities.map(r => r.toLowerCase()));
  for (const rarity of SELL_ALL_PET_RARITY_OPTIONS) {
    const row = document.createElement('label');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;cursor:pointer;padding:1px 0';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = currentProtected.has(rarity.toLowerCase());
    cb.style.cssText = `width:14px;height:14px;cursor:pointer;accent-color:${ACCENT}`;
    cb.addEventListener('change', () => {
      const cur = getSellAllPetsSettings().protections.protectedRarities;
      const set = new Set(cur.map(r => r.toLowerCase()));
      if (cb.checked) set.add(rarity.toLowerCase()); else set.delete(rarity.toLowerCase());
      setSellAllPetsProtectionRules({ protectedRarities: SELL_ALL_PET_RARITY_OPTIONS.filter(r => set.has(r.toLowerCase())) });
    });
    const cbLabel = document.createElement('span');
    cbLabel.style.cssText = 'font-size:11px;color:var(--qpm-text,#fff)';
    cbLabel.textContent = rarity;
    row.append(cb, cbLabel);
    rarityWrap.appendChild(row);
  }
  body.appendChild(rarityWrap);
  return root;
}

// ── Tabbed layout ───────────────────────────────────────────────────────────

const TAB_DEFS = [
  { id: 'plants', label: '\ud83c\udf31 Plants' },
  { id: 'eggs',   label: '\ud83e\udd5a Eggs' },
  { id: 'decor',  label: '\ud83e\ude91 Decor' },
  { id: 'sell',   label: '\ud83d\udcb0 Sell' },
] as const;

type TabId = typeof TAB_DEFS[number]['id'];

function buildTabBar(activeTab: TabId, onSwitch: (id: TabId) => void): HTMLElement {
  const bar = document.createElement('div');
  bar.style.cssText = 'display:flex;gap:0;border-bottom:1px solid rgba(255,255,255,0.08)';

  for (const tab of TAB_DEFS) {
    const btn = document.createElement('button');
    btn.textContent = tab.label;
    const isActive = tab.id === activeTab;
    btn.style.cssText = `flex:1;padding:8px 0;background:none;border:none;border-bottom:2px solid ${isActive ? '#8f82ff' : 'transparent'};color:${isActive ? '#8f82ff' : TEXT_MUTED};font-size:12px;font-weight:600;cursor:pointer;transition:color .15s,border-color .15s`;
    btn.addEventListener('mouseenter', () => { if (tab.id !== activeTab) btn.style.color = 'rgba(143,130,255,0.7)'; });
    btn.addEventListener('mouseleave', () => { if (tab.id !== activeTab) btn.style.color = TEXT_MUTED as string; });
    btn.addEventListener('click', () => onSwitch(tab.id));
    bar.appendChild(btn);
  }

  return bar;
}

// ── Main export ─────────────────────────────────────────────────────────────

export function createLockerSection(): HTMLElement {
  const container = document.createElement('div');
  container.style.cssText = 'display:flex;flex-direction:column;gap:10px';

  function render(): void {
    container.innerHTML = '';
    const cfg = getLockerConfig();

    // ── Master toggle (always visible) ──
    const masterRow = document.createElement('label');
    masterRow.style.cssText = TOGGLE_ROW_CSS;
    const masterText = document.createElement('div');
    masterText.style.cssText = LABEL_CSS;
    masterText.textContent = 'Enable Locker';
    const masterInput = document.createElement('input');
    masterInput.type = 'checkbox';
    masterInput.checked = cfg.enabled;
    masterInput.style.cssText = CHECKBOX_CSS;
    masterInput.addEventListener('change', () => {
      updateLockerConfig({ enabled: masterInput.checked });
      render();
    });
    masterRow.append(masterText, masterInput);
    container.appendChild(masterRow);

    // ── Tabs ──
    let activeTab: TabId = 'plants';
    const eligible = getEligibleData();

    // Build all panels once
    const panels: Record<TabId, HTMLElement> = {
      plants: buildPlantsPanel(cfg, eligible),
      eggs:   buildEggsPanel(cfg, eligible),
      decor:  buildDecorPanel(cfg, eligible),
      sell:   buildSellPanel(cfg, eligible),
    };

    // Hide non-active panels
    for (const [id, panel] of Object.entries(panels)) {
      panel.style.display = id === activeTab ? 'flex' : 'none';
    }

    const tabBarSlot = document.createElement('div');
    const panelSlot = document.createElement('div');

    function switchTab(id: TabId): void {
      if (id === activeTab) return;
      panels[activeTab].style.display = 'none';
      activeTab = id;
      panels[activeTab].style.display = 'flex';
      tabBarSlot.innerHTML = '';
      tabBarSlot.appendChild(buildTabBar(activeTab, switchTab));
    }

    tabBarSlot.appendChild(buildTabBar(activeTab, switchTab));
    for (const panel of Object.values(panels)) panelSlot.appendChild(panel);

    container.appendChild(tabBarSlot);
    container.appendChild(panelSlot);

    // ── Inventory Reserve (always visible below tabs) ──
    container.appendChild(buildInventoryReserveCard(cfg));
  }

  render();
  return container;
}
