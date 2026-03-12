// src/store/petTeams.ts
// Team CRUD, apply engine, team detection, and pet pool.

import { storage } from '../utils/storage';
import { log } from '../utils/logger';
import { getActivePetInfos, onActivePetInfos } from './pets';
import { getFavoritedItemIds } from './inventory';
import { getAtomByLabel, readAtomValue } from '../core/jotaiBridge';
import { swapPetIntoActiveSlot, type SwapPetFailureReason } from '../features/petSwap';
import { sendStorePet, sendPlacePet, PLACE_PET_DEFAULTS } from '../features/petTeamActions';
import { logTeamEvent } from './petTeamsLogs';
import { delay } from '../utils/scheduling';
import { getSpeciesXpPerLevel, calculateMaxStrength } from './xpTracker';
import type { PetTeam, PetTeamsConfig, PetFeedPolicy, PooledPet } from '../types/petTeams';
import { sendRoomAction, type WebSocketSendFailureReason } from '../websocket/api';
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

  log(`[PetTeams] Store initialized - ${config.teams.length} teams`);
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
    try { listener(snapshot); } catch (error) { log('[petTeams] config listener threw', error); }
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

  // Helper: resolve strength from a raw item - tries 3 paths in order:
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
    log('[petTeams] failed to read hutch', error);
  }

  // Inventory pets - use myInventoryAtom (general bag) with .items sub-array,
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
    log('[petTeams] failed to read inventory', error);
  }

  return pool;
}

// ---------------------------------------------------------------------------
// Apply team
// ---------------------------------------------------------------------------

const INVENTORY_ATOM_LABEL = 'myInventoryAtom';
const PET_HUTCH_STORAGE_ID = 'PetHutch';
const HUTCH_RETRIEVE_TIMEOUT_MS = 3500;
const STORE_TIMEOUT_MS = 3000;
const PLACE_TIMEOUT_MS = 3000;
const POLL_INTERVAL_MS = 100;
const APPLY_STEP_DELAY_MS = 120;

export type ApplyErrorReason =
  | 'missing_connection'
  | 'missing_source_pet'
  | 'retrieve_failed_or_inventory_full'
  | 'hutch_store_failed_or_full'
  | 'store_failed_or_timeout'
  | 'swap_failed_or_timeout'
  | 'place_failed_or_timeout'
  | 'balance_unpaired_hutch_target'
  | 'unknown';

function normalizeId(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function extractInventoryItems(raw: unknown): unknown[] {
  if (Array.isArray(raw)) {
    return raw;
  }
  if (raw && typeof raw === 'object') {
    const record = raw as Record<string, unknown>;
    if (Array.isArray(record.items)) {
      return record.items;
    }
  }
  return [];
}

function extractCandidateIds(entry: Record<string, unknown>): string[] {
  const nestedPet = entry.pet && typeof entry.pet === 'object'
    ? (entry.pet as Record<string, unknown>)
    : null;
  const nestedRaw = entry.raw && typeof entry.raw === 'object'
    ? (entry.raw as Record<string, unknown>)
    : null;

  const candidates = [
    normalizeId(entry.id),
    normalizeId(entry.itemId),
    normalizeId(entry.petId),
    normalizeId(entry.slotId),
    normalizeId(nestedPet?.id),
    normalizeId(nestedPet?.itemId),
    normalizeId(nestedPet?.petId),
    normalizeId(nestedRaw?.id),
    normalizeId(nestedRaw?.itemId),
    normalizeId(nestedRaw?.petId),
  ];

  return candidates.filter((value): value is string => Boolean(value));
}

async function readInventoryIdSet(): Promise<Set<string>> {
  const result = new Set<string>();
  const atom = getAtomByLabel(INVENTORY_ATOM_LABEL);
  if (!atom) {
    return result;
  }

  try {
    const raw = await readAtomValue(atom);
    const items = extractInventoryItems(raw);
    for (const item of items) {
      if (!item || typeof item !== 'object') {
        continue;
      }
      extractCandidateIds(item as Record<string, unknown>).forEach((id) => result.add(id));
    }
  } catch (error) {
    log('[petTeams] inventory read failed while applying team', error);
  }

  return result;
}

async function waitForInventoryContains(itemId: string, timeoutMs: number): Promise<boolean> {
  const expected = normalizeId(itemId);
  if (!expected) {
    return false;
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    const inventoryIds = await readInventoryIdSet();
    if (inventoryIds.has(expected)) {
      return true;
    }
    await delay(POLL_INTERVAL_MS);
  }
  return false;
}

async function waitForPetInActiveList(itemId: string, timeoutMs: number): Promise<boolean> {
  const expected = normalizeId(itemId);
  if (!expected) {
    return false;
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    const active = getActivePetInfos();
    const found = active.some(
      (pet) =>
        normalizeId(pet.slotId) === expected ||
        normalizeId(pet.petId) === expected,
    );
    if (found) {
      return true;
    }
    await delay(POLL_INTERVAL_MS);
  }
  return false;
}

async function waitForPetNotActive(itemId: string, timeoutMs: number): Promise<boolean> {
  const expected = normalizeId(itemId);
  if (!expected) {
    return false;
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    const active = getActivePetInfos();
    const found = active.some(
      (pet) =>
        normalizeId(pet.slotId) === expected ||
        normalizeId(pet.petId) === expected,
    );
    if (!found) {
      return true;
    }
    await delay(POLL_INTERVAL_MS);
  }
  return false;
}

function mapSwapFailureReason(reason: SwapPetFailureReason | undefined): ApplyErrorReason {
  switch (reason) {
    case 'missing_connection':
      return 'missing_connection';
    case 'missing_ids':
      return 'missing_source_pet';
    case 'retrieve_failed_or_inventory_full':
      return 'retrieve_failed_or_inventory_full';
    case 'swap_failed_or_timeout':
      return 'swap_failed_or_timeout';
    default:
      return 'unknown';
  }
}

function mapSendReason(
  reason: WebSocketSendFailureReason | undefined,
  fallback: ApplyErrorReason,
): ApplyErrorReason {
  switch (reason) {
    case 'no_connection':
      return 'missing_connection';
    case 'invalid_payload':
      return 'missing_source_pet';
    default:
      return fallback;
  }
}

function incrementReasonCount(
  reasonCounts: Partial<Record<ApplyErrorReason, number>>,
  reason: ApplyErrorReason,
): void {
  reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
}

function buildErrorSummary(reasonCounts: Partial<Record<ApplyErrorReason, number>>): string | undefined {
  const labels: Record<ApplyErrorReason, string> = {
    missing_connection: 'No connection',
    missing_source_pet: 'Missing pet IDs',
    retrieve_failed_or_inventory_full: 'Inventory full / retrieve failed',
    hutch_store_failed_or_full: 'Hutch full / store failed',
    store_failed_or_timeout: 'Store timeout',
    swap_failed_or_timeout: 'Swap timeout',
    place_failed_or_timeout: 'Place timeout',
    balance_unpaired_hutch_target: 'No outgoing pet for hutch balance',
    unknown: 'Unknown',
  };

  const entries = Object.entries(reasonCounts)
    .filter(([, count]) => typeof count === 'number' && count > 0)
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
    .slice(0, 3);

  if (entries.length === 0) {
    return undefined;
  }

  return entries
    .map(([reason, count]) => labels[reason as ApplyErrorReason] + ' x' + String(count))
    .join(', ');
}

export interface ApplyTeamResult {
  applied: number;
  errors: string[];
  reasonCounts?: Partial<Record<ApplyErrorReason, number>>;
  errorSummary?: string;
}

export async function applyTeam(teamId: string): Promise<ApplyTeamResult> {
  const team = config.teams.find(t => t.id === teamId);
  if (!team) return { applied: 0, errors: ['Team not found'] };

  const targetIds = team.slots.filter((s): s is string => s !== null);
  if (targetIds.length === 0) return { applied: 0, errors: ['Team has no pets configured'] };

  const activePets = getActivePetInfos();
  const currentSet = new Set(activePets.map(p => p.slotId).filter((id): id is string => id !== null));
  const targetSet = new Set(targetIds);

  const extras = activePets.filter(p => p.slotId && !targetSet.has(p.slotId));
  const toActivate = targetIds.filter(id => !currentSet.has(id));

  if (extras.length === 0 && toActivate.length === 0) {
    return { applied: 0, errors: [] };
  }

  const pool = await getAllPooledPets();
  const sourceMap = new Map<string, 'hutch' | 'inventory'>();
  for (const pet of pool) {
    if (pet.location !== 'active') sourceMap.set(pet.id, pet.location);
  }

  const lockedIds = getFavoritedItemIds();
  const extrasQueue = [...extras].sort((a, b) => {
    const aLocked = Boolean(a.slotId && lockedIds.has(a.slotId));
    const bLocked = Boolean(b.slotId && lockedIds.has(b.slotId));
    if (aLocked !== bLocked) return aLocked ? -1 : 1;
    return a.slotIndex - b.slotIndex;
  });

  const hutchTargets: string[] = [];
  const inventoryTargets: string[] = [];
  for (const targetId of toActivate) {
    if (sourceMap.get(targetId) === 'hutch') {
      hutchTargets.push(targetId);
    } else {
      inventoryTargets.push(targetId);
    }
  }

  const errors: string[] = [];
  const reasonCounts: Partial<Record<ApplyErrorReason, number>> = {};
  let applied = 0;

  const pushError = (reason: ApplyErrorReason, message: string): void => {
    errors.push(message);
    incrementReasonCount(reasonCounts, reason);
  };

  const nextExtra = (): NonNullable<(typeof extrasQueue)[number]> | null => {
    while (extrasQueue.length > 0) {
      const next = extrasQueue.shift()!;
      if (next.slotId) return next;
      pushError('missing_source_pet', 'Missing extra pet slot ID while applying team');
    }
    return null;
  };

  const placeFromInventory = async (petId: string): Promise<boolean> => {
    const place = sendPlacePet(
      petId,
      PLACE_PET_DEFAULTS.position,
      PLACE_PET_DEFAULTS.tileType,
      PLACE_PET_DEFAULTS.localTileIndex,
    );
    if (!place.ok) {
      pushError(
        mapSendReason(place.reason, 'place_failed_or_timeout'),
        'PlacePet failed: ' + petId + ' (' + String(place.reason ?? 'unknown') + ')',
      );
      return false;
    }

    const placed = await waitForPetInActiveList(petId, PLACE_TIMEOUT_MS);
    if (!placed) {
      pushError('place_failed_or_timeout', 'PlacePet timed out: ' + petId);
      return false;
    }
    applied++;
    return true;
  };

  // 1) Hutch-balanced replacements (prefer locked outgoing active pets)
  while (hutchTargets.length > 0) {
    const extra = nextExtra();
    if (!extra) break;

    const targetId = hutchTargets.shift()!;
    const extraId = extra.slotId!;

    const retrieve = sendRoomAction(
      'RetrieveItemFromStorage',
      { itemId: targetId, storageId: PET_HUTCH_STORAGE_ID },
      { throttleMs: 100 },
    );
    if (!retrieve.ok) {
      pushError(
        mapSendReason(retrieve.reason, 'retrieve_failed_or_inventory_full'),
        'RetrieveItemFromStorage failed: ' + targetId + ' (' + String(retrieve.reason ?? 'unknown') + ')',
      );
      await delay(APPLY_STEP_DELAY_MS);
      continue;
    }

    const retrieved = await waitForInventoryContains(targetId, HUTCH_RETRIEVE_TIMEOUT_MS);
    if (!retrieved) {
      pushError('retrieve_failed_or_inventory_full', 'RetrieveItemFromStorage timed out: ' + targetId + ' (inventory may be full)');
      await delay(APPLY_STEP_DELAY_MS);
      continue;
    }

    const store = sendStorePet(extraId);
    if (!store.ok) {
      pushError(
        mapSendReason(store.reason, 'hutch_store_failed_or_full'),
        'StorePet failed: ' + extraId + ' (' + String(store.reason ?? 'unknown') + '; hutch may be full)',
      );

      // Best-effort fallback: still try activating the target pet.
      const fallbackSwap = await swapPetIntoActiveSlot({
        source: 'inventory',
        itemId: targetId,
        targetSlotId: extraId,
      });
      if (!fallbackSwap.ok) {
        pushError(
          mapSwapFailureReason(fallbackSwap.reason),
          'Fallback swap failed: ' + extraId + ' -> ' + targetId + ' (' + String(fallbackSwap.reason ?? 'unknown') + ')',
        );
      } else {
        applied++;
      }
      await delay(APPLY_STEP_DELAY_MS);
      continue;
    }

    const stored = await waitForPetNotActive(extraId, STORE_TIMEOUT_MS);
    if (!stored) {
      pushError('store_failed_or_timeout', 'StorePet timed out: ' + extraId);
      const fallbackSwap = await swapPetIntoActiveSlot({
        source: 'inventory',
        itemId: targetId,
        targetSlotId: extraId,
      });
      if (!fallbackSwap.ok) {
        pushError(
          mapSwapFailureReason(fallbackSwap.reason),
          'Fallback swap failed after store timeout: ' + extraId + ' -> ' + targetId + ' (' + String(fallbackSwap.reason ?? 'unknown') + ')',
        );
      } else {
        applied++;
      }
      await delay(APPLY_STEP_DELAY_MS);
      continue;
    }

    await placeFromInventory(targetId);
    await delay(APPLY_STEP_DELAY_MS);
  }

  // 2) Inventory replacements into active slots
  while (inventoryTargets.length > 0) {
    const extra = nextExtra();
    if (!extra) break;

    const targetId = inventoryTargets.shift()!;
    const extraId = extra.slotId!;

    const swap = await swapPetIntoActiveSlot({
      source: 'inventory',
      itemId: targetId,
      targetSlotId: extraId,
    });
    if (!swap.ok) {
      pushError(
        mapSwapFailureReason(swap.reason),
        'Swap failed: ' + extraId + ' -> ' + targetId + ' (' + String(swap.reason ?? 'unknown') + ')',
      );
    } else {
      applied++;
    }
    await delay(APPLY_STEP_DELAY_MS);
  }

  // 3) Remaining extras -> hutch
  while (extrasQueue.length > 0) {
    const extra = nextExtra();
    if (!extra) break;

    const extraId = extra.slotId!;
    const store = sendStorePet(extraId);
    if (!store.ok) {
      pushError(
        mapSendReason(store.reason, 'hutch_store_failed_or_full'),
        'StorePet failed: ' + extraId + ' (' + String(store.reason ?? 'unknown') + '; hutch may be full)',
      );
      await delay(APPLY_STEP_DELAY_MS);
      continue;
    }

    const stored = await waitForPetNotActive(extraId, STORE_TIMEOUT_MS);
    if (!stored) {
      pushError('store_failed_or_timeout', 'StorePet timed out: ' + extraId);
    } else {
      applied++;
    }
    await delay(APPLY_STEP_DELAY_MS);
  }

  // 4) Remaining targets -> empty active slots
  for (const targetId of hutchTargets) {
    pushError(
      'balance_unpaired_hutch_target',
      'No outgoing active pet available to keep hutch balanced for ' + targetId,
    );

    const retrieve = sendRoomAction(
      'RetrieveItemFromStorage',
      { itemId: targetId, storageId: PET_HUTCH_STORAGE_ID },
      { throttleMs: 100 },
    );
    if (!retrieve.ok) {
      pushError(
        mapSendReason(retrieve.reason, 'retrieve_failed_or_inventory_full'),
        'RetrieveItemFromStorage failed: ' + targetId + ' (' + String(retrieve.reason ?? 'unknown') + ')',
      );
      await delay(APPLY_STEP_DELAY_MS);
      continue;
    }

    const retrieved = await waitForInventoryContains(targetId, HUTCH_RETRIEVE_TIMEOUT_MS);
    if (!retrieved) {
      pushError('retrieve_failed_or_inventory_full', 'RetrieveItemFromStorage timed out: ' + targetId + ' (inventory may be full)');
      await delay(APPLY_STEP_DELAY_MS);
      continue;
    }

    await placeFromInventory(targetId);
    await delay(APPLY_STEP_DELAY_MS);
  }

  for (const targetId of inventoryTargets) {
    await placeFromInventory(targetId);
    await delay(APPLY_STEP_DELAY_MS);
  }

  const errorSummary = buildErrorSummary(reasonCounts);
  const hasReasonCounts = Object.keys(reasonCounts).length > 0;
  config.activeTeamId = teamId;
  config.lastAppliedAt = Date.now();
  saveConfig();

  logTeamEvent(teamId, team.name, applied, errors);
  return {
    applied,
    errors,
    ...(hasReasonCounts ? { reasonCounts } : {}),
    ...(errorSummary ? { errorSummary } : {}),
  };
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
