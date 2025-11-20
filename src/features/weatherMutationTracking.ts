// src/features/weatherMutationTracking.ts
// Tracks weather mutation (Wet, Chilled, Frozen, Amberlit, Amberbound, Dawnlit, Dawnbound) generation rates and value.

import { getGardenSnapshot, onGardenSnapshot, type GardenSnapshot } from './gardenBridge';
import { getCropStats } from '../data/cropBaseStats';
import { BASE_MULTIPLIERS, COMBINED_MULTIPLIERS } from '../data/cropMultipliers';
import { storage } from '../utils/storage';
import { debounce } from '../utils/helpers';
import {
  computeSlotStateFromMutationNames,
  type PlantSlotState,
} from './mutationReminder';

const STORAGE_KEY = 'qpm.weatherMutationTracking.v1';
const SAVE_DEBOUNCE_MS = 3000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// Weather mutation types
export type WeatherMutationType = 'wet' | 'chilled' | 'frozen' | 'dawnlit' | 'dawnbound' | 'amberlit' | 'amberbound';

export interface WeatherMutationStats {
  // Wet mutations
  wetCount: number;
  wetPerHour: number;
  wetTotalValue: number;
  wetLastAt: number | null;

  // Chilled mutations
  chilledCount: number;
  chilledPerHour: number;
  chilledTotalValue: number;
  chilledLastAt: number | null;

  // Frozen mutations
  frozenCount: number;
  frozenPerHour: number;
  frozenTotalValue: number;
  frozenLastAt: number | null;

  // Dawnlit mutations
  dawnlitCount: number;
  dawnlitPerHour: number;
  dawnlitTotalValue: number;
  dawnlitLastAt: number | null;

  // Dawnbound mutations
  dawnboundCount: number;
  dawnboundPerHour: number;
  dawnboundTotalValue: number;
  dawnboundLastAt: number | null;

  // Amberlit mutations
  amberlitCount: number;
  amberlitPerHour: number;
  amberlitTotalValue: number;
  amberlitLastAt: number | null;

  // Amberbound mutations
  amberboundCount: number;
  amberboundPerHour: number;
  amberboundTotalValue: number;
  amberboundLastAt: number | null;

  // Session totals
  sessionValue: number;
  sessionStart: number;

  // Best records
  bestHourValue: number;
  bestHourTime: number | null;
  bestSessionValue: number;
  bestSessionTime: number | null;
}

export interface WeatherMutationSnapshot {
  stats: WeatherMutationStats;
  updatedAt: number;
}

interface PersistedSnapshot {
  version: number;
  stats: WeatherMutationStats;
  updatedAt: number;
  trackedSlots: Set<string>; // Track slot IDs to detect new mutations
}

interface CropSlot {
  tileId: string;
  slotIndex: number;
  cropName: string | null;
  mutations: string[];
  slotState: PlantSlotState;
}

let snapshot: WeatherMutationSnapshot = {
  stats: {
    wetCount: 0,
    wetPerHour: 0,
    wetTotalValue: 0,
    wetLastAt: null,
    chilledCount: 0,
    chilledPerHour: 0,
    chilledTotalValue: 0,
    chilledLastAt: null,
    frozenCount: 0,
    frozenPerHour: 0,
    frozenTotalValue: 0,
    frozenLastAt: null,
    dawnlitCount: 0,
    dawnlitPerHour: 0,
    dawnlitTotalValue: 0,
    dawnlitLastAt: null,
    dawnboundCount: 0,
    dawnboundPerHour: 0,
    dawnboundTotalValue: 0,
    dawnboundLastAt: null,
    amberlitCount: 0,
    amberlitPerHour: 0,
    amberlitTotalValue: 0,
    amberlitLastAt: null,
    amberboundCount: 0,
    amberboundPerHour: 0,
    amberboundTotalValue: 0,
    amberboundLastAt: null,
    sessionValue: 0,
    sessionStart: Date.now(),
    bestHourValue: 0,
    bestHourTime: null,
    bestSessionValue: 0,
    bestSessionTime: null,
  },
  updatedAt: Date.now(),
};

let trackedSlots = new Set<string>(); // Slot IDs we've already seen
let initialized = false;
const listeners = new Set<(snapshot: WeatherMutationSnapshot) => void>();
let gardenUnsubscribe: (() => void) | null = null;

function extractCropSlots(gardenSnapshot: GardenSnapshot | null): CropSlot[] {
  const slots: CropSlot[] = [];
  if (!gardenSnapshot) return slots;

  const areas: Array<{ tiles: Record<string, unknown> | null | undefined }> = [
    { tiles: gardenSnapshot.tileObjects as Record<string, unknown> | undefined },
    { tiles: gardenSnapshot.boardwalkTileObjects as Record<string, unknown> | undefined },
  ];

  for (const { tiles } of areas) {
    if (!tiles || typeof tiles !== 'object') continue;

    for (const [tileId, rawTile] of Object.entries(tiles)) {
      if (!rawTile || typeof rawTile !== 'object') continue;
      const tile = rawTile as Record<string, unknown>;
      if (tile.objectType !== 'plant') continue;

      const slotsRaw = Array.isArray(tile.slots) ? tile.slots : [];

      slotsRaw.forEach((slotRaw, slotIndex) => {
        if (!slotRaw || typeof slotRaw !== 'object') return;
        const slot = slotRaw as Record<string, unknown>;

        const mutationsRaw = Array.isArray(slot.mutations) ? slot.mutations : [];
        const mutations = (mutationsRaw as unknown[])
          .map((value) => (typeof value === 'string' ? value : null))
          .filter((value): value is string => !!value);

        if (mutations.length === 0) return; // No mutations

        // Extract crop name
        const cropName = readSlotSpecies(slot);
        const slotState = computeSlotStateFromMutationNames(mutations);

        slots.push({
          tileId,
          slotIndex,
          cropName,
          mutations,
          slotState,
        });
      });
    }
  }

  return slots;
}

function readSlotSpecies(slot: Record<string, unknown>): string | null {
  const candidates: unknown[] = [
    slot.species,
    slot.seedSpecies,
    slot.plantSpecies,
    slot.cropSpecies,
    slot.name,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string') {
      const trimmed = candidate.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
  }

  return null;
}

function calculateSlotValue(cropName: string | null, slotState: PlantSlotState): number {
  if (!cropName) return 0;

  const cropStats = getCropStats(cropName);
  if (!cropStats) return 0;

  // Determine mutation multiplier
  const hasGold = slotState.hasGold;
  const hasRainbow = slotState.hasRainbow;
  const hasFrozen = slotState.hasFrozen;
  const hasWet = slotState.hasWet;
  const hasChilled = slotState.hasChilled;
  const hasDawnlit = slotState.hasDawnlit;
  const hasDawnbound = slotState.hasDawnbound;
  const hasAmberlit = slotState.hasAmberlit;
  const hasAmberbound = slotState.hasAmberbound;

  // Build mutation key for combined multipliers
  const parts: string[] = [];
  if (hasRainbow) parts.push('rainbow');
  else if (hasGold) parts.push('golden');

  if (hasFrozen) parts.push('frozen');
  else if (hasChilled) parts.push('chilled');
  else if (hasWet) parts.push('wet');

  if (hasAmberbound) parts.push('amberbound');
  else if (hasAmberlit) parts.push('amberlit');

  if (hasDawnbound) parts.push('dawnbound');
  else if (hasDawnlit) parts.push('dawnlit');

  const mutationKey = parts.join('+');

  // Check for combined multiplier first
  let multiplier = COMBINED_MULTIPLIERS[mutationKey];

  if (!multiplier) {
    // Calculate from base multipliers
    multiplier = 1;
    if (hasRainbow) multiplier *= BASE_MULTIPLIERS.rainbow;
    else if (hasGold) multiplier *= BASE_MULTIPLIERS.golden;

    if (hasFrozen) multiplier *= BASE_MULTIPLIERS.frozen;
    else if (hasChilled) multiplier *= BASE_MULTIPLIERS.chilled;
    else if (hasWet) multiplier *= BASE_MULTIPLIERS.wet;

    if (hasAmberbound) multiplier *= BASE_MULTIPLIERS.amberbound;
    else if (hasAmberlit) multiplier *= BASE_MULTIPLIERS.amberlit;

    if (hasDawnbound) multiplier *= BASE_MULTIPLIERS.dawnbound;
    else if (hasDawnlit) multiplier *= BASE_MULTIPLIERS.dawnlit;
  }

  return cropStats.baseSellPrice * multiplier;
}

function processGardenUpdate(gardenSnapshot: GardenSnapshot | null): void {
  const now = Date.now();
  const slots = extractCropSlots(gardenSnapshot);

  // Track new mutations
  const currentSlotIds = new Set<string>();

  for (const slot of slots) {
    const slotId = `${slot.tileId}-${slot.slotIndex}`;
    currentSlotIds.add(slotId);

    // Check if this is a new slot or if it has new mutations
    const isNewSlot = !trackedSlots.has(slotId);

    if (isNewSlot) {
      trackedSlots.add(slotId);

      // Calculate the value this slot contributes
      const slotValue = calculateSlotValue(slot.cropName, slot.slotState);

      // Increment counters for each weather mutation present
      if (slot.slotState.hasWet) {
        snapshot.stats.wetCount++;
        snapshot.stats.wetLastAt = now;
        snapshot.stats.wetTotalValue += slotValue;
      }

      if (slot.slotState.hasChilled) {
        snapshot.stats.chilledCount++;
        snapshot.stats.chilledLastAt = now;
        snapshot.stats.chilledTotalValue += slotValue;
      }

      if (slot.slotState.hasFrozen) {
        snapshot.stats.frozenCount++;
        snapshot.stats.frozenLastAt = now;
        snapshot.stats.frozenTotalValue += slotValue;
      }

      if (slot.slotState.hasDawnlit) {
        snapshot.stats.dawnlitCount++;
        snapshot.stats.dawnlitLastAt = now;
        snapshot.stats.dawnlitTotalValue += slotValue;
      }

      if (slot.slotState.hasDawnbound) {
        snapshot.stats.dawnboundCount++;
        snapshot.stats.dawnboundLastAt = now;
        snapshot.stats.dawnboundTotalValue += slotValue;
      }

      if (slot.slotState.hasAmberlit) {
        snapshot.stats.amberlitCount++;
        snapshot.stats.amberlitLastAt = now;
        snapshot.stats.amberlitTotalValue += slotValue;
      }

      if (slot.slotState.hasAmberbound) {
        snapshot.stats.amberboundCount++;
        snapshot.stats.amberboundLastAt = now;
        snapshot.stats.amberboundTotalValue += slotValue;
      }
    }
  }

  // Remove tracked slots that no longer exist (harvested)
  for (const slotId of trackedSlots) {
    if (!currentSlotIds.has(slotId)) {
      trackedSlots.delete(slotId);
    }
  }

  recalculateRates();
}

function recalculateRates(): void {
  const now = Date.now();
  const sessionStart = snapshot.stats.sessionStart;
  const duration = Math.max(1, now - sessionStart);
  const hours = duration / HOUR_MS;

  // Calculate per-hour rates
  snapshot.stats.wetPerHour = hours > 0 ? snapshot.stats.wetCount / hours : 0;
  snapshot.stats.chilledPerHour = hours > 0 ? snapshot.stats.chilledCount / hours : 0;
  snapshot.stats.frozenPerHour = hours > 0 ? snapshot.stats.frozenCount / hours : 0;
  snapshot.stats.dawnlitPerHour = hours > 0 ? snapshot.stats.dawnlitCount / hours : 0;
  snapshot.stats.dawnboundPerHour = hours > 0 ? snapshot.stats.dawnboundCount / hours : 0;
  snapshot.stats.amberlitPerHour = hours > 0 ? snapshot.stats.amberlitCount / hours : 0;
  snapshot.stats.amberboundPerHour = hours > 0 ? snapshot.stats.amberboundCount / hours : 0;

  // Calculate session value
  snapshot.stats.sessionValue =
    snapshot.stats.wetTotalValue +
    snapshot.stats.chilledTotalValue +
    snapshot.stats.frozenTotalValue +
    snapshot.stats.dawnlitTotalValue +
    snapshot.stats.dawnboundTotalValue +
    snapshot.stats.amberlitTotalValue +
    snapshot.stats.amberboundTotalValue;

  // Update best records
  if (snapshot.stats.sessionValue > snapshot.stats.bestSessionValue) {
    snapshot.stats.bestSessionValue = snapshot.stats.sessionValue;
    snapshot.stats.bestSessionTime = now;
  }

  snapshot.updatedAt = now;
  scheduleSave();
  notifyListeners();
}

const scheduleSave = debounce(() => {
  try {
    storage.set(STORAGE_KEY, serializeSnapshot());
  } catch (error) {
    console.error('[weatherMutationTracking] Failed to save:', error);
  }
}, SAVE_DEBOUNCE_MS);

function serializeSnapshot(): PersistedSnapshot {
  return {
    version: 1,
    stats: { ...snapshot.stats },
    updatedAt: snapshot.updatedAt,
    trackedSlots,
  };
}

function restoreSnapshot(persisted: PersistedSnapshot | null): void {
  if (!persisted || persisted.version !== 1) return;

  // Only restore best records from previous sessions
  // Reset all counts and session data for current session
  snapshot.stats.bestHourValue = persisted.stats.bestHourValue || 0;
  snapshot.stats.bestHourTime = persisted.stats.bestHourTime || null;
  snapshot.stats.bestSessionValue = persisted.stats.bestSessionValue || 0;
  snapshot.stats.bestSessionTime = persisted.stats.bestSessionTime || null;

  // Reset session start to now (current session only)
  snapshot.stats.sessionStart = Date.now();
  snapshot.updatedAt = Date.now();

  // Do NOT restore trackedSlots - start fresh for new session
  trackedSlots = new Set();
}

function notifyListeners(): void {
  for (const listener of listeners) {
    try {
      listener(snapshot);
    } catch (error) {
      console.error('[weatherMutationTracking] Listener error:', error);
    }
  }
}

export function initializeWeatherMutationTracking(): void {
  if (initialized) return;
  initialized = true;

  try {
    const persisted = storage.get<PersistedSnapshot | null>(STORAGE_KEY, null);
    restoreSnapshot(persisted);
    console.log('[QPM] 🔄 Weather mutation tracking initialized - session data reset, tracking only current session');
  } catch (error) {
    console.error('[weatherMutationTracking] Failed to restore:', error);
  }

  // Subscribe to garden updates
  gardenUnsubscribe = onGardenSnapshot((gardenSnapshot) => {
    processGardenUpdate(gardenSnapshot);
  }, true);

  // Recalculate periodically (every 10 seconds)
  setInterval(() => {
    recalculateRates();
  }, 10000);
}

export function clearAllWeatherMutationHistory(): void {
  // Completely wipe all stored data
  try {
    storage.remove(STORAGE_KEY);
    console.log('[QPM] 🗑️ All weather mutation history cleared from storage');
  } catch (error) {
    console.error('[weatherMutationTracking] Failed to clear storage:', error);
  }

  // Reset in-memory snapshot to defaults
  snapshot = {
    stats: {
      wetCount: 0,
      wetPerHour: 0,
      wetTotalValue: 0,
      wetLastAt: null,
      chilledCount: 0,
      chilledPerHour: 0,
      chilledTotalValue: 0,
      chilledLastAt: null,
      frozenCount: 0,
      frozenPerHour: 0,
      frozenTotalValue: 0,
      frozenLastAt: null,
      dawnlitCount: 0,
      dawnlitPerHour: 0,
      dawnlitTotalValue: 0,
      dawnlitLastAt: null,
      dawnboundCount: 0,
      dawnboundPerHour: 0,
      dawnboundTotalValue: 0,
      dawnboundLastAt: null,
      amberlitCount: 0,
      amberlitPerHour: 0,
      amberlitTotalValue: 0,
      amberlitLastAt: null,
      amberboundCount: 0,
      amberboundPerHour: 0,
      amberboundTotalValue: 0,
      amberboundLastAt: null,
      sessionValue: 0,
      sessionStart: Date.now(),
      bestHourValue: 0,
      bestHourTime: null,
      bestSessionValue: 0,
      bestSessionTime: null,
    },
    updatedAt: Date.now(),
  };

  trackedSlots = new Set();
  notifyListeners();
}

export function getWeatherMutationSnapshot(): WeatherMutationSnapshot {
  return {
    stats: { ...snapshot.stats },
    updatedAt: snapshot.updatedAt,
  };
}

export function subscribeToWeatherMutationTracking(
  listener: (snapshot: WeatherMutationSnapshot) => void
): () => void {
  listeners.add(listener);
  listener(getWeatherMutationSnapshot()); // Immediate callback
  return () => listeners.delete(listener);
}

export function forceRecalculateWeatherMutations(): void {
  const gardenSnapshot = getGardenSnapshot();
  processGardenUpdate(gardenSnapshot);
}

export function resetWeatherMutationTracking(): void {
  snapshot = {
    stats: {
      wetCount: 0,
      wetPerHour: 0,
      wetTotalValue: 0,
      wetLastAt: null,
      chilledCount: 0,
      chilledPerHour: 0,
      chilledTotalValue: 0,
      chilledLastAt: null,
      frozenCount: 0,
      frozenPerHour: 0,
      frozenTotalValue: 0,
      frozenLastAt: null,
      dawnlitCount: 0,
      dawnlitPerHour: 0,
      dawnlitTotalValue: 0,
      dawnlitLastAt: null,
      dawnboundCount: 0,
      dawnboundPerHour: 0,
      dawnboundTotalValue: 0,
      dawnboundLastAt: null,
      amberlitCount: 0,
      amberlitPerHour: 0,
      amberlitTotalValue: 0,
      amberlitLastAt: null,
      amberboundCount: 0,
      amberboundPerHour: 0,
      amberboundTotalValue: 0,
      amberboundLastAt: null,
      sessionValue: 0,
      sessionStart: Date.now(),
      bestHourValue: snapshot.stats.bestHourValue, // Keep best records
      bestHourTime: snapshot.stats.bestHourTime,
      bestSessionValue: snapshot.stats.bestSessionValue,
      bestSessionTime: snapshot.stats.bestSessionTime,
    },
    updatedAt: Date.now(),
  };

  // CRITICAL FIX: Re-populate trackedSlots with current garden state
  // This prevents existing crops from being counted as "new" after reset
  trackedSlots = new Set();
  const currentGarden = getGardenSnapshot();
  const currentSlots = extractCropSlots(currentGarden);

  // Mark all current slots as "already seen" without counting them
  for (const slot of currentSlots) {
    const slotId = `${slot.tileId}-${slot.slotIndex}`;
    trackedSlots.add(slotId);
  }

  // Immediately save (don't wait for debounce)
  try {
    storage.set(STORAGE_KEY, serializeSnapshot());
  } catch (error) {
    console.error('[weatherMutationTracking] Failed to save after reset:', error);
  }

  notifyListeners();
  console.log(`[QPM] 🔄 Weather mutation tracking reset - ${trackedSlots.size} existing slots marked as seen`);
}
