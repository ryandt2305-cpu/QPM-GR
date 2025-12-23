// src/store/pets.ts
// Bridge for active pet information via myPetInfosAtom.

import { getAtomByLabel, subscribeAtom } from '../core/jotaiBridge';
import { getHungerCapForSpecies, DEFAULT_HUNGER_CAP } from '../data/petHungerCaps';
import { log } from '../utils/logger';
import { recordPetXP, estimatePetLevel } from './petLevelCalculator';

export interface ActivePetInfo {
  slotIndex: number;
  slotId: string | null;
  petId: string | null;
  hungerPct: number | null;
  hungerValue: number | null;
  hungerMax: number | null;
  hungerRaw: string | null;
  name: string | null;
  species: string | null;
  targetScale: number | null;
  mutations: string[];
  abilities: string[];
  xp: number | null;
  level: number | null;
  levelRaw: string | null;
  strength: number | null;
  position: { x: number | null; y: number | null } | null;
  updatedAt: number;
  raw: unknown;
}

type RawPetSlot = Record<string, unknown>;

type RawPetInfo = Record<string, unknown> & {
  slot?: RawPetSlot;
};

const PET_INFOS_LABEL = 'myPetInfosAtom';
const PET_INFOS_RETRY_DELAY_MS = 1500;

let cachedInfos: ActivePetInfo[] = [];
let unsubscribe: (() => void) | null = null;
let initializing = false;
const listeners = new Set<(infos: ActivePetInfo[]) => void>();
let retryTimer: number | null = null;

function notify(): void {
  for (const listener of listeners) {
    try {
      listener(cachedInfos);
    } catch (error) {
      log('⚠️ Pet info listener threw', error);
    }
  }
}

/**
 * Manually trigger a refresh notification to all listeners.
 * Used when sprites become ready to refresh UI that depends on pet info.
 */
export function refreshPetInfoListeners(): void {
  notify();
}

function clearStartRetry(): void {
  if (retryTimer != null) {
    window.clearTimeout(retryTimer);
    retryTimer = null;
  }
}

function scheduleStartRetry(): void {
  if (retryTimer != null) {
    return;
  }
  retryTimer = window.setTimeout(() => {
    retryTimer = null;
    if (!unsubscribe) {
      void startPetInfoStore();
    }
  }, PET_INFOS_RETRY_DELAY_MS);
}

function parseNumeric(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const match = value.match(/-?\d+(?:\.\d+)?/);
    if (!match) return null;
    const parsed = Number(match[0]);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value === 'object') {
    return parseNumeric((value as Record<string, unknown>)?.valueOf?.());
  }
  return null;
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (value < 0) {
    return 0;
  }
  if (value > 100) {
    return 100;
  }
  return value;
}

function normalizePercentCandidate(value: number, allowBasisPoint = false): number | null {
  if (!Number.isFinite(value)) {
    return null;
  }
  if (value < 0) {
    return 0;
  }
  if (value > 0 && value <= 1) {
    return value * 100;
  }
  if (value >= 0 && value <= 100) {
    return value;
  }
  if (allowBasisPoint && value > 100 && value <= 10000) {
    const scaled = value / 100;
    if (scaled <= 100) {
      return scaled;
    }
  }
  return null;
}

interface HungerResolution {
  pct: number | null;
  value: number | null;
  max: number | null;
  raw: string | null;
}

function resolveHunger(
  entry: RawPetInfo,
  slot: RawPetSlot,
  stats: RawPetSlot | undefined,
  species: string | null,
): HungerResolution {
  const nested = (slot.pet as RawPetSlot | undefined) ?? (entry.pet as RawPetSlot | undefined) ?? null;
  const sources: { value: unknown; hint: string }[] = [
    { value: entry.hungerPct, hint: 'entry.hungerPct' },
    { value: entry.hunger_percentage, hint: 'entry.hunger_percentage' },
    { value: (entry as RawPetSlot).hunger, hint: 'entry.hunger' },
    { value: slot.hungerPct, hint: 'slot.hungerPct' },
    { value: slot.hunger_percentage, hint: 'slot.hunger_percentage' },
    { value: slot.hunger, hint: 'slot.hunger' },
    { value: stats?.hungerPct, hint: 'stats.hungerPct' },
    { value: stats?.hunger, hint: 'stats.hunger' },
    { value: nested?.hungerPct, hint: 'nested.hungerPct' },
    { value: nested?.hunger, hint: 'nested.hunger' },
  ];

  let firstRaw: string | null = null;
  const pctCandidates: number[] = [];
  const rawCandidates: number[] = [];

  for (const { value, hint } of sources) {
    if (value == null) {
      continue;
    }
    if (firstRaw == null) {
      firstRaw = String(value);
    }
    const numeric = parseNumeric(value);
    if (numeric == null) {
      continue;
    }

    const allowBasisPoint = /pct|percent/i.test(hint);
    const normalizedPct = normalizePercentCandidate(numeric, allowBasisPoint);
    if (normalizedPct != null && (allowBasisPoint || numeric <= 100)) {
      pctCandidates.push(normalizedPct);
      continue;
    }

    rawCandidates.push(numeric);
  }

  const rawCandidate = rawCandidates.length > 0 ? rawCandidates[0]! : null;
  const maxFromData = species ? getHungerCapForSpecies(species) : null;

  if (pctCandidates.length) {
    const pctCandidate = pctCandidates[0]!;
    return {
      pct: clampPercent(pctCandidate),
      value: rawCandidate,
      max: maxFromData,
      raw: firstRaw,
    };
  }

  if (rawCandidate != null) {
    if (maxFromData != null && maxFromData > 0) {
      const pct = clampPercent((rawCandidate / maxFromData) * 100);
      return {
        pct,
        value: rawCandidate,
        max: maxFromData,
        raw: firstRaw,
      };
    }

    if (rawCandidate > 0) {
      const pct = clampPercent((rawCandidate / DEFAULT_HUNGER_CAP) * 100);
      return {
        pct,
        value: rawCandidate,
        max: DEFAULT_HUNGER_CAP,
        raw: firstRaw,
      };
    }

    return {
      pct: 0,
      value: rawCandidate,
      max: maxFromData,
      raw: firstRaw,
    };
  }

  return {
    pct: null,
    value: null,
    max: maxFromData,
    raw: firstRaw,
  };
}

function coerceSlotIndex(entry: RawPetInfo, fallbackIndex: number): number {
  const candidates: unknown[] = [
    entry.slotIndex,
    (entry.slot as Record<string, unknown> | undefined)?.slotIndex,
    entry.order,
    entry.index,
    (entry.slot as Record<string, unknown> | undefined)?.index,
    (entry.slot as Record<string, unknown> | undefined)?.originalIndex,
    (entry.slot as Record<string, unknown> | undefined)?.orderedIndex,
    fallbackIndex,
  ];

  for (const candidate of candidates) {
    const numeric = parseNumeric(candidate);
    if (numeric != null && Number.isFinite(numeric)) {
      return Math.max(0, Math.round(numeric));
    }
  }
  return fallbackIndex;
}

function extractName(entry: RawPetInfo): string | null {
  const slot = (entry.slot as Record<string, unknown> | undefined) ?? {};
  const candidates = [entry.name, entry.displayName, slot.name, slot.displayName];
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function extractSpecies(entry: RawPetInfo): string | null {
  const slot = (entry.slot as Record<string, unknown> | undefined) ?? {};
  const candidates = [
    entry.species,
    slot.species,
    slot.petSpecies,
    entry.petSpecies,
  ];
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function toEntryArray(value: unknown): RawPetInfo[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.filter((entry): entry is RawPetInfo => !!entry && typeof entry === 'object');
  }
  if (value instanceof Map) {
    return Array.from(value.values()).filter((entry): entry is RawPetInfo => !!entry && typeof entry === 'object');
  }
  if (value instanceof Set) {
    return Array.from(value.values()).filter((entry): entry is RawPetInfo => !!entry && typeof entry === 'object');
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const numericEntries: RawPetInfo[] = [];
    for (const [key, val] of Object.entries(record)) {
      if (/^\d+$/.test(key) && val && typeof val === 'object') {
        numericEntries.push(val as RawPetInfo);
      }
    }
    if (numericEntries.length) {
      return numericEntries;
    }
  }
  return [];
}

function extractPetInfoEntries(raw: unknown): RawPetInfo[] {
  const queue: unknown[] = [raw];
  const seen = new Set<unknown>();
  while (queue.length) {
    const current = queue.shift();
    if (current == null) {
      continue;
    }

    const direct = toEntryArray(current);
    if (direct.length) {
      return direct;
    }

    if (typeof current === 'object') {
      if (seen.has(current)) {
        continue;
      }
      seen.add(current);

      if (current instanceof Map) {
        for (const value of current.values()) {
          queue.push(value);
        }
        continue;
      }

      if (current instanceof Set) {
        for (const value of current.values()) {
          queue.push(value);
        }
        continue;
      }

      const record = current as Record<string, unknown>;
      for (const value of Object.values(record)) {
        queue.push(value);
      }
    }
  }
  return [];
}

function getSlotRecord(entry: RawPetInfo): RawPetSlot {
  const slot = entry.slot;
  if (slot && typeof slot === 'object') {
    return slot as RawPetSlot;
  }
  return entry as RawPetSlot;
}

function coerceString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(value);
  }
  return result;
}

function toStringList(value: unknown): string[] {
  if (!value) return [];
  if (typeof value === 'string') {
    const coerced = coerceString(value);
    return coerced ? [coerced] : [];
  }
  if (Array.isArray(value)) {
    const result: string[] = [];
    for (const entry of value) {
      const coerced = coerceString(entry);
      if (coerced) {
        result.push(coerced);
      }
    }
    return result;
  }
  if (value instanceof Set) {
    return toStringList(Array.from(value.values()));
  }
  return [];
}

function extractSlotId(entry: RawPetInfo): string | null {
  const slot = getSlotRecord(entry);
  const nested = (slot.pet as RawPetSlot | undefined) ?? (entry.pet as RawPetSlot | undefined) ?? null;
  const candidates: unknown[] = [
    entry.slotId,
    slot.slotId,
    slot.slotID,
    slot.id,
    nested?.slotId,
    nested?.id,
    entry.id,
  ];
  for (const candidate of candidates) {
    const value = coerceString(candidate);
    if (value) {
      return value;
    }
  }
  return null;
}

function extractPetId(entry: RawPetInfo): string | null {
  const slot = getSlotRecord(entry);
  const nested = (slot.pet as RawPetSlot | undefined) ?? (entry.pet as RawPetSlot | undefined) ?? null;
  const candidates: unknown[] = [
    entry.petId,
    slot.petId,
    nested?.petId,
    nested?.id,
    slot.id,
    entry.entityId,
  ];
  for (const candidate of candidates) {
    const value = coerceString(candidate);
    if (value) {
      return value;
    }
  }
  return extractSlotId(entry);
}

function extractMutations(entry: RawPetInfo): string[] {
  const slot = getSlotRecord(entry);
  const nested = (slot.pet as RawPetSlot | undefined) ?? (entry.pet as RawPetSlot | undefined) ?? null;
  const combined = [
    ...toStringList(entry.mutations),
    ...toStringList(slot.mutations),
    ...toStringList(nested?.mutations),
  ];
  return dedupeStrings(combined);
}

function extractAbilities(entry: RawPetInfo): string[] {
  const slot = getSlotRecord(entry);
  const nested = (slot.pet as RawPetSlot | undefined) ?? (entry.pet as RawPetSlot | undefined) ?? null;
  const combined = [
    ...toStringList(entry.abilities),
    ...toStringList(slot.abilities),
    ...toStringList(slot.ability),
    ...toStringList(nested?.abilities),
  ];
  return dedupeStrings(combined);
}

function extractPosition(entry: RawPetInfo): { x: number | null; y: number | null } | null {
  const slot = getSlotRecord(entry);
  const candidates = [entry.position, entry.pos, slot.position, slot.pos];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') {
      continue;
    }
    const record = candidate as Record<string, unknown>;
    const x = parseNumeric(record.x ?? record.X ?? record.left ?? record.posX ?? record.longitude);
    const y = parseNumeric(record.y ?? record.Y ?? record.top ?? record.posY ?? record.latitude);
    if (x != null || y != null) {
      return { x: x ?? null, y: y ?? null };
    }
  }
  return null;
}

function extractStrengthFromDOM(): number[] {
  const strengthValues: number[] = [];

  try {
    // Look for <p class="chakra-text css-1jrst1o"> elements with "STR XX" pattern
    const strElements = document.querySelectorAll('p.chakra-text.css-1jrst1o');

    for (const el of strElements) {
      const text = el.textContent || '';
      const match = text.match(/\bSTR\s+(\d+)\b/i);

      if (match && match[1]) {
        const strength = parseInt(match[1], 10);
        if (!strengthValues.includes(strength)) {
          strengthValues.push(strength);
        }
      }
    }
  } catch (error) {
    // Silently fail if DOM extraction doesn't work
  }

  return strengthValues;
}

function normalizePetInfos(raw: unknown): ActivePetInfo[] {
  const entries = extractPetInfoEntries(raw);
  if (!entries.length) {
    return [];
  }

  const now = Date.now();
  const infos: ActivePetInfo[] = [];

  // Extract strength values from DOM as fallback
  const domStrengthValues = extractStrengthFromDOM();

  entries.forEach((entry, idx) => {
    if (!entry || typeof entry !== 'object') {
      return;
    }
    const rawInfo = entry as RawPetInfo;
    const slot = getSlotRecord(rawInfo);
    const stats = (slot.stats as RawPetSlot | undefined) ?? undefined;
    const nestedPet = (slot.pet as RawPetSlot | undefined) ?? (rawInfo.pet as RawPetSlot | undefined) ?? undefined;
    const slotIndex = coerceSlotIndex(rawInfo, idx);

    const species = extractSpecies(rawInfo);
    const hunger = resolveHunger(rawInfo, slot, stats, species);

    const xpCandidates = [slot.xp, stats?.xp, rawInfo.xp];
    let xp: number | null = null;
    for (const candidate of xpCandidates) {
      const parsed = parseNumeric(candidate);
      if (parsed != null) {
        xp = parsed;
        break;
      }
    }

    const levelCandidates = [slot.level, stats?.level, rawInfo.level, nestedPet?.level];
    let level: number | null = null;
    let levelRaw: string | null = null;
    for (const candidate of levelCandidates) {
      if (candidate != null && levelRaw == null) {
        levelRaw = typeof candidate === 'string' ? candidate : String(candidate);
      }
      const parsed = parseNumeric(candidate);
      if (parsed != null) {
        level = Math.max(0, Math.round(parsed));
        break;
      }
    }

    const strengthCandidates = [slot.strength, stats?.strength, rawInfo.strength];
    let strength: number | null = null;
    for (const candidate of strengthCandidates) {
      const parsed = parseNumeric(candidate);
      if (parsed != null) {
        strength = parsed;
        break;
      }
    }

    // Fallback: extract strength from DOM if not in Jotai data
    if (strength == null && slotIndex < domStrengthValues.length) {
      strength = domStrengthValues[slotIndex] ?? null;
    }

    const targetScaleCandidates = [
      slot.targetScale,
      stats?.targetScale,
      rawInfo.targetScale,
      nestedPet?.targetScale,
    ];
    let targetScale: number | null = null;
    for (const candidate of targetScaleCandidates) {
      const parsed = parseNumeric(candidate);
      if (parsed != null) {
        targetScale = parsed;
        break;
      }
    }

    const petInfo: ActivePetInfo = {
      slotIndex,
      slotId: extractSlotId(rawInfo),
      petId: extractPetId(rawInfo),
      hungerPct: hunger.pct,
      hungerValue: hunger.value,
      hungerMax: hunger.max,
      hungerRaw: hunger.raw,
      name: extractName(rawInfo),
      species,
      targetScale,
      mutations: extractMutations(rawInfo),
      abilities: extractAbilities(rawInfo),
      xp,
      level,
      levelRaw,
      strength,
      position: extractPosition(rawInfo),
      updatedAt: now,
      raw: entry,
    };

    // Calculate level from XP if not available from Jotai
    if (petInfo.level == null && petInfo.xp != null && petInfo.petId) {
      // Record XP for rate tracking
      recordPetXP(petInfo);

      // Estimate level from XP gain rate
      const levelEstimate = estimatePetLevel(petInfo);
      if (levelEstimate.currentLevel != null) {
        petInfo.level = levelEstimate.currentLevel;
      }
    }

    infos.push(petInfo);
  });

  return infos.sort((a, b) => a.slotIndex - b.slotIndex);
}

export async function startPetInfoStore(): Promise<void> {
  if (unsubscribe || initializing) return;
  initializing = true;
  try {
    const atom = getAtomByLabel(PET_INFOS_LABEL);
    if (!atom) {
      throw new Error('myPetInfosAtom not found in jotai cache');
    }
    unsubscribe = await subscribeAtom(atom, (value) => {
      cachedInfos = normalizePetInfos(value);
      notify();
    });
    clearStartRetry();
  } catch (error) {
    log('⚠️ Failed to start pet info store', error);
    scheduleStartRetry();
  } finally {
    initializing = false;
  }
}

export function stopPetInfoStore(): void {
  try {
    unsubscribe?.();
  } catch {
    // noop
  }
  unsubscribe = null;
  cachedInfos = [];
  clearStartRetry();
}

/**
 * Debug function to get current active pet data
 * Can be called from browser console via window.QPM.debugPets()
 */
export function getActivePetsDebug(): ActivePetInfo[] {
  return cachedInfos;
}

export function getActivePetInfos(): ActivePetInfo[] {
  return cachedInfos;
}

export function onActivePetInfos(
  callback: (infos: ActivePetInfo[]) => void,
  fireImmediately = true,
): () => void {
  listeners.add(callback);
  if (fireImmediately) {
    try {
      callback(cachedInfos);
    } catch (error) {
      log('⚠️ Pet info immediate callback failed', error);
    }
  }
  return () => {
    listeners.delete(callback);
  };
}
