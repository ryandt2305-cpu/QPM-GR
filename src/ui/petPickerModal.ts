// src/ui/petPickerModal.ts
// Pet picker modal for selecting a pet to assign to a team slot.
// Shows all pooled pets (active + hutch + inventory) with sprite previews,
// search/filter, sort, tier filter, mutation tier borders, ability dots,
// a rich hover panel, and a compare mode for side-by-side stat comparison.

import { log } from '../utils/logger';
import { getAllPooledPets } from '../store/petTeams';
import { getPetSpriteDataUrlWithMutations, isSpritesReady } from '../sprite-v2/compat';
import { getAbilityColor } from '../utils/petCardRenderer';
import { getAbilityDefinition, computeAbilityStats, computeEffectPerHour } from '../data/petAbilities';
import { findAbilityHistoryForIdentifiers } from '../store/abilityLogs';
import { computeObservedMetrics } from './abilityAnalysis';
import { calculateMaxStrength, getSpeciesXpPerLevel } from '../store/xpTracker';
import type { PooledPet } from '../types/petTeams';
import { formatCoinsAbbreviated } from '../features/valueCalculator';
import { getPetMetadata } from '../data/petMetadata';
import { getHungerDepletionTime } from '../data/petHungerDepletion';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface PickerState {
  container: HTMLDivElement;
  overlay: HTMLDivElement;
  cleanups: Array<() => void>;
  onSelect: (petItemId: string) => void;
  onCancel: () => void;
}

let activeState: PickerState | null = null;

// ---------------------------------------------------------------------------
// Mutation tier helpers
// ---------------------------------------------------------------------------

type MutationTier = 'rainbow' | 'gold' | 'mutated' | 'none';

function getMutationTier(mutations: string[]): MutationTier {
  if (mutations.some(m => /rainbow/i.test(m))) return 'rainbow';
  if (mutations.some(m => /gold(?:en)?/i.test(m))) return 'gold';
  if (mutations.length > 0) return 'mutated';
  return 'none';
}

function getTierLabel(tier: MutationTier): string {
  switch (tier) {
    case 'rainbow': return '🌈';
    case 'gold': return '⭐';
    case 'mutated': return '✨';
    default: return '';
  }
}

function getLocationLabel(location: PooledPet['location']): string {
  switch (location) {
    case 'active': return 'Active';
    case 'hutch': return 'Hutch';
    default: return 'Bag';
  }
}

// ---------------------------------------------------------------------------
// Bar renderer helper
// ---------------------------------------------------------------------------

function makeFilledBar(value: number, max: number, color: string): string {
  const TOTAL_BLOCKS = 10;
  const filled = Math.round((value / Math.max(max, 1)) * TOTAL_BLOCKS);
  const empty = TOTAL_BLOCKS - filled;
  return `<span style="color:${color};">${'█'.repeat(Math.max(0, filled))}${'░'.repeat(Math.max(0, empty))}</span> ${value} / ${max}`;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const STYLES = `
.qpm-picker-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.55);
  z-index: 999998;
  display: flex; align-items: center; justify-content: center;
}
.qpm-picker {
  background: rgba(18,20,26,0.97);
  border: 1px solid rgba(143,130,255,0.45);
  border-radius: 10px;
  width: min(1020px, 97vw);
  max-height: min(620px, 92vh);
  display: flex; flex-direction: column;
  font-family: inherit;
  box-shadow: 0 8px 32px rgba(0,0,0,0.6);
  overflow: hidden;
}
.qpm-picker__header {
  padding: 10px 14px;
  border-bottom: 1px solid rgba(143,130,255,0.2);
  display: flex; align-items: center; gap: 8px;
  flex-shrink: 0; flex-wrap: wrap;
}
.qpm-picker__title {
  color: #8f82ff; font-weight: 600; font-size: 15px; flex: 1; min-width: 80px;
}
.qpm-picker__search {
  background: rgba(255,255,255,0.07);
  border: 1px solid rgba(143,130,255,0.3);
  border-radius: 6px;
  color: #e0e0e0; font-size: 13px;
  padding: 6px 10px; outline: none; width: 160px;
}
.qpm-picker__search:focus { border-color: rgba(143,130,255,0.7); }
.qpm-picker__filter {
  background: rgba(255,255,255,0.07);
  border: 1px solid rgba(143,130,255,0.3);
  border-radius: 6px;
  color: #e0e0e0; font-size: 12px;
  padding: 5px 7px; outline: none; cursor: pointer;
}
.qpm-picker__compare-btn {
  background: rgba(143,130,255,0.12);
  border: 1px solid rgba(143,130,255,0.35);
  border-radius: 6px;
  color: #c4beff; font-size: 12px;
  padding: 5px 10px; cursor: pointer; transition: background 0.15s;
  white-space: nowrap;
}
.qpm-picker__compare-btn:hover { background: rgba(143,130,255,0.25); }
.qpm-picker__compare-btn--active {
  background: rgba(143,130,255,0.28);
  border-color: rgba(143,130,255,0.7);
  color: #fff;
}
.qpm-picker__main {
  display: flex; flex: 1; overflow: hidden;
}
.qpm-picker__body {
  overflow-y: auto; flex: 1;
  padding: 10px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 8px;
  align-content: start;
}
.qpm-picker__empty {
  grid-column: 1 / -1;
  text-align: center; color: rgba(224,224,224,0.4);
  font-size: 13px; padding: 40px 0;
}
/* --- Pet card --- */
.qpm-pet-card {
  border-radius: 9px; padding: 10px 8px;
  cursor: pointer; transition: opacity 0.15s, box-shadow 0.15s;
  display: flex; flex-direction: column; align-items: center; gap: 5px;
  position: relative;
  border: 1px solid rgba(143,130,255,0.2);
  background: rgba(255,255,255,0.04);
}
.qpm-pet-card:hover { opacity: 0.85; }
.qpm-pet-card--active { box-shadow: 0 0 0 1px rgba(100,255,150,0.4) inset; }
.qpm-pet-card--compare-selected {
  box-shadow: 0 0 0 2px rgba(143,130,255,0.9), 0 0 10px rgba(143,130,255,0.35);
  outline: none;
}
.qpm-pet-card__sprite {
  width: 48px; height: 48px;
  image-rendering: pixelated; object-fit: contain;
}
.qpm-pet-card__sprite--placeholder {
  width: 48px; height: 48px;
  background: rgba(143,130,255,0.1); border-radius: 4px;
  display: flex; align-items: center; justify-content: center;
  font-size: 22px;
}
.qpm-pet-card__name {
  font-size: 11px; color: #e0e0e0; text-align: center;
  max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.qpm-pet-card__str {
  font-size: 11px; color: rgba(224,224,224,0.65); text-align: center; font-family: monospace;
}
.qpm-pet-card__ability-dots {
  display: flex; gap: 3px; justify-content: center; flex-wrap: wrap;
}
.qpm-pet-card__dot {
  width: 8px; height: 8px; border-radius: 2px; flex-shrink: 0;
}
.qpm-pet-card__badge {
  position: absolute; top: 4px; right: 4px;
  font-size: 9px; padding: 1px 4px; border-radius: 3px;
  font-weight: 600;
}
.qpm-pet-card__badge--active    { background: rgba(100,255,150,0.2); color: #64ff96; }
.qpm-pet-card__badge--hutch     { background: rgba(143,130,255,0.2); color: #a899ff; }
.qpm-pet-card__badge--inventory { background: rgba(255,200,100,0.2); color: #ffc864; }
/* --- Hover / detail panel --- */
.qpm-picker__hover-panel {
  width: 280px; flex-shrink: 0;
  border-left: 1px solid rgba(143,130,255,0.2);
  background: rgba(12,14,20,0.6);
  overflow-y: auto; padding: 14px 13px;
  display: flex; flex-direction: column; gap: 10px;
}
.qpm-picker__hover-panel--empty {
  color: rgba(224,224,224,0.25); font-size: 12px;
  align-items: center; justify-content: center;
  text-align: center;
}
/* Redesigned hover panel elements */
.qpm-hover__sprite-section {
  display: flex; justify-content: center; align-items: center;
  padding: 8px 0 4px;
}
.qpm-hover__sprite {
  width: 72px; height: 72px;
  image-rendering: pixelated; object-fit: contain;
}
.qpm-hover__sprite-placeholder {
  width: 72px; height: 72px;
  background: rgba(143,130,255,0.1); border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  font-size: 34px;
}
.qpm-hover__id-row {
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
}
.qpm-hover__name {
  font-size: 14px; font-weight: 600; color: #e0e0e0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  flex: 1; min-width: 0;
}
.qpm-hover__location-badge {
  font-size: 9px; padding: 2px 5px; border-radius: 3px; font-weight: 600;
  flex-shrink: 0;
}
.qpm-hover__location-badge--active    { background: rgba(100,255,150,0.2); color: #64ff96; }
.qpm-hover__location-badge--hutch     { background: rgba(143,130,255,0.2); color: #a899ff; }
.qpm-hover__location-badge--inventory { background: rgba(255,200,100,0.2); color: #ffc864; }
.qpm-hover__species-row {
  display: flex; align-items: center; gap: 5px;
  font-size: 11px; color: rgba(224,224,224,0.5); margin-top: 1px;
}
.qpm-hover__tier-badge {
  font-size: 10px;
}
/* Stat bars */
.qpm-hover__section { display: flex; flex-direction: column; gap: 5px; }
.qpm-hover__section-title {
  font-size: 10px; font-weight: 600; color: rgba(143,130,255,0.8);
  text-transform: uppercase; letter-spacing: 0.06em;
}
.qpm-hover__bar-row {
  display: flex; flex-direction: column; gap: 2px;
}
.qpm-hover__bar-label-row {
  display: flex; justify-content: space-between; font-size: 10px;
}
.qpm-hover__bar-label { color: rgba(224,224,224,0.5); }
.qpm-hover__bar-value { color: rgba(200,200,255,0.85); font-family: monospace; }
.qpm-hover__bar-track {
  height: 5px; background: rgba(255,255,255,0.1); border-radius: 3px; overflow: hidden;
}
.qpm-hover__bar-fill { height: 100%; border-radius: 3px; }
.qpm-hover__xp-note { font-size: 10px; color: rgba(224,224,224,0.4); }
/* Mutation pills */
.qpm-hover__mutation-list {
  display: flex; flex-wrap: wrap; gap: 4px;
}
.qpm-hover__mutation-pill {
  font-size: 9px; padding: 2px 6px; border-radius: 10px;
  background: rgba(143,130,255,0.15); color: #c4beff;
  border: 1px solid rgba(143,130,255,0.25);
}
.qpm-hover__mutation-pill--rainbow {
  background: linear-gradient(135deg,rgba(255,0,0,0.2),rgba(0,255,0,0.2),rgba(0,0,255,0.2));
  color: #fff; border-color: rgba(255,255,255,0.3);
}
.qpm-hover__mutation-pill--gold {
  background: rgba(255,215,0,0.15); color: #ffd700;
  border-color: rgba(255,215,0,0.4);
}
/* Compact ability rows */
.qpm-hover__abil-row {
  display: flex; align-items: center; gap: 6px;
  font-size: 11px; padding: 3px 0;
}
.qpm-hover__abil-dot {
  width: 9px; height: 9px; border-radius: 2px; flex-shrink: 0;
}
.qpm-hover__abil-name { color: #d0d0ff; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.qpm-hover__abil-metric { color: rgba(200,200,200,0.55); font-size: 10px; white-space: nowrap; flex-shrink: 0; }
/* Compare mode */
.qpm-picker__compare-banner {
  padding: 14px 13px;
  color: rgba(224,224,224,0.55); font-size: 12px;
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; text-align: center; gap: 8px;
  flex: 1;
}
.qpm-picker__compare-banner-title {
  font-size: 14px; color: #c4beff; font-weight: 600;
}
.qpm-picker__compare-count {
  font-size: 18px; font-weight: 700; color: #8f82ff;
}
.qpm-picker__compare-clear {
  background: rgba(244,67,54,0.1);
  border: 1px solid rgba(244,67,54,0.3);
  border-radius: 5px; color: rgba(244,67,54,0.8);
  padding: 4px 12px; font-size: 11px; cursor: pointer;
  transition: background 0.15s;
}
.qpm-picker__compare-clear:hover { background: rgba(244,67,54,0.2); }
/* Compare panel */
.qpm-compare-panel {
  width: 280px; flex-shrink: 0;
  border-left: 1px solid rgba(143,130,255,0.2);
  background: rgba(12,14,20,0.6);
  overflow-y: auto; padding: 10px 12px;
  display: flex; flex-direction: column; gap: 8px;
}
.qpm-compare__header {
  display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;
}
.qpm-compare__title { font-size: 12px; font-weight: 600; color: rgba(143,130,255,0.8); text-transform: uppercase; letter-spacing: 0.06em; }
.qpm-compare__sprites {
  display: grid; grid-template-columns: 1fr auto 1fr; align-items: center;
  gap: 6px; margin-bottom: 6px;
}
.qpm-compare__sprite-col { display: flex; flex-direction: column; align-items: center; gap: 3px; }
.qpm-compare__sprite {
  width: 48px; height: 48px; image-rendering: pixelated; object-fit: contain;
}
.qpm-compare__sprite-placeholder {
  width: 48px; height: 48px; background: rgba(143,130,255,0.1); border-radius: 6px;
  display: flex; align-items: center; justify-content: center; font-size: 24px;
}
.qpm-compare__pet-name { font-size: 10px; color: #d0d0d0; text-align: center; max-width: 80px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.qpm-compare__vs { font-size: 12px; color: rgba(224,224,224,0.3); font-weight: 700; }
.qpm-compare__row {
  display: grid; grid-template-columns: 1fr auto 1fr;
  align-items: center; gap: 4px; font-size: 11px; padding: 3px 0;
  border-bottom: 1px solid rgba(255,255,255,0.04);
}
.qpm-compare__row:last-child { border-bottom: none; }
.qpm-compare__cell-a { text-align: right; font-family: monospace; }
.qpm-compare__cell-b { text-align: left; font-family: monospace; }
.qpm-compare__cell-label { text-align: center; font-size: 9px; color: rgba(224,224,224,0.4); text-transform: uppercase; letter-spacing: 0.05em; }
.qpm-compare__winner { color: rgba(64,255,194,0.9) !important; font-weight: 700; }
.qpm-compare__loser { color: rgba(224,224,224,0.3) !important; }
.qpm-compare__tie { color: rgba(224,224,224,0.65); }
/* --- Compare panel new classes --- */
.qpm-compare__section-title {
  font-size: 9px; font-weight: 600; color: rgba(143,130,255,0.6);
  text-transform: uppercase; letter-spacing: 0.07em;
  padding: 6px 0 3px; border-top: 1px solid rgba(143,130,255,0.12);
  margin-top: 2px;
}
.qpm-compare__stat-row {
  display: grid; grid-template-columns: 1fr 36px 1fr;
  gap: 2px; align-items: center; font-size: 10px; padding: 1px 0;
}
.qpm-compare__stat-lbl { text-align: center; color: rgba(224,224,224,0.3); font-size: 9px; }
.qpm-compare__stat-a { text-align: right; font-family: monospace; }
.qpm-compare__stat-b { text-align: left; font-family: monospace; }
.qpm-compare__abil-block {
  display: grid; grid-template-columns: 1fr 52px 1fr;
  gap: 3px; padding: 4px 0;
  border-bottom: 1px solid rgba(255,255,255,0.04);
}
.qpm-compare__abil-center {
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  justify-content: center;
}
.qpm-compare__abil-dot { width: 8px; height: 8px; border-radius: 2px; }
.qpm-compare__abil-label { font-size: 8px; color: rgba(224,224,224,0.3); text-align: center; word-break: break-word; }
.qpm-compare__abil-side {
  padding: 4px 5px; border-radius: 5px;
  border: 1px solid rgba(255,255,255,0.05);
  background: rgba(255,255,255,0.02);
  display: flex; flex-direction: column; gap: 2px;
}
.qpm-compare__abil-side--winner {
  border-color: rgba(64,255,194,0.4) !important;
  background: rgba(64,255,194,0.07) !important;
}
.qpm-compare__abil-metric { display: flex; justify-content: space-between; font-size: 9px; }
.qpm-compare__abil-metric-lbl { color: rgba(224,224,224,0.3); }
.qpm-compare__abil-metric-val { font-weight: 600; }
.qpm-compare__abil-none { font-size: 10px; color: rgba(224,224,224,0.2); text-align: center; padding: 6px 0; }
/* --- Footer --- */
.qpm-picker__footer {
  padding: 8px 16px;
  border-top: 1px solid rgba(143,130,255,0.2);
  display: flex; justify-content: flex-end;
  flex-shrink: 0;
}
.qpm-picker__cancel {
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 6px; color: #e0e0e0;
  padding: 7px 16px; font-size: 13px; cursor: pointer;
  transition: background 0.15s;
}
.qpm-picker__cancel:hover { background: rgba(255,255,255,0.14); }
`;

let stylesInjected = false;
function ensureStyles(): void {
  if (stylesInjected) return;
  const el = document.createElement('style');
  el.id = 'qpm-picker-styles';
  el.textContent = STYLES;
  document.head.appendChild(el);
  stylesInjected = true;
}

// ---------------------------------------------------------------------------
// Sprite helpers
// ---------------------------------------------------------------------------

function getSpriteSrc(species: string, mutations: string[]): string | null {
  if (!isSpritesReady()) return null;
  return getPetSpriteDataUrlWithMutations(species, mutations) ?? null;
}

// ---------------------------------------------------------------------------
// Ability metric summary
// ---------------------------------------------------------------------------

function getAbilityMetric(abilityId: string, strength: number | null | undefined): string {
  const def = getAbilityDefinition(abilityId);
  if (!def) return '';
  const stats = computeAbilityStats(def, strength ?? null);
  if (!stats) return '';
  const effectPerHour = computeEffectPerHour(def, stats);
  if (def.effectUnit === 'coins' && effectPerHour > 0) {
    return `~${formatCoinsAbbreviated(Math.round(effectPerHour))} $/hr`;
  }
  if ((def.category === 'plantGrowth' || def.category === 'eggGrowth') && effectPerHour > 0) {
    return `~${effectPerHour.toFixed(1)} min/hr`;
  }
  if (def.category === 'xp' && effectPerHour > 0) {
    return `~${formatCoinsAbbreviated(Math.round(effectPerHour))} xp/hr`;
  }
  if (stats.procsPerHour > 0) {
    return `${stats.procsPerHour.toFixed(1)} proc/hr`;
  }
  return '';
}

// ---------------------------------------------------------------------------
// Redesigned hover panel builder
// ---------------------------------------------------------------------------

function buildHoverPanel(pet: PooledPet, panel: HTMLElement): void {
  panel.innerHTML = '';
  panel.className = 'qpm-picker__hover-panel';

  // --- Sprite section ---
  const spriteSection = document.createElement('div');
  spriteSection.className = 'qpm-hover__sprite-section';

  const tier = getMutationTier(pet.mutations);
  const spriteSrc = getSpriteSrc(pet.species, pet.mutations);
  if (spriteSrc) {
    const img = document.createElement('img');
    img.className = 'qpm-hover__sprite';
    img.src = spriteSrc;
    img.alt = pet.species;
    if (tier === 'rainbow') {
      img.style.filter = 'drop-shadow(0 0 6px rgba(200,100,255,0.6))';
    } else if (tier === 'gold') {
      img.style.filter = 'drop-shadow(0 0 6px rgba(255,215,0,0.5))';
    }
    spriteSection.appendChild(img);
  } else {
    const ph = document.createElement('div');
    ph.className = 'qpm-hover__sprite-placeholder';
    ph.textContent = '🐾';
    spriteSection.appendChild(ph);
  }
  panel.appendChild(spriteSection);

  // --- Identity row ---
  const idRow = document.createElement('div');
  idRow.className = 'qpm-hover__id-row';

  const nameEl = document.createElement('div');
  nameEl.className = 'qpm-hover__name';
  nameEl.textContent = pet.name || pet.species;
  idRow.appendChild(nameEl);

  const locBadge = document.createElement('span');
  locBadge.className = `qpm-hover__location-badge qpm-hover__location-badge--${pet.location}`;
  locBadge.textContent = getLocationLabel(pet.location);
  idRow.appendChild(locBadge);

  panel.appendChild(idRow);

  // --- Species + tier row ---
  const speciesRow = document.createElement('div');
  speciesRow.className = 'qpm-hover__species-row';
  speciesRow.textContent = pet.species;
  if (tier !== 'none') {
    const tierBadge = document.createElement('span');
    tierBadge.className = 'qpm-hover__tier-badge';
    tierBadge.textContent = getTierLabel(tier);
    tierBadge.title = tier;
    speciesRow.appendChild(tierBadge);
  }
  panel.appendChild(speciesRow);

  // --- Stats section ---
  const statsSection = document.createElement('div');
  statsSection.className = 'qpm-hover__section';

  const statsTitle = document.createElement('div');
  statsTitle.className = 'qpm-hover__section-title';
  statsTitle.textContent = 'Stats';
  statsSection.appendChild(statsTitle);

  const maxStr = calculateMaxStrength(pet.targetScale, pet.species);

  // STR bar
  if (pet.strength != null) {
    const barMax = maxStr ?? Math.max(100, pet.strength);
    statsSection.appendChild(makeBarRow('STR', pet.strength, barMax, '#8f82ff'));
  }

  // Max STR bar (if different from current)
  if (maxStr != null && (pet.strength == null || pet.strength < maxStr)) {
    const row = document.createElement('div');
    row.className = 'qpm-hover__bar-label-row';
    const lbl = document.createElement('span');
    lbl.className = 'qpm-hover__bar-label';
    lbl.textContent = 'Max STR';
    const val = document.createElement('span');
    val.className = 'qpm-hover__bar-value';
    val.textContent = String(maxStr);
    row.appendChild(lbl);
    row.appendChild(val);
    statsSection.appendChild(row);
  }

  // XP bar
  if (pet.xp != null && maxStr != null && pet.strength != null && pet.strength < maxStr) {
    const xpPerLevel = getSpeciesXpPerLevel(pet.species);
    if (xpPerLevel && xpPerLevel > 0) {
      const levelsToMax = maxStr - pet.strength;
      const xpForMax = levelsToMax * xpPerLevel;
      const xpProgress = xpForMax > 0 ? pet.xp / (pet.xp + xpForMax) : 1;
      statsSection.appendChild(makeBarRow('XP', Math.round(xpProgress * 100), 100, '#6eb5ff', '%'));
      const xpNote = document.createElement('div');
      xpNote.className = 'qpm-hover__xp-note';
      xpNote.textContent = `${pet.xp.toLocaleString()} XP earned`;
      statsSection.appendChild(xpNote);
    }
  }

  // Hunger bar
  if (pet.hunger != null) {
    statsSection.appendChild(makeBarRow('Hunger', Math.round(pet.hunger), 100, '#64ff96', '%'));
  }

  panel.appendChild(statsSection);

  // --- Mutations ---
  if (pet.mutations.length > 0) {
    const mutSection = document.createElement('div');
    mutSection.className = 'qpm-hover__section';
    const mutTitle = document.createElement('div');
    mutTitle.className = 'qpm-hover__section-title';
    mutTitle.textContent = 'Mutations';
    mutSection.appendChild(mutTitle);
    const pillWrap = document.createElement('div');
    pillWrap.className = 'qpm-hover__mutation-list';
    for (const m of pet.mutations) {
      const pill = document.createElement('span');
      const isRainbow = /rainbow/i.test(m);
      const isGold = /gold(?:en)?/i.test(m);
      pill.className = `qpm-hover__mutation-pill${isRainbow ? ' qpm-hover__mutation-pill--rainbow' : isGold ? ' qpm-hover__mutation-pill--gold' : ''}`;
      pill.textContent = m;
      pillWrap.appendChild(pill);
    }
    mutSection.appendChild(pillWrap);
    panel.appendChild(mutSection);
  }

  // --- Abilities (compact rows) ---
  if (pet.abilities.length > 0) {
    const abilSection = document.createElement('div');
    abilSection.className = 'qpm-hover__section';
    const abilTitle = document.createElement('div');
    abilTitle.className = 'qpm-hover__section-title';
    abilTitle.textContent = 'Abilities';
    abilSection.appendChild(abilTitle);

    for (const abilityId of pet.abilities) {
      const def = getAbilityDefinition(abilityId);
      const color = getAbilityColor(abilityId);

      // Observed history for active pets
      const history = findAbilityHistoryForIdentifiers(abilityId, {
        petId: pet.petId,
        slotId: pet.id,
        slotIndex: pet.slotIndex ?? null,
      });
      const observed = history && def ? computeObservedMetrics(history, def) : null;

      const row = document.createElement('div');
      row.className = 'qpm-hover__abil-row';

      const dot = document.createElement('div');
      dot.className = 'qpm-hover__abil-dot';
      dot.style.background = color.base;
      row.appendChild(dot);

      const name = document.createElement('span');
      name.className = 'qpm-hover__abil-name';
      name.textContent = def?.name ?? abilityId;
      row.appendChild(name);

      // Key metric: observed first, then estimated
      let metric = '';
      if (observed?.procsPerHour != null && def) {
        const stats = computeAbilityStats(def, pet.strength ?? null);
        if (stats) {
          const eph = computeEffectPerHour(def, { ...stats, procsPerHour: observed.procsPerHour });
          if (def.effectUnit === 'coins' && eph > 0) {
            metric = `~${formatCoinsAbbreviated(Math.round(eph))} $/hr`;
          } else if (stats.procsPerHour > 0) {
            metric = `${observed.procsPerHour.toFixed(1)}/hr`;
          }
        }
      }
      if (!metric) {
        metric = getAbilityMetric(abilityId, pet.strength);
      }

      if (metric) {
        const metricEl = document.createElement('span');
        metricEl.className = 'qpm-hover__abil-metric';
        metricEl.textContent = metric;
        row.appendChild(metricEl);
      }

      abilSection.appendChild(row);
    }

    panel.appendChild(abilSection);
  }

  // --- Metadata footer ---
  const meta = getPetMetadata(pet.species);
  const depleteMin = getHungerDepletionTime(pet.species);
  const metaParts: string[] = [];
  if (meta?.rarity) metaParts.push(`Rarity: ${meta.rarity}`);
  if (meta?.maturityHours != null) metaParts.push(`Matures ${meta.maturityHours}h`);
  if (depleteMin != null) metaParts.push(`Depletes ${depleteMin}min`);
  if (metaParts.length > 0) {
    const footerEl = document.createElement('div');
    footerEl.style.cssText = 'font-size:10px;color:rgba(224,224,224,0.3);margin-top:4px;text-align:center;';
    footerEl.textContent = metaParts.join('  ·  ');
    panel.appendChild(footerEl);
  }
}

// Helper: make a labeled bar row element
function makeBarRow(label: string, value: number, max: number, color: string, suffix = ''): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'qpm-hover__bar-row';

  const labelRow = document.createElement('div');
  labelRow.className = 'qpm-hover__bar-label-row';
  const lbl = document.createElement('span');
  lbl.className = 'qpm-hover__bar-label';
  lbl.textContent = label;
  const val = document.createElement('span');
  val.className = 'qpm-hover__bar-value';
  val.textContent = `${value}${suffix} / ${max}${suffix}`;
  labelRow.appendChild(lbl);
  labelRow.appendChild(val);
  wrap.appendChild(labelRow);

  const track = document.createElement('div');
  track.className = 'qpm-hover__bar-track';
  const fill = document.createElement('div');
  fill.className = 'qpm-hover__bar-fill';
  fill.style.width = `${Math.min(100, Math.max(0, (value / Math.max(max, 1)) * 100))}%`;
  fill.style.background = color;
  track.appendChild(fill);
  wrap.appendChild(track);

  return wrap;
}

// ---------------------------------------------------------------------------
// Compare panel helpers
// ---------------------------------------------------------------------------

function computePetAbilityStatsForCompare(
  pet: PooledPet,
  abilityId: string,
): { procsPerHour: number; impact: number } | null {
  const def = getAbilityDefinition(abilityId);
  if (!def) return null;
  const str = pet.strength ?? calculateMaxStrength(pet.targetScale, pet.species) ?? 100;
  const stats = computeAbilityStats(def, str);
  const impact = computeEffectPerHour(def, stats);
  return { procsPerHour: stats.procsPerHour, impact };
}

function formatImpactValue(
  def: { effectUnit?: string; category: string },
  impact: number,
  procsPerHour: number,
): string {
  if (def.effectUnit === 'coins') return formatCoinsAbbreviated(impact) + '/hr';
  if (def.category === 'plantGrowth' || def.category === 'eggGrowth') return impact.toFixed(1) + ' min/hr';
  if (def.effectUnit === 'xp' || def.category === 'xp') return formatCoinsAbbreviated(impact) + ' xp/hr';
  if (procsPerHour > 0) return procsPerHour.toFixed(1) + '/hr';
  return '—';
}

// ---------------------------------------------------------------------------
// Compare panel builder
// ---------------------------------------------------------------------------

function buildComparePanel(petA: PooledPet, petB: PooledPet, container: HTMLElement): void {
  container.innerHTML = '';
  container.className = 'qpm-compare-panel';

  const CMP_LEFT_TEXT  = '#C9F1FF';
  const CMP_RIGHT_TEXT = '#F7E5FF';
  const CMP_WIN_TEXT   = 'rgb(64,255,194)';
  const CMP_LOSE_TEXT  = 'rgba(224,224,224,0.28)';

  // --- Header ---
  const hdr = document.createElement('div');
  hdr.className = 'qpm-compare__header';
  const hdrTitle = document.createElement('div');
  hdrTitle.className = 'qpm-compare__title';
  hdrTitle.textContent = 'Compare';
  hdr.appendChild(hdrTitle);
  container.appendChild(hdr);

  // --- Sprites row ---
  const spritesRow = document.createElement('div');
  spritesRow.className = 'qpm-compare__sprites';

  function makeSpritCol(pet: PooledPet, nameColor: string): HTMLElement {
    const col = document.createElement('div');
    col.className = 'qpm-compare__sprite-col';
    const src = getSpriteSrc(pet.species, pet.mutations);
    if (src) {
      const img = document.createElement('img');
      img.className = 'qpm-compare__sprite';
      img.src = src;
      img.alt = pet.species;
      col.appendChild(img);
    } else {
      const ph = document.createElement('div');
      ph.className = 'qpm-compare__sprite-placeholder';
      ph.textContent = '🐾';
      col.appendChild(ph);
    }
    const nm = document.createElement('div');
    nm.className = 'qpm-compare__pet-name';
    nm.style.color = nameColor;
    nm.textContent = pet.name || pet.species;
    col.appendChild(nm);
    const locEl = document.createElement('div');
    locEl.style.cssText = 'font-size:9px;color:rgba(224,224,224,0.3);text-align:center;';
    locEl.textContent = getLocationLabel(pet.location);
    col.appendChild(locEl);
    return col;
  }

  spritesRow.appendChild(makeSpritCol(petA, CMP_LEFT_TEXT));
  const vsEl = document.createElement('div');
  vsEl.className = 'qpm-compare__vs';
  vsEl.textContent = 'vs';
  spritesRow.appendChild(vsEl);
  spritesRow.appendChild(makeSpritCol(petB, CMP_RIGHT_TEXT));
  container.appendChild(spritesRow);

  // Working strength with fallback for hutch/inventory pets
  const strANum = petA.strength ?? calculateMaxStrength(petA.targetScale, petA.species) ?? 100;
  const strBNum = petB.strength ?? calculateMaxStrength(petB.targetScale, petB.species) ?? 100;
  const strAEst = petA.strength == null;
  const strBEst = petB.strength == null;
  const maxStrA = calculateMaxStrength(petA.targetScale, petA.species);
  const maxStrB = calculateMaxStrength(petB.targetScale, petB.species);

  // --- Stat row helper ---
  function addStatRow(
    label: string,
    aText: string,
    bText: string,
    winner: 'a' | 'b' | 'tie' | 'none' = 'none',
    aColorOverride?: string,
    bColorOverride?: string,
  ): void {
    const row = document.createElement('div');
    row.className = 'qpm-compare__stat-row';

    const aEl = document.createElement('div');
    aEl.className = 'qpm-compare__stat-a';
    aEl.textContent = aText;
    aEl.style.color = aColorOverride ?? (winner === 'a' ? CMP_WIN_TEXT : winner === 'b' ? CMP_LOSE_TEXT : CMP_LEFT_TEXT);

    const lblEl = document.createElement('div');
    lblEl.className = 'qpm-compare__stat-lbl';
    lblEl.textContent = label;

    const bEl = document.createElement('div');
    bEl.className = 'qpm-compare__stat-b';
    bEl.textContent = bText;
    bEl.style.color = bColorOverride ?? (winner === 'b' ? CMP_WIN_TEXT : winner === 'a' ? CMP_LOSE_TEXT : CMP_RIGHT_TEXT);

    row.appendChild(aEl);
    row.appendChild(lblEl);
    row.appendChild(bEl);
    container.appendChild(row);
  }

  function addSectionTitle(text: string): void {
    const el = document.createElement('div');
    el.className = 'qpm-compare__section-title';
    el.textContent = text;
    container.appendChild(el);
  }

  // --- Stats section ---
  addSectionTitle('Stats');

  addStatRow(
    'STR',
    strAEst ? `~${strANum}` : String(strANum),
    strBEst ? `~${strBNum}` : String(strBNum),
    strANum > strBNum ? 'a' : strBNum > strANum ? 'b' : 'tie',
  );

  if (maxStrA != null || maxStrB != null) {
    addStatRow(
      'Max STR',
      maxStrA != null ? String(maxStrA) : '—',
      maxStrB != null ? String(maxStrB) : '—',
      maxStrA != null && maxStrB != null ? (maxStrA > maxStrB ? 'a' : maxStrB > maxStrA ? 'b' : 'tie') : 'none',
    );
  }

  // Hunger — only available for active pets
  const hungerA = petA.hunger != null ? `${Math.round(petA.hunger)}%` : '—';
  const hungerB = petB.hunger != null ? `${Math.round(petB.hunger)}%` : '—';
  addStatRow(
    'Hunger',
    hungerA,
    hungerB,
    petA.hunger != null && petB.hunger != null
      ? (petA.hunger > petB.hunger ? 'a' : petB.hunger > petA.hunger ? 'b' : 'tie')
      : 'none',
    petA.hunger == null ? 'rgba(224,224,224,0.25)' : undefined,
    petB.hunger == null ? 'rgba(224,224,224,0.25)' : undefined,
  );

  // Rarity (text only, no winner)
  const metaA = getPetMetadata(petA.species);
  const metaB = getPetMetadata(petB.species);
  addStatRow('Rarity', metaA?.rarity ?? '—', metaB?.rarity ?? '—', 'none');

  // Depletes — higher is better (lasts longer)
  const deplA = getHungerDepletionTime(petA.species);
  const deplB = getHungerDepletionTime(petB.species);
  addStatRow(
    'Depletes',
    deplA != null ? `${deplA}min` : '—',
    deplB != null ? `${deplB}min` : '—',
    deplA != null && deplB != null ? (deplA > deplB ? 'a' : deplB > deplA ? 'b' : 'tie') : 'none',
    deplA == null ? 'rgba(224,224,224,0.25)' : undefined,
    deplB == null ? 'rgba(224,224,224,0.25)' : undefined,
  );

  // --- Abilities section ---
  const allAbilityIds = [...new Set([...petA.abilities, ...petB.abilities])];
  if (allAbilityIds.length > 0) {
    addSectionTitle('Abilities');

    for (const abilityId of allAbilityIds) {
      const def = getAbilityDefinition(abilityId);
      if (!def) continue;

      const hasA = petA.abilities.includes(abilityId);
      const hasB = petB.abilities.includes(abilityId);
      const color = getAbilityColor(abilityId);

      const cmpA = hasA ? computePetAbilityStatsForCompare(petA, abilityId) : null;
      const cmpB = hasB ? computePetAbilityStatsForCompare(petB, abilityId) : null;

      const impactA = cmpA?.impact ?? 0;
      const impactB = cmpB?.impact ?? 0;
      const procsA = cmpA?.procsPerHour ?? 0;
      const procsB = cmpB?.procsPerHour ?? 0;

      const aWins = hasA && hasB && (impactA > impactB || (impactA === impactB && procsA > procsB));
      const bWins = hasA && hasB && (impactB > impactA || (impactA === impactB && procsB > procsA));

      function buildAbilSide(
        hasPet: boolean,
        cmpStats: { procsPerHour: number; impact: number } | null,
        isWinner: boolean,
        nameColor: string,
      ): HTMLElement {
        const side = document.createElement('div');
        side.className = `qpm-compare__abil-side${isWinner ? ' qpm-compare__abil-side--winner' : ''}`;

        if (!hasPet || !cmpStats) {
          const none = document.createElement('div');
          none.className = 'qpm-compare__abil-none';
          none.textContent = '—';
          side.appendChild(none);
          return side;
        }

        const metricColor = isWinner ? CMP_WIN_TEXT : nameColor;

        const procsRow = document.createElement('div');
        procsRow.className = 'qpm-compare__abil-metric';
        const procsLbl = document.createElement('span');
        procsLbl.className = 'qpm-compare__abil-metric-lbl';
        procsLbl.textContent = 'Proc/hr';
        const procsVal = document.createElement('span');
        procsVal.className = 'qpm-compare__abil-metric-val';
        procsVal.textContent = cmpStats.procsPerHour.toFixed(1);
        procsVal.style.color = metricColor;
        procsRow.appendChild(procsLbl);
        procsRow.appendChild(procsVal);
        side.appendChild(procsRow);

        if (cmpStats.impact > 0) {
          const impactRow = document.createElement('div');
          impactRow.className = 'qpm-compare__abil-metric';
          const impactLbl = document.createElement('span');
          impactLbl.className = 'qpm-compare__abil-metric-lbl';
          impactLbl.textContent = 'Impact';
          const impactVal = document.createElement('span');
          impactVal.className = 'qpm-compare__abil-metric-val';
          impactVal.textContent = formatImpactValue(def!, cmpStats.impact, cmpStats.procsPerHour);
          impactVal.style.color = metricColor;
          impactRow.appendChild(impactLbl);
          impactRow.appendChild(impactVal);
          side.appendChild(impactRow);
        }

        return side;
      }

      const block = document.createElement('div');
      block.className = 'qpm-compare__abil-block';

      block.appendChild(buildAbilSide(hasA, cmpA, aWins, CMP_LEFT_TEXT));

      const center = document.createElement('div');
      center.className = 'qpm-compare__abil-center';
      const dot = document.createElement('div');
      dot.className = 'qpm-compare__abil-dot';
      dot.style.background = color.base;
      center.appendChild(dot);
      const nameEl = document.createElement('div');
      nameEl.className = 'qpm-compare__abil-label';
      nameEl.textContent = def.name;
      center.appendChild(nameEl);
      block.appendChild(center);

      block.appendChild(buildAbilSide(hasB, cmpB, bWins, CMP_RIGHT_TEXT));

      container.appendChild(block);
    }
  }
}

// ---------------------------------------------------------------------------
// Card renderer
// ---------------------------------------------------------------------------

function renderBadge(location: PooledPet['location']): HTMLElement {
  const badge = document.createElement('span');
  badge.className = `qpm-pet-card__badge qpm-pet-card__badge--${location}`;
  badge.textContent = location === 'active' ? 'Active' : location === 'hutch' ? 'Hutch' : 'Bag';
  return badge;
}

function applyMutationTierStyle(card: HTMLElement, tier: MutationTier): void {
  if (tier === 'rainbow') {
    card.style.border = '2px solid transparent';
    card.style.background = [
      'linear-gradient(rgba(18,20,26,0.97),rgba(18,20,26,0.97)) padding-box',
      'linear-gradient(135deg,#f00,#f70,#ff0,#0f0,#00f,#808,#90d) border-box',
    ].join(',');
    card.style.boxShadow = '0 0 10px rgba(180,100,255,0.35)';
  } else if (tier === 'gold') {
    card.style.border = '2px solid transparent';
    card.style.background = [
      'linear-gradient(rgba(18,20,26,0.97),rgba(18,20,26,0.97)) padding-box',
      'linear-gradient(135deg,#FFD700,#FFA500,#FFD700) border-box',
    ].join(',');
    card.style.boxShadow = '0 0 10px rgba(255,215,0,0.25)';
  } else if (tier === 'mutated') {
    card.style.border = '2px solid rgba(143,130,255,0.35)';
  }
}

function renderPetCard(
  pet: PooledPet,
  onClick: () => void,
  onHover: (pet: PooledPet | null) => void,
): HTMLElement {
  const tier = getMutationTier(pet.mutations);

  const card = document.createElement('div');
  card.className = `qpm-pet-card${pet.location === 'active' ? ' qpm-pet-card--active' : ''}`;
  card.dataset.petId = pet.id;
  applyMutationTierStyle(card, tier);

  const mutNames = pet.mutations.join(', ') || 'No mutations';
  const abilNames = pet.abilities.join(', ') || 'None';
  card.title = `${pet.name || pet.species}\nSTR ${pet.strength ?? '?'}\nMutations: ${mutNames}\nAbilities: ${abilNames}`;
  card.addEventListener('click', onClick);
  card.addEventListener('mouseenter', () => onHover(pet));
  card.addEventListener('mouseleave', () => onHover(null));

  card.appendChild(renderBadge(pet.location));

  // Sprite
  const placeholder = document.createElement('div');
  placeholder.className = 'qpm-pet-card__sprite--placeholder';
  placeholder.textContent = '🐾';
  card.appendChild(placeholder);

  // Name
  const name = document.createElement('div');
  name.className = 'qpm-pet-card__name';
  name.textContent = pet.name || pet.species;
  card.appendChild(name);

  // STR / Max STR
  const maxStr = calculateMaxStrength(pet.targetScale, pet.species);
  const str = document.createElement('div');
  str.className = 'qpm-pet-card__str';
  if (pet.strength != null && maxStr != null) {
    str.textContent = `STR ${pet.strength} / ${maxStr}`;
  } else if (pet.strength != null) {
    str.textContent = `STR ${pet.strength}`;
  } else {
    str.textContent = 'STR ?';
    str.style.opacity = '0.4';
  }
  card.appendChild(str);

  // Ability dots
  if (pet.abilities.length > 0) {
    const dotsWrap = document.createElement('div');
    dotsWrap.className = 'qpm-pet-card__ability-dots';
    for (const abilityId of pet.abilities.slice(0, 4)) {
      const color = getAbilityColor(abilityId);
      const dot = document.createElement('div');
      dot.className = 'qpm-pet-card__dot';
      dot.style.background = color.base;
      dot.title = abilityId;
      dotsWrap.appendChild(dot);
    }
    card.appendChild(dotsWrap);
  }

  // Synchronous mutation-aware sprite
  const spriteSrc = getSpriteSrc(pet.species, pet.mutations);
  if (spriteSrc) {
    const img = document.createElement('img');
    img.className = 'qpm-pet-card__sprite';
    img.src = spriteSrc;
    img.alt = pet.species;
    card.replaceChild(img, placeholder);
  }

  return card;
}

// ---------------------------------------------------------------------------
// Ability filter builder
// ---------------------------------------------------------------------------

function buildAbilityFilterOptions(pets: PooledPet[], sel: HTMLSelectElement): void {
  const idToName = new Map<string, string>();
  for (const pet of pets) {
    for (const id of pet.abilities) {
      if (!idToName.has(id)) {
        const def = getAbilityDefinition(id);
        idToName.set(id, def?.name ?? id);
      }
    }
  }
  sel.innerHTML = '';
  const allOpt = document.createElement('option');
  allOpt.value = 'all';
  allOpt.textContent = 'All Abilities';
  sel.appendChild(allOpt);
  const sorted = [...idToName.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  for (const [id, name] of sorted) {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = name;
    sel.appendChild(opt);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface OpenPickerOptions {
  usedPetIds?: Set<string>;
  onSelect: (petItemId: string) => void;
  onCancel?: () => void;
}

export async function openPetPicker(options: OpenPickerOptions): Promise<void> {
  closePickerModal();
  ensureStyles();

  const cleanups: Array<() => void> = [];

  const overlay = document.createElement('div');
  overlay.className = 'qpm-picker-overlay';

  const modal = document.createElement('div');
  modal.className = 'qpm-picker';
  overlay.appendChild(modal);

  // --- Header ---
  const header = document.createElement('div');
  header.className = 'qpm-picker__header';

  const title = document.createElement('div');
  title.className = 'qpm-picker__title';
  title.textContent = 'Pick a Pet';
  header.appendChild(title);

  const search = document.createElement('input');
  search.className = 'qpm-picker__search';
  search.placeholder = 'Search…';
  search.type = 'text';
  header.appendChild(search);

  // Location filter
  const locationFilter = document.createElement('select');
  locationFilter.className = 'qpm-picker__filter';
  for (const [value, label] of [['all', 'All Locations'], ['active', 'Active'], ['hutch', 'Hutch'], ['inventory', 'Bag']] as const) {
    const opt = document.createElement('option');
    opt.value = value; opt.textContent = label;
    locationFilter.appendChild(opt);
  }
  header.appendChild(locationFilter);

  // Sort filter
  const sortFilter = document.createElement('select');
  sortFilter.className = 'qpm-picker__filter';
  for (const [value, label] of [['str-desc', 'STR ↓'], ['str-asc', 'STR ↑'], ['name-az', 'Name A→Z'], ['rainbow', 'Rainbow first']] as const) {
    const opt = document.createElement('option');
    opt.value = value; opt.textContent = label;
    sortFilter.appendChild(opt);
  }
  header.appendChild(sortFilter);

  // Tier filter
  const tierFilter = document.createElement('select');
  tierFilter.className = 'qpm-picker__filter';
  for (const [value, label] of [['all', 'All Tiers'], ['rainbow', '🌈 Rainbow'], ['gold', '⭐ Gold'], ['clean', 'Clean']] as const) {
    const opt = document.createElement('option');
    opt.value = value; opt.textContent = label;
    tierFilter.appendChild(opt);
  }
  header.appendChild(tierFilter);

  // Ability filter (populated after pets load)
  const abilityFilter = document.createElement('select');
  abilityFilter.className = 'qpm-picker__filter';
  const abilFilterDefaultOpt = document.createElement('option');
  abilFilterDefaultOpt.value = 'all';
  abilFilterDefaultOpt.textContent = 'All Abilities';
  abilityFilter.appendChild(abilFilterDefaultOpt);
  header.appendChild(abilityFilter);

  // Compare button
  const compareBtn = document.createElement('button');
  compareBtn.className = 'qpm-picker__compare-btn';
  compareBtn.textContent = '⚖ Compare';
  header.appendChild(compareBtn);

  modal.appendChild(header);

  // --- Main layout ---
  const main = document.createElement('div');
  main.className = 'qpm-picker__main';
  modal.appendChild(main);

  const body = document.createElement('div');
  body.className = 'qpm-picker__body';
  main.appendChild(body);

  // Right panel (hover or compare)
  const rightPanel = document.createElement('div');
  rightPanel.className = 'qpm-picker__hover-panel qpm-picker__hover-panel--empty';
  rightPanel.textContent = 'Hover a pet to see details';
  main.appendChild(rightPanel);

  // --- Footer ---
  const footer = document.createElement('div');
  footer.className = 'qpm-picker__footer';
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'qpm-picker__cancel';
  cancelBtn.textContent = 'Cancel';
  footer.appendChild(cancelBtn);
  modal.appendChild(footer);

  document.body.appendChild(overlay);

  // --- State ---
  let allPets: PooledPet[] = [];
  let hoverTimeout: number | null = null;
  let compareMode = false;
  let compareSelected: PooledPet[] = [];
  const cardMap = new Map<string, HTMLElement>(); // pet.id → card element

  // --- Compare mode ---
  function setCompareMode(active: boolean): void {
    compareMode = active;
    compareSelected = [];
    compareBtn.classList.toggle('qpm-picker__compare-btn--active', active);
    compareBtn.textContent = active ? '✕ Exit Compare' : '⚖ Compare';
    updateRightPanel(null);
    syncCompareHighlights();
  }

  function syncCompareHighlights(): void {
    const selectedIds = new Set(compareSelected.map(p => p.id));
    for (const [petId, card] of cardMap.entries()) {
      card.classList.toggle('qpm-pet-card--compare-selected', selectedIds.has(petId));
    }
  }

  function updateRightPanel(hoveredPet: PooledPet | null): void {
    if (compareMode) {
      if (compareSelected.length === 2) {
        buildComparePanel(compareSelected[0]!, compareSelected[1]!, rightPanel);
      } else {
        rightPanel.className = 'qpm-picker__hover-panel qpm-picker__hover-panel--empty';
        rightPanel.innerHTML = '';

        const banner = document.createElement('div');
        banner.className = 'qpm-picker__compare-banner';

        const bTitle = document.createElement('div');
        bTitle.className = 'qpm-picker__compare-banner-title';
        bTitle.textContent = '⚖ Compare Mode';
        banner.appendChild(bTitle);

        const bCount = document.createElement('div');
        bCount.className = 'qpm-picker__compare-count';
        bCount.textContent = `${compareSelected.length} / 2 selected`;
        banner.appendChild(bCount);

        const bHint = document.createElement('div');
        bHint.textContent = compareSelected.length === 0
          ? 'Click two pets to compare them'
          : 'Click one more pet to compare';
        banner.appendChild(bHint);

        const clearBtn2 = document.createElement('button');
        clearBtn2.className = 'qpm-picker__compare-clear';
        clearBtn2.textContent = '✕ Cancel Compare';
        clearBtn2.addEventListener('click', () => setCompareMode(false));
        banner.appendChild(clearBtn2);

        rightPanel.appendChild(banner);
      }
      return;
    }

    if (!hoveredPet) {
      rightPanel.className = 'qpm-picker__hover-panel qpm-picker__hover-panel--empty';
      rightPanel.textContent = 'Hover a pet to see details';
      return;
    }
    buildHoverPanel(hoveredPet, rightPanel);
  }

  function onHover(pet: PooledPet | null): void {
    if (compareMode) return; // hover does nothing in compare mode
    if (hoverTimeout !== null) { window.clearTimeout(hoverTimeout); hoverTimeout = null; }
    if (!pet) {
      hoverTimeout = window.setTimeout(() => updateRightPanel(null), 200);
      return;
    }
    updateRightPanel(pet);
  }

  function handleCardClick(pet: PooledPet): void {
    if (compareMode) {
      const existingIdx = compareSelected.findIndex(p => p.id === pet.id);
      if (existingIdx >= 0) {
        // Deselect
        compareSelected.splice(existingIdx, 1);
      } else if (compareSelected.length < 2) {
        compareSelected.push(pet);
      } else {
        // Replace oldest
        compareSelected.shift();
        compareSelected.push(pet);
      }
      syncCompareHighlights();
      updateRightPanel(null);
      return;
    }
    options.onSelect(pet.id);
    closePickerModal();
  }

  // --- Filtering & sorting ---
  function applySort(pets: PooledPet[]): PooledPet[] {
    const sort = sortFilter.value;
    const copy = [...pets];
    if (sort === 'str-desc') {
      copy.sort((a, b) => (b.strength ?? -1) - (a.strength ?? -1));
    } else if (sort === 'str-asc') {
      copy.sort((a, b) => (a.strength ?? -1) - (b.strength ?? -1));
    } else if (sort === 'name-az') {
      copy.sort((a, b) => (a.name || a.species).localeCompare(b.name || b.species));
    } else if (sort === 'rainbow') {
      copy.sort((a, b) => {
        const ta = getMutationTier(a.mutations);
        const tb = getMutationTier(b.mutations);
        const tierOrd = (t: MutationTier) => t === 'rainbow' ? 0 : t === 'gold' ? 1 : t === 'mutated' ? 2 : 3;
        const tdiff = tierOrd(ta) - tierOrd(tb);
        if (tdiff !== 0) return tdiff;
        return (b.strength ?? -1) - (a.strength ?? -1);
      });
    }
    return copy;
  }

  function renderList(): void {
    cardMap.clear();
    const term = search.value.toLowerCase().trim();
    const loc = locationFilter.value;
    const tierVal = tierFilter.value;

    let filtered = allPets.filter(p => {
      if (loc !== 'all' && p.location !== loc) return false;
      if (term && !p.name.toLowerCase().includes(term) && !p.species.toLowerCase().includes(term)) return false;
      if (tierVal !== 'all') {
        const t = getMutationTier(p.mutations);
        if (tierVal === 'clean' && t !== 'none') return false;
        if (tierVal !== 'clean' && t !== tierVal) return false;
      }
      if (abilityFilter.value !== 'all' && !p.abilities.includes(abilityFilter.value)) return false;
      return true;
    });

    filtered = applySort(filtered);

    body.innerHTML = '';

    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'qpm-picker__empty';
      empty.textContent = 'No pets found';
      body.appendChild(empty);
      return;
    }

    for (const pet of filtered) {
      const inUse = options.usedPetIds?.has(pet.id) && pet.location !== 'active';
      const card = renderPetCard(pet, () => handleCardClick(pet), onHover);
      if (inUse) {
        card.style.opacity = '0.45';
        card.title = `[In use] ${card.title}`;
      }
      cardMap.set(pet.id, card);
      body.appendChild(card);
    }

    // Re-apply compare highlights after re-render
    if (compareMode) syncCompareHighlights();
  }

  // --- Load pets ---
  try {
    allPets = await getAllPooledPets();
    buildAbilityFilterOptions(allPets, abilityFilter);
  } catch (error) {
    log('⚠️ petPickerModal: failed to load pets', error);
  }
  renderList();

  // --- Wire events ---
  const onSearch = () => renderList();
  search.addEventListener('input', onSearch);
  locationFilter.addEventListener('change', onSearch);
  sortFilter.addEventListener('change', onSearch);
  tierFilter.addEventListener('change', onSearch);
  abilityFilter.addEventListener('change', onSearch);
  cleanups.push(() => {
    search.removeEventListener('input', onSearch);
    locationFilter.removeEventListener('change', onSearch);
    sortFilter.removeEventListener('change', onSearch);
    tierFilter.removeEventListener('change', onSearch);
    abilityFilter.removeEventListener('change', onSearch);
  });

  compareBtn.addEventListener('click', () => setCompareMode(!compareMode));
  cleanups.push(() => compareBtn.removeEventListener('click', () => {}));

  const doClose = () => { options.onCancel?.(); closePickerModal(); };
  cancelBtn.addEventListener('click', doClose);
  cleanups.push(() => cancelBtn.removeEventListener('click', doClose));

  const onOverlayClick = (e: MouseEvent) => { if (e.target === overlay) doClose(); };
  overlay.addEventListener('click', onOverlayClick);
  cleanups.push(() => overlay.removeEventListener('click', onOverlayClick));

  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') doClose(); };
  window.addEventListener('keydown', onKey);
  cleanups.push(() => window.removeEventListener('keydown', onKey));

  setTimeout(() => search.focus(), 50);

  activeState = {
    container: modal,
    overlay,
    cleanups,
    onSelect: options.onSelect,
    onCancel: options.onCancel ?? (() => {}),
  };
}

export function closePickerModal(): void {
  if (!activeState) return;
  const state = activeState;
  activeState = null;
  state.cleanups.forEach(fn => fn());
  state.overlay.remove();
}
