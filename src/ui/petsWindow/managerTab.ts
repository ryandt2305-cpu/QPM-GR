// Manager tab: team list, team editor, drag-drop reorder, compare panel
// integration, import Aries teams, keybind config.

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
  getAllPooledPets,
  getFeedPolicy,
  setFeedPolicyOverride,
  clearFeedPolicyOverride,
} from '../../store/petTeams';
import { getActivePetInfos } from '../../store/pets';
import { getPetSpriteDataUrlWithMutations, getCropSpriteDataUrl, isSpritesReady } from '../../sprite-v2/compat';
import { calculateMaxStrength } from '../../store/xpTracker';
import { getAbilityColor } from '../../utils/petCardRenderer';
import { getAbilityDefinition } from '../../data/petAbilities';
import { openPetPicker } from '../petPickerModal';
import { openFloatingCardForSlot, closeFloatingCardForSlot, hasFloatingCardForSlot } from '../petFloatingCard';
import { storage } from '../../utils/storage';
import { importAriesTeams } from '../../utils/ariesTeamImport';
import { calculatePetScore, type CollectedPet } from '../../features/petOptimizer';
import { enqueueFeed } from '../../features/instantFeed';
import {
  getPetFoodRules,
  getDietOptionsForSpecies,
} from '../../features/petFoodRules';
import { normalizeSpeciesKey } from '../../utils/helpers';
import { formatNumber } from '../../utils/formatters';
import type { PooledPet, PetItemFeedOverride } from '../../types/petTeams';
import type { CompareStage } from '../../data/petCompareRules';
import type { ActivePetInfo } from '../../store/pets';
import type { ManagerState, CompareStateChange } from './types';
import { ARIES_IMPORT_ONCE_KEY } from './constants';
import { loadPetTeamsUiState } from './state';
import { btn, showToast, formatKeybind, createKeybindButton, getCoinSpriteUrl, getAgeSpriteUrl } from './helpers';
import { renderTeamSummaryBar, computeTeamAbilityPills } from './teamSummary';
import { buildCompareTeamsPanel } from './comparisonPanel';

export function buildManagerTab(
  root: HTMLElement,
  onCompareStateChange?: (state: CompareStateChange) => void,
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

  const compareTeamsBtn = btn('\u2696 Compare', 'sm');
  compareTeamsBtn.title = 'Compare two teams side by side';
  listTop.appendChild(compareTeamsBtn);

  const importBtn = btn('\u2B07', 'sm');
  importBtn.title = 'Import Aries teams';
  listTop.appendChild(importBtn);

  const search = document.createElement('input');
  search.className = 'qpm-mgr__search';
  search.placeholder = 'Search teams\u2026';
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
  let editorRenderTimer: ReturnType<typeof setTimeout> | null = null;

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
    renderTeamList();
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
    compareTeamsBtn.textContent = compareOpen ? '\u2715 Close Compare' : '\u2696 Compare';
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

  // Score helpers
  function computeTeamScore(teamSlots: Array<string | null>): number {
    let total = 0;
    for (const slotId of teamSlots) {
      if (!slotId) continue;
      const pooledPet = petPool.find(p => p.id === slotId);
      if (!pooledPet || !pooledPet.species) continue;
      const collected: CollectedPet = {
        id: pooledPet.id,
        itemId: pooledPet.id,
        name: pooledPet.name,
        species: pooledPet.species,
        location: pooledPet.location,
        slotIndex: pooledPet.slotIndex ?? -1,
        strength: pooledPet.strength ?? 0,
        maxStrength: pooledPet.species && pooledPet.targetScale
          ? calculateMaxStrength(pooledPet.targetScale, pooledPet.species)
          : null,
        targetScale: pooledPet.targetScale,
        xp: pooledPet.xp,
        level: pooledPet.level,
        abilities: pooledPet.abilities,
        abilityIds: pooledPet.abilities.map(a => getAbilityDefinition(a)?.id ?? a),
        mutations: pooledPet.mutations,
        hasGold: pooledPet.mutations.some(m => m.toLowerCase().includes('gold')),
        hasRainbow: pooledPet.mutations.some(m => m.toLowerCase().includes('rainbow')),
        raw: null,
      };
      const score = calculatePetScore(collected);
      total += score.total;
    }
    return total;
  }

  function computeTeamDominantMetric(teamSlots: Array<string | null>): {
    type: 'coin' | 'xp';
    value: number;
    formatted: string;
  } | null {
    const slotData: Array<{ abilities: string[]; strength: number | null; targetScale: number | null; species: string }> = [];
    for (const slotId of teamSlots) {
      if (!slotId) continue;
      const pooledPet = petPool.find(p => p.id === slotId);
      const activePet = getActivePetInfos().find(p => p.slotId === slotId);
      const species = pooledPet?.species ?? activePet?.species ?? '';
      if (!species) continue;
      slotData.push({
        abilities: pooledPet?.abilities ?? activePet?.abilities ?? [],
        strength: pooledPet?.strength ?? activePet?.strength ?? null,
        targetScale: pooledPet?.targetScale ?? activePet?.targetScale ?? null,
        species,
      });
    }
    if (slotData.length === 0) return null;

    const pills = computeTeamAbilityPills(slotData);
    let coinTotal = 0;
    let xpTotal = 0;
    for (const pill of pills) {
      if (pill.unit === 'coins') coinTotal += pill.sortValue;
      if (pill.unit === 'xp') xpTotal += pill.sortValue;
    }

    if (coinTotal === 0 && xpTotal === 0) return null;
    const formatMetricValue = (value: number): string => {
      const v = Math.round(value);
      if (!Number.isFinite(v)) return '0';
      if (Math.abs(v) >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(2)}B`;
      if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
      if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(2)}k`;
      return String(v);
    };
    if (coinTotal >= xpTotal) {
      return { type: 'coin', value: coinTotal, formatted: `${formatMetricValue(coinTotal)}/hr` };
    }
    return { type: 'xp', value: xpTotal, formatted: `${formatMetricValue(xpTotal)} XP/hr` };
  }

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
      const isActive = team.id === detectedId;
      if (!compareOpen && state.selectedTeamId === team.id) row.classList.add('qpm-team-row--selected');
      if (isActive) row.classList.add('qpm-team-row--active');
      if (compareOpen && compareTeamAId === team.id) row.classList.add('qpm-team-row--compare-a');
      if (compareOpen && compareTeamBId === team.id) row.classList.add('qpm-team-row--compare-b');
      if (reorderEnabled) row.classList.add('qpm-team-row--draggable');

      // --- Name line ---
      const nameLine = document.createElement('div');
      nameLine.className = 'qpm-team-row__name-line';

      const name = document.createElement('div');
      name.className = 'qpm-team-row__name';
      name.textContent = team.name;
      nameLine.appendChild(name);

      const keyLabel = keyByTeamId[team.id];
      if (keyLabel) {
        const keyEl = document.createElement('span');
        keyEl.className = 'qpm-team-row__key';
        keyEl.textContent = formatKeybind(keyLabel);
        nameLine.appendChild(keyEl);
      }

      if (isActive) {
        const activeBadge = document.createElement('span');
        activeBadge.className = 'qpm-team-row__active-badge';
        activeBadge.textContent = '\u25CF ACTIVE';
        nameLine.appendChild(activeBadge);
      }

      if (compareOpen && compareTeamAId === team.id) {
        const badgeA = document.createElement('span');
        badgeA.className = 'qpm-team-row__cmp-badge qpm-team-row__cmp-badge--a';
        badgeA.textContent = 'A';
        nameLine.appendChild(badgeA);
      }
      if (compareOpen && compareTeamBId === team.id) {
        const badgeB = document.createElement('span');
        badgeB.className = 'qpm-team-row__cmp-badge qpm-team-row__cmp-badge--b';
        badgeB.textContent = 'B';
        nameLine.appendChild(badgeB);
      }

      row.appendChild(nameLine);

      // --- Metrics line ---
      const topLine = document.createElement('div');
      topLine.className = 'qpm-team-row__top';

      // Dynamic metric (coins/hr or xp/hr)
      const metric = computeTeamDominantMetric(team.slots);
      if (metric) {
        const metricEl = document.createElement('div');
        metricEl.className = 'qpm-team-row__metric';
        const spriteUrl = metric.type === 'coin' ? getCoinSpriteUrl() : getAgeSpriteUrl();
        if (spriteUrl) {
          const metricImg = document.createElement('img');
          metricImg.src = spriteUrl;
          metricImg.alt = metric.type === 'coin' ? '$' : 'XP';
          metricEl.appendChild(metricImg);
        }
        const metricText = document.createElement('span');
        metricText.className = `qpm-team-row__metric-text qpm-team-row__metric-text--${metric.type}`;
        metricText.textContent = metric.formatted;
        metricEl.appendChild(metricText);
        topLine.appendChild(metricEl);
      }

      // Team score
      const teamScore = computeTeamScore(team.slots);
      if (teamScore > 0) {
        const scoreWrap = document.createElement('div');
        scoreWrap.className = 'qpm-team-row__score';
        const scoreLbl = document.createElement('span');
        scoreLbl.className = 'qpm-team-row__score-label';
        scoreLbl.textContent = 'Score:';
        const scoreVal = document.createElement('span');
        scoreVal.className = 'qpm-team-row__score-value';
        scoreVal.textContent = String(Math.round(teamScore));
        scoreWrap.appendChild(scoreLbl);
        scoreWrap.appendChild(scoreVal);
        topLine.appendChild(scoreWrap);
      }

      row.appendChild(topLine);

      // --- Bottom line ---
      const bottomLine = document.createElement('div');
      bottomLine.className = 'qpm-team-row__bottom';

      // Sprite cluster
      const spritesWrap = document.createElement('div');
      spritesWrap.className = 'qpm-team-row__sprites';
      for (let i = 0; i < 3; i++) {
        const slotId = team.slots[i as 0 | 1 | 2];
        if (slotId) {
          const pooledPet = petPool.find(p => p.id === slotId);
          const activePet = getActivePetInfos().find(p => p.slotId === slotId);
          const species = pooledPet?.species ?? activePet?.species ?? '';
          const mutations = pooledPet?.mutations ?? activePet?.mutations ?? [];
          if (species && isSpritesReady()) {
            const src = getPetSpriteDataUrlWithMutations(species, mutations);
            if (src) {
              const img = document.createElement('img');
              img.src = src;
              img.alt = species;
              spritesWrap.appendChild(img);
              continue;
            }
          }
        }
        const emptySlot = document.createElement('div');
        emptySlot.className = 'qpm-team-row__sprites-empty';
        emptySlot.textContent = '+';
        spritesWrap.appendChild(emptySlot);
      }
      bottomLine.appendChild(spritesWrap);

      // Ability pills (top 2)
      const slotData: Array<{ abilities: string[]; strength: number | null; targetScale: number | null; species: string }> = [];
      for (let i = 0; i < 3; i++) {
        const slotId = team.slots[i as 0 | 1 | 2];
        if (!slotId) continue;
        const pooledPet = petPool.find(p => p.id === slotId);
        const activePet = getActivePetInfos().find(p => p.slotId === slotId);
        const species = pooledPet?.species ?? activePet?.species ?? '';
        if (species) {
          slotData.push({
            abilities: pooledPet?.abilities ?? activePet?.abilities ?? [],
            strength: pooledPet?.strength ?? activePet?.strength ?? null,
            targetScale: pooledPet?.targetScale ?? activePet?.targetScale ?? null,
            species,
          });
        }
      }
      if (slotData.length > 0) {
        const pills = computeTeamAbilityPills(slotData).slice(0, 2);
        if (pills.length > 0) {
          const pillsWrap = document.createElement('div');
          pillsWrap.className = 'qpm-team-row__pills';
          for (const pill of pills) {
            const p = document.createElement('span');
            p.className = 'qpm-team-row__pill';
            const colors = getAbilityColor(pill.abilityId);
            p.style.background = colors.base;
            p.style.color = colors.text;
            p.title = pill.hoverTitle || pill.abilityName;
            p.textContent = pill.abilityName;
            pillsWrap.appendChild(p);
          }
          bottomLine.appendChild(pillsWrap);
        }
      }

      // Feed popout toggle
      if (isActive) {
        const feedToggle = document.createElement('button');
        feedToggle.className = 'qpm-team-row__feed-toggle';
        const allOpen = [0, 1, 2].every(idx => hasFloatingCardForSlot(idx));
        if (allOpen) feedToggle.classList.add('qpm-team-row__feed-toggle--active');
        feedToggle.textContent = '\uD83C\uDF56';
        feedToggle.title = allOpen ? 'Close all floating feed cards' : 'Open all floating feed cards';
        feedToggle.addEventListener('click', (e) => {
          e.stopPropagation();
          if (allOpen) {
            for (let idx = 0; idx < 3; idx++) closeFloatingCardForSlot(idx);
          } else {
            for (let idx = 0; idx < 3; idx++) openFloatingCardForSlot(idx);
          }
          renderTeamList();
        });
        bottomLine.appendChild(feedToggle);
      }

      row.appendChild(bottomLine);

      // Click handler
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

      // Drag-drop reordering
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

  let activeDietAnchor: HTMLElement | null = null;
  let activeDietClose: (() => void) | null = null;

  function openDietPopover(
    anchorEl: HTMLElement,
    species: string,
    petItemId: string | null,
    onClose: () => void,
  ): void {
    // Toggle: if clicking the same gear again, close and return
    if (activeDietAnchor === anchorEl && activeDietClose) {
      activeDietClose();
      return;
    }
    // Close any existing popover first
    if (activeDietClose) activeDietClose();

    const speciesKey = normalizeSpeciesKey(species);
    const dietOptions = getDietOptionsForSpecies(species);
    if (dietOptions.length === 0) return;

    const dropdown = document.createElement('div');
    dropdown.style.cssText = [
      'position:fixed', 'z-index:99998',
      'background:rgba(14,16,22,0.98)',
      'border:1px solid rgba(143,130,255,0.35)',
      'border-radius:10px', 'padding:8px',
      'min-width:200px', 'max-width:260px',
      'max-height:300px', 'overflow-y:auto',
      'box-shadow:0 8px 32px rgba(0,0,0,0.7)',
      'display:flex', 'flex-direction:column', 'gap:2px',
    ].join(';');

    const titleEl = document.createElement('div');
    titleEl.style.cssText = 'font-size:11px;font-weight:600;color:#e8e0ff;padding:4px 6px 6px;';
    titleEl.textContent = `Diet \u2014 ${species}`;
    dropdown.appendChild(titleEl);

    const divider = document.createElement('div');
    divider.style.cssText = 'border-top:1px solid rgba(255,255,255,0.08);margin:0 0 4px;';
    dropdown.appendChild(divider);

    function readForbiddenSet(): Set<string> {
      const rules = getPetFoodRules();
      const feedPolicy = getFeedPolicy();
      const speciesOverride = speciesKey ? (rules.overrides[speciesKey] ?? {}) : {};
      const itemOverride = petItemId ? (feedPolicy.petItemOverrides[petItemId] ?? null) : null;
      const effectiveForbidden = Array.isArray(itemOverride?.forbidden)
        ? itemOverride.forbidden
        : (speciesOverride.forbidden ?? []);
      return new Set(effectiveForbidden);
    }

    function readPreferredKey(): string | null {
      const rules = getPetFoodRules();
      const feedPolicy = getFeedPolicy();
      const speciesOverride = speciesKey ? (rules.overrides[speciesKey] ?? {}) : {};
      const itemOverride = petItemId ? (feedPolicy.petItemOverrides[petItemId] ?? null) : null;
      return itemOverride?.preferred ?? speciesOverride.preferred ?? null;
    }

    const forbiddenSet = readForbiddenSet();
    const preferredKey = readPreferredKey();

    for (const option of dietOptions) {
      const row = document.createElement('label');
      row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:4px 6px;border-radius:6px;cursor:pointer;font-size:12px;color:#e0e0e0;';
      row.addEventListener('mouseenter', () => { row.style.background = 'rgba(143,130,255,0.1)'; });
      row.addEventListener('mouseleave', () => { row.style.background = ''; });

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !forbiddenSet.has(option.key);
      cb.style.cssText = 'accent-color:#8f82ff;cursor:pointer;flex-shrink:0;';
      cb.addEventListener('change', () => {
        if (!petItemId && !speciesKey) return;
        const freshRules = getPetFoodRules();
        const freshFeedPolicy = getFeedPolicy();
        const freshSpeciesOverride = speciesKey ? (freshRules.overrides[speciesKey] ?? {}) : {};
        const freshItemOverride = petItemId ? (freshFeedPolicy.petItemOverrides[petItemId] ?? null) : null;
        const currentForbidden = Array.isArray(freshItemOverride?.forbidden)
          ? freshItemOverride.forbidden
          : (freshSpeciesOverride.forbidden ?? []);
        const forbidden = new Set(currentForbidden);
        if (cb.checked) forbidden.delete(option.key);
        else forbidden.add(option.key);
        const nextForbidden = Array.from(forbidden);
        const speciesForbidden = new Set(freshSpeciesOverride.forbidden ?? []);
        const sameAsSpecies = (
          nextForbidden.length === speciesForbidden.size &&
          nextForbidden.every((v) => speciesForbidden.has(v))
        );
        if (petItemId) {
          const nextOverride: Partial<PetItemFeedOverride> = {};
          const nextAllowed = Array.isArray(freshItemOverride?.allowed) ? [...freshItemOverride.allowed] : undefined;
          const nextPreferred = typeof freshItemOverride?.preferred === 'string' && freshItemOverride.preferred.length > 0
            ? freshItemOverride.preferred : undefined;
          if (nextAllowed !== undefined) nextOverride.allowed = nextAllowed;
          if (nextPreferred !== undefined) nextOverride.preferred = nextPreferred;
          if (!sameAsSpecies) nextOverride.forbidden = nextForbidden;
          const hasAny = nextOverride.allowed || nextOverride.forbidden || nextOverride.preferred;
          if (!hasAny) clearFeedPolicyOverride(petItemId);
          else setFeedPolicyOverride(petItemId, nextOverride);
        }
      });
      row.appendChild(cb);

      // Crop sprite
      const cropUrl = getCropSpriteDataUrl(option.key);
      if (cropUrl) {
        const img = document.createElement('img');
        img.src = cropUrl;
        img.alt = '';
        img.style.cssText = 'width:20px;height:20px;object-fit:contain;image-rendering:pixelated;flex-shrink:0;';
        row.appendChild(img);
      }

      const txt = document.createElement('span');
      txt.textContent = `${option.label}${option.key === preferredKey ? ' \u2605' : ''}`;
      if (option.key === preferredKey) txt.style.color = '#8f82ff';
      row.appendChild(txt);

      dropdown.appendChild(row);
    }

    document.body.appendChild(dropdown);

    // Position below anchor
    const rect = anchorEl.getBoundingClientRect();
    dropdown.style.top = `${rect.bottom + 4}px`;
    dropdown.style.left = `${rect.left}px`;
    // Clamp to viewport
    requestAnimationFrame(() => {
      const dw = dropdown.offsetWidth || 240;
      const dh = dropdown.offsetHeight || 200;
      let left = rect.left;
      let top = rect.bottom + 4;
      if (left + dw > window.innerWidth - 8) left = Math.max(8, window.innerWidth - dw - 8);
      if (top + dh > window.innerHeight - 8) top = Math.max(8, rect.top - dh - 4);
      dropdown.style.left = `${Math.round(left)}px`;
      dropdown.style.top = `${Math.round(top)}px`;
    });

    const closeDropdown = (): void => {
      dropdown.remove();
      document.removeEventListener('mousedown', onOutside, true);
      activeDietAnchor = null;
      activeDietClose = null;
      onClose();
    };
    const onOutside = (ev: MouseEvent): void => {
      if (!dropdown.contains(ev.target as Node) && ev.target !== anchorEl) {
        closeDropdown();
      }
    };
    activeDietAnchor = anchorEl;
    activeDietClose = closeDropdown;
    setTimeout(() => document.addEventListener('mousedown', onOutside, true), 0);
  }

  function computePetScore(slotId: string): { total: number; granterBonus: number; granterType: 'rainbow' | 'gold' | null } | null {
    const pooledPet = petPool.find(p => p.id === slotId);
    if (!pooledPet || !pooledPet.species) return null;
    const collected: CollectedPet = {
      id: pooledPet.id,
      itemId: pooledPet.id,
      name: pooledPet.name,
      species: pooledPet.species,
      location: pooledPet.location,
      slotIndex: pooledPet.slotIndex ?? -1,
      strength: pooledPet.strength ?? 0,
      maxStrength: pooledPet.species && pooledPet.targetScale
        ? calculateMaxStrength(pooledPet.targetScale, pooledPet.species)
        : null,
      targetScale: pooledPet.targetScale,
      xp: pooledPet.xp,
      level: pooledPet.level,
      abilities: pooledPet.abilities,
      abilityIds: pooledPet.abilities.map(a => getAbilityDefinition(a)?.id ?? a),
      mutations: pooledPet.mutations,
      hasGold: pooledPet.mutations.some(m => m.toLowerCase().includes('gold')),
      hasRainbow: pooledPet.mutations.some(m => m.toLowerCase().includes('rainbow')),
      raw: null,
    };
    const score = calculatePetScore(collected);
    return { total: score.total, granterBonus: score.granterBonus, granterType: score.granterType };
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
    const isActiveTeam = detectedId === team.id;
    const activePets = getActivePetInfos();

    // Header: name + status + action buttons
    const header = document.createElement('div');
    header.className = 'qpm-editor__header';

    const nameInput = document.createElement('input');
    nameInput.className = 'qpm-editor__name';
    nameInput.value = team.name;
    nameInput.placeholder = 'Team name\u2026';
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
    statusEl.className = `qpm-editor__status ${isActiveTeam ? 'qpm-editor__status--active' : 'qpm-editor__status--inactive'}`;
    statusEl.textContent = isActiveTeam ? '\u2713 Active' : '';
    header.appendChild(statusEl);

    const applyBtn = btn('\u25B6 Apply', 'primary');
    applyBtn.addEventListener('click', async () => {
      applyBtn.disabled = true;
      applyBtn.textContent = '\u23F3 Applying\u2026';
      try {
        const result = await applyTeam(team.id);
        if (result.errors.length === 0) showToast(`Applied "${team.name}"`, 'success');
        else {
          const summary = result.errorSummary ? `: ${result.errorSummary}` : '';
          showToast(`Applied "${team.name}" with ${result.errors.length} error(s)${summary}`, 'error');
        }
      } catch { showToast('Apply failed', 'error'); } finally {
        applyBtn.disabled = false;
        applyBtn.textContent = '\u25B6 Apply';
        renderTeamList();
        renderEditor();
      }
    });
    header.appendChild(applyBtn);

    const snapshotBtn = btn('\uD83D\uDCF7 Save Current', 'default');
    snapshotBtn.title = 'Save currently active pets to this team';
    snapshotBtn.addEventListener('click', () => {
      saveCurrentTeamSlots(team.id);
      renderTeamList();
      renderEditor();
      showToast('Team updated from active pets', 'success');
    });
    header.appendChild(snapshotBtn);
    editor.appendChild(header);

    // Team summary bar (includes team score)
    const filledSlotData: { strength: number | null; targetScale: number | null; species: string; abilities: string[] }[] = [];
    for (let si = 0; si < 3; si++) {
      const slotId = team.slots[si as 0 | 1 | 2];
      if (!slotId) continue;
      const pooledPet = petPool.find(p => p.id === slotId);
      const activePetSummary = isActiveTeam ? (activePets[si] ?? null) : activePets.find(p => p.slotId === slotId) ?? null;
      const species = pooledPet?.species ?? activePetSummary?.species ?? '';
      if (species) {
        filledSlotData.push({
          strength: pooledPet?.strength ?? activePetSummary?.strength ?? null,
          targetScale: pooledPet?.targetScale ?? activePetSummary?.targetScale ?? null,
          species,
          abilities: pooledPet?.abilities ?? activePetSummary?.abilities ?? [],
        });
      }
    }
    if (filledSlotData.length > 0) {
      const teamScore = computeTeamScore(team.slots);
      editor.appendChild(renderTeamSummaryBar(filledSlotData, teamScore));
    }

    // Slot cards
    const slotsEl = document.createElement('div');
    slotsEl.className = 'qpm-slots';

    for (let i = 0; i < 3; i++) {
      const slotId = team.slots[i as 0 | 1 | 2];
      const slot = document.createElement('div');
      slot.className = 'qpm-slot';

      if (slotId) {
        const pooledPet = petPool.find(p => p.id === slotId);
        // For the active team, match by slot index (saved slotIds go stale after swaps)
        const activePet = isActiveTeam ? (activePets[i] ?? null) : activePets.find(p => p.slotId === slotId) ?? null;
        const species = pooledPet?.species ?? activePet?.species ?? '';
        const mutations = pooledPet?.mutations ?? activePet?.mutations ?? [];
        const abilities = pooledPet?.abilities ?? activePet?.abilities ?? [];

        // 1. Ability squares
        if (abilities.length > 0) {
          const abilitiesWrap = document.createElement('div');
          abilitiesWrap.className = 'qpm-slot__abilities';
          for (const abilId of abilities.slice(0, 4)) {
            const color = getAbilityColor(abilId);
            const sq = document.createElement('div');
            sq.className = 'qpm-slot__ability-sq';
            sq.style.background = color.base;
            sq.style.boxShadow = `0 0 4px ${color.glow}`;
            sq.title = getAbilityDefinition(abilId)?.name ?? abilId;
            abilitiesWrap.appendChild(sq);
          }
          slot.appendChild(abilitiesWrap);
        }

        // 2. Pet sprite — no border or background
        if (species && isSpritesReady()) {
          const src = getPetSpriteDataUrlWithMutations(species, mutations);
          if (src) {
            const img = document.createElement('img');
            img.className = 'qpm-slot__sprite';
            img.src = src;
            img.alt = species;
            slot.appendChild(img);
          } else {
            const ph = document.createElement('div');
            ph.className = 'qpm-slot__sprite-placeholder';
            ph.textContent = '\uD83D\uDC3E';
            slot.appendChild(ph);
          }
        } else {
          const ph = document.createElement('div');
          ph.className = 'qpm-slot__sprite-placeholder';
          ph.textContent = '\uD83D\uDC3E';
          slot.appendChild(ph);
        }

        // 3. Pet info (species + STR)
        const info = document.createElement('div');
        info.className = 'qpm-slot__info';

        const speciesEl = document.createElement('div');
        speciesEl.className = 'qpm-slot__species';
        speciesEl.textContent = pooledPet?.name || activePet?.name || species || '(unknown)';

        const hasRainbow = mutations.some(m => m.toLowerCase().includes('rainbow'));
        const hasGold = mutations.some(m => m.toLowerCase().includes('gold'));
        if (hasRainbow) {
          const mut = document.createElement('span');
          mut.className = 'qpm-slot__mutation--rainbow';
          mut.textContent = ' \u2605 Rainbow';
          speciesEl.appendChild(mut);
        } else if (hasGold) {
          const mut = document.createElement('span');
          mut.className = 'qpm-slot__mutation--gold';
          mut.textContent = ' \u2605 Gold';
          speciesEl.appendChild(mut);
        }
        info.appendChild(speciesEl);

        const str = pooledPet?.strength ?? activePet?.strength ?? null;
        const strEl = document.createElement('div');
        strEl.className = 'qpm-slot__str';
        strEl.textContent = str != null ? `STR ${str}` : 'STR ?';
        if (str == null) strEl.style.opacity = '0.35';
        info.appendChild(strEl);

        slot.appendChild(info);

        // 4. Change / clear buttons (next to info)
        const pickBtn = btn('\u21BB', 'sm');
        pickBtn.title = 'Change pet';
        pickBtn.addEventListener('click', () => {
          const usedIds = new Set((team.slots.filter((s, idx2) => s && idx2 !== i) as string[]));
          openPetPicker({
            teamId: team.id,
            usedPetIds: usedIds,
            onSelect: (petId) => {
              setTeamSlot(team.id, i as 0 | 1 | 2, petId);
              getAllPooledPets().then(pool => { petPool = pool; }).catch(() => {});
              renderTeamList();
              renderEditor();
            },
          });
        });
        slot.appendChild(pickBtn);

        const clearBtn = btn('\u00D7', 'sm');
        clearBtn.title = 'Clear slot';
        clearBtn.addEventListener('click', () => {
          clearTeamSlot(team.id, i as 0 | 1 | 2);
          renderTeamList();
          renderEditor();
        });
        slot.appendChild(clearBtn);

        // 5. Hunger bar + feed controls
        if (species) {
          const hungerControls = document.createElement('div');
          hungerControls.className = 'qpm-slot__hunger-controls';

          // Hunger bar — prefer live active-pet data, fall back to pool snapshot
          const hungerPct = activePet?.hungerPct ?? pooledPet?.hunger ?? null;
          if (hungerPct != null) {
            const barWrap = document.createElement('div');
            barWrap.className = 'qpm-slot__hunger-bar';
            const fill = document.createElement('div');
            fill.className = 'qpm-slot__hunger-fill';
            fill.style.width = `${hungerPct}%`;
            const hungerColor = hungerPct < 30 ? '#ff6464' : hungerPct < 60 ? '#ffb464' : '#64ff96';
            fill.style.background = hungerColor;
            barWrap.appendChild(fill);
            hungerControls.appendChild(barWrap);

            const pctLabel = document.createElement('span');
            pctLabel.className = 'qpm-slot__hunger-pct';
            pctLabel.style.color = hungerColor;
            pctLabel.textContent = `${Math.round(hungerPct)}%`;
            hungerControls.appendChild(pctLabel);
          }

          // Feed button (active team only)
          if (isActiveTeam) {
            const feedBtn = document.createElement('button');
            feedBtn.className = 'qpm-slot__feed-btn';
            if (hasFloatingCardForSlot(i)) feedBtn.classList.add('qpm-slot__feed-btn--active');
            feedBtn.textContent = '\uD83C\uDF56';
            feedBtn.title = 'Feed pet';
            feedBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              enqueueFeed(i);
              if (!hasFloatingCardForSlot(i)) {
                openFloatingCardForSlot(i);
                feedBtn.classList.add('qpm-slot__feed-btn--active');
              }
            });
            hungerControls.appendChild(feedBtn);
          }

          // Diet gear
          const dietBtn = document.createElement('button');
          dietBtn.className = 'qpm-slot__diet-btn';
          dietBtn.textContent = '\u2699';
          dietBtn.title = 'Diet settings';
          dietBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openDietPopover(dietBtn, species, pooledPet?.id ?? activePet?.slotId ?? null, () => {});
          });
          hungerControls.appendChild(dietBtn);

          slot.appendChild(hungerControls);
        }

        // 6. Per-pet score (far right)
        const petScore = computePetScore(slotId);
        if (petScore) {
          const scoreWrap = document.createElement('div');
          scoreWrap.className = 'qpm-slot__score';
          const scoreLbl = document.createElement('div');
          scoreLbl.className = 'qpm-slot__score-label';
          scoreLbl.textContent = 'Score';
          const scoreVal = document.createElement('div');
          scoreVal.className = 'qpm-slot__score-value';
          scoreVal.textContent = String(Math.round(petScore.total - petScore.granterBonus));
          scoreWrap.appendChild(scoreLbl);
          scoreWrap.appendChild(scoreVal);

          if (petScore.granterBonus > 0 && petScore.granterType) {
            const granterEl = document.createElement('div');
            granterEl.className = `qpm-slot__score-granter qpm-slot__score-granter--${petScore.granterType}`;
            granterEl.textContent = `+${Math.round(petScore.granterBonus)}`;
            scoreWrap.appendChild(granterEl);
          }
          slot.appendChild(scoreWrap);
        }
      } else {
        // Empty slot
        const ph = document.createElement('div');
        ph.className = 'qpm-slot__sprite-placeholder';
        ph.textContent = '+';
        slot.appendChild(ph);

        const emptyLabel = document.createElement('div');
        emptyLabel.className = 'qpm-slot__empty';
        emptyLabel.textContent = 'Empty slot';
        slot.appendChild(emptyLabel);

        const pickBtn = btn('+ Pick Pet', 'sm');
        pickBtn.addEventListener('click', () => {
          const usedIds = new Set((team.slots.filter((s, idx2) => s && idx2 !== i) as string[]));
          openPetPicker({
            teamId: team.id,
            usedPetIds: usedIds,
            onSelect: (petId) => {
              setTeamSlot(team.id, i as 0 | 1 | 2, petId);
              getAllPooledPets().then(pool => { petPool = pool; }).catch(() => {});
              renderTeamList();
              renderEditor();
            },
          });
        });
        slot.appendChild(pickBtn);
      }

      slotsEl.appendChild(slot);
    }
    editor.appendChild(slotsEl);

    // Bottom controls: keybind + delete
    const controls = document.createElement('div');
    controls.className = 'qpm-editor__controls';

    const deleteBtn = btn('Delete', 'danger');
    deleteBtn.addEventListener('click', () => {
      deleteBtn.style.display = 'none';
      const confirmRow = document.createElement('div');
      confirmRow.style.cssText = 'display:flex;gap:6px;align-items:center;flex-wrap:wrap;';
      const confirmLabel = document.createElement('span');
      confirmLabel.style.cssText = 'font-size:12px;color:#f87171;white-space:nowrap;';
      confirmLabel.textContent = `Delete "${team.name}"?`;
      const yesBtn = btn('Yes, delete', 'danger');
      const cancelConfirmBtn = btn('Cancel', 'default');
      yesBtn.addEventListener('click', () => {
        deleteTeam(team.id);
        state.selectedTeamId = null;
        renderTeamList();
        renderEditor();
      });
      cancelConfirmBtn.addEventListener('click', () => {
        confirmRow.remove();
        deleteBtn.style.display = '';
      });
      confirmRow.appendChild(confirmLabel);
      confirmRow.appendChild(yesBtn);
      confirmRow.appendChild(cancelConfirmBtn);
      controls.appendChild(confirmRow);
    });
    controls.appendChild(deleteBtn);
    editor.appendChild(controls);

    // Keybind config
    const keybindRow = document.createElement('div');
    keybindRow.className = 'qpm-editor__keybind-row';
    keybindRow.appendChild(Object.assign(document.createElement('span'), { textContent: 'Keybind:' }));

    const teamId = team.id;
    const kbBtn = createKeybindButton({
      onSet(combo) {
        Object.entries(getKeybinds()).forEach(([k, id]) => { if (id === teamId) clearKeybind(k); });
        setKeybind(combo, teamId);
        renderTeamList();
      },
      onClear() {
        Object.entries(getKeybinds()).forEach(([k, id]) => { if (id === teamId) clearKeybind(k); });
        renderTeamList();
      },
      readCurrent: () => Object.entries(getKeybinds()).find(([, id]) => id === teamId)?.[0] ?? '',
    });
    keybindRow.appendChild(kbBtn);

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
    if (!compareOpen) {
      // Defer editor re-render to the next task so that document.activeElement
      // has settled after any in-progress click / focus transition.  This also
      // batches rapid config notifications (e.g. clearKeybind → setKeybind)
      // into a single rebuild.
      if (editorRenderTimer) clearTimeout(editorRenderTimer);
      editorRenderTimer = setTimeout(() => {
        editorRenderTimer = null;
        const active = document.activeElement;
        const interactingWithEditor =
          active != null &&
          editor.contains(active);
        if (!interactingWithEditor) renderEditor();
      }, 0);
    }
  });
  state.cleanups.push(unsub);
  state.cleanups.push(() => { if (editorRenderTimer) { clearTimeout(editorRenderTimer); editorRenderTimer = null; } });

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
      compareTeamsBtn.textContent = '\u2696 Compare';
      emitCompareState();
    }
    renderTeamList();
    renderEditor();
  };

  return state;
}
