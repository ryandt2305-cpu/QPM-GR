// src/features/procRateAnalytics.ts
// Analyzes ability proc rates to identify trends, streaks, and variance from expected rates.

import { getAbilityHistorySnapshot, type AbilityHistory } from '../store/abilityLogs';
import { getActivePetsDebug } from '../store/pets';
import { abilityDefinitions, type AbilityDefinition } from '../data/petAbilities';
import { storage } from '../utils/storage';
import { debounce } from '../utils/helpers';

const STORAGE_KEY = 'qpm.procRateAnalytics.v1';
const SAVE_DEBOUNCE_MS = 3000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// Strength multiplier formula (from QPM_DEVELOPMENT_GUIDE.md)
const STRENGTH_BASELINE = 100;
const STRENGTH_DIVISOR = 200;
const MIN_MULTIPLIER = 0.25;
const MAX_CHANCE = 0.95;

export interface ProcStreak {
  type: 'hot' | 'cold';
  startTime: number;
  endTime: number;
  procCount: number;
  expectedProcs: number;
  variance: number; // % deviation from expected
  duration: number; // milliseconds
}

export interface AbilityProcRateStats {
  abilityId: string;
  abilityName: string;
  totalProcs: number;
  firstProcAt: number | null;
  lastProcAt: number | null;

  // Historical rates
  procsPerHour: number;
  procsPerDay: number;

  // Expected vs actual
  expectedProcsPerHour: number;
  variance: number; // % deviation from expected

  // Time between procs
  avgTimeBetweenProcs: number; // milliseconds
  minTimeBetweenProcs: number;
  maxTimeBetweenProcs: number;

  // Streaks
  currentStreak: ProcStreak | null;
  hotStreaks: ProcStreak[];
  coldStreaks: ProcStreak[];

  // Recent performance (last hour)
  recentProcs: number;
  recentVariance: number;
}

export interface ProcRateSnapshot {
  abilities: Map<string, AbilityProcRateStats>;
  updatedAt: number;
  sessionStart: number;
}

interface PersistedStreak {
  type: 'hot' | 'cold';
  startTime: number;
  endTime: number;
  procCount: number;
  expectedProcs: number;
  variance: number;
  duration: number;
}

interface PersistedAbilityStats {
  abilityId: string;
  abilityName: string;
  totalProcs: number;
  firstProcAt: number | null;
  lastProcAt: number | null;
  procsPerHour: number;
  procsPerDay: number;
  expectedProcsPerHour: number;
  variance: number;
  avgTimeBetweenProcs: number;
  minTimeBetweenProcs: number;
  maxTimeBetweenProcs: number;
  currentStreak: PersistedStreak | null;
  hotStreaks: PersistedStreak[];
  coldStreaks: PersistedStreak[];
  recentProcs: number;
  recentVariance: number;
}

interface PersistedSnapshot {
  version: number;
  abilities: PersistedAbilityStats[];
  updatedAt: number;
  sessionStart: number;
}

let snapshot: ProcRateSnapshot = {
  abilities: new Map(),
  updatedAt: Date.now(),
  sessionStart: Date.now(),
};

let initialized = false;
const listeners = new Set<(snapshot: ProcRateSnapshot) => void>();

function computeAbilityMultiplier(strength: number): number {
  const delta = strength - STRENGTH_BASELINE;
  return Math.max(MIN_MULTIPLIER, 1 + delta / STRENGTH_DIVISOR);
}

function computeChancePerRoll(baseProbability: number, strength: number): number {
  const multiplier = computeAbilityMultiplier(strength);
  const baseChance = baseProbability / 100;
  return Math.min(MAX_CHANCE, baseChance * multiplier);
}

function findAbilityDefinition(abilityId: string): AbilityDefinition | null {
  return abilityDefinitions.find(def =>
    def.id === abilityId || def.aliases?.includes(abilityId)
  ) ?? null;
}

function findPetStrength(abilityId: string): number {
  const pets = getActivePetsDebug();
  const petWithAbility = pets.find(pet =>
    pet.abilities.some(ability => ability === abilityId)
  );
  return petWithAbility?.strength ?? STRENGTH_BASELINE;
}

function calculateExpectedProcsPerHour(
  abilityDef: AbilityDefinition,
  strength: number
): number {
  if (!abilityDef.baseProbability || !abilityDef.rollPeriodMinutes) {
    return 0;
  }

  if (abilityDef.trigger !== 'continuous') {
    return 0; // Can't calculate expected rate for event-triggered abilities
  }

  const rollsPerHour = 60 / abilityDef.rollPeriodMinutes;
  const chancePerRoll = computeChancePerRoll(abilityDef.baseProbability, strength);
  return rollsPerHour * chancePerRoll;
}

function detectStreaks(
  events: Array<{ performedAt: number }>,
  expectedRate: number, // procs per hour
  minDuration: number = 30 * 60 * 1000 // 30 minutes minimum
): { hot: ProcStreak[]; cold: ProcStreak[] } {
  const hot: ProcStreak[] = [];
  const cold: ProcStreak[] = [];

  if (events.length < 2 || expectedRate === 0) {
    return { hot, cold };
  }

  // Define hot streak as >150% expected rate, cold as <50%
  const HOT_THRESHOLD = 1.5;
  const COLD_THRESHOLD = 0.5;
  const WINDOW_SIZE = 60 * 60 * 1000; // 1 hour rolling window

  for (let i = 0; i < events.length; i++) {
    const windowStart = events[i]!.performedAt;
    const windowEnd = windowStart + WINDOW_SIZE;

    // Count procs in this window
    let procCount = 0;
    let lastProcInWindow = windowStart;

    for (let j = i; j < events.length && events[j]!.performedAt < windowEnd; j++) {
      procCount++;
      lastProcInWindow = events[j]!.performedAt;
    }

    const actualDuration = Math.min(WINDOW_SIZE, lastProcInWindow - windowStart + 1);
    if (actualDuration < minDuration) continue;

    const expectedProcs = expectedRate * (actualDuration / HOUR_MS);
    const ratio = procCount / Math.max(1, expectedProcs);
    const variance = ((procCount - expectedProcs) / Math.max(1, expectedProcs)) * 100;

    if (ratio >= HOT_THRESHOLD && procCount >= 3) {
      hot.push({
        type: 'hot',
        startTime: windowStart,
        endTime: lastProcInWindow,
        procCount,
        expectedProcs,
        variance,
        duration: actualDuration,
      });
    } else if (ratio <= COLD_THRESHOLD && expectedProcs >= 3) {
      cold.push({
        type: 'cold',
        startTime: windowStart,
        endTime: lastProcInWindow,
        procCount,
        expectedProcs,
        variance,
        duration: actualDuration,
      });
    }
  }

  // Deduplicate overlapping streaks, keeping the most extreme
  const deduplicateStreaks = (streaks: ProcStreak[]): ProcStreak[] => {
    if (streaks.length === 0) return [];

    const sorted = [...streaks].sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance));
    const result: ProcStreak[] = [];

    for (const streak of sorted) {
      const overlaps = result.some(existing => {
        return !(streak.endTime < existing.startTime || streak.startTime > existing.endTime);
      });
      if (!overlaps) {
        result.push(streak);
      }
    }

    return result.sort((a, b) => b.startTime - a.startTime);
  };

  return {
    hot: deduplicateStreaks(hot).slice(0, 5), // Keep top 5
    cold: deduplicateStreaks(cold).slice(0, 5),
  };
}

function analyzeAbilityHistory(
  history: AbilityHistory,
  now: number
): AbilityProcRateStats | null {
  const abilityDef = findAbilityDefinition(history.abilityId);
  const abilityName = abilityDef?.name ?? history.abilityId;

  if (history.events.length === 0) {
    return null;
  }

  const sortedEvents = [...history.events].sort((a, b) => a.performedAt - b.performedAt);
  const firstProcAt = sortedEvents[0]!.performedAt;
  const lastProcAt = sortedEvents[sortedEvents.length - 1]!.performedAt;
  const totalProcs = sortedEvents.length;

  // Calculate time between procs
  const timeBetweenProcs: number[] = [];
  for (let i = 1; i < sortedEvents.length; i++) {
    timeBetweenProcs.push(sortedEvents[i]!.performedAt - sortedEvents[i - 1]!.performedAt);
  }

  const avgTimeBetweenProcs = timeBetweenProcs.length > 0
    ? timeBetweenProcs.reduce((sum, t) => sum + t, 0) / timeBetweenProcs.length
    : 0;
  const minTimeBetweenProcs = timeBetweenProcs.length > 0
    ? Math.min(...timeBetweenProcs)
    : 0;
  const maxTimeBetweenProcs = timeBetweenProcs.length > 0
    ? Math.max(...timeBetweenProcs)
    : 0;

  // Calculate rates
  const duration = Math.max(1, now - firstProcAt);
  const hoursElapsed = duration / HOUR_MS;
  const daysElapsed = duration / DAY_MS;

  const procsPerHour = totalProcs / hoursElapsed;
  const procsPerDay = totalProcs / Math.max(0.001, daysElapsed);

  // Expected rate
  const strength = findPetStrength(history.abilityId);
  const expectedProcsPerHour = abilityDef
    ? calculateExpectedProcsPerHour(abilityDef, strength)
    : 0;

  const variance = expectedProcsPerHour > 0
    ? ((procsPerHour - expectedProcsPerHour) / expectedProcsPerHour) * 100
    : 0;

  // Recent performance (last hour)
  const oneHourAgo = now - HOUR_MS;
  const recentEvents = sortedEvents.filter(e => e.performedAt >= oneHourAgo);
  const recentProcs = recentEvents.length;
  const recentVariance = expectedProcsPerHour > 0
    ? ((recentProcs - expectedProcsPerHour) / expectedProcsPerHour) * 100
    : 0;

  // Detect streaks
  const streaks = detectStreaks(sortedEvents, expectedProcsPerHour);

  // Current streak (if the most recent streak includes "now")
  const currentStreak =
    (streaks.hot[0] && now - streaks.hot[0].endTime < 5 * 60 * 1000) ? streaks.hot[0] :
    (streaks.cold[0] && now - streaks.cold[0].endTime < 5 * 60 * 1000) ? streaks.cold[0] :
    null;

  return {
    abilityId: history.abilityId,
    abilityName,
    totalProcs,
    firstProcAt,
    lastProcAt,
    procsPerHour,
    procsPerDay,
    expectedProcsPerHour,
    variance,
    avgTimeBetweenProcs,
    minTimeBetweenProcs,
    maxTimeBetweenProcs,
    currentStreak,
    hotStreaks: streaks.hot,
    coldStreaks: streaks.cold,
    recentProcs,
    recentVariance,
  };
}

function recalculateSnapshot(): void {
  const now = Date.now();
  const historySnapshot = getAbilityHistorySnapshot();
  const newAbilities = new Map<string, AbilityProcRateStats>();

  // Process each unique ability
  const processedAbilities = new Set<string>();

  for (const history of historySnapshot.values()) {
    if (processedAbilities.has(history.abilityId)) continue;
    processedAbilities.add(history.abilityId);

    const stats = analyzeAbilityHistory(history, now);
    if (stats) {
      newAbilities.set(history.abilityId, stats);
    }
  }

  snapshot = {
    abilities: newAbilities,
    updatedAt: now,
    sessionStart: snapshot.sessionStart,
  };

  scheduleSave();
  notifyListeners();
}

const scheduleSave = debounce(() => {
  try {
    storage.set(STORAGE_KEY, serializeSnapshot());
  } catch (error) {
    console.error('[procRateAnalytics] Failed to save:', error);
  }
}, SAVE_DEBOUNCE_MS);

function serializeSnapshot(): PersistedSnapshot {
  const abilities: PersistedAbilityStats[] = [];

  for (const stats of snapshot.abilities.values()) {
    abilities.push({
      abilityId: stats.abilityId,
      abilityName: stats.abilityName,
      totalProcs: stats.totalProcs,
      firstProcAt: stats.firstProcAt,
      lastProcAt: stats.lastProcAt,
      procsPerHour: stats.procsPerHour,
      procsPerDay: stats.procsPerDay,
      expectedProcsPerHour: stats.expectedProcsPerHour,
      variance: stats.variance,
      avgTimeBetweenProcs: stats.avgTimeBetweenProcs,
      minTimeBetweenProcs: stats.minTimeBetweenProcs,
      maxTimeBetweenProcs: stats.maxTimeBetweenProcs,
      currentStreak: stats.currentStreak,
      hotStreaks: stats.hotStreaks,
      coldStreaks: stats.coldStreaks,
      recentProcs: stats.recentProcs,
      recentVariance: stats.recentVariance,
    });
  }

  return {
    version: 1,
    abilities,
    updatedAt: snapshot.updatedAt,
    sessionStart: snapshot.sessionStart,
  };
}

function restoreSnapshot(persisted: PersistedSnapshot | null): void {
  if (!persisted || persisted.version !== 1) {
    return;
  }

  const abilities = new Map<string, AbilityProcRateStats>();

  for (const stats of persisted.abilities) {
    abilities.set(stats.abilityId, {
      abilityId: stats.abilityId,
      abilityName: stats.abilityName,
      totalProcs: stats.totalProcs,
      firstProcAt: stats.firstProcAt,
      lastProcAt: stats.lastProcAt,
      procsPerHour: stats.procsPerHour,
      procsPerDay: stats.procsPerDay,
      expectedProcsPerHour: stats.expectedProcsPerHour,
      variance: stats.variance,
      avgTimeBetweenProcs: stats.avgTimeBetweenProcs,
      minTimeBetweenProcs: stats.minTimeBetweenProcs,
      maxTimeBetweenProcs: stats.maxTimeBetweenProcs,
      currentStreak: stats.currentStreak,
      hotStreaks: stats.hotStreaks,
      coldStreaks: stats.coldStreaks,
      recentProcs: stats.recentProcs,
      recentVariance: stats.recentVariance,
    });
  }

  snapshot = {
    abilities,
    updatedAt: persisted.updatedAt,
    sessionStart: persisted.sessionStart,
  };
}

function notifyListeners(): void {
  for (const listener of listeners) {
    try {
      listener(snapshot);
    } catch (error) {
      console.error('[procRateAnalytics] Listener error:', error);
    }
  }
}

export function initializeProcRateAnalytics(): void {
  if (initialized) return;
  initialized = true;

  try {
    const persisted = storage.get<PersistedSnapshot | null>(STORAGE_KEY, null);
    restoreSnapshot(persisted);
  } catch (error) {
    console.error('[procRateAnalytics] Failed to restore:', error);
  }

  // Recalculate on init
  recalculateSnapshot();

  // Recalculate periodically (every 60 seconds)
  setInterval(() => {
    recalculateSnapshot();
  }, 60000);
}

export function getProcRateSnapshot(): ProcRateSnapshot {
  return {
    abilities: new Map(snapshot.abilities),
    updatedAt: snapshot.updatedAt,
    sessionStart: snapshot.sessionStart,
  };
}

export function getAbilityProcStats(abilityId: string): AbilityProcRateStats | null {
  return snapshot.abilities.get(abilityId) ?? null;
}

export function subscribeToProcRateAnalytics(
  listener: (snapshot: ProcRateSnapshot) => void
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function forceRecalculateProcRates(): void {
  recalculateSnapshot();
}

export function resetProcRateAnalytics(): void {
  snapshot = {
    abilities: new Map(),
    updatedAt: Date.now(),
    sessionStart: Date.now(),
  };
  scheduleSave();
  notifyListeners();
}
