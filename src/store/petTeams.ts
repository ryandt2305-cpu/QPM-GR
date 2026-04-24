// src/store/petTeams.ts
// Team CRUD, apply engine, team detection, and pet pool.

import { storage } from '../utils/storage';
import { log } from '../utils/logger';
import { getActivePetInfos, onActivePetInfos } from './pets';
import { getAtomByLabel, readAtomValue } from '../core/jotaiBridge';
import { logTeamEvent } from './petTeamsLogs';
import { delay } from '../utils/scheduling';
import { getSpeciesXpPerLevel, calculateMaxStrength } from './xpTracker';
import type { PetTeam, PetTeamsConfig, PetFeedPolicy, PooledPet } from '../types/petTeams';
import { sendRoomAction, type WebSocketSendFailureReason } from '../websocket/api';
import { findEmptyGardenTile, PLACE_PET_DEFAULTS, resolveMyUserSlotIdx } from '../features/petTeamActions';
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
  let teamsNormalized = false;
  for (const team of config.teams) {
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
  } else if (teamsNormalized) {
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
const HUTCH_ATOM_LABEL = 'myPetHutchPetItemsAtom';
const PET_HUTCH_STORAGE_ID = 'PetHutch';
const DEFAULT_HUTCH_CAPACITY = 25;
const HUTCH_RETRIEVE_TIMEOUT_MS = 3500;
const STORE_TIMEOUT_MS = 3000;
const PLACE_TIMEOUT_MS = 3000;
const POLL_INTERVAL_MS = 100;
const APPLY_STEP_DELAY_MS = 120;
const FAST_PATH_SETTLE_TIMEOUT_MS = 1200;
const FAST_SETTLE_POLL_INTERVAL_MS = 50;
const REPAIR_SETTLE_TIMEOUT_MS = 1200;

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

function extractPrimaryItemId(entry: Record<string, unknown>): string | null {
  return (
    normalizeId(entry.id) ??
    normalizeId(entry.itemId) ??
    extractCandidateIds(entry)[0] ??
    null
  );
}

function isLikelyPetInventoryEntry(entry: Record<string, unknown>): boolean {
  const itemType = String(entry.itemType ?? '').trim().toLowerCase();
  if (itemType === 'pet') {
    return true;
  }
  if (normalizeId(entry.petId)) {
    return true;
  }
  const nestedPet = entry.pet && typeof entry.pet === 'object'
    ? (entry.pet as Record<string, unknown>)
    : null;
  if (normalizeId(nestedPet?.id) || normalizeId(nestedPet?.petId)) {
    return true;
  }
  return Array.isArray(entry.abilities);
}

interface InventorySnapshot {
  ids: Set<string>;
  petIds: string[];
  freeIndex: number | null;
}

interface HutchSnapshot {
  ids: Set<string>;
  count: number;
  hutchMax: number;
  freeIndex: number | null;
}

function getActiveSlotIds(): string[] {
  return getActivePetInfos()
    .map((pet) => normalizeId(pet.slotId))
    .filter((id): id is string => Boolean(id));
}

async function readInventorySnapshot(): Promise<InventorySnapshot> {
  const ids = new Set<string>();
  const petIds: string[] = [];
  const atom = getAtomByLabel(INVENTORY_ATOM_LABEL);
  if (!atom) {
    return { ids, petIds, freeIndex: null };
  }

  try {
    const raw = await readAtomValue(atom);
    const items = extractInventoryItems(raw);
    let firstFreeIndex: number | null = null;

    for (let idx = 0; idx < items.length; idx++) {
      const item = items[idx];
      if (!item) {
        if (firstFreeIndex == null) {
          firstFreeIndex = idx;
        }
        continue;
      }
      if (typeof item !== 'object') {
        continue;
      }

      const record = item as Record<string, unknown>;
      extractCandidateIds(record).forEach((id) => ids.add(id));

      if (isLikelyPetInventoryEntry(record)) {
        const petItemId = extractPrimaryItemId(record);
        if (petItemId) {
          petIds.push(petItemId);
        }
      }
    }

    const freeIndex = firstFreeIndex ?? items.length;
    return { ids, petIds, freeIndex };
  } catch (error) {
    log('[petTeams] inventory snapshot read failed', error);
    return { ids, petIds, freeIndex: null };
  }
}

async function readHutchSnapshot(): Promise<HutchSnapshot> {
  const ids = new Set<string>();
  const atom = getAtomByLabel(HUTCH_ATOM_LABEL);
  if (!atom) {
    return { ids, count: 0, hutchMax: DEFAULT_HUTCH_CAPACITY, freeIndex: 0 };
  }

  try {
    const raw = await readAtomValue(atom);
    const items = Array.isArray(raw) ? raw : [];
    const usedStorageIndexes = new Set<number>();
    let hasStorageIndexes = false;
    let occupied = 0;
    let firstArrayHole: number | null = null;

    for (let idx = 0; idx < items.length; idx++) {
      const item = items[idx];
      if (!item) {
        if (firstArrayHole == null) {
          firstArrayHole = idx;
        }
        continue;
      }
      occupied++;
      if (typeof item !== 'object') {
        continue;
      }

      const record = item as Record<string, unknown>;
      const id = extractPrimaryItemId(record);
      if (id) {
        ids.add(id);
      }

      const storageIndex = Number(record.storageIndex);
      if (Number.isFinite(storageIndex) && storageIndex >= 0) {
        hasStorageIndexes = true;
        usedStorageIndexes.add(Math.floor(storageIndex));
      }
    }

    // Derive effective max from the atom array length (reflects upgraded capacity).
    const effectiveMax = Math.max(items.length, occupied, DEFAULT_HUTCH_CAPACITY);

    let freeIndex: number | null = null;
    if (hasStorageIndexes) {
      for (let idx = 0; idx < effectiveMax; idx++) {
        if (!usedStorageIndexes.has(idx)) {
          freeIndex = idx;
          break;
        }
      }
    } else if (firstArrayHole != null) {
      freeIndex = firstArrayHole < effectiveMax ? firstArrayHole : null;
    } else if (occupied < effectiveMax) {
      freeIndex = occupied;
    }

    return { ids, count: occupied, hutchMax: effectiveMax, freeIndex };
  } catch (error) {
    log('[petTeams] hutch snapshot read failed', error);
    return { ids, count: 0, hutchMax: DEFAULT_HUTCH_CAPACITY, freeIndex: null };
  }
}

async function readInventoryIdSet(): Promise<Set<string>> {
  const result = new Set<string>();
  const snapshot = await readInventorySnapshot();
  snapshot.ids.forEach((id) => result.add(id));
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

async function waitForHutchContains(itemId: string, timeoutMs: number): Promise<boolean> {
  const expected = normalizeId(itemId);
  if (!expected) {
    return false;
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    const hutch = await readHutchSnapshot();
    if (hutch.ids.has(expected)) {
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

function isActiveTeamMatch(targetIds: string[]): boolean {
  if (!targetIds.length) {
    return false;
  }
  const active = getActiveSlotIds();
  const activeSet = new Set(active);
  if (!targetIds.every((id) => activeSet.has(id))) {
    return false;
  }
  return active.length <= targetIds.length;
}

async function waitForActiveTeamMatch(
  targetIds: string[],
  timeoutMs: number,
  pollIntervalMs = POLL_INTERVAL_MS,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    if (isActiveTeamMatch(targetIds)) {
      return true;
    }
    await delay(pollIntervalMs);
  }
  return false;
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

/**
 * Locate a pet across all known locations.
 * Returns 'active' | 'inventory' | 'hutch' | null.
 */
async function locatePet(petId: string): Promise<'active' | 'inventory' | 'hutch' | null> {
  const activeIds = new Set(getActiveSlotIds());
  if (activeIds.has(petId)) return 'active';

  const inventory = await readInventorySnapshot();
  if (inventory.ids.has(petId)) return 'inventory';

  const hutch = await readHutchSnapshot();
  if (hutch.ids.has(petId)) return 'hutch';

  return null;
}

let applyQueue: Promise<void> = Promise.resolve();

function enqueueApply<T>(task: () => Promise<T>): Promise<T> {
  const run = applyQueue.then(task, task);
  applyQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function applyTeamInternal(teamId: string): Promise<ApplyTeamResult> {
  const team = config.teams.find(t => t.id === teamId);
  if (!team) return { applied: 0, errors: ['Team not found'] };

  const targetIds: string[] = [];
  for (const slot of team.slots.slice(0, 3)) {
    if (slot && !targetIds.includes(slot)) {
      targetIds.push(slot);
    }
  }
  if (targetIds.length === 0) return { applied: 0, errors: ['Team has no pets configured'] };

  const currentSet = new Set(getActiveSlotIds());
  const targetSet = new Set(targetIds);
  if (targetIds.every((id) => currentSet.has(id)) && currentSet.size <= targetIds.length) {
    return { applied: 0, errors: [] };
  }

  const errors: string[] = [];
  const reasonCounts: Partial<Record<ApplyErrorReason, number>> = {};
  let applied = 0;

  const pushError = (reason: ApplyErrorReason, message: string): void => {
    errors.push(message);
    incrementReasonCount(reasonCounts, reason);
  };

  // Resolve player's garden slot index once — used by all PlacePet calls.
  const resolvedSlotIdx = await resolveMyUserSlotIdx();

  // Pre-validate: check that all target pets are locatable somewhere.
  const validTargetIds: string[] = [];
  for (const targetId of targetIds) {
    if (currentSet.has(targetId)) {
      validTargetIds.push(targetId);
      continue;
    }
    const location = await locatePet(targetId);
    if (location) {
      validTargetIds.push(targetId);
    } else {
      pushError('missing_source_pet', 'Pet not found in active/inventory/hutch: ' + targetId);
    }
  }

  if (validTargetIds.length === 0) {
    const errorSummary = buildErrorSummary(reasonCounts);
    return {
      applied: 0,
      errors,
      ...(Object.keys(reasonCounts).length > 0 ? { reasonCounts } : {}),
      ...(errorSummary ? { errorSummary } : {}),
    };
  }

  // Replace targetIds/targetSet with validated versions for the rest of the function.
  // (targetIds is used by closures below, so we reassign in-place isn't possible
  //  — instead shadow with const and update targetSet.)
  const validTargetSet = new Set(validTargetIds);

  const sendRetrieveFromHutch = (itemId: string, toInventoryIndex: number | null, skipThrottle = false) => {
    const payload: Record<string, unknown> = {
      itemId,
      storageId: PET_HUTCH_STORAGE_ID,
    };
    if (typeof toInventoryIndex === 'number' && Number.isFinite(toInventoryIndex) && toInventoryIndex >= 0) {
      payload.toInventoryIndex = toInventoryIndex;
    }
    return sendRoomAction(
      'RetrieveItemFromStorage',
      payload,
      skipThrottle ? { skipThrottle: true } : { throttleMs: 100 },
    );
  };

  const sendSwapPet = (petSlotId: string, petInventoryId: string, skipThrottle = false) =>
    sendRoomAction(
      'SwapPet',
      { petSlotId, petInventoryId },
      skipThrottle ? { skipThrottle: true } : { throttleMs: 100 },
    );

  // Track positions claimed during this apply to avoid placing two pets on the
  // same tile when the fast path fires multiple PlacePet messages at once.
  const claimedPositions = new Set<string>();

  const sendPlaceFromInventory = (itemId: string, skipThrottle = false) => {
    const tile = findEmptyGardenTile(claimedPositions, resolvedSlotIdx);
    const position = tile?.position ?? PLACE_PET_DEFAULTS.position;
    const tileType = tile?.tileType ?? PLACE_PET_DEFAULTS.tileType;
    const localTileIndex = tile?.localTileIndex ?? PLACE_PET_DEFAULTS.localTileIndex;

    if (tile) {
      claimedPositions.add(`${position.x},${position.y}`);
    }

    return sendRoomAction(
      'PlacePet',
      { itemId, position, tileType, localTileIndex },
      skipThrottle ? { skipThrottle: true } : { throttleMs: 100 },
    );
  };

  const sendPickupPet = (petId: string, skipThrottle = false) =>
    sendRoomAction(
      'PickupPet',
      { petId },
      skipThrottle ? { skipThrottle: true } : { throttleMs: 100 },
    );

  const sendPutItemInStorage = (itemId: string, toStorageIndex: number | null, skipThrottle = false) => {
    const payload: Record<string, unknown> = {
      itemId,
      storageId: PET_HUTCH_STORAGE_ID,
    };
    if (typeof toStorageIndex === 'number' && Number.isFinite(toStorageIndex) && toStorageIndex >= 0) {
      payload.toStorageIndex = toStorageIndex;
    }
    return sendRoomAction(
      'PutItemInStorage',
      payload,
      skipThrottle ? { skipThrottle: true } : { throttleMs: 100 },
    );
  };

  const finishApply = (): ApplyTeamResult => {
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
  };

  const placeFromInventoryWithConfirm = async (petId: string): Promise<boolean> => {
    const place = sendPlaceFromInventory(petId, false);
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
    return true;
  };

  const putInventoryPetInHutchWithConfirm = async (
    petId: string,
    reportErrors: boolean,
  ): Promise<boolean> => {
    const hutch = await readHutchSnapshot();
    if (hutch.count >= hutch.hutchMax && hutch.freeIndex == null) {
      if (reportErrors) {
        pushError('hutch_store_failed_or_full', 'Pet Hutch is full while storing ' + petId);
      }
      return false;
    }

    const store = sendPutItemInStorage(petId, hutch.freeIndex, false);
    if (!store.ok) {
      if (reportErrors) {
        pushError(
          mapSendReason(store.reason, 'hutch_store_failed_or_full'),
          'PutItemInStorage failed: ' + petId + ' (' + String(store.reason ?? 'unknown') + ')',
        );
      }
      return false;
    }

    const stored = await waitForHutchContains(petId, STORE_TIMEOUT_MS);
    if (!stored) {
      if (reportErrors) {
        pushError('store_failed_or_timeout', 'PutItemInStorage timed out: ' + petId);
      }
      return false;
    }
    return true;
  };

  const retrieveFromHutchWithConfirm = async (petId: string): Promise<boolean> => {
    const tryRetrieveOnce = async (): Promise<{ ok: boolean; reason?: WebSocketSendFailureReason }> => {
      const inventory = await readInventorySnapshot();
      const retrieve = sendRetrieveFromHutch(petId, inventory.freeIndex, false);
      if (!retrieve.ok) {
        return retrieve.reason ? { ok: false, reason: retrieve.reason } : { ok: false };
      }
      const retrieved = await waitForInventoryContains(petId, HUTCH_RETRIEVE_TIMEOUT_MS);
      return { ok: retrieved };
    };

    const first = await tryRetrieveOnce();
    if (first.ok) {
      return true;
    }

    const activeSet = new Set(getActiveSlotIds());
    const inventory = await readInventorySnapshot();
    const candidate = inventory.petIds.find((id) => !activeSet.has(id) && !validTargetSet.has(id));
    if (candidate) {
      await putInventoryPetInHutchWithConfirm(candidate, false);
      await delay(APPLY_STEP_DELAY_MS);
    }

    const second = await tryRetrieveOnce();
    if (second.ok) {
      return true;
    }

    pushError(
      mapSendReason(second.reason ?? first.reason, 'retrieve_failed_or_inventory_full'),
      'RetrieveItemFromStorage failed: ' + petId + ' (inventory may be full)',
    );
    return false;
  };

  const swapIntoActiveWithConfirm = async (
    targetId: string,
    outgoingActiveId: string,
  ): Promise<boolean> => {
    const swap = sendSwapPet(outgoingActiveId, targetId, false);
    if (!swap.ok) {
      pushError(
        mapSendReason(swap.reason, 'swap_failed_or_timeout'),
        'SwapPet failed: ' + outgoingActiveId + ' -> ' + targetId + ' (' + String(swap.reason ?? 'unknown') + ')',
      );
      return false;
    }
    const swapped = await waitForPetInActiveList(targetId, PLACE_TIMEOUT_MS);
    if (!swapped) {
      pushError('swap_failed_or_timeout', 'SwapPet timed out: ' + outgoingActiveId + ' -> ' + targetId);
      return false;
    }
    return true;
  };

  const applyTeamFastHutchPath = async (): Promise<boolean> => {
    const modeledActive = getActiveSlotIds();
    const modeledActiveSet = new Set(modeledActive);
    const pendingTargets = validTargetIds.filter((id) => !modeledActiveSet.has(id));
    if (pendingTargets.length === 0) {
      return modeledActive.every((id) => validTargetSet.has(id));
    }

    const inventory = await readInventorySnapshot();
    const hutch = await readHutchSnapshot();

    const modeledHutchIds = new Set(hutch.ids);
    const unavailableTargets = new Set<string>();
    let modeledInventoryIndex = inventory.freeIndex;
    let modeledHutchCount = hutch.count;
    let modeledHutchIndex = hutch.freeIndex;
    let fastOpsSent = 0;

    const retrieveTargets = pendingTargets.filter((targetId) => modeledHutchIds.has(targetId));
    for (const targetId of retrieveTargets) {
      const retrieve = sendRetrieveFromHutch(targetId, modeledInventoryIndex, true);
      if (!retrieve.ok) {
        unavailableTargets.add(targetId);
        continue;
      }
      fastOpsSent++;
      modeledHutchIds.delete(targetId);
      modeledHutchCount = Math.max(0, modeledHutchCount - 1);
      if (modeledHutchCount < hutch.hutchMax && modeledHutchIndex == null) {
        modeledHutchIndex = modeledHutchCount;
      }
      if (typeof modeledInventoryIndex === 'number') {
        modeledInventoryIndex += 1;
      }
    }

    const displacedPets: string[] = [];
    for (const targetId of pendingTargets) {
      if (modeledActiveSet.has(targetId) || unavailableTargets.has(targetId)) {
        continue;
      }

      const outgoingIndex = modeledActive.findIndex((id) => !validTargetSet.has(id));
      if (outgoingIndex >= 0) {
        const outgoing = modeledActive[outgoingIndex];
        if (!outgoing) {
          continue;
        }
        const swap = sendSwapPet(outgoing, targetId, true);
        if (!swap.ok) {
          continue;
        }
        fastOpsSent++;
        modeledActive[outgoingIndex] = targetId;
        modeledActiveSet.delete(outgoing);
        modeledActiveSet.add(targetId);
        displacedPets.push(outgoing);
        applied++;
      } else {
        const place = sendPlaceFromInventory(targetId, true);
        if (!place.ok) {
          continue;
        }
        fastOpsSent++;
        modeledActive.push(targetId);
        modeledActiveSet.add(targetId);
        applied++;
      }
    }

    for (const displacedId of displacedPets) {
      if (modeledHutchCount >= hutch.hutchMax && modeledHutchIndex == null) {
        continue;
      }
      const store = sendPutItemInStorage(displacedId, modeledHutchIndex, true);
      if (!store.ok) {
        continue;
      }
      fastOpsSent++;
      modeledHutchCount = Math.min(hutch.hutchMax, modeledHutchCount + 1);
      if (typeof modeledHutchIndex === 'number') {
        const next = modeledHutchIndex + 1;
        modeledHutchIndex = next < hutch.hutchMax ? next : null;
      } else if (modeledHutchCount < hutch.hutchMax) {
        modeledHutchIndex = modeledHutchCount;
      }
    }

    if (fastOpsSent === 0) {
      return false;
    }

    return waitForActiveTeamMatch(validTargetIds, FAST_PATH_SETTLE_TIMEOUT_MS, FAST_SETTLE_POLL_INTERVAL_MS);
  };

  const applyTeamRepairPass = async (): Promise<void> => {
    // Reset claimed positions — fast path tiles are stale after failure.
    claimedPositions.clear();

    let activeNow = getActiveSlotIds();
    let pendingTargets = validTargetIds.filter((id) => !activeNow.includes(id));

    for (const targetId of pendingTargets) {
      activeNow = getActiveSlotIds();
      if (activeNow.includes(targetId)) {
        continue;
      }

      // Verify pet is locatable before attempting placement
      const location = await locatePet(targetId);
      if (!location) {
        pushError('missing_source_pet', 'Pet not found during repair: ' + targetId);
        await delay(APPLY_STEP_DELAY_MS);
        continue;
      }

      if (location === 'active') {
        // Already active — skip
        continue;
      }

      if (location === 'hutch') {
        const retrieved = await retrieveFromHutchWithConfirm(targetId);
        if (!retrieved) {
          await delay(APPLY_STEP_DELAY_MS);
          continue;
        }
      } else if (location !== 'inventory') {
        // Unknown location — already handled as missing_source_pet above
        continue;
      }

      const outgoing = getActiveSlotIds().find((id) => !validTargetSet.has(id)) ?? null;
      if (outgoing) {
        const swapped = await swapIntoActiveWithConfirm(targetId, outgoing);
        if (swapped) {
          applied++;
          await putInventoryPetInHutchWithConfirm(outgoing, false);
        } else {
          const placed = await placeFromInventoryWithConfirm(targetId);
          if (placed) {
            applied++;
          }
        }
      } else {
        const placed = await placeFromInventoryWithConfirm(targetId);
        if (placed) {
          applied++;
        }
      }
      await delay(APPLY_STEP_DELAY_MS);
    }

    activeNow = getActiveSlotIds();
    const leftovers = activeNow.filter((id) => !validTargetSet.has(id));
    for (const extraId of leftovers) {
      const pickup = sendPickupPet(extraId, false);
      if (!pickup.ok) {
        pushError(
          mapSendReason(pickup.reason, 'hutch_store_failed_or_full'),
          'PickupPet failed: ' + extraId + ' (' + String(pickup.reason ?? 'unknown') + ')',
        );
        continue;
      }

      const picked = await waitForPetNotActive(extraId, STORE_TIMEOUT_MS);
      if (!picked) {
        pushError('store_failed_or_timeout', 'PickupPet timed out: ' + extraId);
        continue;
      }

      await putInventoryPetInHutchWithConfirm(extraId, true);
      applied++;
      await delay(APPLY_STEP_DELAY_MS);
    }
    await waitForActiveTeamMatch(validTargetIds, REPAIR_SETTLE_TIMEOUT_MS, FAST_SETTLE_POLL_INTERVAL_MS);
  };

  const fastSettled = await applyTeamFastHutchPath();
  if (!fastSettled) {
    await applyTeamRepairPass();
  }

  return finishApply();
}

export async function applyTeam(teamId: string): Promise<ApplyTeamResult> {
  return enqueueApply(() => applyTeamInternal(teamId));
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
