// src/ui/petsWindow.ts
// Pets window: 3-tab panel (Manager | Feeding | Logs)
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
import { getPetSpriteDataUrlWithMutations, isSpritesReady } from '../sprite-v2/compat';
import { calculateMaxStrength } from '../store/xpTracker';
import { getAbilityColor } from '../utils/petCardRenderer';
import { formatCoinsAbbreviated } from '../features/valueCalculator';
import { getAbilityDefinition, computeAbilityStats, computeEffectPerHour } from '../data/petAbilities';
import { getLogs, clearLogs, onLogsChange } from '../store/petTeamsLogs';
import { getActivePetInfos } from '../store/pets';
import { openPetPicker } from './petPickerModal';
import { importAriesTeams } from '../utils/ariesTeamImport';
import {
  getPetFoodRules,
  setRespectPetFoodRules,
  setAvoidFavoritedFoods,
  getDietOptionsForSpecies,
  updateSpeciesOverride,
} from '../features/petFoodRules';
import { normalizeSpeciesKey } from '../utils/helpers';
import { feedPetInstantly, feedAllPetsInstantly } from '../features/instantFeed';
import { openFloatingCard, hasFloatingCard } from './petFloatingCard';
import type { PetTeam, PooledPet } from '../types/petTeams';
import type { PetLogEventType } from '../types/petTeams';

const WINDOW_ID = 'qpm-pets-window';
const DEFAULT_KEYBIND = 'p';
let currentKeybind = DEFAULT_KEYBIND;

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const STYLES = `
.qpm-pets {
  font-family: inherit;
  color: #e0e0e0;
  height: 100%;
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
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.qpm-pets__panel { display: none; flex: 1; overflow: hidden; }
.qpm-pets__panel--active { display: flex; flex-direction: column; }

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
  border-right: 1px solid rgba(143,130,255,0.2);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.qpm-mgr__list-header {
  padding: 10px 12px;
  display: flex;
  gap: 6px;
  flex-shrink: 0;
  border-bottom: 1px solid rgba(143,130,255,0.1);
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
.qpm-mgr__actions {
  padding: 10px 12px;
  display: flex;
  gap: 6px;
  flex-shrink: 0;
  border-top: 1px solid rgba(143,130,255,0.1);
  flex-wrap: wrap;
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
  width: 36px;
  text-align: center;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(143,130,255,0.25);
  border-radius: 5px;
  color: #e0e0e0;
  font-size: 12px;
  padding: 5px;
  outline: none;
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
  display: inline-flex; align-items: center; gap: 4px;
  background: rgba(143,130,255,0.1); border: 1px solid rgba(143,130,255,0.2);
  border-radius: 12px; padding: 2px 8px;
  font-size: 11px; color: rgba(224,224,224,0.75); white-space: nowrap;
}

/* Logs tab */
.qpm-logs { display: flex; flex-direction: column; flex: 1; overflow: hidden; }
.qpm-logs__header {
  padding: 10px 14px;
  border-bottom: 1px solid rgba(143,130,255,0.15);
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
  flex-shrink: 0;
}
.qpm-logs__filter-btn {
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 11px;
  cursor: pointer;
  border: 1px solid rgba(143,130,255,0.2);
  background: transparent;
  color: rgba(224,224,224,0.6);
  transition: background 0.1s;
}
.qpm-logs__filter-btn--active {
  background: rgba(143,130,255,0.2);
  color: #e0e0e0;
  border-color: rgba(143,130,255,0.5);
}
.qpm-logs__clear {
  margin-left: auto;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 11px;
  cursor: pointer;
  border: 1px solid rgba(244,67,54,0.3);
  background: transparent;
  color: rgba(244,67,54,0.7);
  transition: background 0.1s;
}
.qpm-logs__clear:hover { background: rgba(244,67,54,0.1); }
.qpm-logs__list { flex: 1; overflow-y: auto; padding: 6px; }
.qpm-log-entry {
  display: flex;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 5px;
  font-size: 12px;
  transition: background 0.1s;
}
.qpm-log-entry:hover { background: rgba(255,255,255,0.03); }
.qpm-log-entry__time { color: rgba(224,224,224,0.35); flex-shrink: 0; width: 56px; }
.qpm-log-entry__type {
  flex-shrink: 0;
  font-size: 10px;
  padding: 2px 5px;
  border-radius: 3px;
  font-weight: 600;
  text-transform: uppercase;
  height: fit-content;
  margin-top: 1px;
}
.qpm-log-entry__type--ability { background: rgba(124,77,255,0.2); color: #b39dff; }
.qpm-log-entry__type--feed { background: rgba(100,200,100,0.2); color: #80c880; }
.qpm-log-entry__type--team { background: rgba(143,130,255,0.2); color: #8f82ff; }
.qpm-log-entry__detail { flex: 1; color: #e0e0e0; }
.qpm-logs__empty {
  text-align: center;
  color: rgba(224,224,224,0.3);
  font-size: 13px;
  padding: 40px 0;
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

function formatTime(ts: number): string {
  const d = new Date(ts);
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  const s = d.getSeconds().toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
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
): Array<{ icon: string; label: string; value: string }> {
  const totals = { coins: 0, plant: 0, egg: 0, xp: 0 };

  for (const slot of slots) {
    const str = slot.strength ?? calculateMaxStrength(slot.targetScale, slot.species) ?? 100;
    for (const abilityId of slot.abilities) {
      const def = getAbilityDefinition(abilityId);
      if (!def) continue;
      const stats = computeAbilityStats(def, str);
      const eph = computeEffectPerHour(def, stats);
      if (def.effectUnit === 'coins' || def.category === 'coins') totals.coins += eph;
      else if (def.category === 'plantGrowth') totals.plant += eph;
      else if (def.category === 'eggGrowth') totals.egg += eph;
      else if (def.category === 'xp') totals.xp += eph;
    }
  }

  const pills: Array<{ icon: string; label: string; value: string }> = [];
  if (totals.coins > 0) pills.push({ icon: '💰', label: '/hr', value: formatCoinsAbbreviated(totals.coins) });
  if (totals.plant > 0) pills.push({ icon: '🌱', label: 'min/hr', value: totals.plant.toFixed(1) });
  if (totals.egg > 0)   pills.push({ icon: '🥚', label: 'min/hr', value: totals.egg.toFixed(1) });
  if (totals.xp > 0)    pills.push({ icon: '✨', label: 'xp/hr', value: formatCoinsAbbreviated(totals.xp) });
  return pills;
}

// ---------------------------------------------------------------------------
// Manager tab
// ---------------------------------------------------------------------------

interface ManagerState {
  selectedTeamId: string | null;
  searchTerm: string;
  cleanups: Array<() => void>;
}

function buildManagerTab(root: HTMLElement): ManagerState {
  const state: ManagerState = { selectedTeamId: null, searchTerm: '', cleanups: [] };
  let petPool: PooledPet[] = [];
  getAllPooledPets().then(pool => {
    petPool = pool;
    if (state.selectedTeamId) renderEditor();
  }).catch(() => { /* pool stays empty */ });

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

  const search = document.createElement('input');
  search.className = 'qpm-mgr__search';
  search.placeholder = 'Search teams…';
  listHeader.appendChild(search);

  const teamsContainer = document.createElement('div');
  teamsContainer.className = 'qpm-mgr__teams';
  listPanel.appendChild(teamsContainer);

  const listActions = document.createElement('div');
  listActions.className = 'qpm-mgr__actions';
  listPanel.appendChild(listActions);

  const newTeamBtn = btn('+ New Team', 'sm');
  listActions.appendChild(newTeamBtn);

  const importBtn = btn('⬆ Import Aries', 'sm');
  importBtn.title = 'Import pet teams from Aries Mod';
  listActions.appendChild(importBtn);

  // --- Right: team editor ---
  const editorPanel = document.createElement('div');
  editorPanel.className = 'qpm-mgr__editor';
  mgr.appendChild(editorPanel);

  const editor = document.createElement('div');
  editor.className = 'qpm-editor';
  editorPanel.appendChild(editor);

  // Render helpers
  function renderTeamList(): void {
    const config = getTeamsConfig();
    const term = state.searchTerm.toLowerCase();
    const detectedId = detectCurrentTeam();
    const keybinds = getKeybinds();
    const keyByIndex = Object.fromEntries(Object.entries(keybinds).map(([k, idx]) => [String(idx), k]));

    teamsContainer.innerHTML = '';

    const filtered = config.teams.filter(t => !term || t.name.toLowerCase().includes(term));

    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'padding:20px;text-align:center;color:rgba(224,224,224,0.3);font-size:12px;';
      empty.textContent = config.teams.length === 0 ? 'No teams yet. Create one!' : 'No results';
      teamsContainer.appendChild(empty);
      return;
    }

    filtered.forEach((team, idx) => {
      const row = document.createElement('div');
      row.className = `qpm-team-row${state.selectedTeamId === team.id ? ' qpm-team-row--selected' : ''}`;

      const name = document.createElement('div');
      name.className = 'qpm-team-row__name';
      name.textContent = team.name;
      row.appendChild(name);

      const keyLabel = keyByIndex[String(idx)];
      if (keyLabel) {
        const keyEl = document.createElement('span');
        keyEl.className = 'qpm-team-row__key';
        keyEl.textContent = `[${keyLabel}]`;
        row.appendChild(keyEl);
      }

      if (team.id === detectedId) {
        const badge = document.createElement('span');
        badge.className = 'qpm-team-row__badge';
        badge.textContent = '✓';
        row.appendChild(badge);
      }

      row.addEventListener('click', () => {
        state.selectedTeamId = team.id;
        renderTeamList();
        renderEditor();
      });
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
      state.selectedTeamId = null;
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
          p.className = 'qpm-team-summary__pill';
          p.textContent = `${pill.icon} ${pill.value} ${pill.label}`;
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
          log('[PetsWindow] applyTeam errors:', result.errors);
        }
      } catch (err) {
        showToast('Apply failed', 'error');
        log('[PetsWindow] applyTeam threw:', err);
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
    kbInput.maxLength = 1;
    kbInput.placeholder = '—';

    const config2 = getTeamsConfig();
    const teamIndex = config2.teams.findIndex(t => t.id === team.id);
    const keybinds = getKeybinds();
    const currentKey = Object.entries(keybinds).find(([, idx]) => idx === teamIndex)?.[0] ?? '';
    kbInput.value = currentKey;

    kbInput.addEventListener('input', () => {
      const key = kbInput.value.toLowerCase().trim();
      // Clear any existing binding for this team first
      Object.entries(keybinds).forEach(([k, idx]) => { if (idx === teamIndex) clearKeybind(k); });
      if (key) setKeybind(key, teamIndex);
      renderTeamList();
    });
    keybindRow.appendChild(kbInput);

    const kbHint = document.createElement('span');
    kbHint.style.cssText = 'color:rgba(224,224,224,0.35);font-size:11px;';
    kbHint.textContent = '(single key, no modifier)';
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

  importBtn.addEventListener('click', () => {
    const result = importAriesTeams();
    if (!result.available) {
      showToast('No Aries Mod teams found in storage', 'error');
      return;
    }
    showToast(`Imported ${result.imported} team(s), skipped ${result.skipped}`, result.imported > 0 ? 'success' : 'info');
    renderTeamList();
  });

  // Subscribe to team changes
  const unsub = onTeamsChange(() => {
    renderTeamList();
    renderEditor();
  });
  state.cleanups.push(unsub);

  renderTeamList();
  renderEditor();

  return state;
}

// ---------------------------------------------------------------------------
// Feeding tab
// ---------------------------------------------------------------------------

function buildFeedingTab(root: HTMLElement): void {
  const feed = document.createElement('div');
  feed.className = 'qpm-feed';
  root.appendChild(feed);

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
    respectCb.addEventListener('change', () => setRespectPetFoodRules(respectCb.checked));
    respectRow.appendChild(respectCb);
    respectRow.append('Respect pet diet rules');
    togglesWrap.appendChild(respectRow);

    const favRow = document.createElement('label');
    favRow.className = 'qpm-toggle-row';
    const favCb = document.createElement('input');
    favCb.type = 'checkbox'; favCb.className = 'qpm-toggle';
    favCb.checked = rules.avoidFavorited;
    favCb.addEventListener('change', () => setAvoidFavoritedFoods(favCb.checked));
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
        const results = await feedAllPetsInstantly(100, rules.respectRules);
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
          const result = await feedPetInstantly(i, rules.respectRules);
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

      // Pop-out button — opens a draggable floating card for this pet
      if (pet.petId) {
        const popoutBtn = document.createElement('button');
        popoutBtn.className = `qpm-feed__popout-btn${hasFloatingCard(pet.petId) ? ' qpm-feed__popout-btn--active' : ''}`;
        popoutBtn.title = 'Open as floating card';
        popoutBtn.textContent = '↗';
        popoutBtn.addEventListener('click', () => {
          if (pet.petId) {
            openFloatingCard(pet.petId);
            popoutBtn.classList.add('qpm-feed__popout-btn--active');
          }
        });
        header.appendChild(popoutBtn);
      }

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
}

// ---------------------------------------------------------------------------
// Logs tab
// ---------------------------------------------------------------------------

function buildLogsTab(root: HTMLElement): Array<() => void> {
  const cleanups: Array<() => void> = [];

  const logsEl = document.createElement('div');
  logsEl.className = 'qpm-logs';
  root.appendChild(logsEl);

  const header = document.createElement('div');
  header.className = 'qpm-logs__header';
  logsEl.appendChild(header);

  let activeFilter: PetLogEventType | undefined;

  const filterBtns: HTMLButtonElement[] = [];
  for (const [type, label] of [[undefined, 'All'], ['ability', 'Ability'], ['feed', 'Feed'], ['team', 'Team']] as const) {
    const fbtn = document.createElement('button');
    fbtn.className = `qpm-logs__filter-btn${activeFilter === type ? ' qpm-logs__filter-btn--active' : ''}`;
    fbtn.textContent = label;
    fbtn.addEventListener('click', () => {
      activeFilter = type;
      filterBtns.forEach(b => b.classList.remove('qpm-logs__filter-btn--active'));
      fbtn.classList.add('qpm-logs__filter-btn--active');
      renderList();
    });
    filterBtns.push(fbtn);
    header.appendChild(fbtn);
  }
  filterBtns[0]?.classList.add('qpm-logs__filter-btn--active');

  const clearBtn = document.createElement('button');
  clearBtn.className = 'qpm-logs__clear';
  clearBtn.textContent = 'Clear';
  clearBtn.addEventListener('click', () => {
    if (confirm('Clear all pet event logs?')) { clearLogs(); renderList(); }
  });
  header.appendChild(clearBtn);

  const list = document.createElement('div');
  list.className = 'qpm-logs__list';
  logsEl.appendChild(list);

  function renderList(): void {
    list.innerHTML = '';
    const logs = getLogs(activeFilter, 500);

    if (logs.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'qpm-logs__empty';
      empty.textContent = 'No events recorded yet';
      list.appendChild(empty);
      return;
    }

    for (const entry of logs) {
      const row = document.createElement('div');
      row.className = 'qpm-log-entry';

      const time = document.createElement('div');
      time.className = 'qpm-log-entry__time';
      time.textContent = formatTime(entry.timestamp);
      row.appendChild(time);

      const typeBadge = document.createElement('div');
      typeBadge.className = `qpm-log-entry__type qpm-log-entry__type--${entry.type}`;
      typeBadge.textContent = entry.type;
      row.appendChild(typeBadge);

      const detail = document.createElement('div');
      detail.className = 'qpm-log-entry__detail';
      detail.textContent = entry.detail;
      row.appendChild(detail);

      list.appendChild(row);
    }
  }

  renderList();

  const unsub = onLogsChange(() => renderList());
  cleanups.push(unsub);

  return cleanups;
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

  const body = document.createElement('div');
  body.className = 'qpm-pets__body';
  container.appendChild(body);

  const tabDefs = [
    { id: 'manager', label: 'Manager', lazy: false },
    { id: 'feeding', label: 'Feeding', lazy: false },
    { id: 'logs', label: 'Logs', lazy: false },
    { id: 'pet-hub', label: '🐾 Pet Hub', lazy: true },
    { id: 'pet-optimizer', label: '🎯 Pet Optimizer', lazy: true },
  ] as const;

  type TabId = typeof tabDefs[number]['id'];
  let activeTab: TabId = 'manager';

  const panels: Partial<Record<TabId, HTMLElement>> = {};
  const tabBtns: Partial<Record<TabId, HTMLElement>> = {};
  const lazyLoaded = new Set<TabId>();

  function switchTab(id: TabId): void {
    activeTab = id;
    for (const def of tabDefs) {
      tabBtns[def.id]?.classList.toggle('qpm-pets__tab--active', def.id === id);
      panels[def.id]?.classList.toggle('qpm-pets__panel--active', def.id === id);
    }
    // Lazy-load hub tabs on first activation
    if (id === 'pet-hub' && !lazyLoaded.has('pet-hub')) {
      lazyLoaded.add('pet-hub');
      const panel = panels['pet-hub']!;
      panel.style.cssText = 'display:flex;flex:1;overflow:hidden;flex-direction:column;';
      import('./petHubWindow').then(({ renderPetHubWindow }) => {
        panel.innerHTML = '';
        renderPetHubWindow(panel);
      }).catch(() => {
        panel.innerHTML = '<div style="padding:20px;color:#ff6b6b;">Failed to load Pet Hub</div>';
      });
    } else if (id === 'pet-optimizer' && !lazyLoaded.has('pet-optimizer')) {
      lazyLoaded.add('pet-optimizer');
      const panel = panels['pet-optimizer']!;
      panel.style.cssText = 'display:flex;flex:1;overflow:hidden;flex-direction:column;';
      import('./petOptimizerWindow').then(({ renderPetOptimizerWindow }) => {
        panel.innerHTML = '';
        renderPetOptimizerWindow(panel);
      }).catch(() => {
        panel.innerHTML = '<div style="padding:20px;color:#ff6b6b;">Failed to load Pet Optimizer</div>';
      });
    }
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
      managerState = buildManagerTab(panel);
      allCleanups.push(...managerState.cleanups);
    } else if (def.id === 'feeding') {
      buildFeedingTab(panel);
    } else if (def.id === 'logs') {
      const logCleanups = buildLogsTab(panel);
      allCleanups.push(...logCleanups);
    }
    // pet-hub and pet-optimizer are lazy-loaded on first click
  }

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
  if (keybindHandler) return; // idempotent

  keybindHandler = (e: KeyboardEvent) => {
    // Window open/close keybind
    if (e.key.toLowerCase() === currentKeybind &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement) &&
        !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      togglePetsWindow();
      return;
    }

    // Team keybinds
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    const keybinds = getKeybinds();
    const teamIndex = keybinds[e.key.toLowerCase()];
    if (teamIndex == null) return;

    const config = getTeamsConfig();
    const team = config.teams[teamIndex];
    if (!team) return;

    e.preventDefault();
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
  log('[PetsWindow] Initialized');
}

export function stopPetsWindow(): void {
  if (keybindHandler) {
    document.removeEventListener('keydown', keybindHandler);
    keybindHandler = null;
  }
}
