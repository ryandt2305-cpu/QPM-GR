// src/features/mutationValueTracking.ts
// Tracks gold/rainbow/crop boost generation rates per hour and session value.

import { getAbilityHistorySnapshot } from '../store/abilityLogs';
import { storage } from '../utils/storage';
import { debounce } from '../utils/helpers';

const STORAGE_KEY = 'qpm.mutationValueTracking.v1';
const SAVE_DEBOUNCE_MS = 3000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// Estimated values for high-value mutations/procs
const MUTATION_VALUES = {
  gold: 500000, // Avg gold crop value (conservative)
  rainbow: 1000000, // Avg rainbow crop value (conservative)
  cropBoost: 50000, // Avg value of a crop size boost proc
};

export interface MutationValueStats {
  // Gold mutations
  goldProcs: number;
  goldPerHour: number;
  goldTotalValue: number;
  goldLastProcAt: number | null;

  // Rainbow mutations
  rainbowProcs: number;
  rainbowPerHour: number;
  rainbowTotalValue: number;
  rainbowLastProcAt: number | null;

  // Crop size boosts
  cropBoostProcs: number;
  cropBoostPerHour: number;
  cropBoostTotalValue: number;
  cropBoostLastProcAt: number | null;

  // Session totals
  sessionValue: number; // Total value generated this session
  sessionStart: number;

  // Best sessions
  bestHourValue: number;
  bestHourTime: number | null;
  bestSessionValue: number;
  bestSessionTime: number | null;
}

export interface SessionHistory {
  date: string; // YYYY-MM-DD
  value: number;
  goldProcs: number;
  rainbowProcs: number;
  cropBoostProcs: number;
  duration: number; // milliseconds
}

export interface MutationValueSnapshot {
  stats: MutationValueStats;
  sessions: SessionHistory[];
  hourlyBreakdown: Map<number, number>; // Hour of day (0-23) -> avg value
  updatedAt: number;
}

interface PersistedStats {
  goldProcs: number;
  goldPerHour: number;
  goldTotalValue: number;
  goldLastProcAt: number | null;
  rainbowProcs: number;
  rainbowPerHour: number;
  rainbowTotalValue: number;
  rainbowLastProcAt: number | null;
  cropBoostProcs: number;
  cropBoostPerHour: number;
  cropBoostTotalValue: number;
  cropBoostLastProcAt: number | null;
  sessionValue: number;
  sessionStart: number;
  bestHourValue: number;
  bestHourTime: number | null;
  bestSessionValue: number;
  bestSessionTime: number | null;
}

interface PersistedSnapshot {
  version: number;
  stats: PersistedStats;
  sessions: SessionHistory[];
  updatedAt: number;
}

let snapshot: MutationValueSnapshot = {
  stats: {
    goldProcs: 0,
    goldPerHour: 0,
    goldTotalValue: 0,
    goldLastProcAt: null,
    rainbowProcs: 0,
    rainbowPerHour: 0,
    rainbowTotalValue: 0,
    rainbowLastProcAt: null,
    cropBoostProcs: 0,
    cropBoostPerHour: 0,
    cropBoostTotalValue: 0,
    cropBoostLastProcAt: null,
    sessionValue: 0,
    sessionStart: Date.now(),
    bestHourValue: 0,
    bestHourTime: null,
    bestSessionValue: 0,
    bestSessionTime: null,
  },
  sessions: [],
  hourlyBreakdown: new Map(),
  updatedAt: Date.now(),
};

let initialized = false;
const listeners = new Set<(snapshot: MutationValueSnapshot) => void>();

function countAbilityProcs(abilityId: string, since: number): {count: number, lastProcAt: number | null} {
  const historySnapshot = getAbilityHistorySnapshot();
  let count = 0;
  let lastProcAt: number | null = null;

  for (const history of historySnapshot.values()) {
    if (history.abilityId === abilityId) {
      const relevantEvents = history.events.filter(e => e.performedAt >= since);
      count += relevantEvents.length;

      if (relevantEvents.length > 0) {
        const latest = Math.max(...relevantEvents.map(e => e.performedAt));
        if (lastProcAt === null || latest > lastProcAt) {
          lastProcAt = latest;
        }
      }
    }
  }

  return { count, lastProcAt };
}

function recalculateStats(): void {
  const now = Date.now();
  const sessionStart = snapshot.stats.sessionStart;
  const duration = Math.max(1, now - sessionStart);
  const hours = duration / HOUR_MS;

  // Count gold granters
  const goldData = countAbilityProcs('GoldGranter', sessionStart);
  snapshot.stats.goldProcs = goldData.count;
  snapshot.stats.goldLastProcAt = goldData.lastProcAt;
  snapshot.stats.goldTotalValue = goldData.count * MUTATION_VALUES.gold;
  snapshot.stats.goldPerHour = hours > 0 ? goldData.count / hours : 0;

  // Count rainbow granters
  const rainbowData = countAbilityProcs('RainbowGranter', sessionStart);
  snapshot.stats.rainbowProcs = rainbowData.count;
  snapshot.stats.rainbowLastProcAt = rainbowData.lastProcAt;
  snapshot.stats.rainbowTotalValue = rainbowData.count * MUTATION_VALUES.rainbow;
  snapshot.stats.rainbowPerHour = hours > 0 ? rainbowData.count / hours : 0;

  // Count crop boosts
  const cropBoostData1 = countAbilityProcs('ProduceScaleBoost', sessionStart);
  const cropBoostData2 = countAbilityProcs('ProduceScaleBoostII', sessionStart);
  const totalCropBoosts = cropBoostData1.count + cropBoostData2.count;
  const lastCropBoost = cropBoostData1.lastProcAt && cropBoostData2.lastProcAt
    ? Math.max(cropBoostData1.lastProcAt, cropBoostData2.lastProcAt)
    : (cropBoostData1.lastProcAt || cropBoostData2.lastProcAt);

  snapshot.stats.cropBoostProcs = totalCropBoosts;
  snapshot.stats.cropBoostLastProcAt = lastCropBoost;
  snapshot.stats.cropBoostTotalValue = totalCropBoosts * MUTATION_VALUES.cropBoost;
  snapshot.stats.cropBoostPerHour = hours > 0 ? totalCropBoosts / hours : 0;

  // Calculate session value
  snapshot.stats.sessionValue =
    snapshot.stats.goldTotalValue +
    snapshot.stats.rainbowTotalValue +
    snapshot.stats.cropBoostTotalValue;

  // Calculate hourly breakdown
  calculateHourlyBreakdown();

  // Update best hour/session
  const currentHourValue = calculateCurrentHourValue(now);
  if (currentHourValue > snapshot.stats.bestHourValue) {
    snapshot.stats.bestHourValue = currentHourValue;
    snapshot.stats.bestHourTime = now;
  }

  if (snapshot.stats.sessionValue > snapshot.stats.bestSessionValue) {
    snapshot.stats.bestSessionValue = snapshot.stats.sessionValue;
    snapshot.stats.bestSessionTime = now;
  }

  snapshot.updatedAt = now;
  scheduleSave();
  notifyListeners();
}

function calculateCurrentHourValue(now: number): number {
  const oneHourAgo = now - HOUR_MS;
  const goldData = countAbilityProcs('GoldGranter', oneHourAgo);
  const rainbowData = countAbilityProcs('RainbowGranter', oneHourAgo);
  const cropBoostData1 = countAbilityProcs('ProduceScaleBoost', oneHourAgo);
  const cropBoostData2 = countAbilityProcs('ProduceScaleBoostII', oneHourAgo);

  return (
    goldData.count * MUTATION_VALUES.gold +
    rainbowData.count * MUTATION_VALUES.rainbow +
    (cropBoostData1.count + cropBoostData2.count) * MUTATION_VALUES.cropBoost
  );
}

function calculateHourlyBreakdown(): void {
  const hourlyTotals = new Map<number, {value: number, count: number}>();

  // This is a simplified version - in a real implementation, we'd track
  // historical proc times to calculate true hourly averages
  const historySnapshot = getAbilityHistorySnapshot();

  for (const history of historySnapshot.values()) {
    for (const event of history.events) {
      const hour = new Date(event.performedAt).getHours();

      let value = 0;
      if (history.abilityId === 'GoldGranter') {
        value = MUTATION_VALUES.gold;
      } else if (history.abilityId === 'RainbowGranter') {
        value = MUTATION_VALUES.rainbow;
      } else if (history.abilityId === 'ProduceScaleBoost' || history.abilityId === 'ProduceScaleBoostII') {
        value = MUTATION_VALUES.cropBoost;
      }

      if (value > 0) {
        const existing = hourlyTotals.get(hour) || { value: 0, count: 0 };
        existing.value += value;
        existing.count += 1;
        hourlyTotals.set(hour, existing);
      }
    }
  }

  // Calculate averages
  snapshot.hourlyBreakdown = new Map();
  for (const [hour, data] of hourlyTotals) {
    snapshot.hourlyBreakdown.set(hour, data.value / Math.max(1, data.count));
  }
}

function endCurrentSession(): void {
  const now = Date.now();
  const today = new Date(now).toISOString().split('T')[0]!;

  // Save current session
  if (snapshot.stats.sessionValue > 0 || snapshot.stats.goldProcs + snapshot.stats.rainbowProcs + snapshot.stats.cropBoostProcs > 0) {
    snapshot.sessions.push({
      date: today,
      value: snapshot.stats.sessionValue,
      goldProcs: snapshot.stats.goldProcs,
      rainbowProcs: snapshot.stats.rainbowProcs,
      cropBoostProcs: snapshot.stats.cropBoostProcs,
      duration: now - snapshot.stats.sessionStart,
    });

    // Keep only last 30 sessions
    if (snapshot.sessions.length > 30) {
      snapshot.sessions = snapshot.sessions.slice(-30);
    }
  }
}

const scheduleSave = debounce(() => {
  try {
    storage.set(STORAGE_KEY, serializeSnapshot());
  } catch (error) {
    console.error('[mutationValueTracking] Failed to save:', error);
  }
}, SAVE_DEBOUNCE_MS);

function serializeSnapshot(): PersistedSnapshot {
  return {
    version: 1,
    stats: {
      goldProcs: snapshot.stats.goldProcs,
      goldPerHour: snapshot.stats.goldPerHour,
      goldTotalValue: snapshot.stats.goldTotalValue,
      goldLastProcAt: snapshot.stats.goldLastProcAt,
      rainbowProcs: snapshot.stats.rainbowProcs,
      rainbowPerHour: snapshot.stats.rainbowPerHour,
      rainbowTotalValue: snapshot.stats.rainbowTotalValue,
      rainbowLastProcAt: snapshot.stats.rainbowLastProcAt,
      cropBoostProcs: snapshot.stats.cropBoostProcs,
      cropBoostPerHour: snapshot.stats.cropBoostPerHour,
      cropBoostTotalValue: snapshot.stats.cropBoostTotalValue,
      cropBoostLastProcAt: snapshot.stats.cropBoostLastProcAt,
      sessionValue: snapshot.stats.sessionValue,
      sessionStart: snapshot.stats.sessionStart,
      bestHourValue: snapshot.stats.bestHourValue,
      bestHourTime: snapshot.stats.bestHourTime,
      bestSessionValue: snapshot.stats.bestSessionValue,
      bestSessionTime: snapshot.stats.bestSessionTime,
    },
    sessions: snapshot.sessions,
    updatedAt: snapshot.updatedAt,
  };
}

function restoreSnapshot(persisted: PersistedSnapshot | null): void {
  if (!persisted || persisted.version !== 1) return;

  snapshot.stats = persisted.stats;
  snapshot.sessions = persisted.sessions;
  snapshot.updatedAt = persisted.updatedAt;
}

function notifyListeners(): void {
  for (const listener of listeners) {
    try {
      listener(snapshot);
    } catch (error) {
      console.error('[mutationValueTracking] Listener error:', error);
    }
  }
}

export function initializeMutationValueTracking(): void {
  if (initialized) return;
  initialized = true;

  try {
    const persisted = storage.get<PersistedSnapshot | null>(STORAGE_KEY, null);
    restoreSnapshot(persisted);
  } catch (error) {
    console.error('[mutationValueTracking] Failed to restore:', error);
  }

  // Recalculate on init
  recalculateStats();

  // Recalculate periodically (every 10 seconds)
  setInterval(() => {
    recalculateStats();
  }, 10000);
}

export function getMutationValueSnapshot(): MutationValueSnapshot {
  return {
    stats: { ...snapshot.stats },
    sessions: [...snapshot.sessions],
    hourlyBreakdown: new Map(snapshot.hourlyBreakdown),
    updatedAt: snapshot.updatedAt,
  };
}

export function subscribeToMutationValueTracking(
  listener: (snapshot: MutationValueSnapshot) => void
): () => void {
  listeners.add(listener);
  listener(getMutationValueSnapshot()); // Immediate callback
  return () => listeners.delete(listener);
}

export function forceRecalculateMutationValue(): void {
  recalculateStats();
}

export function resetMutationValueTracking(): void {
  endCurrentSession(); // Save current session before reset

  snapshot = {
    stats: {
      goldProcs: 0,
      goldPerHour: 0,
      goldTotalValue: 0,
      goldLastProcAt: null,
      rainbowProcs: 0,
      rainbowPerHour: 0,
      rainbowTotalValue: 0,
      rainbowLastProcAt: null,
      cropBoostProcs: 0,
      cropBoostPerHour: 0,
      cropBoostTotalValue: 0,
      cropBoostLastProcAt: null,
      sessionValue: 0,
      sessionStart: Date.now(),
      bestHourValue: snapshot.stats.bestHourValue, // Keep best records
      bestHourTime: snapshot.stats.bestHourTime,
      bestSessionValue: snapshot.stats.bestSessionValue,
      bestSessionTime: snapshot.stats.bestSessionTime,
    },
    sessions: snapshot.sessions,
    hourlyBreakdown: new Map(),
    updatedAt: Date.now(),
  };

  scheduleSave();
  notifyListeners();
}

export function getWeekTrend(): { current: number; previous: number; percentChange: number } {
  const now = Date.now();
  const currentWeekStart = now - (7 * DAY_MS);
  const previousWeekStart = currentWeekStart - (7 * DAY_MS);

  const currentWeekSessions = snapshot.sessions.filter(s => {
    const sessionTime = new Date(s.date).getTime();
    return sessionTime >= currentWeekStart && sessionTime < now;
  });

  const previousWeekSessions = snapshot.sessions.filter(s => {
    const sessionTime = new Date(s.date).getTime();
    return sessionTime >= previousWeekStart && sessionTime < currentWeekStart;
  });

  const currentValue = currentWeekSessions.reduce((sum, s) => sum + s.value, 0);
  const previousValue = previousWeekSessions.reduce((sum, s) => sum + s.value, 0);

  const percentChange = previousValue > 0
    ? ((currentValue - previousValue) / previousValue) * 100
    : 0;

  return {
    current: currentValue,
    previous: previousValue,
    percentChange,
  };
}
