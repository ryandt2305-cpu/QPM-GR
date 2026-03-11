// src/ui/petsWindow.ts
// Pets window: tab panel (Manager | Feeding | Pet Hub | Pet Optimizer)
// Opened via toggleWindow from modalWindow.ts.

import { log } from '../utils/logger';
import { toggleWindow } from './modalWindow';
import {
  getTeamsConfig,
  createTeam,
  renameTeam,
  deleteTeam,
  reorderTeams,
  saveCurrentTeamSlots,
  setTeamSlot,
  clearTeamSlot,
  applyTeam,
  detectCurrentTeam,
  onTeamsChange,
  setKeybind,
  clearKeybind,
  getKeybinds,
  getFeedPolicy,
  setFeedPolicyOverride,
  clearFeedPolicyOverride,
  getAllPooledPets,
} from '../store/petTeams';
import { getPetSpriteDataUrlWithMutations, isSpritesReady, getAnySpriteDataUrl, onSpritesReady } from '../sprite-v2/compat';
import { calculateMaxStrength } from '../store/xpTracker';
import { getAbilityColor } from '../utils/petCardRenderer';
import { formatCoinsAbbreviated } from '../features/valueCalculator';
import { getAbilityDefinition } from '../data/petAbilities';
import { getHungerCapForSpecies, DEFAULT_HUNGER_CAP } from '../data/petHungerCaps';
import { buildAbilityValuationContext, type AbilityValuationContext } from '../features/abilityValuation';
import {
  buildPetCompareProfile,
  buildTeamCompareProfile,
  captureProgressionStage,
  getAbilityFamilyKey,
  type ComparePetInput,
  type TeamCompareProfile,
} from '../features/petCompareEngine';
import { getActivePetInfos, onActivePetInfos } from '../store/pets';
import { openPetPicker } from './petPickerModal';
import { storage } from '../utils/storage';
import {
  getPetFoodRules,
  setRespectPetFoodRules,
  setAvoidFavoritedFoods,
  getDietOptionsForSpecies,
  updateSpeciesOverride,
  PET_FOOD_RULES_CHANGED_EVENT,
} from '../features/petFoodRules';
import { normalizeSpeciesKey } from '../utils/helpers';
import { feedPetInstantly, feedAllPetsInstantly } from '../features/instantFeed';
import { initFloatingCards, openFloatingCardForSlot, hasFloatingCardForSlot } from './petFloatingCard';
import { importAriesTeams } from '../utils/ariesTeamImport';
import type { PetTeam, PooledPet } from '../types/petTeams';
import {
  buildCompareCardViewModel,
} from './comparePresentation';
import type { CompareStage } from '../data/petCompareRules';

const WINDOW_ID = 'qpm-pets-window';
const PETS_WINDOW_SWITCH_TAB_EVENT = 'qpm:pets-window-switch-tab';
const DEFAULT_KEYBIND = 'p';
const FLOATING_CARD_STATE_EVENT = 'qpm:floating-card-state';
let currentKeybind = DEFAULT_KEYBIND;
const PET_TEAMS_UI_STATE_KEY = 'qpm.petTeams.uiState.v1';
const ARIES_IMPORT_ONCE_KEY = 'petHub:ariesImportOnce.v1';

const IS_MAC = /Mac|iPhone|iPad|iPod/.test(navigator.platform);

interface CompareUiState {
  selectedTeamAId?: string;
  selectedTeamBId?: string;
  abilityByPair?: Record<string, string>;
}

interface PetTeamsUiState {
  compare?: CompareUiState;
}

function loadPetTeamsUiState(): PetTeamsUiState {
  const raw = storage.get<PetTeamsUiState>(PET_TEAMS_UI_STATE_KEY, {});
  return raw && typeof raw === 'object' ? raw : {};
}

function saveCompareUiState(patch: Partial<CompareUiState>): void {
  const state = loadPetTeamsUiState();
  const nextCompare: CompareUiState = {
    ...(state.compare ?? {}),
    ...patch,
  };
  storage.set(PET_TEAMS_UI_STATE_KEY, {
    ...state,
    compare: nextCompare,
  });
}

function saveCompareAbilityForPair(pairKey: string, abilityId: string): void {
  if (!pairKey) return;
  const state = loadPetTeamsUiState();
  const currentCompare = state.compare ?? {};
  const currentMap = currentCompare.abilityByPair ?? {};
  storage.set(PET_TEAMS_UI_STATE_KEY, {
    ...state,
    compare: {
      ...currentCompare,
      abilityByPair: {
        ...currentMap,
        [pairKey]: abilityId,
      },
    },
  });
}

function getCompareAbilityForPair(pairKey: string): string | null {
  if (!pairKey) return null;
  const state = loadPetTeamsUiState();
  const ability = state.compare?.abilityByPair?.[pairKey];
  return typeof ability === 'string' ? ability : null;
}

function canonicalKeyFromEvent(e: KeyboardEvent): string {
  const code = e.code || '';
  if (code.startsWith('Key') && code.length === 4) return code.slice(3).toLowerCase();
  if (code.startsWith('Digit') && code.length === 6) return code.slice(5);
  if (/^F\d{1,2}$/.test(code)) return code.toLowerCase();

  switch (code) {
    case 'Space': return 'space';
    case 'Minus': return '-';
    case 'Equal': return '=';
    case 'BracketLeft': return '[';
    case 'BracketRight': return ']';
    case 'Backslash': return '\\';
    case 'Semicolon': return ';';
    case 'Quote': return '\'';
    case 'Backquote': return '`';
    case 'Comma': return ',';
    case 'Period': return '.';
    case 'Slash': return '/';
    case 'ArrowUp': return 'arrowup';
    case 'ArrowDown': return 'arrowdown';
    case 'ArrowLeft': return 'arrowleft';
    case 'ArrowRight': return 'arrowright';
    case 'Enter': return 'enter';
    case 'Tab': return 'tab';
    case 'Escape': return 'escape';
    case 'Backspace': return 'backspace';
    case 'Delete': return 'delete';
    case 'Home': return 'home';
    case 'End': return 'end';
    case 'PageUp': return 'pageup';
    case 'PageDown': return 'pagedown';
    case 'Insert': return 'insert';
    default: {
      const key = e.key.toLowerCase();
      return key.length > 0 ? key : '';
    }
  }
}

function normalizeKeybind(e: KeyboardEvent): string {
  const SKIP = ['Control', 'Shift', 'Alt', 'Meta', 'CapsLock', 'Tab', 'Dead', 'Unidentified'];
  if (SKIP.includes(e.key)) return '';
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('ctrl');
  if (e.altKey) parts.push('alt');
  if (e.shiftKey) parts.push('shift');
  const key = canonicalKeyFromEvent(e);
  if (!key) return '';
  parts.push(key);
  return parts.join('+');
}

function formatKeybind(combo: string): string {
  if (!combo) return '';
  return combo.split('+').map(p => {
    if (p === 'ctrl') return IS_MAC ? '⌘' : 'Ctrl';
    if (p === 'alt') return IS_MAC ? '⌥' : 'Alt';
    if (p === 'shift') return IS_MAC ? '⇧' : 'Shift';
    if (p === 'space') return 'Space';
    if (p.startsWith('arrow')) return p.replace('arrow', 'Arrow ');
    if (p.length > 1 && p.startsWith('f') && /^f\d{1,2}$/.test(p)) return p.toUpperCase();
    return p.length === 1 ? p.toUpperCase() : p;
  }).join(IS_MAC ? '' : '+');
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable
  ) {
    return true;
  }
  return !!target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]');
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const STYLES = `
.qpm-pets {
  font-family: inherit;
  color: #e0e0e0;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.qpm-pets__tabs {
  display: flex;
  gap: 4px;
  padding: 10px 14px 0;
  border-bottom: 1px solid rgba(143,130,255,0.2);
  flex-shrink: 0;
}
.qpm-pets__stage-badge {
  margin-left: auto;
  align-self: center;
  margin-bottom: 7px;
  padding: 2px 9px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.22);
  background: rgba(255,255,255,0.08);
  color: rgba(240,242,250,0.92);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  line-height: 1.5;
  white-space: nowrap;
}
.qpm-pets__stage-badge--hidden { display: none; }
.qpm-pets__stage-badge--early {
  border-color: rgba(255,208,130,0.36);
  background: rgba(255,208,130,0.10);
}
.qpm-pets__stage-badge--mid {
  border-color: rgba(144,196,255,0.36);
  background: rgba(144,196,255,0.10);
}
.qpm-pets__stage-badge--late {
  border-color: rgba(142,255,200,0.36);
  background: rgba(142,255,200,0.10);
}
.qpm-pets__tab {
  padding: 7px 16px;
  font-size: 13px;
  color: rgba(224,224,224,0.55);
  cursor: pointer;
  border-radius: 6px 6px 0 0;
  border-bottom: 2px solid transparent;
  transition: color 0.15s, border-color 0.15s;
  user-select: none;
}
.qpm-pets__tab:hover { color: #e0e0e0; }
.qpm-pets__tab--active { color: #8f82ff; border-color: #8f82ff; }
.qpm-pets__body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.qpm-pets__panel { display: none; flex: 1; min-height: 0; overflow: hidden; }
.qpm-pets__panel--active { display: flex; flex-direction: column; min-height: 0; }

/* Manager tab */
.qpm-mgr {
  display: flex;
  gap: 0;
  flex: 1;
  overflow: hidden;
}
.qpm-mgr__list {
  width: 240px;
  flex-shrink: 0;
  min-height: 0;
  border-right: 1px solid rgba(143,130,255,0.2);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.qpm-mgr__list-header {
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
  border-bottom: 1px solid rgba(143,130,255,0.1);
}
.qpm-mgr__list-top {
  display: flex;
  gap: 6px;
  flex-wrap: nowrap;
}
.qpm-mgr__search {
  flex: 1;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(143,130,255,0.25);
  border-radius: 5px;
  color: #e0e0e0;
  font-size: 12px;
  padding: 5px 8px;
  outline: none;
}
.qpm-mgr__teams {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 6px 8px;
}
.qpm-team-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.12s;
  user-select: none;
}
.qpm-team-row:hover { background: rgba(143,130,255,0.08); }
.qpm-team-row--selected { background: rgba(143,130,255,0.16); }
.qpm-team-row--draggable { cursor: grab; }
.qpm-team-row--dragging { opacity: 0.55; }
.qpm-team-row--compare-a {
  background: rgba(88, 160, 255, 0.15);
  box-shadow: inset 0 0 0 1px rgba(88, 160, 255, 0.6);
}
.qpm-team-row--compare-b {
  background: rgba(100, 255, 150, 0.14);
  box-shadow: inset 0 0 0 1px rgba(100, 255, 150, 0.55);
}
.qpm-team-row__name {
  flex: 1;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.qpm-team-row__badge {
  font-size: 9px;
  padding: 2px 5px;
  border-radius: 3px;
  font-weight: 600;
  background: rgba(100,255,150,0.15);
  color: #64ff96;
  flex-shrink: 0;
}
.qpm-team-row__key {
  font-size: 10px;
  color: rgba(224,224,224,0.4);
  flex-shrink: 0;
}
.qpm-team-row__cmp-badge {
  font-size: 10px;
  font-weight: 700;
  min-width: 16px;
  height: 16px;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.qpm-team-row__cmp-badge--a {
  background: rgba(88, 160, 255, 0.3);
  color: #b8dcff;
}
.qpm-team-row__cmp-badge--b {
  background: rgba(100, 255, 150, 0.24);
  color: #c8ffd9;
}
.qpm-mgr__editor {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.qpm-editor {
  padding: 16px;
  flex: 1;
  overflow-y: auto;
}
.qpm-editor__placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: rgba(224,224,224,0.35);
  font-size: 14px;
}
.qpm-editor__header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
}
.qpm-editor__name {
  flex: 1;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(143,130,255,0.3);
  border-radius: 6px;
  color: #e0e0e0;
  font-size: 14px;
  padding: 7px 10px;
  outline: none;
}
.qpm-editor__name:focus { border-color: rgba(143,130,255,0.7); }
.qpm-editor__status {
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 4px;
}
.qpm-editor__status--active { background: rgba(100,255,150,0.15); color: #64ff96; }
.qpm-editor__status--inactive { color: rgba(224,224,224,0.4); }
.qpm-slots { display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px; }
.qpm-slot {
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(143,130,255,0.2);
  border-radius: 8px;
  padding: 10px 12px;
}
.qpm-slot__index {
  font-size: 11px;
  color: rgba(224,224,224,0.4);
  width: 16px;
  flex-shrink: 0;
  align-self: center;
}
.qpm-slot__sprite-wrap {
  width: 42px; height: 42px; flex-shrink: 0;
  background: rgba(143,130,255,0.07);
  border-radius: 6px;
  display: flex; align-items: center; justify-content: center;
  font-size: 20px;
  overflow: hidden;
}
.qpm-slot__sprite {
  width: 42px; height: 42px;
  image-rendering: pixelated; object-fit: contain;
}
.qpm-slot__info { flex: 1; min-width: 0; }
.qpm-slot__name {
  font-size: 13px; font-weight: 500;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.qpm-slot__str { font-size: 11px; color: rgba(224,224,224,0.5); margin-top: 2px; }
.qpm-slot__abilities { display: flex; gap: 3px; margin-top: 5px; flex-wrap: wrap; }
.qpm-slot__ability-dot { width: 8px; height: 8px; border-radius: 2px; flex-shrink: 0; }
.qpm-slot__empty { font-size: 13px; color: rgba(224,224,224,0.3); font-style: italic; align-self: center; }
.qpm-editor__controls {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.qpm-editor__keybind-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 14px;
  font-size: 12px;
  color: rgba(224,224,224,0.6);
}
.qpm-keybind-input {
  width: 90px;
  text-align: center;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(143,130,255,0.25);
  border-radius: 5px;
  color: #e0e0e0;
  font-size: 11px;
  padding: 5px;
  outline: none;
  cursor: pointer;
  caret-color: transparent;
}
.qpm-keybind-input:focus {
  border-color: rgba(143,130,255,0.6);
  box-shadow: 0 0 0 2px rgba(143,130,255,0.12);
}
.qpm-select {
  padding: 4px 8px;
  border: 1px solid rgba(143,130,255,0.3);
  border-radius: 8px;
  background: rgba(20,24,36,0.65);
  color: #e0e0e0;
  font-size: 11px;
  outline: none;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
  color-scheme: dark;
}
.qpm-select:focus {
  border-color: #8f82ff;
  box-shadow: 0 0 0 2px rgba(143,130,255,0.18);
}
.qpm-select option {
  background: rgb(20, 24, 36);
  color: #e0e0e0;
}

/* Feeding tab */
.qpm-feed {
  padding: 14px; overflow-y: auto; flex: 1;
  display: flex; flex-direction: column; gap: 10px;
}
.qpm-section-title {
  font-size: 13px;
  font-weight: 600;
  color: #8f82ff;
  margin-bottom: 10px;
  margin-top: 16px;
}
.qpm-section-title:first-child { margin-top: 0; }
.qpm-toggle-row {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
}
.qpm-toggle {
  width: 16px;
  height: 16px;
  cursor: pointer;
  accent-color: #8f82ff;
  flex-shrink: 0;
}
/* Feed globals bar */
.qpm-feed__globals {
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
  padding: 10px 12px;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(143,130,255,0.15);
  border-radius: 8px;
}
.qpm-feed__globals-toggles { display: flex; flex-direction: column; gap: 6px; flex: 1; }
/* Per-pet feed card */
.qpm-feed__pet-card {
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(143,130,255,0.2);
  border-radius: 8px;
  padding: 12px;
  display: flex; flex-direction: column; gap: 8px;
}
.qpm-feed__pet-header {
  display: flex; align-items: center; gap: 10px;
}
.qpm-feed__pet-sprite-wrap {
  width: 40px; height: 40px; flex-shrink: 0;
  background: rgba(143,130,255,0.07); border-radius: 6px;
  display: flex; align-items: center; justify-content: center;
  font-size: 20px; overflow: hidden;
}
.qpm-feed__pet-sprite {
  width: 40px; height: 40px;
  image-rendering: pixelated; object-fit: contain;
}
.qpm-feed__pet-info { flex: 1; min-width: 0; }
.qpm-feed__pet-name {
  font-size: 13px; font-weight: 500;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.qpm-feed__pet-hunger {
  display: flex; align-items: center; gap: 6px; margin-top: 3px;
}
.qpm-feed__hunger-pct { font-size: 11px; color: rgba(224,224,224,0.5); min-width: 28px; }
.qpm-feed__hunger-bar-wrap {
  flex: 1; height: 5px; background: rgba(255,255,255,0.1);
  border-radius: 3px; overflow: hidden;
}
.qpm-feed__hunger-bar { height: 100%; border-radius: 3px; }
/* Diet checkboxes */
.qpm-feed__diet-title {
  font-size: 11px; font-weight: 600;
  color: rgba(143,130,255,0.7); text-transform: uppercase; letter-spacing: 0.05em;
}
.qpm-feed__diet {
  display: flex; flex-wrap: wrap; gap: 6px 10px;
}
.qpm-feed__food-label {
  display: flex; align-items: center; gap: 4px;
  font-size: 12px; color: rgba(224,224,224,0.65);
  cursor: pointer; user-select: none;
}
.qpm-feed__food-label input { cursor: pointer; accent-color: #8f82ff; margin: 0; }
.qpm-feed__food-label--preferred { color: #ffd700; }
/* Pop-out button */
.qpm-feed__popout-btn {
  background: none;
  border: 1px solid rgba(143,130,255,0.25);
  border-radius: 5px;
  color: rgba(143,130,255,0.6);
  font-size: 11px; padding: 3px 6px; cursor: pointer;
  transition: color 0.12s, background 0.12s;
  flex-shrink: 0;
}
.qpm-feed__popout-btn:hover { color: #c4beff; background: rgba(143,130,255,0.15); }
.qpm-feed__popout-btn--active { color: #8f82ff; background: rgba(143,130,255,0.18); }
/* Team summary row */
.qpm-team-summary {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  padding: 8px 12px;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(143,130,255,0.12);
  border-radius: 7px;
  margin-bottom: 12px;
  font-size: 11px;
}
.qpm-team-summary__stat { display: flex; flex-direction: column; align-items: center; gap: 1px; }
.qpm-team-summary__val { font-size: 13px; font-weight: 600; color: #c4beff; }
.qpm-team-summary__lbl { font-size: 9px; color: rgba(224,224,224,0.4); text-transform: uppercase; letter-spacing: 0.05em; }
.qpm-team-summary__sep { width: 1px; height: 28px; background: rgba(143,130,255,0.15); }
.qpm-team-summary__dots { display: flex; gap: 3px; align-items: center; flex-wrap: wrap; }
.qpm-team-summary__pill {
  display: inline-flex; align-items: center;
  border: 1px solid rgba(255,255,255,0.25);
  border-radius: 10px; padding: 2px 7px;
  font-size: 10px; font-weight: 700;
  white-space: nowrap;
  text-shadow: 0 1px 1px rgba(0,0,0,0.35);
  box-shadow: inset 0 0 0 1px rgba(0,0,0,0.15);
}
.qpm-team-summary__pill--ability {
  cursor: default;
}
.qpm-team-summary__pill--rainbow {
  border-color: rgba(255,255,255,0.45);
  text-shadow: 0 1px 1px rgba(0,0,0,0.6), 0 0 8px rgba(0,0,0,0.35);
}
.qpm-team-summary__pill-coin {
  width: 11px;
  height: 11px;
  image-rendering: pixelated;
  object-fit: contain;
  margin: 0 1px;
}
.qpm-team-summary__pill-suffix {
  font-size: 9px;
  font-weight: 700;
  opacity: 0.92;
}
.qpm-tcmp-grid { display:flex; flex-direction:column; gap:10px; }
.qpm-tcmp-team-summary {
  display:flex;
  flex-direction:column;
  gap:7px;
  padding:10px 12px;
  border:1px solid rgba(143,130,255,0.24);
  border-radius:10px;
  background:linear-gradient(155deg, rgba(143,130,255,0.10), rgba(255,255,255,0.02));
}
.qpm-tcmp-team-head {
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:8px;
}
.qpm-tcmp-team-title {
  font-size:12px;
  color:rgba(224,224,224,0.8);
  font-weight:600;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
}
.qpm-tcmp-team-score {
  font-size:12px;
  font-weight:700;
  color:#dfe6ff;
  text-align:left;
}
.qpm-tcmp-team-score--right { text-align:right; }
.qpm-tcmp-team-score--win { color:#74ffb5; }
.qpm-tcmp-team-score--lose { color:rgba(224,224,224,0.38); }
.qpm-tcmp-team-table {
  display:grid;
  grid-template-columns:minmax(0,1fr) 98px minmax(0,1fr);
  gap:6px;
  align-items:center;
}
.qpm-tcmp-team-table-head {
  font-size:10px;
  text-transform:uppercase;
  letter-spacing:0.08em;
  color:rgba(224,224,224,0.45);
  border-bottom:1px solid rgba(143,130,255,0.18);
  padding-bottom:3px;
}
.qpm-tcmp-team-table-head--a { text-align:left; }
.qpm-tcmp-team-table-head--mid { text-align:center; }
.qpm-tcmp-team-table-head--b { text-align:right; }
.qpm-tcmp-team-a { text-align:left; font-size:12px; font-weight:700; color:#e7e8ff; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.qpm-tcmp-team-b { text-align:right; font-size:12px; font-weight:700; color:#e7e8ff; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.qpm-tcmp-team-mid {
  text-align:center;
  font-size:10px;
  text-transform:uppercase;
  letter-spacing:0.07em;
  color:rgba(224,224,224,0.48);
  white-space:nowrap;
}
.qpm-tcmp-team-win { color:#74ffb5; }
.qpm-tcmp-row {
  display:grid;
  grid-template-columns:minmax(0,1fr) 236px minmax(0,1fr);
  gap:10px;
  align-items:stretch;
  padding:12px;
  border:1px solid rgba(143,130,255,0.22);
  border-radius:10px;
  background:linear-gradient(145deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02));
}
.qpm-tcmp-pet {
  display:flex;
  flex-direction:column;
  gap:8px;
  min-width:0;
  border:1px solid rgba(143,130,255,0.22);
  border-radius:9px;
  padding:10px 11px;
  background:rgba(8,10,18,0.42);
  transition:border-color 0.15s, background 0.15s, box-shadow 0.15s;
}
.qpm-tcmp-pet--right { align-items:flex-end; text-align:right; }
.qpm-tcmp-head { display:flex; align-items:center; gap:8px; min-width:0; min-height:50px; }
.qpm-tcmp-pet--right .qpm-tcmp-head { flex-direction:row-reverse; }
.qpm-tcmp-pet--winner {
  border-color:rgba(102,255,165,0.58);
  background:linear-gradient(170deg, rgba(64,255,194,0.14), rgba(8,10,18,0.45));
  box-shadow:0 0 0 1px rgba(102,255,165,0.25) inset;
}
.qpm-tcmp-pet--loser {
  opacity:0.88;
  border-color:rgba(143,130,255,0.15);
}
.qpm-tcmp-sprite {
  width:46px; height:46px;
  border-radius:8px;
  background:rgba(143,130,255,0.10);
  display:flex; align-items:center; justify-content:center;
  font-size:22px;
  overflow:hidden;
  flex-shrink:0;
}
.qpm-tcmp-sprite img { width:46px; height:46px; object-fit:contain; image-rendering:pixelated; }
.qpm-tcmp-name { font-size:14px; font-weight:700; color:#f0eeff; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:100%; }
.qpm-tcmp-str { font-size:12px; color:rgba(224,224,224,0.72); font-family:monospace; }
.qpm-tcmp-idline {
  display:flex;
  align-items:flex-start;
  justify-content:space-between;
  gap:7px;
  width:100%;
}
.qpm-tcmp-idline--right { flex-direction:row-reverse; }
.qpm-tcmp-idcopy { min-width:0; flex:1; }
.qpm-tcmp-adots {
  display:flex;
  gap:4px;
  flex-wrap:wrap;
  max-width:72px;
  margin-top:2px;
}
.qpm-tcmp-adots--right { justify-content:flex-start; }
.qpm-tcmp-adot {
  width:9px;
  height:9px;
  border-radius:2px;
  box-shadow:0 0 0 1px rgba(255,255,255,0.2) inset;
  flex-shrink:0;
}
.qpm-tcmp-ab {
  display:flex;
  flex-direction:column;
  gap:2px;
  max-width:100%;
  min-height:30px;
}
.qpm-tcmp-ab-main {
  font-size:11px;
  color:rgba(170,200,255,0.86);
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
}
.qpm-tcmp-ab-all {
  font-size:10px;
  color:rgba(224,224,224,0.5);
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
}
.qpm-tcmp-metrics {
  display:flex;
  flex-direction:column;
  gap:6px;
  width:100%;
}
.qpm-tcmp-metric {
  display:flex;
  align-items:center;
  justify-content:flex-start;
  font-size:12px;
  color:rgba(224,224,224,0.68);
  min-height:18px;
}
.qpm-tcmp-metric--right { justify-content:flex-end; }
.qpm-tcmp-metric-key {
  font-size:9px;
  text-transform:uppercase;
  letter-spacing:0.07em;
  color:rgba(224,224,224,0.43);
  flex-shrink:0;
  white-space:nowrap;
}
.qpm-tcmp-metric-val {
  font-weight:700;
  color:#dfe6ff;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
}
.qpm-tcmp-metric-val--winner { color:#74ffb5; }
.qpm-tcmp-metric-val--rainbow {
  background:linear-gradient(90deg,#ff6f6f,#ffd56b,#77ff9f,#6fc4ff,#d487ff);
  -webkit-background-clip:text;
  background-clip:text;
  -webkit-text-fill-color:transparent;
}
.qpm-tcmp-metric-val--gold { color:#ffd86b; }
.qpm-tcmp-coin {
  width:14px;
  height:14px;
  object-fit:contain;
  image-rendering:pixelated;
  flex-shrink:0;
}
.qpm-tcmp-center {
  display:flex;
  flex-direction:column;
  align-items:stretch;
  justify-content:flex-start;
  gap:8px;
  border:1px solid rgba(143,130,255,0.16);
  border-radius:9px;
  padding:9px 8px;
  background:rgba(143,130,255,0.06);
}
.qpm-tcmp-center-top {
  display:flex;
  flex-direction:column;
  justify-content:center;
  align-items:center;
  gap:8px;
  min-height:88px;
}
.qpm-tcmp-slot { font-size:10px; letter-spacing:0.08em; text-transform:uppercase; color:rgba(224,224,224,0.45); text-align:center; }
.qpm-tcmp-verdict {
  font-size:12px;
  font-weight:700;
  padding:4px 9px;
  border-radius:999px;
  border:1px solid rgba(255,255,255,0.15);
  color:#f5f2ff;
  background:rgba(255,255,255,0.06);
  width:fit-content;
  align-self:center;
}
.qpm-tcmp-verdict--a { border-color:rgba(88,160,255,0.55); background:rgba(88,160,255,0.18); color:#d6e8ff; }
.qpm-tcmp-verdict--b { border-color:rgba(100,255,150,0.55); background:rgba(100,255,150,0.18); color:#d6ffe4; }
.qpm-tcmp-verdict--tie { border-color:rgba(255,255,255,0.28); background:rgba(255,255,255,0.08); color:#ececec; }
.qpm-tcmp-verdict--review { border-color:rgba(255,193,7,0.5); background:rgba(255,193,7,0.14); color:#ffe8a3; }
.qpm-tcmp-ledger {
  display:flex;
  flex-direction:column;
  gap:5px;
  width:100%;
}
.qpm-tcmp-ledger-head,
.qpm-tcmp-ledger-row {
  display:grid;
  grid-template-columns:minmax(0,1fr) 72px minmax(0,1fr);
  align-items:center;
  gap:6px;
}
.qpm-tcmp-ledger-head {
  font-size:10px;
  text-transform:uppercase;
  letter-spacing:0.08em;
  color:rgba(224,224,224,0.46);
  border-bottom:1px solid rgba(143,130,255,0.2);
  padding-bottom:4px;
}
.qpm-tcmp-ledger-row {
  font-size:11px;
  color:rgba(224,224,224,0.72);
}
.qpm-tcmp-ledger-a,
.qpm-tcmp-ledger-b {
  font-weight:700;
  color:#e7e8ff;
}
.qpm-tcmp-ledger-a { text-align:left; }
.qpm-tcmp-ledger-b { text-align:right; }
.qpm-tcmp-ledger-mid {
  text-align:center;
  font-size:9px;
  text-transform:uppercase;
  letter-spacing:0.07em;
  color:rgba(224,224,224,0.46);
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
}
.qpm-tcmp-ledger-win { color:#74ffb5; }
.qpm-tcmp-legend {
  display:flex;
  flex-direction:column;
  gap:5px;
  width:100%;
}
.qpm-tcmp-legend-row {
  display:flex;
  align-items:center;
  justify-content:center;
  min-height:18px;
  text-align:center;
  font-size:9px;
  text-transform:uppercase;
  letter-spacing:0.07em;
  color:rgba(224,224,224,0.5);
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
}
.qpm-tcmp-stage {
  font-size:10px;
  text-transform:uppercase;
  letter-spacing:0.07em;
  color:rgba(224,224,224,0.5);
  text-align:center;
  border-top:1px solid rgba(143,130,255,0.2);
  padding-top:6px;
}
.qpm-tcmp-filter-row { display:flex; align-items:center; gap:8px; }
.qpm-tcmp-filter-chip {
  font-size:10px;
  color:rgba(224,224,224,0.7);
  border:1px solid rgba(143,130,255,0.25);
  background:rgba(143,130,255,0.1);
  border-radius:999px;
  padding:2px 8px;
  white-space:nowrap;
}

/* Shared buttons */
.qpm-btn {
  padding: 7px 14px;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  border: 1px solid rgba(143,130,255,0.35);
  background: rgba(143,130,255,0.1);
  color: #e0e0e0;
  transition: background 0.15s;
}
.qpm-btn:hover { background: rgba(143,130,255,0.2); }
.qpm-btn--primary {
  background: rgba(143,130,255,0.25);
  border-color: rgba(143,130,255,0.6);
  color: #d0c8ff;
  font-weight: 500;
}
.qpm-btn--primary:hover { background: rgba(143,130,255,0.38); }
.qpm-btn--danger {
  border-color: rgba(244,67,54,0.3);
  background: rgba(244,67,54,0.08);
  color: rgba(244,67,54,0.8);
}
.qpm-btn--danger:hover { background: rgba(244,67,54,0.16); }
.qpm-btn--sm { padding: 4px 10px; font-size: 11px; }
`;

let stylesEl: HTMLStyleElement | null = null;
function ensureStyles(doc: Document): void {
  if (doc.getElementById('qpm-pets-styles')) return;
  stylesEl = doc.createElement('style');
  stylesEl.id = 'qpm-pets-styles';
  stylesEl.textContent = STYLES;
  doc.head.appendChild(stylesEl);
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function btn(label: string, variant: 'default' | 'primary' | 'danger' | 'sm' = 'default', extraClass = ''): HTMLButtonElement {
  const el = document.createElement('button');
  el.className = `qpm-btn${variant === 'primary' ? ' qpm-btn--primary' : variant === 'danger' ? ' qpm-btn--danger' : variant === 'sm' ? ' qpm-btn--sm' : ''} ${extraClass}`.trim();
  el.textContent = label;
  return el;
}

function showToast(message: string, type: 'success' | 'error' | 'info' = 'info'): void {
  const el = document.createElement('div');
  el.style.cssText = `
    position:fixed; bottom:24px; right:24px; z-index:9999999;
    background:${type === 'error' ? 'rgba(244,67,54,0.9)' : type === 'success' ? 'rgba(76,175,80,0.9)' : 'rgba(18,20,26,0.95)'};
    border:1px solid ${type === 'error' ? 'rgba(244,67,54,0.5)' : type === 'success' ? 'rgba(76,175,80,0.5)' : 'rgba(143,130,255,0.4)'};
    color:#fff; border-radius:8px; padding:10px 16px; font-size:13px;
    box-shadow:0 4px 16px rgba(0,0,0,0.5); max-width:320px;
  `;
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ---------------------------------------------------------------------------
// Team ability pills helper
// ---------------------------------------------------------------------------

function computeTeamAbilityPills(
  slots: Array<{ abilities: string[]; strength: number | null; targetScale: number | null; species: string }>,
): Array<{
  abilityId: string;
  abilityName: string;
  hoverTitle: string;
  unit: 'coins' | 'minutes' | 'xp' | 'food' | 'none';
  valueText: string;
  valueSuffix: ' /hr' | ' /proc' | ' food /hr';
  sortValue: number;
}> {
  const inputs = slots.map((slot, index) => ({
    id: `team-summary-${index}`,
    species: slot.species,
    strength: slot.strength,
    targetScale: slot.targetScale,
    abilities: slot.abilities,
    mutations: [],
  }));
  const stage = captureProgressionStage(inputs);
  const teamFoodBarValues = inputs
    .map((input) => {
      const cap = getHungerCapForSpecies(input.species);
      return Number.isFinite(cap) && (cap as number) > 0 ? (cap as number) : DEFAULT_HUNGER_CAP;
    })
    .filter((value) => Number.isFinite(value) && value > 0);
  const averageTeamFoodBar = teamFoodBarValues.length > 0
    ? teamFoodBarValues.reduce((sum, value) => sum + value, 0) / teamFoodBarValues.length
    : DEFAULT_HUNGER_CAP;

  let valuationContext: AbilityValuationContext | null = null;
  try {
    valuationContext = buildAbilityValuationContext();
  } catch {
    valuationContext = null;
  }

  type Unit = 'coins' | 'minutes' | 'xp' | 'food' | 'none';
  const resolveHungerRestorePerProcFood = (abilityId: string): number | null => {
    if (!abilityId.startsWith('HungerRestore')) return null;
    if (/IV$/i.test(abilityId)) return 0.45;
    if (/III$/i.test(abilityId)) return 0.40;
    if (/II$/i.test(abilityId)) return 0.35;
    return 0.30;
  };
  const byAbility = new Map<string, {
    abilityId: string;
    abilityName: string;
    unit: Unit;
    displayValue: number;
    valueSuffix: ' /hr' | ' /proc' | ' food /hr';
    sortValue: number;
    representativeSortValue: number;
    isGranter: boolean;
    abilityNames: Set<string>;
  }>();
  for (const input of inputs) {
    const profile = buildPetCompareProfile(input, stage, valuationContext);
    for (const entry of profile.abilities) {
      if (entry.isIgnored || entry.isReview) continue;
      if (entry.group === 'hatch_trio' || entry.group === 'hatch_dollar') continue;

      let unit: Unit = entry.unit !== 'none'
        ? entry.unit
        : entry.group === 'food'
          ? 'minutes'
          : entry.group === 'sale' || entry.group === 'per_hour'
            ? 'coins'
            : 'none';
      let rawDisplayValue = entry.isAction ? entry.expectedValuePerTrigger : entry.impactPerHour;
      let rawSortValue = entry.isAction ? entry.expectedValuePerHour : entry.impactPerHour;
      let valueSuffix: ' /hr' | ' /proc' | ' food /hr' = entry.isAction ? ' /proc' : ' /hr';

      // Hunger Restore should be shown as food/hr, not coin-value proxy.
      const restoreFoodPerProc = resolveHungerRestorePerProcFood(entry.abilityId);
      if (restoreFoodPerProc != null) {
        unit = 'food';
        rawDisplayValue = Math.max(0, entry.procsPerHour) * restoreFoodPerProc * averageTeamFoodBar;
        rawSortValue = rawDisplayValue;
        valueSuffix = ' food /hr';
      }

      const displayValue = Number.isFinite(rawDisplayValue) ? Math.max(0, rawDisplayValue) : 0;
      const sortValue = Number.isFinite(rawSortValue) ? Math.max(0, rawSortValue) : 0;
      const familyKeyRaw = getAbilityFamilyKey(entry.abilityId).trim();
      const familyKey = (familyKeyRaw || entry.abilityId).toLowerCase();
      const existing = byAbility.get(familyKey);
      if (existing) {
        existing.displayValue += displayValue;
        existing.sortValue += sortValue;
        existing.abilityNames.add(entry.name);
        if (existing.unit === 'none' && unit !== 'none') existing.unit = unit;
        if (sortValue > existing.representativeSortValue) {
          existing.abilityId = entry.abilityId;
          existing.abilityName = entry.name;
          existing.representativeSortValue = sortValue;
        }
      } else {
        byAbility.set(familyKey, {
          abilityId: entry.abilityId,
          abilityName: entry.name,
          unit,
          displayValue,
          valueSuffix,
          sortValue,
          representativeSortValue: sortValue,
          isGranter: entry.abilityId.endsWith('Granter'),
          abilityNames: new Set([entry.name]),
        });
      }
    }
  }

  const formatDisplayValue = (value: number, unit: Unit): string => {
    if (unit === 'coins') return formatCoinsAbbreviated(Math.max(0, Math.round(value)));
    if (unit === 'food') {
      if (value >= 1000) return formatCoinsAbbreviated(Math.max(0, Math.round(value)));
      return value.toFixed(value >= 10 ? 1 : 2);
    }
    if (unit === 'minutes') return `${value.toFixed(value >= 10 ? 1 : 2)}min`;
    if (unit === 'xp') return `${formatCoinsAbbreviated(Math.max(0, Math.round(value)))} xp`;
    return `${formatCoinsAbbreviated(Math.max(0, Math.round(value)))}`;
  };

  return [...byAbility.values()]
    .filter((entry) => entry.sortValue > 0.001 || entry.isGranter)
    .sort((a, b) => {
      if (a.isGranter !== b.isGranter) return a.isGranter ? -1 : 1;
      return b.sortValue - a.sortValue;
    })
    .map((entry) => ({
      // Show all merged tier names when a family badge represents multiple abilities.
      hoverTitle: entry.abilityNames.size > 1
        ? `Abilities:\n${[...entry.abilityNames].join('\n')}`
        : (entry.abilityName || [...entry.abilityNames][0] || ''),
      abilityId: entry.abilityId,
      abilityName: entry.abilityName,
      unit: entry.unit,
      valueText: formatDisplayValue(entry.displayValue, entry.unit),
      valueSuffix: entry.valueSuffix,
      sortValue: entry.sortValue,
    }));
}

function parseHexChannelPair(hex: string): number | null {
  if (!/^[0-9a-f]{2}$/i.test(hex)) return null;
  const parsed = Number.parseInt(hex, 16);
  return Number.isFinite(parsed) ? parsed : null;
}

function getReadableBadgeTextColor(background: string, fallback: string): string {
  const hexMatch = background.trim().match(/^#([0-9a-f]{6})$/i);
  if (hexMatch?.[1]) {
    const raw = hexMatch[1];
    const r = parseHexChannelPair(raw.slice(0, 2));
    const g = parseHexChannelPair(raw.slice(2, 4));
    const b = parseHexChannelPair(raw.slice(4, 6));
    if (r != null && g != null && b != null) {
      const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      return luminance > 0.6 ? '#101318' : '#f6f8ff';
    }
  }

  const rgbMatch = background.trim().match(/^rgba?\(([^)]+)\)$/i);
  if (rgbMatch?.[1]) {
    const pieces = rgbMatch[1].split(',').map((part) => Number.parseFloat(part.trim()));
    const r = pieces[0];
    const g = pieces[1];
    const b = pieces[2];
    if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) {
      const luminance = (0.299 * (r as number) + 0.587 * (g as number) + 0.114 * (b as number)) / 255;
      return luminance > 0.6 ? '#101318' : '#f6f8ff';
    }
  }

  return fallback;
}

// ---------------------------------------------------------------------------
// 3v3 Compare Teams panel (Manager tab)
// ---------------------------------------------------------------------------

function toCompareInput(pet: PooledPet | null): ComparePetInput | null {
  if (!pet) return null;
  return {
    id: pet.id,
    species: pet.species,
    strength: pet.strength,
    targetScale: pet.targetScale,
    abilities: pet.abilities,
    mutations: pet.mutations,
  };
}

function deriveCompareStage(pool: PooledPet[]): ReturnType<typeof captureProgressionStage> {
  const inputs = pool.map((pet) => toCompareInput(pet)).filter((pet): pet is ComparePetInput => !!pet);
  return captureProgressionStage(inputs);
}

function formatActionExpectedValue(profile: TeamCompareProfile, key: 'harvest' | 'sell' | 'hatch'): string {
  const bucket = profile.actionBuckets[key];
  const value = bucket.expectedValuePerTrigger;
  const unit = bucket.entries.find((entry) => entry.unit !== 'none')?.unit ?? 'none';
  if (unit === 'coins') return formatCoinsAbbreviated(Math.max(0, Math.round(value)));
  if (unit === 'minutes') return value.toFixed(1);
  if (unit === 'xp') return formatCoinsAbbreviated(Math.max(0, Math.round(value)));
  if (Math.abs(value) >= 1000) return formatCoinsAbbreviated(Math.max(0, Math.round(value)));
  return value.toFixed(value >= 10 ? 1 : 2);
}

function formatTeamScoreCompact(score: number): string {
  if (!Number.isFinite(score)) return '0';
  const absScore = Math.abs(score);
  if (absScore >= 1000) return formatCoinsAbbreviated(score);
  if (absScore >= 100) return score.toFixed(1);
  return score.toFixed(2);
}

function renderTeamSummaryCompare(params: {
  teamAName: string;
  teamBName: string;
  profileA: TeamCompareProfile;
  profileB: TeamCompareProfile;
  stage: CompareStage;
  stageScore: number;
}): HTMLElement {
  const { teamAName, teamBName, profileA, profileB, stage, stageScore } = params;
  const wrap = document.createElement('div');
  wrap.className = 'qpm-tcmp-team-summary';

  const head = document.createElement('div');
  head.className = 'qpm-tcmp-team-head';
  const title = document.createElement('div');
  title.className = 'qpm-tcmp-team-title';
  title.textContent = 'Team Summary';
  const stageEl = document.createElement('div');
  stageEl.className = 'qpm-tcmp-stage';
  stageEl.style.borderTop = 'none';
  stageEl.style.paddingTop = '0';
  stageEl.textContent = `Stage ${stage.toUpperCase()} • ${stageScore.toFixed(1)}`;
  head.append(title, stageEl);
  wrap.appendChild(head);

  const table = document.createElement('div');
  table.className = 'qpm-tcmp-team-table';

  const hA = document.createElement('div');
  hA.className = 'qpm-tcmp-team-table-head qpm-tcmp-team-table-head--a';
  hA.textContent = teamAName;
  const hMid = document.createElement('div');
  hMid.className = 'qpm-tcmp-team-table-head qpm-tcmp-team-table-head--mid';
  hMid.textContent = 'Metric';
  const hB = document.createElement('div');
  hB.className = 'qpm-tcmp-team-table-head qpm-tcmp-team-table-head--b';
  hB.textContent = teamBName;
  table.append(hA, hMid, hB);

  const hasMagnitude = (aRaw: number, bRaw: number): boolean => {
    const EPS = 0.0001;
    return Math.abs(aRaw) > EPS || Math.abs(bRaw) > EPS;
  };

  const addRow = (label: string, aRaw: number, bRaw: number, aText: string, bText: string): void => {
    if (!hasMagnitude(aRaw, bRaw)) return;

    const a = document.createElement('div');
    a.className = 'qpm-tcmp-team-a';
    a.textContent = aText;
    const mid = document.createElement('div');
    mid.className = 'qpm-tcmp-team-mid';
    mid.textContent = label;
    const b = document.createElement('div');
    b.className = 'qpm-tcmp-team-b';
    b.textContent = bText;

    if (aRaw > bRaw) a.classList.add('qpm-tcmp-team-win');
    else if (bRaw > aRaw) b.classList.add('qpm-tcmp-team-win');

    table.append(a, mid, b);
  };

  addRow(
    'Coins/Hr',
    profileA.totals.coinsPerHour,
    profileB.totals.coinsPerHour,
    formatCoinsAbbreviated(Math.max(0, Math.round(profileA.totals.coinsPerHour))),
    formatCoinsAbbreviated(Math.max(0, Math.round(profileB.totals.coinsPerHour))),
  );
  addRow(
    'Plant Min/Hr',
    profileA.totals.plantMinutesPerHour,
    profileB.totals.plantMinutesPerHour,
    profileA.totals.plantMinutesPerHour.toFixed(1),
    profileB.totals.plantMinutesPerHour.toFixed(1),
  );
  addRow(
    'Egg Min/Hr',
    profileA.totals.eggMinutesPerHour,
    profileB.totals.eggMinutesPerHour,
    profileA.totals.eggMinutesPerHour.toFixed(1),
    profileB.totals.eggMinutesPerHour.toFixed(1),
  );
  addRow(
    'XP/Hr',
    profileA.totals.xpPerHour,
    profileB.totals.xpPerHour,
    formatCoinsAbbreviated(Math.max(0, Math.round(profileA.totals.xpPerHour))),
    formatCoinsAbbreviated(Math.max(0, Math.round(profileB.totals.xpPerHour))),
  );

  const actionKeys: Array<'harvest' | 'sell' | 'hatch'> = ['harvest', 'sell', 'hatch'];
  for (const key of actionKeys) {
    const bucketA = profileA.actionBuckets[key];
    const bucketB = profileB.actionBuckets[key];
    const hasActionAbility = bucketA.entries.length > 0 || bucketB.entries.length > 0;
    if (!hasActionAbility) continue;

    const titleCase = key.charAt(0).toUpperCase() + key.slice(1);
    addRow(
      `${titleCase} Chance/Min`,
      bucketA.combinedChancePercent,
      bucketB.combinedChancePercent,
      `${bucketA.combinedChancePercent.toFixed(1)}%`,
      `${bucketB.combinedChancePercent.toFixed(1)}%`,
    );
    if (hasMagnitude(bucketA.expectedValuePerTrigger, bucketB.expectedValuePerTrigger)) {
      addRow(
        `${titleCase} Value/Trigger`,
        bucketA.expectedValuePerTrigger,
        bucketB.expectedValuePerTrigger,
        formatActionExpectedValue(profileA, key),
        formatActionExpectedValue(profileB, key),
      );
    }
  }

  const scoreA = document.createElement('div');
  scoreA.className = 'qpm-tcmp-team-score';
  scoreA.textContent = formatTeamScoreCompact(profileA.score);
  const scoreMid = document.createElement('div');
  scoreMid.className = 'qpm-tcmp-team-mid';
  scoreMid.textContent = 'Team Score';
  const scoreB = document.createElement('div');
  scoreB.className = 'qpm-tcmp-team-score qpm-tcmp-team-score--right';
  scoreB.textContent = formatTeamScoreCompact(profileB.score);
  if (profileA.score > profileB.score) scoreA.classList.add('qpm-tcmp-team-score--win');
  else if (profileB.score > profileA.score) scoreB.classList.add('qpm-tcmp-team-score--win');
  else {
    scoreA.classList.add('qpm-tcmp-team-score--lose');
    scoreB.classList.add('qpm-tcmp-team-score--lose');
  }
  table.append(scoreA, scoreMid, scoreB);

  wrap.appendChild(table);
  return wrap;
}

let coinSpriteUrlCache: string | null = null;
function getCoinSpriteUrl(): string | null {
  if (coinSpriteUrlCache) return coinSpriteUrlCache;
  const url = getAnySpriteDataUrl('sprite/ui/Coin');
  if (url) coinSpriteUrlCache = url;
  return coinSpriteUrlCache;
}

function isCurrencyMetric(metricLabel: string): boolean {
  return metricLabel.includes('$');
}

const WINNER_HIGHLIGHT_MODE: 'full' | 'metric' = 'full';

function applyImpactEmphasis(el: HTMLElement, abilityId: string | null): void {
  el.classList.remove('qpm-tcmp-metric-val--rainbow', 'qpm-tcmp-metric-val--gold');
  if (!abilityId) return;
  if (abilityId === 'RainbowGranter') {
    el.classList.add('qpm-tcmp-metric-val--rainbow');
    return;
  }
  if (abilityId === 'GoldGranter') {
    el.classList.add('qpm-tcmp-metric-val--gold');
    return;
  }
  el.style.color = getAbilityColor(abilityId).base;
}

type CompareSideData = NonNullable<ReturnType<typeof buildCompareCardViewModel>>['sideA'];
type CompareRowData = NonNullable<ReturnType<typeof buildCompareCardViewModel>>['ledgerRows'][number];

function formatAbilityNamesForCompare(abilityIds: string[]): string {
  if (abilityIds.length === 0) return 'No abilities';

  const names = abilityIds.map((abilityId) => getAbilityDefinition(abilityId)?.name ?? abilityId);
  const maxVisible = 3;
  if (names.length <= maxVisible) return names.join(', ');
  return `${names.slice(0, maxVisible).join(', ')} +${names.length - maxVisible}`;
}

function renderComparePetColumn(params: {
  pet: PooledPet | null;
  side: 'left' | 'right';
  metrics: CompareSideData;
  rows: CompareRowData[];
  verdict: 'a' | 'b' | 'tie' | 'review';
}): HTMLElement {
  const { pet, side, metrics, rows, verdict } = params;
  const root = document.createElement('div');
  root.className = `qpm-tcmp-pet${side === 'right' ? ' qpm-tcmp-pet--right' : ''}`;
  const sideKey = side === 'left' ? 'a' : 'b';
  if (WINNER_HIGHLIGHT_MODE === 'full') {
    if (verdict === sideKey) {
      root.classList.add('qpm-tcmp-pet--winner');
    } else if (verdict === 'a' || verdict === 'b') {
      root.classList.add('qpm-tcmp-pet--loser');
    }
  }

  if (!pet) {
    root.textContent = 'Empty slot';
    root.style.color = 'rgba(224,224,224,0.35)';
    root.style.fontSize = '13px';
    root.style.justifyContent = 'center';
    return root;
  }

  const header = document.createElement('div');
  header.className = 'qpm-tcmp-head';

  const sprite = document.createElement('div');
  sprite.className = 'qpm-tcmp-sprite';
  if (pet.species && isSpritesReady()) {
    const src = getPetSpriteDataUrlWithMutations(pet.species, pet.mutations ?? []);
    if (src) {
      const img = document.createElement('img');
      img.src = src;
      img.alt = pet.species;
      sprite.appendChild(img);
    } else {
      sprite.textContent = '🐾';
    }
  } else {
    sprite.textContent = '🐾';
  }
  header.appendChild(sprite);

  const text = document.createElement('div');
  text.style.minWidth = '0';
  text.style.width = '100%';
  const idLine = document.createElement('div');
  idLine.className = `qpm-tcmp-idline${side === 'right' ? ' qpm-tcmp-idline--right' : ''}`;
  const idCopy = document.createElement('div');
  idCopy.className = 'qpm-tcmp-idcopy';
  const name = document.createElement('div');
  name.className = 'qpm-tcmp-name';
  name.textContent = pet.name || pet.species;
  const maxStr = calculateMaxStrength(pet.targetScale, pet.species);
  const str = document.createElement('div');
  str.className = 'qpm-tcmp-str';
  str.textContent = pet.strength != null && maxStr != null
    ? `STR ${pet.strength} / ${maxStr}`
    : pet.strength != null ? `STR ${pet.strength}` : 'STR ?';
  idCopy.append(name, str);
  const abilityDots = document.createElement('div');
  abilityDots.className = `qpm-tcmp-adots${side === 'right' ? ' qpm-tcmp-adots--right' : ''}`;
  for (const abilityId of pet.abilities.slice(0, 4)) {
    const dot = document.createElement('span');
    dot.className = 'qpm-tcmp-adot';
    dot.title = abilityId;
    dot.style.background = getAbilityColor(abilityId).base;
    abilityDots.appendChild(dot);
  }
  idLine.append(idCopy, abilityDots);
  text.append(idLine);
  header.appendChild(text);
  root.appendChild(header);

  const ability = document.createElement('div');
  ability.className = 'qpm-tcmp-ab';
  const abilityMain = document.createElement('div');
  abilityMain.className = 'qpm-tcmp-ab-main';
  abilityMain.textContent = metrics.hasData ? `Focus: ${metrics.abilityName}` : 'No comparable ability';
  const abilityAll = document.createElement('div');
  abilityAll.className = 'qpm-tcmp-ab-all';
  abilityAll.textContent = `All: ${formatAbilityNamesForCompare(pet.abilities)}`;
  ability.append(abilityMain, abilityAll);
  root.appendChild(ability);

  const metricRows = document.createElement('div');
  metricRows.className = 'qpm-tcmp-metrics';
  const getMetricValue = (rowId: CompareRowData['id']): string => {
    if (rowId === 'value_per_proc') return metrics.valuePerProc;
    if (rowId === 'impact_per_hour') return metrics.impactPerHour;
    if (rowId === 'procs_per_hour') return metrics.procsPerHour;
    return metrics.triggerPercent;
  };

  const renderMetric = (rowData: CompareRowData): void => {
    const row = document.createElement('div');
    row.className = `qpm-tcmp-metric${side === 'right' ? ' qpm-tcmp-metric--right' : ''}`;
    const vWrap = document.createElement('span');
    vWrap.style.cssText = 'display:inline-flex;align-items:center;gap:6px;';
    const v = document.createElement('span');
    v.className = 'qpm-tcmp-metric-val';
    v.textContent = getMetricValue(rowData.id);

    if (rowData.winner === sideKey && rowData.id !== 'impact_per_hour') {
      v.classList.add('qpm-tcmp-metric-val--winner');
    }
    if (rowData.id === 'impact_per_hour') {
      applyImpactEmphasis(v, metrics.abilityId);
    }
    if (rowData.id === 'value_per_proc' && isCurrencyMetric(metrics.metricLabel)) {
      const coinUrl = getCoinSpriteUrl();
      if (coinUrl) {
        const coin = document.createElement('img');
        coin.className = 'qpm-tcmp-coin';
        coin.src = coinUrl;
        coin.alt = '$';
        vWrap.appendChild(coin);
      }
    }
    vWrap.appendChild(v);
    row.append(vWrap);
    metricRows.appendChild(row);
  };

  for (const rowData of rows) {
    renderMetric(rowData);
  }
  root.appendChild(metricRows);

  return root;
}

function buildSlotCompareRow(params: {
  petA: PooledPet | null;
  petB: PooledPet | null;
  slotIndex: number;
  abilityFilter: string;
  valuationContext: AbilityValuationContext | null;
  pool: PooledPet[];
  stage: CompareStage;
}): HTMLElement {
  const { petA, petB, slotIndex, abilityFilter, valuationContext, pool, stage } = params;
  const row = document.createElement('div');
  row.className = 'qpm-tcmp-row';

  const model = buildCompareCardViewModel({
    petA,
    petB,
    abilityFilter,
    valuationContext,
    stage,
    poolForRank: pool,
  });
  const verdictKey = model?.verdict ?? 'review';
  const sideA = model?.sideA ?? {
    hasData: false,
    abilityId: null,
    abilityName: 'No comparable ability',
    metricLabel: 'Metric',
    valuePerProc: '—',
    impactPerHour: '—',
    procsPerHour: '—',
    triggerPercent: '—',
    rawValuePerProc: 0,
    rawImpactPerHour: 0,
    rawProcsPerHour: 0,
    rawTriggerPercent: 0,
  };
  const sideB = model?.sideB ?? {
    hasData: false,
    abilityId: null,
    abilityName: 'No comparable ability',
    metricLabel: 'Metric',
    valuePerProc: '—',
    impactPerHour: '—',
    procsPerHour: '—',
    triggerPercent: '—',
    rawValuePerProc: 0,
    rawImpactPerHour: 0,
    rawProcsPerHour: 0,
    rawTriggerPercent: 0,
  };
  const rows: CompareRowData[] = model?.ledgerRows ?? [
    { id: 'value_per_proc', label: 'Value/Proc', a: '—', b: '—', winner: 'review' as const },
    { id: 'impact_per_hour', label: 'Impact/Hr', a: '—', b: '—', winner: 'review' as const },
    { id: 'procs_per_hour', label: 'Rate/Hr', a: '—', b: '—', winner: 'review' as const },
    { id: 'trigger_percent', label: 'Chance/Min', a: '—', b: '—', winner: 'review' as const },
  ];

  const left = renderComparePetColumn({ pet: petA, side: 'left', metrics: sideA, rows, verdict: verdictKey });
  const right = renderComparePetColumn({ pet: petB, side: 'right', metrics: sideB, rows, verdict: verdictKey });

  const center = document.createElement('div');
  center.className = 'qpm-tcmp-center';
  const centerTop = document.createElement('div');
  centerTop.className = 'qpm-tcmp-center-top';
  const slot = document.createElement('div');
  slot.className = 'qpm-tcmp-slot';
  slot.textContent = `Slot ${slotIndex + 1}`;
  centerTop.appendChild(slot);

  const verdict = document.createElement('div');
  verdict.className = `qpm-tcmp-verdict qpm-tcmp-verdict--${verdictKey}`;
  verdict.textContent =
    verdictKey === 'a' ? 'A Wins'
      : verdictKey === 'b' ? 'B Wins'
        : verdictKey === 'tie' ? 'Tie'
          : 'Review';
  centerTop.appendChild(verdict);
  center.appendChild(centerTop);

  const legend = document.createElement('div');
  legend.className = 'qpm-tcmp-legend';
  for (const rowData of rows) {
    const legendRow = document.createElement('div');
    legendRow.className = 'qpm-tcmp-legend-row';
    legendRow.textContent = rowData.label;
    legend.appendChild(legendRow);
  }
  center.appendChild(legend);

  const stageBadge = document.createElement('div');
  stageBadge.className = 'qpm-tcmp-stage';
  stageBadge.textContent = `Stage ${model?.stageBadge ?? stage.toUpperCase()}`;
  center.appendChild(stageBadge);

  row.append(left, center, right);
  return row;
}

interface ComparePanelHandle {
  root: HTMLElement;
  setPair: (teamAId: string | null, teamBId: string | null) => void;
  refresh: () => void;
}

function buildCompareTeamsPanel(
  getPetPool: () => PooledPet[],
  onStageChange?: (stage: CompareStage) => void,
): ComparePanelHandle {
  const panel = document.createElement('div');
  panel.style.cssText = 'display:flex;flex-direction:column;gap:10px;padding:12px 14px 14px;flex:1;overflow-y:auto;';
  const compareState = loadPetTeamsUiState().compare ?? {};
  let teamAId: string | null = compareState.selectedTeamAId ?? null;
  let teamBId: string | null = compareState.selectedTeamBId ?? null;

  const hdr = document.createElement('div');
  hdr.style.cssText = 'font-size:11px;font-weight:700;color:rgba(143,130,255,0.8);text-transform:uppercase;letter-spacing:0.06em;';
  hdr.textContent = 'Team Comparison';
  panel.appendChild(hdr);

  const selectionHint = document.createElement('div');
  selectionHint.style.cssText = 'font-size:11px;color:rgba(224,224,224,0.5);';
  panel.appendChild(selectionHint);

  const filterRow = document.createElement('div');
  filterRow.className = 'qpm-tcmp-filter-row';
  const filterLbl = document.createElement('span');
  filterLbl.style.cssText = 'font-size:11px;color:rgba(224,224,224,0.4);flex-shrink:0;';
  filterLbl.textContent = 'Abilities:';
  const filterSel = document.createElement('select');
  filterSel.className = 'qpm-select';
  filterSel.style.cssText = 'flex:1;cursor:pointer;';
  const allOption = document.createElement('option');
  allOption.value = 'all';
  allOption.textContent = 'All';
  filterSel.appendChild(allOption);
  const activeFilterChip = document.createElement('span');
  activeFilterChip.className = 'qpm-tcmp-filter-chip';
  activeFilterChip.textContent = 'All abilities';
  filterRow.append(filterLbl, filterSel, activeFilterChip);
  panel.appendChild(filterRow);

  const grid = document.createElement('div');
  panel.appendChild(grid);

  function getPairKey(aId: string | null, bId: string | null): string {
    return aId && bId ? `${aId}|${bId}` : '';
  }

  function resolveTeamPets(targetTeamId: string): (PooledPet | null)[] {
    const pool = getPetPool();
    const team = getTeamsConfig().teams.find((entry) => entry.id === targetTeamId);
    if (!team) return [null, null, null];
    return team.slots.map((slotId) => (slotId ? (pool.find((pet) => pet.id === slotId) ?? null) : null));
  }

  function updateAbilityFilter(allPets: (PooledPet | null)[], preferredAbility: string): void {
    const allIds = new Set<string>();
    allPets.forEach((pet) => {
      if (!pet) return;
      pet.abilities.forEach((id) => allIds.add(id));
    });

    filterSel.innerHTML = '';
    const all = document.createElement('option');
    all.value = 'all';
    all.textContent = 'All';
    filterSel.appendChild(all);

    for (const abilityId of allIds) {
      const def = getAbilityDefinition(abilityId);
      const option = document.createElement('option');
      option.value = abilityId;
      option.textContent = def?.name ?? abilityId;
      filterSel.appendChild(option);
    }
    filterSel.value = allIds.has(preferredAbility) ? preferredAbility : 'all';
  }

  function normalizePair(): void {
    const allTeamIds = new Set(getTeamsConfig().teams.map((team) => team.id));
    if (teamAId && !allTeamIds.has(teamAId)) teamAId = null;
    if (teamBId && !allTeamIds.has(teamBId)) teamBId = null;
    if (teamAId && teamBId && teamAId === teamBId) teamBId = null;
  }

  function setPlaceholder(text: string): void {
    grid.innerHTML = '';
    grid.style.cssText = 'font-size:12px;color:rgba(224,224,224,0.3);text-align:center;padding:16px 0;';
    grid.textContent = text;
  }

  function renderComparison(): void {
    normalizePair();
    const pool = getPetPool();
    const stageSnapshot = deriveCompareStage(pool);
    const stage = stageSnapshot.stage;
    onStageChange?.(stage);

    const comparePatch: Partial<CompareUiState> = {};
    if (teamAId) comparePatch.selectedTeamAId = teamAId;
    if (teamBId) comparePatch.selectedTeamBId = teamBId;
    saveCompareUiState(comparePatch);

    if (!teamAId && !teamBId) {
      selectionHint.textContent = 'Compare mode: click a team in the list to set Team A.';
      filterSel.disabled = true;
      filterSel.value = 'all';
      activeFilterChip.textContent = 'All abilities';
      setPlaceholder('Select Team A, then Team B from the list.');
      return;
    }

    if (teamAId && !teamBId) {
      const teamAName = getTeamsConfig().teams.find((team) => team.id === teamAId)?.name ?? 'Team A';
      selectionHint.textContent = `Team A: ${teamAName}. Click another team to set Team B.`;
      filterSel.disabled = true;
      filterSel.value = 'all';
      activeFilterChip.textContent = 'All abilities';
      setPlaceholder('Waiting for Team B selection.');
      return;
    }

    if (!teamAId || !teamBId) return;

    const teamAName = getTeamsConfig().teams.find((team) => team.id === teamAId)?.name ?? 'Team A';
    const teamBName = getTeamsConfig().teams.find((team) => team.id === teamBId)?.name ?? 'Team B';
    selectionHint.textContent = `Comparing ${teamAName} (A) vs ${teamBName} (B).`;
    filterSel.disabled = false;

    const pairKey = getPairKey(teamAId, teamBId);
    const petsA = resolveTeamPets(teamAId);
    const petsB = resolveTeamPets(teamBId);
    const preferredAbility = getCompareAbilityForPair(pairKey) ?? filterSel.value;
    updateAbilityFilter([...petsA, ...petsB], preferredAbility);
    saveCompareAbilityForPair(pairKey, filterSel.value);
    activeFilterChip.textContent = filterSel.value === 'all'
      ? 'All abilities'
      : (getAbilityDefinition(filterSel.value)?.name ?? filterSel.value);

    let valuationContext: AbilityValuationContext | null = null;
    try {
      valuationContext = buildAbilityValuationContext();
    } catch {
      valuationContext = null;
    }
    grid.innerHTML = '';
    grid.className = 'qpm-tcmp-grid';

    const teamProfileA = buildTeamCompareProfile(
      petsA.map((pet) => toCompareInput(pet)),
      stageSnapshot,
      valuationContext,
    );
    const teamProfileB = buildTeamCompareProfile(
      petsB.map((pet) => toCompareInput(pet)),
      stageSnapshot,
      valuationContext,
    );
    grid.appendChild(renderTeamSummaryCompare({
      teamAName,
      teamBName,
      profileA: teamProfileA,
      profileB: teamProfileB,
      stage,
      stageScore: stageSnapshot.score,
    }));

    for (let i = 0; i < 3; i += 1) {
      grid.appendChild(buildSlotCompareRow({
        petA: petsA[i] ?? null,
        petB: petsB[i] ?? null,
        slotIndex: i,
        abilityFilter: filterSel.value,
        valuationContext,
        pool,
        stage,
      }));
    }
  }

  filterSel.addEventListener('change', () => {
    const pairKey = getPairKey(teamAId, teamBId);
    if (pairKey) saveCompareAbilityForPair(pairKey, filterSel.value);
    renderComparison();
  });

  renderComparison();

  return {
    root: panel,
    setPair(nextTeamAId: string | null, nextTeamBId: string | null): void {
      teamAId = nextTeamAId;
      teamBId = nextTeamBId;
      renderComparison();
    },
    refresh(): void {
      renderComparison();
    },
  };
}

// ---------------------------------------------------------------------------
// Manager tab
// ---------------------------------------------------------------------------

interface ManagerState {
  selectedTeamId: string | null;
  searchTerm: string;
  selectTeam: (teamId: string | null) => void;
  cleanups: Array<() => void>;
}

function buildManagerTab(
  root: HTMLElement,
  onCompareStateChange?: (state: { visible: boolean; stage: CompareStage | null }) => void,
): ManagerState {
  const initialTeams = getTeamsConfig().teams;
  const state: ManagerState = {
    selectedTeamId: initialTeams[0]?.id ?? null,
    searchTerm: '',
    selectTeam: () => {},
    cleanups: [],
  };
  let petPool: PooledPet[] = [];

  const mgr = document.createElement('div');
  mgr.className = 'qpm-mgr';
  root.appendChild(mgr);

  // --- Left: team list ---
  const listPanel = document.createElement('div');
  listPanel.className = 'qpm-mgr__list';
  mgr.appendChild(listPanel);

  const listHeader = document.createElement('div');
  listHeader.className = 'qpm-mgr__list-header';
  listPanel.appendChild(listHeader);

  const listTop = document.createElement('div');
  listTop.className = 'qpm-mgr__list-top';
  listHeader.appendChild(listTop);

  const newTeamBtn = btn('+ New Team', 'sm');
  listTop.appendChild(newTeamBtn);

  const compareTeamsBtn = btn('⚖ Compare', 'sm');
  compareTeamsBtn.title = 'Compare two teams side by side';
  listTop.appendChild(compareTeamsBtn);

  const importBtn = btn('⬇', 'sm');
  importBtn.title = 'Import Aries teams';
  listTop.appendChild(importBtn);

  const search = document.createElement('input');
  search.className = 'qpm-mgr__search';
  search.placeholder = 'Search teams…';
  listHeader.appendChild(search);

  const teamsContainer = document.createElement('div');
  teamsContainer.className = 'qpm-mgr__teams';
  listPanel.appendChild(teamsContainer);

  // --- Right: team editor ---
  const editorPanel = document.createElement('div');
  editorPanel.className = 'qpm-mgr__editor';
  mgr.appendChild(editorPanel);

  const editor = document.createElement('div');
  editor.className = 'qpm-editor';
  editorPanel.appendChild(editor);

  const savedCompare = loadPetTeamsUiState().compare ?? {};
  let compareOpen = false;
  let compareTeamAId: string | null = savedCompare.selectedTeamAId ?? null;
  let compareTeamBId: string | null = savedCompare.selectedTeamBId ?? null;
  let dragTeamId: string | null = null;

  let currentCompareStage: CompareStage = 'early';
  const emitCompareState = (): void => {
    onCompareStateChange?.({
      visible: compareOpen,
      stage: compareOpen ? currentCompareStage : null,
    });
  };

  const comparePanel = buildCompareTeamsPanel(
    () => petPool,
    (stage) => {
      currentCompareStage = stage;
      emitCompareState();
    },
  );
  const compareWrapper = comparePanel.root;
  compareWrapper.style.display = 'none';
  editorPanel.appendChild(compareWrapper);

  getAllPooledPets().then((pool) => {
    petPool = pool;
    comparePanel.refresh();
    emitCompareState();
    if (!compareOpen && state.selectedTeamId) renderEditor();
  }).catch(() => { /* pool stays empty */ });

  function normalizeComparePair(): void {
    const teamIds = new Set(getTeamsConfig().teams.map((team) => team.id));
    if (compareTeamAId && !teamIds.has(compareTeamAId)) compareTeamAId = null;
    if (compareTeamBId && !teamIds.has(compareTeamBId)) compareTeamBId = null;
    if (compareTeamAId && compareTeamBId && compareTeamAId === compareTeamBId) compareTeamBId = null;
    comparePanel.setPair(compareTeamAId, compareTeamBId);
  }

  function refreshImportButton(): void {
    const imported = storage.get<boolean>(ARIES_IMPORT_ONCE_KEY, false);
    importBtn.title = imported ? 'Aries import already completed' : 'Import Aries teams';
    importBtn.style.opacity = imported ? '0.62' : '1';
  }

  compareTeamsBtn.addEventListener('click', () => {
    compareOpen = !compareOpen;
    normalizeComparePair();
    editor.style.display = compareOpen ? 'none' : '';
    compareWrapper.style.display = compareOpen ? '' : 'none';
    compareTeamsBtn.textContent = compareOpen ? '✕ Close Compare' : '⚖ Compare';
    emitCompareState();
    renderTeamList();
    if (!compareOpen) renderEditor();
  });

  importBtn.addEventListener('click', () => {
    const result = importAriesTeams();
    if (!result.available) {
      showToast('No Aries teams found in localStorage', 'info');
      return;
    }

    storage.set(ARIES_IMPORT_ONCE_KEY, true);
    refreshImportButton();
    comparePanel.refresh();
    renderTeamList();
    if (!compareOpen) renderEditor();
    emitCompareState();

    if (result.imported > 0) {
      showToast(`Imported ${result.imported} team${result.imported > 1 ? 's' : ''}`, 'success');
    } else {
      showToast('Aries teams already imported', 'info');
    }
  });

  refreshImportButton();
  emitCompareState();

  // Render helpers
  function renderTeamList(): void {
    const config = getTeamsConfig();
    const term = state.searchTerm.toLowerCase();
    const detectedId = detectCurrentTeam();
    const keybinds = getKeybinds();
    const keyByTeamId: Record<string, string> = {};
    for (const [combo, teamId] of Object.entries(keybinds)) {
      if (!teamId || keyByTeamId[teamId]) continue;
      keyByTeamId[teamId] = combo;
    }

    const reorderEnabled = !compareOpen && term.length === 0;
    normalizeComparePair();

    teamsContainer.innerHTML = '';

    const filtered = config.teams.filter((team) => !term || team.name.toLowerCase().includes(term));

    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'padding:20px;text-align:center;color:rgba(224,224,224,0.3);font-size:12px;';
      empty.textContent = config.teams.length === 0 ? 'No teams yet. Create one!' : 'No results';
      teamsContainer.appendChild(empty);
      return;
    }

    filtered.forEach((team) => {
      const row = document.createElement('div');
      row.className = 'qpm-team-row';
      if (!compareOpen && state.selectedTeamId === team.id) {
        row.classList.add('qpm-team-row--selected');
      }
      if (compareOpen && compareTeamAId === team.id) row.classList.add('qpm-team-row--compare-a');
      if (compareOpen && compareTeamBId === team.id) row.classList.add('qpm-team-row--compare-b');
      if (reorderEnabled) row.classList.add('qpm-team-row--draggable');

      const name = document.createElement('div');
      name.className = 'qpm-team-row__name';
      name.textContent = team.name;
      row.appendChild(name);

      const keyLabel = keyByTeamId[team.id];
      if (keyLabel) {
        const keyEl = document.createElement('span');
        keyEl.className = 'qpm-team-row__key';
        keyEl.textContent = `[${formatKeybind(keyLabel)}]`;
        row.appendChild(keyEl);
      }

      if (compareOpen && compareTeamAId === team.id) {
        const badgeA = document.createElement('span');
        badgeA.className = 'qpm-team-row__cmp-badge qpm-team-row__cmp-badge--a';
        badgeA.textContent = 'A';
        row.appendChild(badgeA);
      }
      if (compareOpen && compareTeamBId === team.id) {
        const badgeB = document.createElement('span');
        badgeB.className = 'qpm-team-row__cmp-badge qpm-team-row__cmp-badge--b';
        badgeB.textContent = 'B';
        row.appendChild(badgeB);
      }

      if (team.id === detectedId) {
        const badge = document.createElement('span');
        badge.className = 'qpm-team-row__badge';
        badge.textContent = '✓';
        row.appendChild(badge);
      }

      row.addEventListener('click', () => {
        if (compareOpen) {
          if (!compareTeamAId) {
            compareTeamAId = team.id;
            compareTeamBId = null;
          } else if (!compareTeamBId) {
            if (team.id !== compareTeamAId) compareTeamBId = team.id;
          } else {
            compareTeamAId = team.id;
            compareTeamBId = null;
          }
          comparePanel.setPair(compareTeamAId, compareTeamBId);
          renderTeamList();
          return;
        }

        state.selectedTeamId = team.id;
        renderTeamList();
        renderEditor();
      });

      if (reorderEnabled) {
        row.draggable = true;
        row.addEventListener('dragstart', (event) => {
          dragTeamId = team.id;
          row.classList.add('qpm-team-row--dragging');
          if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', team.id);
          }
        });
        row.addEventListener('dragend', () => {
          dragTeamId = null;
          row.classList.remove('qpm-team-row--dragging');
        });
        row.addEventListener('dragover', (event) => {
          event.preventDefault();
          if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
        });
        row.addEventListener('drop', (event) => {
          event.preventDefault();
          const fromId = dragTeamId || event.dataTransfer?.getData('text/plain') || null;
          dragTeamId = null;
          if (!fromId || fromId === team.id) return;
          const liveTeams = getTeamsConfig().teams;
          const fromIndex = liveTeams.findIndex((entry) => entry.id === fromId);
          const toIndex = liveTeams.findIndex((entry) => entry.id === team.id);
          if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;
          reorderTeams(fromIndex, toIndex);
          comparePanel.refresh();
        });
      }

      teamsContainer.appendChild(row);
    });
  }
  function renderEditor(): void {
    editor.innerHTML = '';

    if (!state.selectedTeamId) {
      const placeholder = document.createElement('div');
      placeholder.className = 'qpm-editor__placeholder';
      placeholder.textContent = 'Select a team to edit';
      editor.appendChild(placeholder);
      return;
    }

    const config = getTeamsConfig();
    const team = config.teams.find(t => t.id === state.selectedTeamId);
    if (!team) {
      state.selectedTeamId = config.teams[0]?.id ?? null;
      renderEditor();
      return;
    }

    const detectedId = detectCurrentTeam();
    const isActive = detectedId === team.id;
    const activePets = getActivePetInfos();

    // Header: name + status
    const header = document.createElement('div');
    header.className = 'qpm-editor__header';

    const nameInput = document.createElement('input');
    nameInput.className = 'qpm-editor__name';
    nameInput.value = team.name;
    nameInput.placeholder = 'Team name…';
    let renameTimer: number | null = null;
    nameInput.addEventListener('input', () => {
      if (renameTimer) clearTimeout(renameTimer);
      renameTimer = window.setTimeout(() => {
        renameTeam(team.id, nameInput.value);
        renderTeamList();
      }, 400);
    });
    header.appendChild(nameInput);

    const statusEl = document.createElement('span');
    statusEl.className = `qpm-editor__status ${isActive ? 'qpm-editor__status--active' : 'qpm-editor__status--inactive'}`;
    statusEl.textContent = isActive ? '✓ Active' : '';
    header.appendChild(statusEl);
    editor.appendChild(header);

    // Team summary (partial stats for filled slots)
    const filledSlotData: { strength: number | null; targetScale: number | null; species: string; abilities: string[] }[] = [];
    for (let si = 0; si < 3; si++) {
      const slotId = team.slots[si as 0 | 1 | 2];
      if (!slotId) continue;
      const pooledPet = petPool.find(p => p.id === slotId);
      const activePet = activePets.find(p => p.slotId === slotId);
      const species = pooledPet?.species ?? activePet?.species ?? '';
      if (species) {
        filledSlotData.push({
          strength: pooledPet?.strength ?? activePet?.strength ?? null,
          targetScale: pooledPet?.targetScale ?? activePet?.targetScale ?? null,
          species,
          abilities: pooledPet?.abilities ?? activePet?.abilities ?? [],
        });
      }
    }

    const filledCount = filledSlotData.length;
    if (filledCount > 0) {
      const summary = document.createElement('div');
      summary.className = 'qpm-team-summary';

      // Slot fill indicator
      const slotStat = document.createElement('div');
      slotStat.className = 'qpm-team-summary__stat';
      const slotVal = document.createElement('div');
      slotVal.className = 'qpm-team-summary__val';
      slotVal.textContent = `${filledCount}/3`;
      const slotLbl = document.createElement('div');
      slotLbl.className = 'qpm-team-summary__lbl';
      slotLbl.textContent = 'Slots';
      slotStat.appendChild(slotVal);
      slotStat.appendChild(slotLbl);
      summary.appendChild(slotStat);

      // Total STR
      const totalStr = filledSlotData.reduce((sum, p) => sum + (p.strength ?? 0), 0);
      const sep1 = document.createElement('div');
      sep1.className = 'qpm-team-summary__sep';
      summary.appendChild(sep1);

      const strStat = document.createElement('div');
      strStat.className = 'qpm-team-summary__stat';
      const strVal = document.createElement('div');
      strVal.className = 'qpm-team-summary__val';
      strVal.textContent = String(totalStr);
      const strLbl = document.createElement('div');
      strLbl.className = 'qpm-team-summary__lbl';
      strLbl.textContent = 'Total STR';
      strStat.appendChild(strVal);
      strStat.appendChild(strLbl);
      summary.appendChild(strStat);

      // Ability contribution pills
      const pills = computeTeamAbilityPills(filledSlotData);
      if (pills.length > 0) {
        const sep2 = document.createElement('div');
        sep2.className = 'qpm-team-summary__sep';
        summary.appendChild(sep2);

        const pillsWrap = document.createElement('div');
        pillsWrap.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;align-items:center;';
        for (const pill of pills) {
          const p = document.createElement('span');
          p.className = 'qpm-team-summary__pill qpm-team-summary__pill--ability';
          const colors = getAbilityColor(pill.abilityId);
          if (pill.abilityId === 'RainbowGranter') {
            p.classList.add('qpm-team-summary__pill--rainbow');
            p.style.background = 'linear-gradient(135deg,#ff477e,#ff9f1c,#35d9c8,#4b7bec,#a55eea,#ff477e)';
            p.style.color = '#f6f8ff';
          } else {
            p.style.background = colors.base;
            p.style.color = getReadableBadgeTextColor(colors.base, colors.text);
          }
          p.title = pill.hoverTitle || pill.abilityName;

          if (pill.unit === 'coins') {
            const valueEl = document.createElement('span');
            valueEl.textContent = pill.valueText;
            p.appendChild(valueEl);

            const coin = getCoinSpriteUrl();
            if (coin) {
              const coinEl = document.createElement('img');
              coinEl.className = 'qpm-team-summary__pill-coin';
              coinEl.src = coin;
              coinEl.alt = '$';
              p.appendChild(coinEl);
            } else {
              const coinFallback = document.createElement('span');
              coinFallback.textContent = '$';
              p.appendChild(coinFallback);
            }

            const suffix = document.createElement('span');
            suffix.className = 'qpm-team-summary__pill-suffix';
            suffix.textContent = pill.valueSuffix;
            p.appendChild(suffix);
          } else {
            p.textContent = `${pill.valueText}${pill.valueSuffix}`;
          }

          pillsWrap.appendChild(p);
        }
        summary.appendChild(pillsWrap);
      }

      editor.appendChild(summary);
    }

    // Slots
    const slotsEl = document.createElement('div');
    slotsEl.className = 'qpm-slots';

    for (let i = 0; i < 3; i++) {
      const slotId = team.slots[i as 0 | 1 | 2];
      const slot = document.createElement('div');
      slot.className = 'qpm-slot';

      const idxEl = document.createElement('div');
      idxEl.className = 'qpm-slot__index';
      idxEl.textContent = String(i + 1);
      slot.appendChild(idxEl);

      if (slotId) {
        const pooledPet = petPool.find(p => p.id === slotId);
        const activePet = activePets.find(p => p.slotId === slotId);

        // Sprite
        const spriteWrap = document.createElement('div');
        spriteWrap.className = 'qpm-slot__sprite-wrap';
        const species = pooledPet?.species ?? activePet?.species ?? '';
        const mutations = pooledPet?.mutations ?? activePet?.mutations ?? [];
        if (species && isSpritesReady()) {
          const src = getPetSpriteDataUrlWithMutations(species, mutations);
          if (src) {
            const img = document.createElement('img');
            img.className = 'qpm-slot__sprite';
            img.src = src;
            img.alt = species;
            spriteWrap.appendChild(img);
          } else {
            spriteWrap.textContent = '🐾';
          }
        } else {
          spriteWrap.textContent = '🐾';
        }
        slot.appendChild(spriteWrap);

        // Info
        const info = document.createElement('div');
        info.className = 'qpm-slot__info';

        const nameEl = document.createElement('div');
        nameEl.className = 'qpm-slot__name';
        nameEl.textContent = pooledPet?.name || activePet?.name || activePet?.species || species || '(unknown)';
        info.appendChild(nameEl);

        const str = pooledPet?.strength ?? activePet?.strength ?? null;
        const targetScale = pooledPet?.targetScale ?? activePet?.targetScale ?? null;
        const maxStr = species ? calculateMaxStrength(targetScale, species) : null;
        const strEl = document.createElement('div');
        strEl.className = 'qpm-slot__str';
        if (str != null && maxStr != null && maxStr > str) {
          strEl.textContent = `STR ${str} → ${maxStr}`;
        } else if (str != null) {
          strEl.textContent = `STR ${str}`;
        } else {
          strEl.textContent = 'STR ?';
          strEl.style.opacity = '0.35';
        }
        info.appendChild(strEl);

        const abilities = pooledPet?.abilities ?? activePet?.abilities ?? [];
        if (abilities.length > 0) {
          const dotsWrap = document.createElement('div');
          dotsWrap.className = 'qpm-slot__abilities';
          for (const abilId of abilities.slice(0, 4)) {
            const color = getAbilityColor(abilId);
            const dot = document.createElement('div');
            dot.className = 'qpm-slot__ability-dot';
            dot.style.background = color.base;
            dot.title = abilId;
            dotsWrap.appendChild(dot);
          }
          info.appendChild(dotsWrap);
        }

        slot.appendChild(info);
      } else {
        const empty = document.createElement('div');
        empty.className = 'qpm-slot__empty';
        empty.textContent = 'Empty slot';
        slot.appendChild(empty);
      }

      // Slot actions
      const pickBtn = btn(slotId ? '↻ Change' : '+ Pick', 'sm');
      pickBtn.addEventListener('click', () => {
        const usedIds = new Set(
          (team.slots.filter((s, idx2) => s && idx2 !== i) as string[])
        );
        openPetPicker({
          teamId: team.id,
          usedPetIds: usedIds,
          onSelect: (petId) => {
            setTeamSlot(team.id, i as 0 | 1 | 2, petId);
            // Refresh pool so the new slot renders with full pet data
            getAllPooledPets().then(pool => { petPool = pool; }).catch(() => {});
            renderTeamList();
            renderEditor();
          },
        });
      });
      slot.appendChild(pickBtn);

      if (slotId) {
        const clearBtn = btn('×', 'sm');
        clearBtn.title = 'Clear slot';
        clearBtn.addEventListener('click', () => {
          clearTeamSlot(team.id, i as 0 | 1 | 2);
          renderTeamList();
          renderEditor();
        });
        slot.appendChild(clearBtn);
      }

      slotsEl.appendChild(slot);
    }
    editor.appendChild(slotsEl);

    // Controls
    const controls = document.createElement('div');
    controls.className = 'qpm-editor__controls';

    const applyBtn = btn('▶ Apply Team', 'primary');
    applyBtn.addEventListener('click', async () => {
      applyBtn.disabled = true;
      applyBtn.textContent = '⏳ Applying…';
      try {
        const result = await applyTeam(team.id);
        if (result.errors.length === 0) {
          showToast(`Applied "${team.name}"`, 'success');
        } else {
          showToast(`Applied with ${result.errors.length} error(s)`, 'error');
          // errors logged via showToast above
        }
      } catch (err) {
        showToast('Apply failed', 'error');
        void err;
      } finally {
        applyBtn.disabled = false;
        applyBtn.textContent = '▶ Apply Team';
        renderTeamList();
        renderEditor();
      }
    });
    controls.appendChild(applyBtn);

    const snapshotBtn = btn('📸 Save Current', 'default');
    snapshotBtn.title = 'Save currently active pets to this team';
    snapshotBtn.addEventListener('click', () => {
      saveCurrentTeamSlots(team.id);
      renderTeamList();
      renderEditor();
      showToast('Team updated from active pets', 'success');
    });
    controls.appendChild(snapshotBtn);

    const deleteBtn = btn('Delete', 'danger');
    deleteBtn.addEventListener('click', () => {
      if (!confirm(`Delete team "${team.name}"?`)) return;
      deleteTeam(team.id);
      state.selectedTeamId = null;
      renderTeamList();
      renderEditor();
    });
    controls.appendChild(deleteBtn);
    editor.appendChild(controls);

    // Keybind config
    const keybindRow = document.createElement('div');
    keybindRow.className = 'qpm-editor__keybind-row';
    keybindRow.appendChild(Object.assign(document.createElement('span'), { textContent: 'Keybind:' }));

    const kbInput = document.createElement('input');
    kbInput.className = 'qpm-keybind-input';
    kbInput.readOnly = true;
    kbInput.placeholder = '—';

    const teamId = team.id;
    const currentCombo = Object.entries(getKeybinds()).find(([, id]) => id === teamId)?.[0] ?? '';
    kbInput.value = currentCombo ? formatKeybind(currentCombo) : '';

    kbInput.addEventListener('focus', () => {
      kbInput.placeholder = 'Press a key…';
      kbInput.value = '';
    });

    kbInput.addEventListener('blur', () => {
      kbInput.placeholder = '—';
      const freshCombo = Object.entries(getKeybinds()).find(([, id]) => id === teamId)?.[0] ?? '';
      kbInput.value = freshCombo ? formatKeybind(freshCombo) : '';
    });

    kbInput.addEventListener('keydown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') { kbInput.blur(); return; }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        Object.entries(getKeybinds()).forEach(([k, id]) => { if (id === teamId) clearKeybind(k); });
        kbInput.value = '';
        kbInput.blur();
        renderTeamList();
        return;
      }
      const combo = normalizeKeybind(e);
      if (!combo) return;
      Object.entries(getKeybinds()).forEach(([k, id]) => { if (id === teamId) clearKeybind(k); });
      setKeybind(combo, teamId);
      kbInput.value = formatKeybind(combo);
      kbInput.blur();
      renderTeamList();
    });
    keybindRow.appendChild(kbInput);

    const kbHint = document.createElement('span');
    kbHint.style.cssText = 'color:rgba(224,224,224,0.35);font-size:11px;';
    kbHint.textContent = '(click to set, Del to clear)';
    keybindRow.appendChild(kbHint);

    editor.appendChild(keybindRow);
  }

  // Wire up controls
  search.addEventListener('input', () => {
    state.searchTerm = search.value;
    renderTeamList();
  });
  state.cleanups.push(() => search.removeEventListener('input', () => {}));

  newTeamBtn.addEventListener('click', () => {
    const team = createTeam(`Team ${getTeamsConfig().teams.length + 1}`);
    state.selectedTeamId = team.id;
    renderTeamList();
    renderEditor();
  });

  // Subscribe to team changes
  const unsub = onTeamsChange(() => {
    const teams = getTeamsConfig().teams;
    if (state.selectedTeamId && !teams.some(t => t.id === state.selectedTeamId)) {
      state.selectedTeamId = teams[0]?.id ?? null;
    } else if (!state.selectedTeamId && teams.length > 0) {
      state.selectedTeamId = teams[0]!.id;
    }
    normalizeComparePair();
    comparePanel.refresh();
    renderTeamList();
    if (!compareOpen) renderEditor();
  });
  state.cleanups.push(unsub);

  renderTeamList();
  renderEditor();

  state.selectTeam = (teamId: string | null): void => {
    const teams = getTeamsConfig().teams;
    if (teamId && teams.some((team) => team.id === teamId)) {
      state.selectedTeamId = teamId;
    } else {
      state.selectedTeamId = teams[0]?.id ?? null;
    }
    if (compareOpen) {
      compareOpen = false;
      normalizeComparePair();
      editor.style.display = '';
      compareWrapper.style.display = 'none';
      compareTeamsBtn.textContent = '⚖ Compare';
      emitCompareState();
    }
    renderTeamList();
    renderEditor();
  };

  return state;
}

// ---------------------------------------------------------------------------
// Feeding tab
// ---------------------------------------------------------------------------

function buildFeedingTab(root: HTMLElement): () => void {
  const feed = document.createElement('div');
  feed.className = 'qpm-feed';
  root.appendChild(feed);
  let destroyed = false;
  let renderQueued = false;

  const queueRender = (): void => {
    if (destroyed || renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      if (!destroyed) render();
    });
  };

  function render(): void {
    feed.innerHTML = '';

    const rules = getPetFoodRules();
    const activePets = getActivePetInfos();

    // --- Global settings bar ---
    const globalsEl = document.createElement('div');
    globalsEl.className = 'qpm-feed__globals';

    const togglesWrap = document.createElement('div');
    togglesWrap.className = 'qpm-feed__globals-toggles';

    const respectRow = document.createElement('label');
    respectRow.className = 'qpm-toggle-row';
    const respectCb = document.createElement('input');
    respectCb.type = 'checkbox'; respectCb.className = 'qpm-toggle';
    respectCb.checked = rules.respectRules;
    respectCb.addEventListener('change', () => {
      setRespectPetFoodRules(respectCb.checked);
      queueRender();
    });
    respectRow.appendChild(respectCb);
    respectRow.append('Respect pet diet rules');
    togglesWrap.appendChild(respectRow);

    const favRow = document.createElement('label');
    favRow.className = 'qpm-toggle-row';
    const favCb = document.createElement('input');
    favCb.type = 'checkbox'; favCb.className = 'qpm-toggle';
    favCb.checked = rules.avoidFavorited;
    favCb.addEventListener('change', () => {
      setAvoidFavoritedFoods(favCb.checked);
      queueRender();
    });
    favRow.appendChild(favCb);
    favRow.append('Avoid feeding favorited items');
    togglesWrap.appendChild(favRow);
    globalsEl.appendChild(togglesWrap);

    const feedAllBtn = btn('🍖 Feed All', 'primary');
    feedAllBtn.title = 'Feed all active pets from inventory';
    feedAllBtn.addEventListener('click', async () => {
      feedAllBtn.disabled = true;
      feedAllBtn.textContent = '⏳ Feeding…';
      try {
        const latestRules = getPetFoodRules();
        const results = await feedAllPetsInstantly(100, latestRules.respectRules);
        const ok = results.filter(r => r.success).length;
        const fail = results.filter(r => !r.success).length;
        if (results.length === 0) showToast('No pets needed feeding', 'info');
        else if (fail === 0) showToast(`Fed ${ok} pet${ok !== 1 ? 's' : ''}`, 'success');
        else showToast(`Fed ${ok}, failed ${fail}`, 'error');
      } finally {
        feedAllBtn.disabled = false;
        feedAllBtn.textContent = '🍖 Feed All';
      }
    });
    globalsEl.appendChild(feedAllBtn);
    feed.appendChild(globalsEl);

    // --- No active pets ---
    if (activePets.length === 0) {
      const emptyEl = document.createElement('div');
      emptyEl.style.cssText = 'text-align:center;color:rgba(224,224,224,0.3);font-size:13px;padding:24px 0;';
      emptyEl.textContent = 'No active pets';
      feed.appendChild(emptyEl);
      return;
    }

    // --- Per-pet cards ---
    for (let i = 0; i < activePets.length; i++) {
      const pet = activePets[i]!;
      const speciesKey = pet.species ? normalizeSpeciesKey(pet.species) : '';
      const speciesOverride = speciesKey ? (rules.overrides[speciesKey] ?? {}) : {};
      const forbiddenSet = new Set(speciesOverride.forbidden ?? []);
      const preferredKey = speciesOverride.preferred ?? null;

      const card = document.createElement('div');
      card.className = 'qpm-feed__pet-card';

      // Header: sprite + info + feed button
      const header = document.createElement('div');
      header.className = 'qpm-feed__pet-header';

      // Sprite
      const spriteWrap = document.createElement('div');
      spriteWrap.className = 'qpm-feed__pet-sprite-wrap';
      if (pet.species && isSpritesReady()) {
        const src = getPetSpriteDataUrlWithMutations(pet.species, pet.mutations ?? []);
        if (src) {
          const img = document.createElement('img');
          img.className = 'qpm-feed__pet-sprite';
          img.src = src; img.alt = pet.species;
          spriteWrap.appendChild(img);
        } else {
          spriteWrap.textContent = '🐾';
        }
      } else {
        spriteWrap.textContent = '🐾';
      }
      header.appendChild(spriteWrap);

      // Info
      const info = document.createElement('div');
      info.className = 'qpm-feed__pet-info';

      const nameEl = document.createElement('div');
      nameEl.className = 'qpm-feed__pet-name';
      nameEl.textContent = pet.name || pet.species || 'Pet';
      info.appendChild(nameEl);

      if (pet.hungerPct !== null) {
        const hungerRow = document.createElement('div');
        hungerRow.className = 'qpm-feed__pet-hunger';
        const hungerPct = document.createElement('span');
        hungerPct.className = 'qpm-feed__hunger-pct';
        hungerPct.textContent = `${Math.round(pet.hungerPct)}%`;
        const barWrap = document.createElement('div');
        barWrap.className = 'qpm-feed__hunger-bar-wrap';
        const bar = document.createElement('div');
        bar.className = 'qpm-feed__hunger-bar';
        bar.style.width = `${pet.hungerPct}%`;
        bar.style.background = pet.hungerPct < 30 ? '#ff6464' : pet.hungerPct < 60 ? '#ffb464' : '#64ff96';
        barWrap.appendChild(bar);
        hungerRow.appendChild(hungerPct);
        hungerRow.appendChild(barWrap);
        info.appendChild(hungerRow);
      }

      header.appendChild(info);

      // Feed button
      const feedBtn = btn('Feed', 'primary');
      feedBtn.addEventListener('click', async () => {
        feedBtn.disabled = true;
        feedBtn.textContent = '⏳';
        try {
          const latestRules = getPetFoodRules();
          const result = await feedPetInstantly(pet.slotIndex, latestRules.respectRules);
          if (result.success) {
            showToast(`Fed ${result.petName || 'pet'}${result.foodSpecies ? ` (${result.foodSpecies})` : ''}`, 'success');
          } else {
            showToast(result.error ?? 'Feed failed', 'error');
          }
        } finally {
          feedBtn.disabled = false;
          feedBtn.textContent = 'Feed';
        }
      });
      header.appendChild(feedBtn);

      // Pop-out button — opens a draggable floating card bound to this slot.
      const slotIndex = pet.slotIndex;
      const popoutBtn = document.createElement('button');
      popoutBtn.className = `qpm-feed__popout-btn${hasFloatingCardForSlot(slotIndex) ? ' qpm-feed__popout-btn--active' : ''}`;
      popoutBtn.title = 'Open detached feed card';
      popoutBtn.textContent = '↗';
      popoutBtn.addEventListener('click', () => {
        openFloatingCardForSlot(slotIndex);
        popoutBtn.classList.add('qpm-feed__popout-btn--active');
      });
      header.appendChild(popoutBtn);

      card.appendChild(header);

      // Diet checkboxes
      if (pet.species) {
        const dietOptions = getDietOptionsForSpecies(pet.species);
        if (dietOptions.length > 0) {
          const dietTitle = document.createElement('div');
          dietTitle.className = 'qpm-feed__diet-title';
          dietTitle.textContent = `Diet — ${pet.species}`;
          card.appendChild(dietTitle);

          const dietEl = document.createElement('div');
          dietEl.className = 'qpm-feed__diet';

          for (const option of dietOptions) {
            const lbl = document.createElement('label');
            lbl.className = `qpm-feed__food-label${option.key === preferredKey ? ' qpm-feed__food-label--preferred' : ''}`;

            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = !forbiddenSet.has(option.key);
            cb.addEventListener('change', () => {
              const fresh = getPetFoodRules();
              const freshKey = normalizeSpeciesKey(pet.species!);
              const freshOverride = freshKey ? (fresh.overrides[freshKey] ?? {}) : {};
              const forbidden = new Set(freshOverride.forbidden ?? []);
              if (cb.checked) forbidden.delete(option.key);
              else forbidden.add(option.key);
              updateSpeciesOverride(pet.species!, { ...freshOverride, forbidden: Array.from(forbidden) });
            });

            lbl.appendChild(cb);
            lbl.append(` ${option.label}${option.key === preferredKey ? ' ★' : ''}`);
            dietEl.appendChild(lbl);
          }

          card.appendChild(dietEl);
        }
      }

      feed.appendChild(card);
    }
  }

  render();
  const unsubscribePets = onActivePetInfos(() => queueRender(), false);
  const unsubscribeSprites = onSpritesReady(() => queueRender());
  const onFoodRulesChanged = (): void => queueRender();
  const onFloatingCardState = (): void => queueRender();
  window.addEventListener(PET_FOOD_RULES_CHANGED_EVENT, onFoodRulesChanged as EventListener);
  window.addEventListener(FLOATING_CARD_STATE_EVENT, onFloatingCardState as EventListener);
  return () => {
    destroyed = true;
    unsubscribePets();
    unsubscribeSprites();
    window.removeEventListener(PET_FOOD_RULES_CHANGED_EVENT, onFoodRulesChanged as EventListener);
    window.removeEventListener(FLOATING_CARD_STATE_EVENT, onFloatingCardState as EventListener);
  };
}


// ---------------------------------------------------------------------------
// Main window
// ---------------------------------------------------------------------------

export function togglePetsWindow(): void {
  toggleWindow(WINDOW_ID, 'Pets', renderPetsWindow, '880px', '600px');
}

function renderPetsWindow(root: HTMLElement): void {
  ensureStyles(root.ownerDocument ?? document);

  const container = document.createElement('div');
  container.className = 'qpm-pets';
  root.appendChild(container);

  const allCleanups: Array<() => void> = [];

  // Tabs
  const tabs = document.createElement('div');
  tabs.className = 'qpm-pets__tabs';
  container.appendChild(tabs);

  const compareStageBadge = document.createElement('div');
  compareStageBadge.className = 'qpm-pets__stage-badge qpm-pets__stage-badge--hidden';
  compareStageBadge.textContent = 'Stage • Early';

  const body = document.createElement('div');
  body.className = 'qpm-pets__body';
  container.appendChild(body);

  const tabDefs = [
    { id: 'manager', label: 'Manager', lazy: false },
    { id: 'feeding', label: 'Feeding', lazy: false },
    { id: 'pet-optimizer', label: '🎯 Pet Optimizer', lazy: true },
  ] as const;

  type TabId = typeof tabDefs[number]['id'];
  let activeTab: TabId = 'manager';
  let compareBadgeVisible = false;
  let compareBadgeStage: CompareStage | null = null;

  const panels: Partial<Record<TabId, HTMLElement>> = {};
  const tabBtns: Partial<Record<TabId, HTMLElement>> = {};
  const lazyLoaded = new Set<TabId>();

  function renderCompareStageBadge(): void {
    const show = compareBadgeVisible && activeTab === 'manager' && !!compareBadgeStage;
    compareStageBadge.classList.toggle('qpm-pets__stage-badge--hidden', !show);
    compareStageBadge.classList.remove(
      'qpm-pets__stage-badge--early',
      'qpm-pets__stage-badge--mid',
      'qpm-pets__stage-badge--late',
    );

    if (!show || !compareBadgeStage) return;

    compareStageBadge.textContent = `Stage • ${compareBadgeStage.toUpperCase()}`;
    compareStageBadge.classList.add(`qpm-pets__stage-badge--${compareBadgeStage}`);
  }

  function reassertScrollChain(panel: HTMLElement | undefined): void {
    if (!panel) return;
    panel.style.minHeight = '0';
    panel.style.overflow = 'hidden';

    const scrollTargets = panel.querySelectorAll<HTMLElement>(
      '.qpm-mgr__teams, .qpm-mgr__editor, .qpm-editor, .qpm-feed, .qpm-tcmp-grid, .qpm-window-body, .qpm-pet-optimizer-root',
    );
    scrollTargets.forEach((target) => {
      if (!target.style.minHeight) target.style.minHeight = '0';
      if (!target.style.overflowY) target.style.overflowY = 'auto';
    });
  }

  function switchTab(id: TabId): void {
    activeTab = id;
    for (const def of tabDefs) {
      tabBtns[def.id]?.classList.toggle('qpm-pets__tab--active', def.id === id);
      panels[def.id]?.classList.toggle('qpm-pets__panel--active', def.id === id);
    }
    // Force inactive panels hidden to avoid stale sub-layout bleed-through.
    for (const def of tabDefs) {
      const panel = panels[def.id];
      if (!panel) continue;
      panel.style.display = def.id === id ? 'flex' : 'none';
    }
    // Lazy-load optimizer tab on first activation.
    if (id === 'pet-optimizer' && !lazyLoaded.has('pet-optimizer')) {
      lazyLoaded.add('pet-optimizer');
      const panel = panels['pet-optimizer']!;
      import('./petOptimizerWindow').then(({ renderPetOptimizerWindow }) => {
        panel.innerHTML = '';
        renderPetOptimizerWindow(panel);
      }).catch(() => {
        panel.innerHTML = '<div style="padding:20px;color:#ff6b6b;">Failed to load Pet Optimizer</div>';
      });
    }

    renderCompareStageBadge();
    requestAnimationFrame(() => reassertScrollChain(panels[id]));
  }

  let managerState: ManagerState | null = null;

  for (const def of tabDefs) {
    const tabBtn = document.createElement('div');
    tabBtn.className = `qpm-pets__tab${def.id === activeTab ? ' qpm-pets__tab--active' : ''}`;
    tabBtn.textContent = def.label;
    tabBtn.addEventListener('click', () => switchTab(def.id));
    tabs.appendChild(tabBtn);
    tabBtns[def.id] = tabBtn;

    const panel = document.createElement('div');
    panel.className = `qpm-pets__panel${def.id === activeTab ? ' qpm-pets__panel--active' : ''}`;
    body.appendChild(panel);
    panels[def.id] = panel;

    if (def.id === 'manager') {
      managerState = buildManagerTab(panel, ({ visible, stage }) => {
        compareBadgeVisible = visible;
        compareBadgeStage = stage;
        renderCompareStageBadge();
      });
      allCleanups.push(...managerState.cleanups);
    } else if (def.id === 'feeding') {
      allCleanups.push(buildFeedingTab(panel));
    }
    // pet-optimizer is lazy-loaded on first click
  }
  tabs.appendChild(compareStageBadge);

  // Normalize initial panel visibility through the same switch path.
  switchTab(activeTab);

  const onWindowRestore = (event: Event): void => {
    const detail = (event as CustomEvent<{ id?: string }>).detail;
    if (!detail || detail.id !== WINDOW_ID) return;
    requestAnimationFrame(() => reassertScrollChain(panels[activeTab]));
  };
  window.addEventListener('qpm:window-restored', onWindowRestore as EventListener);
  allCleanups.push(() => window.removeEventListener('qpm:window-restored', onWindowRestore as EventListener));

  const onPetsWindowSwitchTab = (event: Event): void => {
    const detail = (event as CustomEvent<{ tab?: string; teamId?: string | null }>).detail;
    if (!detail?.tab) return;
    if (detail.tab !== 'manager' && detail.tab !== 'feeding' && detail.tab !== 'pet-optimizer') return;
    switchTab(detail.tab);
    if (detail.tab === 'manager' && managerState) {
      managerState.selectTeam(detail.teamId ?? null);
    }
  };
  window.addEventListener(PETS_WINDOW_SWITCH_TAB_EVENT, onPetsWindowSwitchTab as EventListener);
  allCleanups.push(() => window.removeEventListener(PETS_WINDOW_SWITCH_TAB_EVENT, onPetsWindowSwitchTab as EventListener));

  // Cleanup on window root removal (MutationObserver)
  const observer = new MutationObserver(() => {
    if (!root.isConnected) {
      observer.disconnect();
      allCleanups.forEach(fn => fn());
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

// ---------------------------------------------------------------------------
// Init (keybind registration)
// ---------------------------------------------------------------------------

let keybindHandler: ((e: KeyboardEvent) => void) | null = null;

export function initPetsWindow(): void {
  initFloatingCards();
  if (keybindHandler) return; // idempotent

  keybindHandler = (e: KeyboardEvent) => {
    if (isEditableTarget(e.target)) return;

    // Window open/close keybind
    if (e.key.toLowerCase() === currentKeybind && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      togglePetsWindow();
      return;
    }

    // Team keybinds
    const keybinds = getKeybinds();
    const combo = normalizeKeybind(e);
    if (!combo) return;
    const teamId = keybinds[combo];
    if (!teamId) return;

    const config = getTeamsConfig();
    const team = config.teams.find((entry) => entry.id === teamId);
    if (!team) return;

    e.preventDefault();
    e.stopPropagation();
    showToast(`Applying "${team.name}"…`);
    applyTeam(team.id)
      .then(result => {
        if (result.errors.length === 0) {
          showToast(`Applied "${team.name}"`, 'success');
        } else {
          showToast(`Applied "${team.name}" with ${result.errors.length} error(s)`, 'error');
        }
      })
      .catch(() => showToast('Team apply failed', 'error'));
  };

  document.addEventListener('keydown', keybindHandler);
}

export function stopPetsWindow(): void {
  if (keybindHandler) {
    document.removeEventListener('keydown', keybindHandler);
    keybindHandler = null;
  }
}
