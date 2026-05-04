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
} from '../../store/petTeams';
import { getActivePetInfos } from '../../store/pets';
import { getPetSpriteDataUrlWithMutations, isSpritesReady } from '../../sprite-v2/compat';
import { calculateMaxStrength } from '../../store/xpTracker';
import { getAbilityColor } from '../../utils/petCardRenderer';
import { getAbilityDefinition } from '../../data/petAbilities';
import { openPetPicker } from '../petPickerModal';
import { storage } from '../../utils/storage';
import { importAriesTeams } from '../../utils/ariesTeamImport';
import type { PooledPet } from '../../types/petTeams';
import type { CompareStage } from '../../data/petCompareRules';
import type { ManagerState, CompareStateChange } from './types';
import { ARIES_IMPORT_ONCE_KEY } from './constants';
import { loadPetTeamsUiState } from './state';
import { btn, showToast, formatKeybind, createKeybindButton } from './helpers';
import { renderTeamSummaryBar } from './teamSummary';
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
        badge.textContent = '\u2713';
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
    statusEl.className = `qpm-editor__status ${isActive ? 'qpm-editor__status--active' : 'qpm-editor__status--inactive'}`;
    statusEl.textContent = isActive ? '\u2713 Active' : '';
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

    if (filledSlotData.length > 0) {
      editor.appendChild(renderTeamSummaryBar(filledSlotData));
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
            spriteWrap.textContent = '\uD83D\uDC3E';
          }
        } else {
          spriteWrap.textContent = '\uD83D\uDC3E';
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
          strEl.textContent = `STR ${str} \u2192 ${maxStr}`;
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
            dot.title = getAbilityDefinition(abilId)?.name ?? abilId;
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
      const pickBtn = btn(slotId ? '\u21BB Change' : '+ Pick', 'sm');
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
        const clearBtn = btn('\u00D7', 'sm');
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

    const applyBtn = btn('\u25B6 Apply Team', 'primary');
    applyBtn.addEventListener('click', async () => {
      applyBtn.disabled = true;
      applyBtn.textContent = '\u23F3 Applying\u2026';
      try {
        const result = await applyTeam(team.id);
        if (result.errors.length === 0) {
          showToast(`Applied "${team.name}"`, 'success');
        } else {
          const summary = result.errorSummary ? `: ${result.errorSummary}` : '';
          showToast(`Applied "${team.name}" with ${result.errors.length} error(s)${summary}`, 'error');
        }
      } catch (err) {
        showToast('Apply failed', 'error');
        void err;
      } finally {
        applyBtn.disabled = false;
        applyBtn.textContent = '\u25B6 Apply Team';
        renderTeamList();
        renderEditor();
      }
    });
    controls.appendChild(applyBtn);

    const snapshotBtn = btn('\uD83D\uDCF8 Save Current', 'default');
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
      // Replace delete button with an inline confirm row — window.confirm() is
      // silently blocked in sandboxed iframes (Discord Activity) and some browsers.
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
