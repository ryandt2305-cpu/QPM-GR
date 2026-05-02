// src/store/petTeams/config.ts
// Lifecycle (init/stop), team CRUD, slot management, keybinds, detection, purge.

import { storage } from '../../utils/storage';
import { log } from '../../utils/logger';
import { getActivePetInfos, onActivePetInfos } from '../pets';
import { onInventoryChange } from '../inventory';
import type { PetTeam, PetTeamsConfig, PetFeedPolicy } from '../../types/petTeams';
import {
  store,
  CONFIG_KEY,
  FEED_POLICY_KEY,
  DEFAULT_CONFIG,
  DEFAULT_FEED_POLICY,
  saveConfig,
  notifyConfigListeners,
  resolveCurrentPlayerId,
  resolvePlayerKeyAndMigrate,
} from './state';
import { getAllPooledPetsWithStatus } from './pool';

// ---------------------------------------------------------------------------
// Init / stop
// ---------------------------------------------------------------------------

export function initPetTeamsStore(): void {
  store.config = storage.get<PetTeamsConfig>(store.resolvedConfigKey, DEFAULT_CONFIG);
  // Ensure required fields exist after version upgrades
  if (!Array.isArray(store.config.teams)) store.config.teams = [];
  if (typeof store.config.keybinds !== 'object' || store.config.keybinds === null) store.config.keybinds = {};
  if (store.config.activeTeamId === undefined) store.config.activeTeamId = null;
  if (typeof store.config.lastAppliedAt !== 'number') store.config.lastAppliedAt = 0;
  // Ensure each team has a valid slots array (guards against corrupt / pre-schema storage)
  let teamsNormalized = false;
  for (const team of store.config.teams) {
    const rawSlots = Array.isArray(team.slots) ? team.slots : [];
    const normalizedSlots: [string | null, string | null, string | null] = [
      typeof rawSlots[0] === 'string' ? rawSlots[0] : null,
      typeof rawSlots[1] === 'string' ? rawSlots[1] : null,
      typeof rawSlots[2] === 'string' ? rawSlots[2] : null,
    ];
    if (
      !Array.isArray(team.slots) ||
      team.slots.length !== 3 ||
      team.slots[0] !== normalizedSlots[0] ||
      team.slots[1] !== normalizedSlots[1] ||
      team.slots[2] !== normalizedSlots[2]
    ) {
      team.slots = normalizedSlots;
      teamsNormalized = true;
    }
  }

  // Keybind migration: combo -> teamIndex (legacy) to combo -> teamId (current).
  // Also prune bindings that point to missing teams.
  const migratedKeybinds: Record<string, string> = {};
  let keybindsChanged = false;
  for (const [combo, target] of Object.entries(store.config.keybinds as Record<string, unknown>)) {
    if (typeof target === 'string') {
      const exists = store.config.teams.some((team) => team.id === target);
      if (exists) {
        migratedKeybinds[combo.toLowerCase()] = target;
      } else {
        keybindsChanged = true;
      }
      continue;
    }
    if (typeof target === 'number' && Number.isInteger(target) && target >= 0) {
      const migratedTeamId = store.config.teams[target]?.id ?? null;
      if (migratedTeamId) {
        migratedKeybinds[combo.toLowerCase()] = migratedTeamId;
      }
      keybindsChanged = true;
      continue;
    }
    keybindsChanged = true;
  }
  if (keybindsChanged || Object.keys(migratedKeybinds).length !== Object.keys(store.config.keybinds).length) {
    store.config.keybinds = migratedKeybinds;
    storage.set(store.resolvedConfigKey, store.config);
  } else if (teamsNormalized) {
    storage.set(store.resolvedConfigKey, store.config);
  }

  store.feedPolicy = storage.get<PetFeedPolicy>(store.resolvedFeedKey, DEFAULT_FEED_POLICY);
  if (typeof store.feedPolicy.petItemOverrides !== 'object' || store.feedPolicy.petItemOverrides === null) {
    store.feedPolicy.petItemOverrides = {};
  }

  // Track active pet changes to update detected team
  store.activePetsUnsubscribe = onActivePetInfos(() => {
    const detectedId = detectCurrentTeam();
    if (detectedId !== store.config.activeTeamId) {
      store.config.activeTeamId = detectedId;
      notifyConfigListeners();
    }
  });

  // Debounced purge of stale pet references (sold/missing pets).
  // Fires on both active-pet and inventory changes so selling from hutch/inventory is caught.
  function schedulePurge(): void {
    if (store.purgeTimer) clearTimeout(store.purgeTimer);
    store.purgeTimer = setTimeout(async () => {
      store.purgeTimer = null;
      if (store.applyInProgress) {
        log('[PetTeams] Skipping purge — apply in progress');
        return;
      }
      try {
        const { pool, complete } = await getAllPooledPetsWithStatus();
        if (!complete) {
          log('[PetTeams] Skipping purge — atom data incomplete');
          return;
        }
        if (!store.hutchEverLoaded) {
          log('[PetTeams] Skipping purge — hutch data never loaded');
          return;
        }
        const validIds = new Set(pool.map(p => p.id));
        // Fix B: skip purge if the account changed since store init
        const currentId = await resolveCurrentPlayerId();
        if (store.initPlayerId !== null && currentId !== null && currentId !== store.initPlayerId) {
          log('[PetTeams] Skipping purge — account change detected');
          return;
        }
        purgeGonePets(validIds);
      } catch { /* ignore */ }
    }, 3000);
  }
  store.purgeUnsubscribe = onActivePetInfos(() => schedulePurge(), false);
  store.purgeInvUnsubscribe = onInventoryChange(() => schedulePurge(), false);

  log(`[PetTeams] Store initialized - ${store.config.teams.length} teams`);
  // Fix C: resolve player-scoped key in background (non-blocking, keep function sync)
  resolvePlayerKeyAndMigrate().catch(err => log('[PetTeams] Key resolution failed', err));
}

export function stopPetTeamsStore(): void {
  store.activePetsUnsubscribe?.();
  store.activePetsUnsubscribe = null;
  store.purgeUnsubscribe?.();
  store.purgeUnsubscribe = null;
  store.purgeInvUnsubscribe?.();
  store.purgeInvUnsubscribe = null;
  if (store.purgeTimer) { clearTimeout(store.purgeTimer); store.purgeTimer = null; }
  store.configListeners.clear();
  // Reset player-scoped key state so re-init works correctly
  store.resolvedConfigKey = CONFIG_KEY;
  store.resolvedFeedKey = FEED_POLICY_KEY;
  store.initPlayerId = null;
  store.hutchEverLoaded = false;
  store.applyInProgress = false;
}

// ---------------------------------------------------------------------------
// Read API
// ---------------------------------------------------------------------------

export function getTeamsConfig(): PetTeamsConfig {
  return {
    ...store.config,
    teams: store.config.teams.map(t => ({ ...t, slots: [...t.slots] as PetTeam['slots'] })),
    keybinds: { ...store.config.keybinds },
  };
}

export function getTeamById(id: string): PetTeam | null {
  const team = store.config.teams.find(t => t.id === id);
  if (!team) return null;
  return { ...team, slots: [...team.slots] as PetTeam['slots'] };
}

export function onTeamsChange(cb: (config: PetTeamsConfig) => void): () => void {
  store.configListeners.add(cb);
  return () => store.configListeners.delete(cb);
}

// ---------------------------------------------------------------------------
// Team CRUD
// ---------------------------------------------------------------------------

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createTeam(name: string): PetTeam {
  const team: PetTeam = {
    id: generateId(),
    name: name.trim() || `Team ${store.config.teams.length + 1}`,
    slots: [null, null, null],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  store.config.teams.push(team);
  saveConfig();
  return team;
}

export function renameTeam(id: string, name: string): void {
  const team = store.config.teams.find(t => t.id === id);
  if (!team) return;
  team.name = name.trim() || team.name;
  team.updatedAt = Date.now();
  saveConfig();
}

export function deleteTeam(id: string): void {
  store.config.teams = store.config.teams.filter(t => t.id !== id);
  if (store.config.activeTeamId === id) store.config.activeTeamId = null;
  // Clear keybinds that pointed to the deleted team.
  for (const [key, teamId] of Object.entries(store.config.keybinds)) {
    if (teamId === id) {
      delete store.config.keybinds[key];
    }
  }
  saveConfig();
}

export function reorderTeams(fromIndex: number, toIndex: number): void {
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= store.config.teams.length || toIndex >= store.config.teams.length) return;
  const [moved] = store.config.teams.splice(fromIndex, 1);
  if (!moved) return;
  // After splice(fromIndex, 1), indices at or above fromIndex shifted left.
  // When moving down (toIndex > fromIndex), subtract 1 so the item lands
  // at the caller's intended position in the original array.
  const adjustedTo = toIndex > fromIndex ? toIndex - 1 : toIndex;
  store.config.teams.splice(adjustedTo, 0, moved);
  saveConfig();
}

// ---------------------------------------------------------------------------
// Team slot management
// ---------------------------------------------------------------------------

export function saveCurrentTeamSlots(teamId: string): void {
  const team = store.config.teams.find(t => t.id === teamId);
  if (!team) return;
  const active = getActivePetInfos();
  const newSlots: [string | null, string | null, string | null] = [null, null, null];
  for (let i = 0; i < 3; i++) {
    newSlots[i] = active[i]?.slotId ?? null;
  }
  team.slots = newSlots;
  team.updatedAt = Date.now();
  saveConfig();
}

export function setTeamSlot(teamId: string, slotIndex: 0 | 1 | 2, petItemId: string | null): void {
  const team = store.config.teams.find(t => t.id === teamId);
  if (!team) return;
  team.slots[slotIndex] = petItemId;
  team.updatedAt = Date.now();
  saveConfig();
}

export function clearTeamSlot(teamId: string, slotIndex: 0 | 1 | 2): void {
  setTeamSlot(teamId, slotIndex, null);
}

// ---------------------------------------------------------------------------
// Stale slot purge (sold / missing pets)
// ---------------------------------------------------------------------------

export function purgeGonePets(validIds: Set<string>): number {
  let cleared = 0;
  for (const team of store.config.teams) {
    for (let i = 0; i < 3; i++) {
      const slotId = team.slots[i];
      if (slotId && !validIds.has(slotId)) {
        team.slots[i] = null;
        cleared++;
      }
    }
  }
  if (cleared > 0) {
    saveConfig();
    log(`[PetTeams] Purged ${cleared} stale slot(s)`);
  }
  return cleared;
}

// ---------------------------------------------------------------------------
// Team detection
// ---------------------------------------------------------------------------

export function detectCurrentTeam(): string | null {
  const activePets = getActivePetInfos();
  const activeSet = new Set(activePets.map(p => p.slotId).filter((id): id is string => id !== null));
  if (activeSet.size === 0) return null;

  for (const team of store.config.teams) {
    const teamSet = new Set(team.slots.filter((s): s is string => s !== null));
    if (teamSet.size === 0) continue;
    // A team matches if every non-null slot is currently active
    if ([...teamSet].every(id => activeSet.has(id))) {
      return team.id;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Keybinds
// ---------------------------------------------------------------------------

export function setKeybind(key: string, teamId: string): void {
  const normalized = key.toLowerCase();
  if (!store.config.teams.some((team) => team.id === teamId)) return;
  store.config.keybinds[normalized] = teamId;
  saveConfig();
}

export function clearKeybind(key: string): void {
  delete store.config.keybinds[key.toLowerCase()];
  saveConfig();
}

export function getKeybinds(): Record<string, string> {
  return { ...store.config.keybinds };
}
