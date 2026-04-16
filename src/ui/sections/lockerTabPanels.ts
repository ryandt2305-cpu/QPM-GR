// src/ui/sections/lockerTabPanels.ts
// Tab panel builders and cross-cutting cards for the Locker UI.

import { createCard } from '../panelHelpers';
import { getLockerConfig, updateLockerConfig, type LockerConfig } from '../../features/locker/index';
import {
  areCatalogsReady, getEggCatalog, getAllPlantSpecies,
  getAllDecor, getDecor, getAllMutations,
} from '../../catalogs/gameCatalogs';
import {
  getSellAllPetsSettings, setSellAllPetsProtectionRules, SELL_ALL_PET_RARITY_OPTIONS,
} from '../../features/sellAllPets';
import {
  UNLOCKED_BG, UNLOCKED_BORDER, ACCENT, TEXT_MUTED, LABEL_CSS,
  type EligibleData,
  resolveEggSprite, resolveDecorSprite,
  makeToggleRow, makeBlockAllCheckbox, makeShowAllToggle, makeHint, makeGrid,
  makeLockTile, makeMutationTile, buildRarityGrid,
} from './lockerPrimitives';
import { buildCustomRulesCard } from './lockerCustomRules';

// ── Plants Panel ────────────────────────────────────────────────────────────

export function buildPlantsPanel(config: LockerConfig, eligible: EligibleData): HTMLElement {
  const panel = document.createElement('div');
  panel.style.cssText = 'display:flex;flex-direction:column;gap:10px';

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
      plantGridSlot.appendChild(buildRarityGrid(filtered, getLockerConfig().plantLocks, 'plantLocks'));
    } else {
      plantGridSlot.appendChild(makeHint('No plants in garden or inventory.'));
    }
  }

  rebuildPlantGrid(false);
  lockerBody.appendChild(plantGridSlot);

  // Mutations sub-section
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
        mutGrid.appendChild(makeMutationTile(
          mutId,
          () => getLockerConfig().mutationLocks[mutId] === true,
          () => {
            const cur = getLockerConfig();
            const next = !cur.mutationLocks[mutId];
            const locks = { ...cur.mutationLocks, [mutId]: next };
            if (!next) delete locks[mutId];
            updateLockerConfig({ mutationLocks: locks });
          },
        ));
      }
      lockerBody.appendChild(mutGrid);
    }
  }

  if (!config.enabled) lockerRoot.style.opacity = '0.55';
  panel.appendChild(lockerRoot);

  // Custom Rules card
  panel.appendChild(buildCustomRulesCard(config, eligible));

  return panel;
}

// ── Eggs Panel ──────────────────────────────────────────────────────────────

export function buildEggsPanel(config: LockerConfig, eligible: EligibleData): HTMLElement {
  const panel = document.createElement('div');
  panel.style.cssText = 'display:flex;flex-direction:column;gap:10px';

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
    const liveEggLocks = getLockerConfig().eggLocks;
    const grid = makeGrid();
    for (const eggId of filtered) {
      const entry = catalog[eggId];
      grid.appendChild(makeLockTile(entry?.name ?? eggId, resolveEggSprite(eggId), liveEggLocks[eggId] === true, (next) => {
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

// ── Decor Panel ─────────────────────────────────────────────────────────────

export function buildDecorPanel(config: LockerConfig, eligible: EligibleData): HTMLElement {
  const panel = document.createElement('div');
  panel.style.cssText = 'display:flex;flex-direction:column;gap:10px';

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
    const liveDecorLocks = getLockerConfig().decorLocks;
    const grid = makeGrid();
    for (const id of filtered) {
      const entry = getDecor(id);
      grid.appendChild(makeLockTile(entry?.name ?? id, resolveDecorSprite(id), liveDecorLocks[id] === true, (next) => {
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

// ── Sell Panel ──────────────────────────────────────────────────────────────

export function buildSellPanel(config: LockerConfig, eligible: EligibleData): HTMLElement {
  const panel = document.createElement('div');
  panel.style.cssText = 'display:flex;flex-direction:column;gap:10px';

  // Crop Sell Protection card
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
      cropSellGridSlot.appendChild(buildRarityGrid(filtered, getLockerConfig().cropSellLocks, 'cropSellLocks'));
    } else {
      cropSellGridSlot.appendChild(makeHint('No plants in garden or inventory.'));
    }
  }

  rebuildCropSellGrid(false);
  cropSellBody.appendChild(cropSellGridSlot);

  if (!config.enabled) cropSellRoot.style.opacity = '0.55';
  panel.appendChild(cropSellRoot);

  // Sell All Pets Protections card
  panel.appendChild(buildSellAllPetsCard());

  return panel;
}

// ── Cross-cutting cards ─────────────────────────────────────────────────────

export function buildInventoryReserveCard(config: LockerConfig): HTMLElement {
  const { root, body } = createCard('Inventory Reserve', { collapsible: true, startCollapsed: true });

  body.appendChild(makeHint('Blocks actions when your inventory (cap: 100) would drop below the reserved slots.'));

  body.appendChild(makeToggleRow('Enable Inventory Reserve', config.inventoryReserve.enabled, (v) => {
    updateLockerConfig({ inventoryReserve: { ...getLockerConfig().inventoryReserve, enabled: v } });
  }));

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
