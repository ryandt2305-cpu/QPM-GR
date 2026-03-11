// src/store/petTeams.ts
// Team CRUD, apply engine, team detection, and pet pool.

import { storage } from '../utils/storage';
import { log } from '../utils/logger';
import { getActivePetInfos, onActivePetInfos } from './pets';
import { getAtomByLabel, readAtomValue } from '../core/jotaiBridge';
import { swapPetIntoActiveSlot } from '../features/petSwap';
import { sendStorePet, sendPlacePet, PLACE_PET_DEFAULTS } from '../features/petTeamActions';
import { logTeamEvent } from './petTeamsLogs';
import { delay } from '../utils/scheduling';
import { getSpeciesXpPerLevel, calculateMaxStrength } from './xpTracker';
import type { PetTeam, PetTeamsConfig, PetFeedPolicy, PooledPet } from '../types/petTeams';
import { sendRoomAction } from '../websocket/api';
import { normalizeSpeciesKey } from '../utils/helpers';

const CONFIG_KEY = 'qpm.petTeams.config.v1';
const FEED_POLICY_KEY = 'qpm.petTeams.feedPolicy.v1';
export const PET_FEED_POLICY_CHANGED_EVENT = 'qpm:pet-feed-policy-changed';

const DEFAULT_CONFIG: PetTeamsConfig = {
  teams: [],
  keybinds: {},
  activeTeamId: null,
  lastAppliedAt: 0,
};

const DEFAULT_FEED_POLICY: PetFeedPolicy = {
  petItemOverrides: {},
  updatedAt: 0,
};

let config: PetTeamsConfig = { ...DEFAULT_CONFIG };
let feedPolicy: PetFeedPolicy = { ...DEFAULT_FEED_POLICY };
const configListeners = new Set<(cfg: PetTeamsConfig) => void>();
let activePetsUnsubscribe: (() => void) | null = null;

// ---------------------------------------------------------------------------
// Init / stop
// ---------------------------------------------------------------------------

export function initPetTeamsStore(): void {
  config = storage.get<PetTeamsConfig>(CONFIG_KEY, DEFAULT_CONFIG);
  // Ensure required fields exist after version upgrades
  if (!Array.isArray(config.teams)) config.teams = [];
  if (typeof config.keybinds !== 'object' || config.keybinds === null) config.keybinds = {};
  if (config.activeTeamId === undefined) config.activeTeamId = null;
  if (typeof config.lastAppliedAt !== 'number') config.lastAppliedAt = 0;
  // Ensure each team has a valid slots array (guards against corrupt / pre-schema storage)
  for (const team of config.teams) {
    if (!Array.isArray(team.slots)) team.slots = [null, null, null];
    while (team.slots.length < 3) team.slots.push(null);
  }

  // Keybind migration: combo -> teamIndex (legacy) to combo -> teamId (current).
  // Also prune bindings that point to missing teams.
  const migratedKeybinds: Record<string, string> = {};
  let keybindsChanged = false;
  for (const [combo, target] of Object.entries(config.keybinds as Record<string, unknown>)) {
    if (typeof target === 'string') {
      const exists = config.teams.some((team) => team.id === target);
      if (exists) {
        migratedKeybinds[combo.toLowerCase()] = target;
      } else {
        keybindsChanged = true;
      }
      continue;
    }
    if (typeof target === 'number' && Number.isInteger(target) && target >= 0) {
      const migratedTeamId = config.teams[target]?.id ?? null;
      if (migratedTeamId) {
        migratedKeybinds[combo.toLowerCase()] = migratedTeamId;
      }
      keybindsChanged = true;
      continue;
    }
    keybindsChanged = true;
  }
  if (keybindsChanged || Object.keys(migratedKeybinds).length !== Object.keys(config.keybinds).length) {
    config.keybinds = migratedKeybinds;
    storage.set(CONFIG_KEY, config);
  }

  feedPolicy = storage.get<PetFeedPolicy>(FEED_POLICY_KEY, DEFAULT_FEED_POLICY);
  if (typeof feedPolicy.petItemOverrides !== 'object' || feedPolicy.petItemOverrides === null) {
    feedPolicy.petItemOverrides = {};
  }

  // Track active pet changes to update detected team
  activePetsUnsubscribe = onActivePetInfos(() => {
    const detectedId = detectCurrentTeam();
    if (detectedId !== config.activeTeamId) {
      config.activeTeamId = detectedId;
      notifyConfigListeners();
    }
  });

  log(`[PetTeams] Store initialized — ${config.teams.length} teams`);
}

export function stopPetTeamsStore(): void {
  activePetsUnsubscribe?.();
  activePetsUnsubscribe = null;
  configListeners.clear();
}

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

function saveConfig(): void {
  storage.set(CONFIG_KEY, config);
  notifyConfigListeners();
}

function saveFeedPolicy(): void {
  feedPolicy.updatedAt = Date.now();
  storage.set(FEED_POLICY_KEY, feedPolicy);
  try {
    window.dispatchEvent(new CustomEvent(PET_FEED_POLICY_CHANGED_EVENT, {
      detail: { updatedAt: feedPolicy.updatedAt },
    }));
  } catch {
    // no-op
  }
}

function notifyConfigListeners(): void {
  const snapshot = getTeamsConfig();
  for (const listener of configListeners) {
    try { listener(snapshot); } catch (error) { log('⚠️ petTeams config listener threw', error); }
  }
}

// ---------------------------------------------------------------------------
// Read API
// ---------------------------------------------------------------------------

export function getTeamsConfig(): PetTeamsConfig {
  return {
    ...config,
    teams: config.teams.map(t => ({ ...t, slots: [...t.slots] as PetTeam['slots'] })),
    keybinds: { ...config.keybinds },
  };
}

export function getFeedPolicy(): PetFeedPolicy {
  const petItemOverrides: PetFeedPolicy['petItemOverrides'] = {};
  for (const [petItemId, value] of Object.entries(feedPolicy.petItemOverrides)) {
    petItemOverrides[petItemId] = {
      ...value,
      ...(Array.isArray(value.allowed) ? { allowed: [...value.allowed] } : {}),
      ...(Array.isArray(value.forbidden) ? { forbidden: [...value.forbidden] } : {}),
    };
  }
  return {
    petItemOverrides,
    updatedAt: feedPolicy.updatedAt,
  };
}

export function getTeamById(id: string): PetTeam | null {
  return config.teams.find(t => t.id === id) ?? null;
}

export function onTeamsChange(cb: (config: PetTeamsConfig) => void): () => void {
  configListeners.add(cb);
  return () => configListeners.delete(cb);
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
    name: name.trim() || `Team ${config.teams.length + 1}`,
    slots: [null, null, null],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  config.teams.push(team);
  saveConfig();
  return team;
}

export function renameTeam(id: string, name: string): void {
  const team = config.teams.find(t => t.id === id);
  if (!team) return;
  team.name = name.trim() || team.name;
  team.updatedAt = Date.now();
  saveConfig();
}

export function deleteTeam(id: string): void {
  config.teams = config.teams.filter(t => t.id !== id);
  if (config.activeTeamId === id) config.activeTeamId = null;
  // Clear keybinds that pointed to the deleted team.
  for (const [key, teamId] of Object.entries(config.keybinds)) {
    if (teamId === id) {
      delete config.keybinds[key];
    }
  }
  saveConfig();
}

export function reorderTeams(fromIndex: number, toIndex: number): void {
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= config.teams.length || toIndex >= config.teams.length) return;
  const [moved] = config.teams.splice(fromIndex, 1);
  if (moved) config.teams.splice(toIndex, 0, moved);
  saveConfig();
}

// ---------------------------------------------------------------------------
// Team slot management
// ---------------------------------------------------------------------------

export function saveCurrentTeamSlots(teamId: string): void {
  const team = config.teams.find(t => t.id === teamId);
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
  const team = config.teams.find(t => t.id === teamId);
  if (!team) return;
  team.slots[slotIndex] = petItemId;
  team.updatedAt = Date.now();
  saveConfig();
}

export function clearTeamSlot(teamId: string, slotIndex: 0 | 1 | 2): void {
  setTeamSlot(teamId, slotIndex, null);
}

// ---------------------------------------------------------------------------
// Team detection
// ---------------------------------------------------------------------------

export function detectCurrentTeam(): string | null {
  const activePets = getActivePetInfos();
  const activeSet = new Set(activePets.map(p => p.slotId).filter((id): id is string => id !== null));
  if (activeSet.size === 0) return null;

  for (const team of config.teams) {
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
// Pet pool (active + hutch + inventory)
// ---------------------------------------------------------------------------

export async function getAllPooledPets(): Promise<PooledPet[]> {
  const pool: PooledPet[] = [];

  // Active pets
  const active = getActivePetInfos();
  for (const p of active) {
    if (!p.slotId) continue;
    pool.push({
      id: p.slotId,
      petId: p.petId,
      name: p.name ?? p.species ?? '',
      species: p.species ?? '',
      level: p.level,
      strength: p.strength,
      mutations: p.mutations ?? [],
      abilities: p.abilities ?? [],
      xp: p.xp,
      targetScale: p.targetScale,
      hunger: p.hungerPct,
      location: 'active',
      slotIndex: p.slotIndex,
    });
  }

  const activeIds = new Set(pool.map(p => p.id));

  // Helper: coerce a raw atom field to string[]
  function toStrArr(v: unknown): string[] {
    if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string');
    return [];
  }

  // Helper: resolve strength from a raw item — tries 3 paths in order:
  // 1. Direct `strength` field
  // 2. targetScale + XP  (calculateMaxStrength gives max, XP gives level progress)
  // 3. Name-parse `(maxLevel)` + XP  (for default-named pets like "Turtle (95)")
  function resolveStrength(it: Record<string, unknown>): number | null {
    if (typeof it.strength === 'number') return it.strength;
    if (typeof it.xp !== 'number') return null;
    const species = String(it.petSpecies ?? it.species ?? '');
    const xpPerLevel = getSpeciesXpPerLevel(species);
    if (!xpPerLevel) return null;

    // Path 2: targetScale
    if (typeof it.targetScale === 'number') {
      const maxViaScale = calculateMaxStrength(it.targetScale, species);
      if (maxViaScale != null) {
        return (maxViaScale - 30) + Math.min(30, Math.floor(it.xp / xpPerLevel));
      }
    }

    // Path 3: name-parse
    const name = typeof it.name === 'string' ? it.name : '';
    const nameMatch = name.match(/\((\d+)\)/);
    const parsedMax = nameMatch?.[1] ? parseInt(nameMatch[1], 10) : null;
    if (!parsedMax || parsedMax < 70 || parsedMax > 100) return null;
    return (parsedMax - 30) + Math.min(30, Math.floor(it.xp / xpPerLevel));
  }

  // Hutch pets
  try {
    const hutchAtom = getAtomByLabel('myPetHutchPetItemsAtom');
    if (hutchAtom) {
      const hutch = await readAtomValue(hutchAtom);
      if (Array.isArray(hutch)) {
        for (const item of hutch) {
          if (!item || typeof item !== 'object') continue;
          const it = item as Record<string, unknown>;
          const id = typeof it.id === 'string' ? it.id : typeof it.itemId === 'string' ? it.itemId : null;
          if (!id || activeIds.has(id)) continue;
          pool.push({
            id,
            petId: typeof it.petId === 'string' ? it.petId : null,
            name: String(it.name ?? it.species ?? ''),
            species: String(it.petSpecies ?? it.species ?? ''),
            level: typeof it.level === 'number' ? it.level : null,
            strength: resolveStrength(it),
            mutations: toStrArr(it.mutations),
            abilities: toStrArr(it.abilities),
            xp: typeof it.xp === 'number' ? it.xp : null,
            targetScale: typeof it.targetScale === 'number' ? it.targetScale : null,
            hunger: null,
            location: 'hutch',
          });
          activeIds.add(id);
        }
      }
    }
  } catch (error) {
    log('⚠️ petTeams: failed to read hutch', error);
  }

  // Inventory pets — use myInventoryAtom (general bag) with .items sub-array,
  // same as xpTrackerWindow. myPetInventoryAtom is a different/empty atom.
  try {
    const invAtom = getAtomByLabel('myInventoryAtom');
    if (invAtom) {
      const invRaw = await readAtomValue(invAtom);
      const inv = invRaw as { items?: unknown[] } | null;
      const items = Array.isArray(inv?.items) ? inv.items : Array.isArray(invRaw) ? invRaw : [];
      for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        const it = item as Record<string, unknown>;
        const itemType = String(it.itemType ?? '');
        if (itemType.toLowerCase() !== 'pet') continue;
        const id = typeof it.id === 'string' ? it.id : typeof it.itemId === 'string' ? it.itemId : null;
        if (!id || activeIds.has(id)) continue;
        pool.push({
          id,
          petId: typeof it.petId === 'string' ? it.petId : null,
          name: String(it.name ?? it.species ?? ''),
          species: String(it.petSpecies ?? it.species ?? ''),
          level: typeof it.level === 'number' ? it.level : null,
          strength: resolveStrength(it),
          mutations: toStrArr(it.mutations),
          abilities: toStrArr(it.abilities),
          xp: typeof it.xp === 'number' ? it.xp : null,
          targetScale: typeof it.targetScale === 'number' ? it.targetScale : null,
          hunger: null,
          location: 'inventory',
        });
        activeIds.add(id);
      }
    }
  } catch (error) {
    log('⚠️ petTeams: failed to read inventory', error);
  }

  return pool;
}

// ---------------------------------------------------------------------------
// Apply team
// ---------------------------------------------------------------------------

export interface ApplyTeamResult {
  applied: number;
  errors: string[];
}

export async function applyTeam(teamId: string): Promise<ApplyTeamResult> {
  const team = config.teams.find(t => t.id === teamId);
  if (!team) return { applied: 0, errors: ['Team not found'] };

  const targetIds = team.slots.filter((s): s is string => s !== null);
  if (targetIds.length === 0) return { applied: 0, errors: ['Team has no pets configured'] };

  const activePets = getActivePetInfos();
  const currentSet = new Set(activePets.map(p => p.slotId).filter((id): id is string => id !== null));
  const targetSet = new Set(targetIds);

  // Active pets NOT in the target team
  const extras = activePets.filter(p => p.slotId && !targetSet.has(p.slotId));
  // Target pets NOT already active
  const toActivate = targetIds.filter(id => !currentSet.has(id));

  if (extras.length === 0 && toActivate.length === 0) {
    return { applied: 0, errors: [] }; // Already correct
  }

  // Determine where each target pet lives (hutch or inventory)
  const pool = await getAllPooledPets();
  const sourceMap = new Map<string, 'hutch' | 'inventory'>();
  for (const p of pool) {
    if (p.location !== 'active') sourceMap.set(p.id, p.location);
  }

  const errors: string[] = [];
  const swapCount = Math.min(extras.length, toActivate.length);

  // Pair extras ↔ targets via swapPetIntoActiveSlot (handles hutch retrieval + verification)
  // Run in parallel — each swap is independent
  const swapPromises: Promise<void>[] = [];
  for (let i = 0; i < swapCount; i++) {
    const extra = extras[i]!;
    const targetId = toActivate[i]!;
    const source = sourceMap.get(targetId) ?? 'inventory';
    swapPromises.push(
      swapPetIntoActiveSlot({ source, itemId: targetId, targetSlotId: extra.slotId! })
        .then(result => {
          if (!result.ok) {
            errors.push(`Swap failed: ${extra.slotId} → ${targetId} (${result.reason ?? 'unknown'})`);
          }
        }),
    );
  }
  await Promise.all(swapPromises);

  // Unpaired extras → store to hutch
  for (let i = swapCount; i < extras.length; i++) {
    const ok = sendStorePet(extras[i]!.slotId!);
    if (!ok) errors.push(`StorePet failed: ${extras[i]!.slotId}`);
  }

  // Remaining targets with no active slot to swap → place into empty slots
  for (let i = swapCount; i < toActivate.length; i++) {
    const petId = toActivate[i]!;
    // If in hutch, retrieve to inventory first
    if (sourceMap.get(petId) === 'hutch') {
      const retrieved = sendRoomAction(
        'RetrieveItemFromStorage',
        { itemId: petId, storageId: 'PetHutch' },
        { throttleMs: 100 },
      );
      if (!retrieved.ok) {
        errors.push(`RetrieveItemFromStorage failed: ${petId} (${retrieved.reason ?? 'unknown'})`);
        continue;
      }
      await delay(3500);
    }
    // ⚠️ PlacePet position is unverified — see PLACE_PET_DEFAULTS
    const ok = sendPlacePet(
      petId,
      PLACE_PET_DEFAULTS.position,
      PLACE_PET_DEFAULTS.tileType,
      PLACE_PET_DEFAULTS.localTileIndex,
    );
    if (!ok) errors.push(`PlacePet failed: ${petId}`);
  }

  const totalApplied = swapCount + (extras.length - swapCount) + (toActivate.length - swapCount);
  config.activeTeamId = teamId;
  config.lastAppliedAt = Date.now();
  saveConfig();

  logTeamEvent(teamId, team.name, totalApplied, errors);
  return { applied: totalApplied, errors };
}

// ---------------------------------------------------------------------------
// Keybinds
// ---------------------------------------------------------------------------

export function setKeybind(key: string, teamId: string): void {
  const normalized = key.toLowerCase();
  if (!config.teams.some((team) => team.id === teamId)) return;
  config.keybinds[normalized] = teamId;
  saveConfig();
}

export function clearKeybind(key: string): void {
  delete config.keybinds[key.toLowerCase()];
  saveConfig();
}

export function getKeybinds(): Record<string, string> {
  return { ...config.keybinds };
}

// ---------------------------------------------------------------------------
// Feed policy
// ---------------------------------------------------------------------------

export function setFeedPolicyOverride(petItemId: string, override: Partial<import('../types/petTeams').PetItemFeedOverride>): void {
  const normalizedPetItemId = String(petItemId ?? '').trim();
  if (!normalizedPetItemId) return;

  const next: import('../types/petTeams').PetItemFeedOverride = {
    petItemId: normalizedPetItemId,
  };

  if (typeof override.displayLabel === 'string' && override.displayLabel.trim().length > 0) {
    next.displayLabel = override.displayLabel.trim();
  }

  if (Array.isArray(override.allowed)) {
    next.allowed = override.allowed
      .map((entry) => normalizeSpeciesKey(entry))
      .filter((entry): entry is string => !!entry);
  }

  if (Array.isArray(override.forbidden)) {
    next.forbidden = override.forbidden
      .map((entry) => normalizeSpeciesKey(entry))
      .filter((entry): entry is string => !!entry);
  }

  if (typeof override.preferred === 'string') {
    const preferred = normalizeSpeciesKey(override.preferred);
    if (preferred) {
      next.preferred = preferred;
    }
  }

  const hasAllowed = Array.isArray(next.allowed);
  const hasForbidden = Array.isArray(next.forbidden);
  const hasPreferred = typeof next.preferred === 'string' && next.preferred.length > 0;
  const hasDisplayLabel = typeof next.displayLabel === 'string' && next.displayLabel.length > 0;
  if (!hasAllowed && !hasForbidden && !hasPreferred && !hasDisplayLabel) {
    delete feedPolicy.petItemOverrides[normalizedPetItemId];
  } else {
    feedPolicy.petItemOverrides[normalizedPetItemId] = next;
  }
  saveFeedPolicy();
}

export function clearFeedPolicyOverride(petItemId: string): void {
  const normalizedPetItemId = String(petItemId ?? '').trim();
  if (!normalizedPetItemId) return;
  delete feedPolicy.petItemOverrides[normalizedPetItemId];
  saveFeedPolicy();
}
