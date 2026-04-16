// src/ui/petPickerModal.ts
// Pet picker modal for selecting a pet to assign to a team slot.
// Shows all pooled pets (active + hutch + inventory) with sprite previews,
// search/filter, sort, tier filter, mutation tier borders, ability dots,
// a rich hover panel, and a compare mode for side-by-side stat comparison.

import { log } from '../utils/logger';
import { getAllPooledPets } from '../store/petTeams';
import { getPetSpriteDataUrlWithMutations, isSpritesReady, onSpritesReady } from '../sprite-v2/compat';
import { getAbilityColor } from '../utils/petCardRenderer';
import { getAbilityDefinition, computeAbilityStats, computeEffectPerHour, type AbilityDefinition } from '../data/petAbilities';
import { findAbilityHistoryForIdentifiers } from '../store/abilityLogs';
import { computeObservedMetrics } from './abilityAnalysis';
import { calculateMaxStrength, getSpeciesXpPerLevel } from '../store/xpTracker';
import type { PooledPet } from '../types/petTeams';
import { formatCoinsAbbreviated } from '../features/valueCalculator';
import { getPetMetadata } from '../data/petMetadata';
import { getHungerDepletionTime } from '../data/petHungerDepletion';
import { buildAbilityValuationContext, resolveDynamicAbilityEffect, type AbilityValuationContext } from '../features/abilityValuation';
import { buildCompareCardViewModel } from './comparePresentation';
import { captureProgressionStage, getOptimizerAbilityFamilyInfo, type ComparePetInput } from '../features/petCompareEngine';
import type { CompareStage } from '../data/petCompareRules';
import { storage } from '../utils/storage';

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
const PET_TEAMS_UI_STATE_KEY = 'qpm.petTeams.uiState.v1';

interface PickerFilterState {
  location: string;
  sort: string;
  tier: string;
  ability: string;
  compareAbility: string;
  species: string[];
}

interface PetTeamsUiState {
  pickerByTeam?: Record<string, PickerFilterState>;
  compare?: {
    selectedTeamAId?: string;
    selectedTeamBId?: string;
    abilityByPair?: Record<string, string>;
  };
}

function loadPetTeamsUiState(): PetTeamsUiState {
  const raw = storage.get<PetTeamsUiState>(PET_TEAMS_UI_STATE_KEY, {});
  return raw && typeof raw === 'object' ? raw : {};
}

function getSavedPickerFilters(teamId?: string): PickerFilterState | null {
  if (!teamId) return null;
  const state = loadPetTeamsUiState();
  const saved = state.pickerByTeam?.[teamId];
  return saved && typeof saved === 'object' ? saved : null;
}

function savePickerFilters(teamId: string | undefined, filters: PickerFilterState): void {
  if (!teamId) return;
  const state = loadPetTeamsUiState();
  const byTeam = state.pickerByTeam ?? {};
  storage.set(PET_TEAMS_UI_STATE_KEY, {
    ...state,
    pickerByTeam: {
      ...byTeam,
      [teamId]: filters,
    },
  });
}

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
  height: min(620px, 92vh);
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
  background: rgba(20,24,36,0.65);
  border: 1px solid rgba(143,130,255,0.3);
  border-radius: 8px;
  color: #e0e0e0; font-size: 11px;
  padding: 4px 8px; outline: none; cursor: pointer;
  color-scheme: dark;
}
.qpm-picker__filter:focus {
  border-color: #8f82ff;
  box-shadow: 0 0 0 2px rgba(143,130,255,0.18);
}
.qpm-picker__filter option {
  background: rgb(20,24,36);
  color: #e0e0e0;
}
.qpm-picker__species-wrap {
  position: relative;
}
.qpm-picker__species-btn {
  background: rgba(20,24,36,0.65);
  border: 1px solid rgba(143,130,255,0.3);
  border-radius: 8px;
  color: #e0e0e0;
  font-size: 11px;
  padding: 4px 8px;
  cursor: pointer;
  white-space: nowrap;
}
.qpm-picker__species-btn:hover {
  border-color: rgba(143,130,255,0.65);
}
.qpm-picker__species-popover {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  width: 220px;
  max-height: 260px;
  overflow-y: auto;
  background: rgba(14,16,22,0.98);
  border: 1px solid rgba(143,130,255,0.35);
  border-radius: 8px;
  padding: 6px;
  z-index: 3;
  box-shadow: 0 10px 28px rgba(0,0,0,0.55);
}
.qpm-picker__species-item {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 5px 6px;
  border-radius: 6px;
  cursor: pointer;
}
.qpm-picker__species-item:hover {
  background: rgba(143,130,255,0.14);
}
.qpm-picker__species-icon {
  width: 18px;
  height: 18px;
  object-fit: contain;
  image-rendering: pixelated;
  flex-shrink: 0;
}
.qpm-picker__species-name {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 11px;
}
.qpm-picker__species-count {
  font-size: 10px;
  color: rgba(224,224,224,0.62);
  margin-left: 6px;
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
  cursor: pointer; transition: opacity 0.15s, box-shadow 0.15s, border-color 0.15s, background 0.15s;
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
.qpm-pet-card--compare-win {
  border-color: rgba(64,255,194,0.75) !important;
  box-shadow: 0 0 0 2px rgba(64,255,194,0.95), 0 0 12px rgba(64,255,194,0.28) !important;
  background: rgba(64,255,194,0.08);
}
.qpm-pet-card--compare-loss {
  border-color: rgba(255,107,107,0.7) !important;
  box-shadow: 0 0 0 2px rgba(255,107,107,0.9), 0 0 12px rgba(255,107,107,0.25) !important;
  background: rgba(255,107,107,0.08);
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
  width: 360px; flex-shrink: 0;
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
  width: 72px; height: 72px; image-rendering: pixelated; object-fit: contain;
}
.qpm-compare__sprite-placeholder {
  width: 72px; height: 72px; background: rgba(143,130,255,0.1); border-radius: 6px;
  display: flex; align-items: center; justify-content: center; font-size: 32px;
}
.qpm-compare__ability-filter {
  background: rgba(20,24,36,0.65);
  border: 1px solid rgba(143,130,255,0.3);
  border-radius: 8px;
  color: #e0e0e0; font-size: 11px;
  padding: 4px 8px; outline: none; cursor: pointer; width: 100%;
  color-scheme: dark;
}
.qpm-compare__ability-filter:focus {
  border-color: #8f82ff;
  box-shadow: 0 0 0 2px rgba(143,130,255,0.18);
}
.qpm-compare__ability-filter option {
  background: rgb(20,24,36);
  color: #e0e0e0;
}
.qpm-compare__pet-name { font-size: 10px; color: #d0d0d0; text-align: center; max-width: 80px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.qpm-compare__vs { font-size: 12px; color: rgba(224,224,224,0.3); font-weight: 700; }
.qpm-compare__row {
  display: grid; grid-template-columns: minmax(0,1fr) 112px minmax(0,1fr);
  align-items: center; gap: 4px; font-size: 11px; padding: 3px 0;
  border-bottom: 1px solid rgba(255,255,255,0.04);
}
.qpm-compare__row:last-child { border-bottom: none; }
.qpm-compare__cell-a { text-align: right; font-family: monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.qpm-compare__cell-b { text-align: left; font-family: monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.qpm-compare__cell-label { text-align: center; font-size: 9px; color: rgba(224,224,224,0.4); text-transform: uppercase; letter-spacing: 0.05em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
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
  display: grid; grid-template-columns: minmax(0,1fr) 112px minmax(0,1fr);
  gap: 6px; align-items: center; font-size: 10px; padding: 1px 0;
}
.qpm-compare__stat-lbl {
  text-align: center;
  color: rgba(224,224,224,0.3);
  font-size: 9px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.qpm-compare__stat-a,
.qpm-compare__stat-b {
  font-family: monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.qpm-compare__stat-a { text-align: right; }
.qpm-compare__stat-b { text-align: left; }
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

function getAbilityMetric(
  abilityId: string,
  strength: number | null | undefined,
  valuationContext: AbilityValuationContext | null,
): string {
  const def = getAbilityDefinition(abilityId);
  if (!def) return '';
  const stats = computeAbilityStats(def, strength ?? null);
  if (!stats) return '';

  if (isEventTriggeredAbility(def)) {
    const triggerChance = Math.max(0, Math.min(100, stats.chancePerMinute));
    let valuePerProc = 0;
    if (valuationContext) {
      const dynamic = resolveDynamicAbilityEffect(abilityId, valuationContext, strength ?? null);
      if (dynamic && Number.isFinite(dynamic.effectPerProc) && dynamic.effectPerProc > 0) {
        valuePerProc = dynamic.effectPerProc;
      }
    }
    if (valuePerProc <= 0 && Number.isFinite(def.effectValuePerProc) && (def.effectValuePerProc ?? 0) > 0) {
      valuePerProc = def.effectValuePerProc!;
    }
    if (valuePerProc > 0) {
      return `${getTriggerLabel(def)} ${triggerChance.toFixed(1)}% · ${formatProcValue(def, valuePerProc)}`;
    }
    return `${getTriggerLabel(def)} ${triggerChance.toFixed(1)}%`;
  }

  const effectPerHour = computeEffectPerHour(def, stats, strength);
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
  let valuationContext: AbilityValuationContext | null = null;
  try {
    valuationContext = buildAbilityValuationContext();
  } catch {
    valuationContext = null;
  }

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
      if (observed?.procsPerHour != null && def && !isEventTriggeredAbility(def)) {
        const stats = computeAbilityStats(def, pet.strength ?? null);
        if (stats) {
          const eph = computeEffectPerHour(def, { ...stats, procsPerHour: observed.procsPerHour }, pet.strength);
          if (def.effectUnit === 'coins' && eph > 0) {
            metric = `~${formatCoinsAbbreviated(Math.round(eph))} $/hr`;
          } else if (stats.procsPerHour > 0) {
            metric = `${observed.procsPerHour.toFixed(1)}/hr`;
          }
        }
      }
      if (!metric) {
        metric = getAbilityMetric(abilityId, pet.strength, valuationContext);
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

function isEventTriggeredAbility(definition: AbilityDefinition): boolean {
  return definition.trigger !== 'continuous';
}

function getTriggerLabel(definition: AbilityDefinition): string {
  if (definition.trigger === 'harvest') return 'Harvest';
  if (definition.trigger === 'sellAllCrops') return 'Sell';
  if (definition.trigger === 'sellPet') return 'Pet Sell';
  if (definition.trigger === 'hatchEgg') return 'Hatch';
  return 'Trigger';
}

function formatProcValue(definition: AbilityDefinition, valuePerProc: number): string {
  if (definition.effectUnit === 'minutes' || definition.category === 'plantGrowth' || definition.category === 'eggGrowth') {
    return `${valuePerProc.toFixed(1)} min/proc`;
  }
  if (definition.effectUnit === 'xp' || definition.category === 'xp') {
    return `${formatCoinsAbbreviated(valuePerProc)} xp/proc`;
  }
  return `${formatCoinsAbbreviated(valuePerProc)} $/proc`;
}

function formatExpectedValuePerTrigger(definition: AbilityDefinition, value: number): string {
  if (definition.effectUnit === 'minutes' || definition.category === 'plantGrowth' || definition.category === 'eggGrowth') {
    return `${value.toFixed(1)} min/trigger`;
  }
  if (definition.effectUnit === 'xp' || definition.category === 'xp') {
    return `${formatCoinsAbbreviated(value)} xp/trigger`;
  }
  return `${formatCoinsAbbreviated(value)} $/trigger`;
}

interface CompareAbilityStats {
  procsPerHour: number;
  impactPerHour: number;
  triggerChancePercent: number;
  valuePerProc: number;
  expectedValuePerTrigger: number;
  isEventTriggered: boolean;
  triggerLabel: string;
}

function computePetAbilityStatsForCompare(
  pet: PooledPet,
  abilityId: string,
  valuationContext: AbilityValuationContext | null,
): CompareAbilityStats | null {
  const def = getAbilityDefinition(abilityId);
  if (!def) return null;
  const str = pet.strength ?? calculateMaxStrength(pet.targetScale, pet.species) ?? 100;
  const stats = computeAbilityStats(def, str);
  const isEventTriggered = isEventTriggeredAbility(def);
  const triggerChancePercent = Math.max(0, Math.min(100, stats.chancePerMinute));

  let valuePerProc = 0;
  if (valuationContext) {
    const dynamic = resolveDynamicAbilityEffect(def.id, valuationContext, str);
    if (dynamic && Number.isFinite(dynamic.effectPerProc) && dynamic.effectPerProc > 0) {
      valuePerProc = dynamic.effectPerProc;
    }
  }
  if (valuePerProc <= 0 && Number.isFinite(def.effectValuePerProc) && (def.effectValuePerProc ?? 0) > 0) {
    valuePerProc = def.effectValuePerProc!;
  }

  const impactPerHour = valuePerProc > 0
    ? valuePerProc * stats.procsPerHour
    : computeEffectPerHour(def, stats, str);
  const expectedValuePerTrigger = valuePerProc > 0 ? (triggerChancePercent / 100) * valuePerProc : 0;

  return {
    procsPerHour: stats.procsPerHour,
    impactPerHour,
    triggerChancePercent,
    valuePerProc,
    expectedValuePerTrigger,
    isEventTriggered,
    triggerLabel: getTriggerLabel(def),
  };
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

function buildComparePanel(
  petA: PooledPet,
  petB: PooledPet,
  container: HTMLElement,
  abilityFilter: string,
  stage: CompareStage,
  onFilterChange: (newFilter: string) => void,
): void {
  container.innerHTML = '';
  container.className = 'qpm-compare-panel';
  let valuationContext: AbilityValuationContext | null = null;
  try {
    valuationContext = buildAbilityValuationContext();
  } catch {
    valuationContext = null;
  }

  const quickFilterAbilityIds = [...new Set([...petA.abilities, ...petB.abilities])];
  const compareAbilitySelectionMap = new Map<string, Set<string>>();
  const compareAbilityGroups = buildGroupedAbilityGroups(quickFilterAbilityIds, 'compare');
  for (const option of compareAbilityGroups) {
    compareAbilitySelectionMap.set(option.value, option.abilityIds);
  }
  const resolvedAbilityFilter = resolveSavedAbilityFilter(
    abilityFilter,
    compareAbilitySelectionMap,
    'compare',
  );

  const sharedModel = buildCompareCardViewModel({
    petA,
    petB,
    abilityFilter: resolvedAbilityFilter,
    valuationContext,
    stage,
    poolForRank: [petA, petB],
    compactNumbers: true,
  });

  const sharedHeader = document.createElement('div');
  sharedHeader.className = 'qpm-compare__header';
  const sharedTitle = document.createElement('div');
  sharedTitle.className = 'qpm-compare__title';
  sharedTitle.textContent = `Compare • ${stage.toUpperCase()}`;
  sharedHeader.appendChild(sharedTitle);
  container.appendChild(sharedHeader);

  if (compareAbilityGroups.length > 0) {
    const filterSel = document.createElement('select');
    filterSel.className = 'qpm-compare__ability-filter qpm-select';
    const allOpt = document.createElement('option');
    allOpt.value = 'all';
    allOpt.textContent = 'All Abilities';
    filterSel.appendChild(allOpt);
    for (const group of compareAbilityGroups) {
      const opt = document.createElement('option');
      opt.value = group.value;
      opt.textContent = group.label;
      filterSel.appendChild(opt);
    }
    filterSel.value = resolvedAbilityFilter;
    filterSel.addEventListener('change', () => onFilterChange(filterSel.value));
    container.appendChild(filterSel);
  }

  const sprites = document.createElement('div');
  sprites.className = 'qpm-compare__sprites';
  const makeSpriteCol = (pet: PooledPet): HTMLElement => {
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
      const placeholder = document.createElement('div');
      placeholder.className = 'qpm-compare__sprite-placeholder';
      placeholder.textContent = '•';
      col.appendChild(placeholder);
    }
    const name = document.createElement('div');
    name.className = 'qpm-compare__pet-name';
    name.textContent = pet.name || pet.species;
    col.appendChild(name);
    return col;
  };
  sprites.appendChild(makeSpriteCol(petA));
  const vs = document.createElement('div');
  vs.className = 'qpm-compare__vs';
  vs.textContent = 'vs';
  sprites.appendChild(vs);
  sprites.appendChild(makeSpriteCol(petB));
  container.appendChild(sprites);

  const addRow = (
    label: string,
    aText: string,
    bText: string,
    winner: 'a' | 'b' | 'tie' | 'review',
  ): void => {
    const row = document.createElement('div');
    row.className = 'qpm-compare__stat-row';
    const a = document.createElement('div');
    a.className = 'qpm-compare__stat-a';
    a.textContent = aText;
    const mid = document.createElement('div');
    mid.className = 'qpm-compare__stat-lbl';
    mid.textContent = label;
    const b = document.createElement('div');
    b.className = 'qpm-compare__stat-b';
    b.textContent = bText;
    if (winner === 'a') {
      a.classList.add('qpm-compare__winner');
      b.classList.add('qpm-compare__loser');
    } else if (winner === 'b') {
      b.classList.add('qpm-compare__winner');
      a.classList.add('qpm-compare__loser');
    }
    row.append(a, mid, b);
    container.appendChild(row);
  };

  const strA = petA.strength ?? calculateMaxStrength(petA.targetScale, petA.species) ?? 100;
  const strB = petB.strength ?? calculateMaxStrength(petB.targetScale, petB.species) ?? 100;
  addRow('STR', String(strA), String(strB), strA > strB ? 'a' : strB > strA ? 'b' : 'tie');

  if (!sharedModel) {
    addRow('Status', 'Review', 'Review', 'review');
    return;
  }

  for (const rowData of sharedModel.ledgerRows) {
    addRow(rowData.label, rowData.a, rowData.b, rowData.winner);
  }
  return;

  /*
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

  // --- Ability filter ---
  const allAbilityIdsForFilter = [...new Set([...petA.abilities, ...petB.abilities])];
  if (allAbilityIdsForFilter.length > 0) {
    const filterSel = document.createElement('select');
    filterSel.className = 'qpm-compare__ability-filter qpm-select';
    const allOpt = document.createElement('option');
    allOpt.value = 'all';
    allOpt.textContent = 'All Abilities';
    filterSel.appendChild(allOpt);
    for (const id of allAbilityIdsForFilter) {
      const def = getAbilityDefinition(id);
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = def?.name ?? id;
      filterSel.appendChild(opt);
    }
    filterSel.value = abilityFilter;
    filterSel.addEventListener('change', () => onFilterChange(filterSel.value));
    container.appendChild(filterSel);
  }

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
  const allAbilityIds = [...new Set([...petA.abilities, ...petB.abilities])]
    .filter(id => abilityFilter === 'all' || id === abilityFilter);
  if (allAbilityIds.length > 0) {
    addSectionTitle('Abilities');

    for (const abilityId of allAbilityIds) {
      const def = getAbilityDefinition(abilityId);
      if (!def) continue;

      const hasA = petA.abilities.includes(abilityId);
      const hasB = petB.abilities.includes(abilityId);
      const color = getAbilityColor(abilityId);

      const cmpA = hasA ? computePetAbilityStatsForCompare(petA, abilityId, valuationContext) : null;
      const cmpB = hasB ? computePetAbilityStatsForCompare(petB, abilityId, valuationContext) : null;

      const impactA = cmpA?.impactPerHour ?? 0;
      const impactB = cmpB?.impactPerHour ?? 0;
      const procsA = cmpA?.procsPerHour ?? 0;
      const procsB = cmpB?.procsPerHour ?? 0;
      const expectedA = cmpA?.expectedValuePerTrigger ?? 0;
      const expectedB = cmpB?.expectedValuePerTrigger ?? 0;
      const chanceA = cmpA?.triggerChancePercent ?? 0;
      const chanceB = cmpB?.triggerChancePercent ?? 0;
      const eventTriggered = cmpA?.isEventTriggered ?? cmpB?.isEventTriggered ?? false;

      const aWins = hasA && hasB && (
        eventTriggered
          ? (expectedA > expectedB || (expectedA === expectedB && chanceA > chanceB))
          : (impactA > impactB || (impactA === impactB && procsA > procsB))
      );
      const bWins = hasA && hasB && (
        eventTriggered
          ? (expectedB > expectedA || (expectedA === expectedB && chanceB > chanceA))
          : (impactB > impactA || (impactA === impactB && procsB > procsA))
      );

      function buildAbilSide(
        hasPet: boolean,
        cmpStats: CompareAbilityStats | null,
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

        if (cmpStats.isEventTriggered) {
          const chanceRow = document.createElement('div');
          chanceRow.className = 'qpm-compare__abil-metric';
          const chanceLbl = document.createElement('span');
          chanceLbl.className = 'qpm-compare__abil-metric-lbl';
          chanceLbl.textContent = `${cmpStats.triggerLabel} %`;
          const chanceVal = document.createElement('span');
          chanceVal.className = 'qpm-compare__abil-metric-val';
          chanceVal.textContent = cmpStats.triggerChancePercent.toFixed(1);
          chanceVal.style.color = metricColor;
          chanceRow.append(chanceLbl, chanceVal);
          side.appendChild(chanceRow);

          if (cmpStats.valuePerProc > 0) {
            const valueRow = document.createElement('div');
            valueRow.className = 'qpm-compare__abil-metric';
            const valueLbl = document.createElement('span');
            valueLbl.className = 'qpm-compare__abil-metric-lbl';
            valueLbl.textContent = 'Value/proc';
            const valueVal = document.createElement('span');
            valueVal.className = 'qpm-compare__abil-metric-val';
            valueVal.textContent = formatProcValue(def!, cmpStats.valuePerProc);
            valueVal.style.color = metricColor;
            valueRow.append(valueLbl, valueVal);
            side.appendChild(valueRow);

            const expRow = document.createElement('div');
            expRow.className = 'qpm-compare__abil-metric';
            const expLbl = document.createElement('span');
            expLbl.className = 'qpm-compare__abil-metric-lbl';
            expLbl.textContent = 'Exp/trigger';
            const expVal = document.createElement('span');
            expVal.className = 'qpm-compare__abil-metric-val';
            expVal.textContent = formatExpectedValuePerTrigger(def!, cmpStats.expectedValuePerTrigger);
            expVal.style.color = metricColor;
            expRow.append(expLbl, expVal);
            side.appendChild(expRow);
          }
        } else {
          const procsRow = document.createElement('div');
          procsRow.className = 'qpm-compare__abil-metric';
          const procsLbl = document.createElement('span');
          procsLbl.className = 'qpm-compare__abil-metric-lbl';
          procsLbl.textContent = 'Proc/hr';
          const procsVal = document.createElement('span');
          procsVal.className = 'qpm-compare__abil-metric-val';
          procsVal.textContent = cmpStats.procsPerHour.toFixed(1);
          procsVal.style.color = metricColor;
          procsRow.append(procsLbl, procsVal);
          side.appendChild(procsRow);

          if (cmpStats.impactPerHour > 0) {
            const impactRow = document.createElement('div');
            impactRow.className = 'qpm-compare__abil-metric';
            const impactLbl = document.createElement('span');
            impactLbl.className = 'qpm-compare__abil-metric-lbl';
            impactLbl.textContent = 'Impact';
            const impactVal = document.createElement('span');
            impactVal.className = 'qpm-compare__abil-metric-val';
            impactVal.textContent = formatImpactValue(def!, cmpStats.impactPerHour, cmpStats.procsPerHour);
            impactVal.style.color = metricColor;
            impactRow.append(impactLbl, impactVal);
            side.appendChild(impactRow);
          }
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
  */
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
  const abilNames = pet.abilities.map((abilityId) => getAbilityDisplayName(abilityId)).join(', ') || 'None';
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
      dot.title = getAbilityDisplayName(abilityId);
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

function getAbilityCanonicalId(value: string): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return getAbilityDefinition(raw)?.id ?? raw;
}

function getAbilityDisplayName(value: string): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return getAbilityDefinition(raw)?.name ?? raw;
}

function stripTierSuffix(value: string): string {
  return value
    .trim()
    .replace(/\s+(?:IV|III|II|I)$/i, '')
    .replace(/\s+[1-4]$/i, '')
    .trim();
}

type AbilityFilterMode = 'picker' | 'compare';

interface GroupedAbilityOption {
  value: string;
  label: string;
  abilityIds: Set<string>;
}

function buildAbilityFilterSelectionValue(
  abilityId: string,
  displayName: string,
  mode: AbilityFilterMode = 'picker',
): { value: string; label: string } {
  const info = getOptimizerAbilityFamilyInfo(abilityId, displayName);
  const fallbackKey = abilityId
    .replace(/_NEW$/i, '')
    .replace(/(?:I{1,3}|IV)$/i, '')
    .trim()
    .toLowerCase();
  const familyKey = (info?.exactFamilyKey ?? fallbackKey ?? abilityId.toLowerCase()).trim().toLowerCase();
  const familyLabel = (info?.exactFamilyLabel ?? stripTierSuffix(displayName) ?? displayName ?? abilityId).trim();

  return {
    value: mode === 'compare' ? familyKey : `family:${familyKey}`,
    label: familyLabel || abilityId,
  };
}

function resolveSavedAbilityFilter(
  rawValue: string | null | undefined,
  selectionMap: Map<string, Set<string>>,
  mode: AbilityFilterMode = 'picker',
): string {
  const value = typeof rawValue === 'string' ? rawValue.trim() : '';
  if (!value) return 'all';
  if (selectionMap.has(value)) return value;

  const canonicalId = getAbilityCanonicalId(value);
  if (!canonicalId) return 'all';
  const displayName = getAbilityDisplayName(value);
  const family = buildAbilityFilterSelectionValue(canonicalId, displayName, mode);
  return selectionMap.has(family.value) ? family.value : 'all';
}

function petMatchesAbilityFilter(
  pet: PooledPet,
  selectedValue: string,
  selectionMap: Map<string, Set<string>>,
): boolean {
  if (selectedValue === 'all') return true;
  const allowedIds = selectionMap.get(selectedValue);
  if (!allowedIds || allowedIds.size === 0) return false;

  return pet.abilities.some((abilityId) => {
    const canonicalId = getAbilityCanonicalId(abilityId);
    return canonicalId.length > 0 && allowedIds.has(canonicalId);
  });
}

function buildAbilityFilterOptions(
  pets: PooledPet[],
  sel: HTMLSelectElement,
  selectionMap: Map<string, Set<string>>,
): void {
  selectionMap.clear();
  const abilityIds = pets.flatMap((pet) => pet.abilities);
  const grouped = buildGroupedAbilityGroups(abilityIds, 'picker');

  sel.innerHTML = '';
  const allOpt = document.createElement('option');
  allOpt.value = 'all';
  allOpt.textContent = 'All Abilities';
  sel.appendChild(allOpt);

  for (const group of grouped) {
    selectionMap.set(group.value, group.abilityIds);
    const opt = document.createElement('option');
    opt.value = group.value;
    opt.textContent = group.label;
    sel.appendChild(opt);
  }
}

function buildGroupedAbilityGroups(
  abilityIds: string[],
  mode: AbilityFilterMode,
): GroupedAbilityOption[] {
  const grouped = new Map<string, GroupedAbilityOption>();

  for (const rawAbilityId of abilityIds) {
    const canonicalId = getAbilityCanonicalId(rawAbilityId);
    if (!canonicalId) continue;

    const displayName = getAbilityDisplayName(rawAbilityId);
    const family = buildAbilityFilterSelectionValue(canonicalId, displayName, mode);
    const existing = grouped.get(family.value);
    if (existing) {
      existing.abilityIds.add(canonicalId);
      continue;
    }

    grouped.set(family.value, {
      value: family.value,
      label: family.label,
      abilityIds: new Set<string>([canonicalId]),
    });
  }

  return [...grouped.values()].sort((a, b) => a.label.localeCompare(b.label));
}

function toCompareInput(pet: PooledPet): ComparePetInput {
  return {
    id: pet.id,
    species: pet.species,
    strength: pet.strength,
    targetScale: pet.targetScale,
    abilities: pet.abilities,
    mutations: pet.mutations,
  };
}

function derivePickerCompareStage(pets: PooledPet[]): CompareStage {
  const stage = captureProgressionStage(pets.map((pet) => toCompareInput(pet)));
  return stage.stage;
}

function getUniqueSpecies(pets: PooledPet[]): string[] {
  const species = new Set<string>();
  for (const pet of pets) {
    if (pet.species) species.add(pet.species);
  }
  return [...species].sort((a, b) => a.localeCompare(b));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface OpenPickerOptions {
  teamId?: string;
  usedPetIds?: Set<string>;
  mode?: 'select' | 'compare_only';
  allowedItemIds?: Set<string>;
  startInCompareMode?: boolean;
  preselectedCompareItemIds?: string[];
  title?: string;
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
  const mode = options.mode ?? 'select';
  const isCompareOnlyMode = mode === 'compare_only';
  title.textContent = options.title ?? (isCompareOnlyMode ? 'Compare Pets' : 'Pick a Pet');
  header.appendChild(title);

  const search = document.createElement('input');
  search.className = 'qpm-picker__search';
  search.placeholder = 'Search…';
  search.type = 'text';
  header.appendChild(search);

  // Location filter
  const locationFilter = document.createElement('select');
  locationFilter.className = 'qpm-picker__filter qpm-select';
  for (const [value, label] of [['all', 'All Locations'], ['active', 'Active'], ['hutch', 'Hutch'], ['inventory', 'Bag']] as const) {
    const opt = document.createElement('option');
    opt.value = value; opt.textContent = label;
    locationFilter.appendChild(opt);
  }
  header.appendChild(locationFilter);

  // Sort filter
  const sortFilter = document.createElement('select');
  sortFilter.className = 'qpm-picker__filter qpm-select';
  for (const [value, label] of [['str-desc', 'STR ↓'], ['str-asc', 'STR ↑'], ['max-str-desc', 'Max STR ↓'], ['max-str-asc', 'Max STR ↑'], ['name-az', 'Name A→Z'], ['rainbow', 'Rainbow first']] as const) {
    const opt = document.createElement('option');
    opt.value = value; opt.textContent = label;
    sortFilter.appendChild(opt);
  }
  header.appendChild(sortFilter);

  // Tier filter
  const tierFilter = document.createElement('select');
  tierFilter.className = 'qpm-picker__filter qpm-select';
  for (const [value, label] of [['all', 'All Tiers'], ['rainbow', '🌈 Rainbow'], ['gold', '⭐ Gold'], ['clean', 'Clean']] as const) {
    const opt = document.createElement('option');
    opt.value = value; opt.textContent = label;
    tierFilter.appendChild(opt);
  }
  header.appendChild(tierFilter);

  // Ability filter (populated after pets load)
  const abilityFilter = document.createElement('select');
  abilityFilter.className = 'qpm-picker__filter qpm-select';
  const abilFilterDefaultOpt = document.createElement('option');
  abilFilterDefaultOpt.value = 'all';
  abilFilterDefaultOpt.textContent = 'All Abilities';
  abilityFilter.appendChild(abilFilterDefaultOpt);
  header.appendChild(abilityFilter);

  // Species filter (popover multi-select)
  const speciesWrap = document.createElement('div');
  speciesWrap.className = 'qpm-picker__species-wrap';
  const speciesBtn = document.createElement('button');
  speciesBtn.type = 'button';
  speciesBtn.className = 'qpm-picker__species-btn';
  speciesBtn.textContent = 'Species';
  const speciesCount = document.createElement('span');
  speciesCount.className = 'qpm-picker__species-count';
  speciesBtn.appendChild(speciesCount);
  speciesWrap.appendChild(speciesBtn);
  const speciesPopover = document.createElement('div');
  speciesPopover.className = 'qpm-picker__species-popover';
  speciesPopover.style.display = 'none';
  speciesWrap.appendChild(speciesPopover);
  header.appendChild(speciesWrap);

  // Compare button
  const compareBtn = document.createElement('button');
  compareBtn.className = 'qpm-picker__compare-btn';
  compareBtn.textContent = '⚖ Compare';
  if (isCompareOnlyMode) {
    compareBtn.style.display = 'none';
  }
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
  const abilityFilterSelectionMap = new Map<string, Set<string>>();
  const shouldStartInCompareMode = options.startInCompareMode ?? isCompareOnlyMode;
  const savedFilters = getSavedPickerFilters(options.teamId);
  let compareAbilityFilter = savedFilters?.compareAbility ?? 'all';
  let selectedSpecies = new Set<string>(Array.isArray(savedFilters?.species) ? savedFilters.species : []);
  let speciesPopoverOpen = false;
  const cardMap = new Map<string, HTMLElement>(); // pet.id → card element

  if (savedFilters?.location && [...locationFilter.options].some(o => o.value === savedFilters.location)) {
    locationFilter.value = savedFilters.location;
  }
  if (savedFilters?.sort && [...sortFilter.options].some(o => o.value === savedFilters.sort)) {
    sortFilter.value = savedFilters.sort;
  }
  if (savedFilters?.tier && [...tierFilter.options].some(o => o.value === savedFilters.tier)) {
    tierFilter.value = savedFilters.tier;
  }

  function updateSpeciesSummaryLabel(): void {
    speciesCount.textContent = selectedSpecies.size > 0 ? `(${selectedSpecies.size})` : '';
    speciesBtn.title = selectedSpecies.size > 0
      ? `${selectedSpecies.size} species selected`
      : 'All species';
  }

  function setSpeciesPopoverVisible(visible: boolean): void {
    speciesPopoverOpen = visible;
    speciesPopover.style.display = visible ? '' : 'none';
  }

  function renderSpeciesPopover(): void {
    speciesPopover.innerHTML = '';
    const speciesList = getUniqueSpecies(allPets);
    if (!speciesList.length) {
      const empty = document.createElement('div');
      empty.style.cssText = 'padding:8px;color:rgba(224,224,224,0.45);font-size:11px;';
      empty.textContent = 'No species loaded';
      speciesPopover.appendChild(empty);
      return;
    }

    for (const species of speciesList) {
      const row = document.createElement('label');
      row.className = 'qpm-picker__species-item';
      const check = document.createElement('input');
      check.type = 'checkbox';
      check.checked = selectedSpecies.has(species);
      check.style.cursor = 'pointer';
      check.addEventListener('change', () => {
        if (check.checked) selectedSpecies.add(species);
        else selectedSpecies.delete(species);
        updateSpeciesSummaryLabel();
        persistFilters();
        renderList();
      });
      row.appendChild(check);

      const src = getSpriteSrc(species, []);
      if (src) {
        const img = document.createElement('img');
        img.className = 'qpm-picker__species-icon';
        img.src = src;
        img.alt = species;
        row.appendChild(img);
      } else {
        const ph = document.createElement('div');
        ph.className = 'qpm-picker__species-icon';
        ph.textContent = '•';
        ph.style.textAlign = 'center';
        row.appendChild(ph);
      }

      const nameEl = document.createElement('span');
      nameEl.className = 'qpm-picker__species-name';
      nameEl.textContent = species;
      row.appendChild(nameEl);
      speciesPopover.appendChild(row);
    }
  }

  const onSpeciesBtnClick = (event: MouseEvent): void => {
    event.stopPropagation();
    if (!speciesPopoverOpen) renderSpeciesPopover();
    setSpeciesPopoverVisible(!speciesPopoverOpen);
  };
  speciesBtn.addEventListener('click', onSpeciesBtnClick);
  cleanups.push(() => speciesBtn.removeEventListener('click', onSpeciesBtnClick));

  const onPointerDown = (event: MouseEvent): void => {
    if (speciesWrap.contains(event.target as Node)) return;
    setSpeciesPopoverVisible(false);
  };
  document.addEventListener('mousedown', onPointerDown);
  cleanups.push(() => document.removeEventListener('mousedown', onPointerDown));
  updateSpeciesSummaryLabel();

  function persistFilters(): void {
    savePickerFilters(options.teamId, {
      location: locationFilter.value,
      sort: sortFilter.value,
      tier: tierFilter.value,
      ability: abilityFilter.value,
      compareAbility: compareAbilityFilter,
      species: [...selectedSpecies],
    });
  }

  // --- Compare mode ---
  function setCompareMode(active: boolean): void {
    if (isCompareOnlyMode && !active) return;
    compareMode = active;
    compareSelected = [];
    compareBtn.classList.toggle('qpm-picker__compare-btn--active', active);
    compareBtn.textContent = active ? '✕ Exit Compare' : '⚖ Compare';
    updateRightPanel(null);
    syncCompareHighlights();
  }

  function getCompareSelectionVerdict(): 'a' | 'b' | 'tie' | 'review' | null {
    if (compareSelected.length !== 2) return null;

    let valuationContext: AbilityValuationContext | null = null;
    try {
      valuationContext = buildAbilityValuationContext();
    } catch {
      valuationContext = null;
    }

    const model = buildCompareCardViewModel({
      petA: compareSelected[0] ?? null,
      petB: compareSelected[1] ?? null,
      abilityFilter: compareAbilityFilter,
      valuationContext,
      stage: derivePickerCompareStage(allPets),
      poolForRank: compareSelected,
      compactNumbers: true,
    });

    return model?.verdict ?? null;
  }

  function syncCompareHighlights(): void {
    const selectedIds = new Set(compareSelected.map(p => p.id));
    const verdict = getCompareSelectionVerdict();
    const firstSelectedId = compareSelected[0]?.id ?? null;
    const secondSelectedId = compareSelected[1]?.id ?? null;

    for (const [petId, card] of cardMap.entries()) {
      const isSelected = selectedIds.has(petId);
      card.classList.toggle('qpm-pet-card--compare-selected', isSelected);
      card.classList.remove('qpm-pet-card--compare-win', 'qpm-pet-card--compare-loss');

      if (!isSelected || compareSelected.length !== 2) continue;
      if (verdict === 'a') {
        card.classList.toggle('qpm-pet-card--compare-win', petId === firstSelectedId);
        card.classList.toggle('qpm-pet-card--compare-loss', petId === secondSelectedId);
      } else if (verdict === 'b') {
        card.classList.toggle('qpm-pet-card--compare-win', petId === secondSelectedId);
        card.classList.toggle('qpm-pet-card--compare-loss', petId === firstSelectedId);
      }
    }
  }

  function updateRightPanel(hoveredPet: PooledPet | null): void {
    if (compareMode) {
      if (compareSelected.length === 2) {
        buildComparePanel(
          compareSelected[0]!, compareSelected[1]!, rightPanel,
          compareAbilityFilter,
          derivePickerCompareStage(allPets),
          (newFilter) => {
            compareAbilityFilter = newFilter;
            persistFilters();
            syncCompareHighlights();
            updateRightPanel(null);
          },
        );
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
        clearBtn2.textContent = isCompareOnlyMode ? 'Clear Selection' : '✕ Cancel Compare';
        clearBtn2.addEventListener('click', () => {
          if (isCompareOnlyMode) {
            compareSelected = [];
            syncCompareHighlights();
            updateRightPanel(null);
            return;
          }
          setCompareMode(false);
        });
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
    if (compareMode || isCompareOnlyMode) {
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
    } else if (sort === 'max-str-desc') {
      copy.sort((a, b) => {
        const aMax = calculateMaxStrength(a.targetScale, a.species) ?? a.strength ?? -1;
        const bMax = calculateMaxStrength(b.targetScale, b.species) ?? b.strength ?? -1;
        return bMax - aMax;
      });
    } else if (sort === 'max-str-asc') {
      copy.sort((a, b) => {
        const aMax = calculateMaxStrength(a.targetScale, a.species) ?? a.strength ?? -1;
        const bMax = calculateMaxStrength(b.targetScale, b.species) ?? b.strength ?? -1;
        return aMax - bMax;
      });
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
      if (options.allowedItemIds && !options.allowedItemIds.has(p.id)) return false;
      if (loc !== 'all' && p.location !== loc) return false;
      if (term && !p.name.toLowerCase().includes(term) && !p.species.toLowerCase().includes(term)) return false;
      if (selectedSpecies.size > 0 && !selectedSpecies.has(p.species)) return false;
      if (tierVal !== 'all') {
        const t = getMutationTier(p.mutations);
        if (tierVal === 'clean' && t !== 'none') return false;
        if (tierVal !== 'clean' && t !== tierVal) return false;
      }
      if (!petMatchesAbilityFilter(p, abilityFilter.value, abilityFilterSelectionMap)) return false;
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
      const inUse = !isCompareOnlyMode && options.usedPetIds?.has(pet.id) && pet.location !== 'active';
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
    const abilitySourcePets = options.allowedItemIds
      ? allPets.filter((pet) => options.allowedItemIds?.has(pet.id))
      : allPets;
    buildAbilityFilterOptions(abilitySourcePets, abilityFilter, abilityFilterSelectionMap);
    abilityFilter.value = resolveSavedAbilityFilter(savedFilters?.ability, abilityFilterSelectionMap);
    const validSpecies = new Set(getUniqueSpecies(allPets));
    selectedSpecies = new Set([...selectedSpecies].filter((species) => validSpecies.has(species)));
    updateSpeciesSummaryLabel();
    renderSpeciesPopover();
  } catch (error) {
    log('⚠️ petPickerModal: failed to load pets', error);
  }

  if (Array.isArray(options.preselectedCompareItemIds) && options.preselectedCompareItemIds.length > 0) {
    const preselectedSet = new Set(options.preselectedCompareItemIds);
    compareSelected = allPets.filter((pet) => preselectedSet.has(pet.id)).slice(0, 2);
  }

  if (shouldStartInCompareMode) {
    compareMode = true;
    compareBtn.classList.add('qpm-picker__compare-btn--active');
    compareBtn.textContent = '✕ Exit Compare';
    if (isCompareOnlyMode) {
      compareBtn.style.display = 'none';
    }
  }

  renderList();
  updateRightPanel(null);
  persistFilters();

  if (!isSpritesReady()) {
    const offSpritesReady = onSpritesReady(() => {
      renderSpeciesPopover();
      renderList();
      updateRightPanel(null);
    });
    cleanups.push(offSpritesReady);
  }

  // --- Wire events ---
  const onSearch = () => renderList();
  const onFilterChange = () => {
    persistFilters();
    renderList();
  };
  search.addEventListener('input', onSearch);
  locationFilter.addEventListener('change', onFilterChange);
  sortFilter.addEventListener('change', onFilterChange);
  tierFilter.addEventListener('change', onFilterChange);
  abilityFilter.addEventListener('change', onFilterChange);
  cleanups.push(() => {
    search.removeEventListener('input', onSearch);
    locationFilter.removeEventListener('change', onFilterChange);
    sortFilter.removeEventListener('change', onFilterChange);
    tierFilter.removeEventListener('change', onFilterChange);
    abilityFilter.removeEventListener('change', onFilterChange);
  });

  const onCompareClick = (): void => setCompareMode(!compareMode);
  if (!isCompareOnlyMode) {
    compareBtn.addEventListener('click', onCompareClick);
    cleanups.push(() => compareBtn.removeEventListener('click', onCompareClick));
  }

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
