// Manager tab: wiring shell — DOM setup, context object, subscriptions, toolbar.

import {
  getTeamsConfig,
  createTeam,
  onTeamsChange,
  getAllPooledPets,
} from '../../store/petTeams';
import { storage } from '../../utils/storage';
import { importAriesTeams } from '../../utils/ariesTeamImport';
import type { PooledPet } from '../../types/petTeams';
import type { CompareStage } from '../../data/petCompareRules';
import type { ManagerState, CompareStateChange, ManagerContext } from './types';
import { ARIES_IMPORT_ONCE_KEY } from './constants';
import { loadPetTeamsUiState } from './state';
import { btn, showToast } from './helpers';
import { buildCompareTeamsPanel } from './comparisonPanel';
import { renderTeamList } from './teamList';
import { renderEditor } from './teamEditor';

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

  // --- Context object (mutable, shared with teamList + teamEditor) ---
  const ctx: ManagerContext = {
    state,
    get petPool() { return petPool; },
    set petPool(v) { petPool = v; },
    get compareOpen() { return compareOpen; },
    get compareTeamAId() { return compareTeamAId; },
    set compareTeamAId(v) { compareTeamAId = v; },
    get compareTeamBId() { return compareTeamBId; },
    set compareTeamBId(v) { compareTeamBId = v; },
    dragTeamId: null,
    teamsContainer,
    editor,
    comparePanel,
    normalizeComparePair(): void {
      const teamIds = new Set(getTeamsConfig().teams.map((team) => team.id));
      if (compareTeamAId && !teamIds.has(compareTeamAId)) compareTeamAId = null;
      if (compareTeamBId && !teamIds.has(compareTeamBId)) compareTeamBId = null;
      if (compareTeamAId && compareTeamBId && compareTeamAId === compareTeamBId) compareTeamBId = null;
      comparePanel.setPair(compareTeamAId, compareTeamBId);
    },
    renderTeamList(): void { renderTeamList(ctx); },
    renderEditor(): void { renderEditor(ctx); },
  };

  // --- Async init ---
  getAllPooledPets().then((pool) => {
    petPool = pool;
    comparePanel.refresh();
    emitCompareState();
    ctx.renderTeamList();
    if (!compareOpen && state.selectedTeamId) ctx.renderEditor();
  }).catch(() => { /* pool stays empty */ });

  function refreshImportButton(): void {
    const imported = storage.get<boolean>(ARIES_IMPORT_ONCE_KEY, false);
    importBtn.title = imported ? 'Aries import already completed' : 'Import Aries teams';
    importBtn.style.opacity = imported ? '0.62' : '1';
  }

  // --- Toolbar event handlers ---
  compareTeamsBtn.addEventListener('click', () => {
    compareOpen = !compareOpen;
    ctx.normalizeComparePair();
    editor.style.display = compareOpen ? 'none' : '';
    compareWrapper.style.display = compareOpen ? '' : 'none';
    compareTeamsBtn.textContent = compareOpen ? '\u2715 Close Compare' : '\u2696 Compare';
    emitCompareState();
    ctx.renderTeamList();
    if (!compareOpen) ctx.renderEditor();
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
    ctx.renderTeamList();
    if (!compareOpen) ctx.renderEditor();
    emitCompareState();

    if (result.imported > 0) {
      showToast(`Imported ${result.imported} team${result.imported > 1 ? 's' : ''}`, 'success');
    } else {
      showToast('Aries teams already imported', 'info');
    }
  });

  refreshImportButton();
  emitCompareState();

  search.addEventListener('input', () => {
    state.searchTerm = search.value;
    ctx.renderTeamList();
  });
  state.cleanups.push(() => search.removeEventListener('input', () => {}));

  newTeamBtn.addEventListener('click', () => {
    const team = createTeam(`Team ${getTeamsConfig().teams.length + 1}`);
    state.selectedTeamId = team.id;
    ctx.renderTeamList();
    ctx.renderEditor();
  });

  // --- Subscribe to team changes ---
  const unsub = onTeamsChange(() => {
    const teams = getTeamsConfig().teams;
    if (state.selectedTeamId && !teams.some(t => t.id === state.selectedTeamId)) {
      state.selectedTeamId = teams[0]?.id ?? null;
    } else if (!state.selectedTeamId && teams.length > 0) {
      state.selectedTeamId = teams[0]!.id;
    }
    ctx.normalizeComparePair();
    comparePanel.refresh();
    ctx.renderTeamList();
    if (!compareOpen) {
      if (editorRenderTimer) clearTimeout(editorRenderTimer);
      editorRenderTimer = setTimeout(() => {
        editorRenderTimer = null;
        const active = document.activeElement;
        const interactingWithEditor =
          active != null &&
          editor.contains(active);
        if (!interactingWithEditor) ctx.renderEditor();
      }, 0);
    }
  });
  state.cleanups.push(unsub);
  state.cleanups.push(() => { if (editorRenderTimer) { clearTimeout(editorRenderTimer); editorRenderTimer = null; } });

  ctx.renderTeamList();
  ctx.renderEditor();

  state.selectTeam = (teamId: string | null): void => {
    const teams = getTeamsConfig().teams;
    if (teamId && teams.some((team) => team.id === teamId)) {
      state.selectedTeamId = teamId;
    } else {
      state.selectedTeamId = teams[0]?.id ?? null;
    }
    if (compareOpen) {
      compareOpen = false;
      ctx.normalizeComparePair();
      editor.style.display = '';
      compareWrapper.style.display = 'none';
      compareTeamsBtn.textContent = '\u2696 Compare';
      emitCompareState();
    }
    ctx.renderTeamList();
    ctx.renderEditor();
  };

  return state;
}
