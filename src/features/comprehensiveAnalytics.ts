// src/features/comprehensiveAnalytics.ts
// Combined analytics for goals, records, predictions, and comparisons.

import { storage } from '../utils/storage';
import { debounce } from '../utils/helpers';
import { getActivePetsDebug } from '../store/pets';
import { getAbilityHistorySnapshot } from '../store/abilityLogs';
import { getPetXpSnapshots } from '../store/petXpTracker';
import { getMutationSummary } from '../store/mutationSummary';
import { getStatsSnapshot } from '../store/stats';

const STORAGE_KEY = 'qpm.comprehensiveAnalytics.v1';
const SAVE_DEBOUNCE_MS = 3000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// ============================================
// PERSONAL RECORDS
// ============================================

export interface PersonalRecords {
  fastestLevelUp: {
    species: string;
    timeMs: number;
    fromLevel: number;
    toLevel: number;
    recordedAt: number;
  } | null;

  mostProcsInSession: {
    count: number;
    abilityId: string;
    recordedAt: number;
  } | null;

  highestValueMutation: {
    type: 'gold' | 'rainbow';
    species: string;
    estimatedValue: number;
    recordedAt: number;
  } | null;

  bestXpGainRate: {
    xpPerHour: number;
    species: string;
    recordedAt: number;
  } | null;

  longestSession: {
    duration: number;
    recordedAt: number;
  } | null;
}

// ============================================
// CUSTOM GOALS
// ============================================

export type GoalType =
  | 'pet_level' // Pet reaches level X
  | 'collect_items' // Collect Y of item
  | 'earn_coins' // Earn Z coins
  | 'get_procs'; // Get X procs of ability

export interface Goal {
  id: string;
  type: GoalType;
  target: number;
  current: number;
  description: string;
  createdAt: number;
  completedAt: number | null;
  estimatedCompletion: number | null; // timestamp

  // Type-specific data
  petSpecies?: string; // for pet_level
  itemName?: string; // for collect_items
  abilityId?: string; // for get_procs
}

// ============================================
// ETA PREDICTIONS
// ============================================

export interface ETAPrediction {
  petLevelUp: Map<string, {
    currentLevel: number;
    nextLevel: number;
    currentXp: number;
    targetXp: number;
    xpNeeded: number;
    xpPerHour: number;
    estimatedHours: number;
    estimatedTimestamp: number;
  }>;

  coinGoals: Map<string, {
    currentCoins: number;
    targetCoins: number;
    coinsNeeded: number;
    coinsPerHour: number;
    estimatedHours: number;
    estimatedTimestamp: number;
  }>;

  nextAbilityProc: Map<string, {
    abilityId: string;
    abilityName: string;
    avgTimeBetweenProcs: number;
    lastProcAt: number;
    estimatedNextProc: number;
  }>;
}

// ============================================
// COMPARATIVE ANALYTICS
// ============================================

export interface TimeComparison {
  thisSession: {
    value: number;
    label: string;
  };
  lastSession: {
    value: number;
    label: string;
  } | null;
  percentChange: number;
}

export interface SpeciesComparison {
  species: string;
  avgXpRate: number;
  avgAbilityValue: number;
  sampleSize: number;
}

export interface ComparativeAnalytics {
  // Time-based comparisons
  xpGain: TimeComparison;
  procCount: TimeComparison;
  sessionValue: TimeComparison;

  // Species comparisons
  speciesRankings: SpeciesComparison[];
  topSpecies: SpeciesComparison | null;
}

// ============================================
// MUTATION ANALYTICS
// ============================================

export interface MutationByWeather {
  weatherType: string;
  mutationCount: number;
  successRate: number; // % of weather events that produced mutations
  avgValue: number;
  bestMutation: string | null;
}

export interface MutationAnalytics {
  byWeather: MutationByWeather[];
  totalMutations: number;
  mostValuableWeather: string | null;
  bestTimeForMutations: number | null; // hour of day (0-23)
}

// ============================================
// COMBINED SNAPSHOT
// ============================================

export interface ComprehensiveSnapshot {
  records: PersonalRecords;
  goals: Goal[];
  predictions: ETAPrediction;
  comparisons: ComparativeAnalytics;
  mutations: MutationAnalytics;
  updatedAt: number;
}

interface PersistedSnapshot {
  version: number;
  records: PersonalRecords;
  goals: Goal[];
  sessionHistory: {
    xpGain: number[];
    procCount: number[];
    value: number[];
  };
  updatedAt: number;
}

let snapshot: ComprehensiveSnapshot = {
  records: {
    fastestLevelUp: null,
    mostProcsInSession: null,
    highestValueMutation: null,
    bestXpGainRate: null,
    longestSession: null,
  },
  goals: [],
  predictions: {
    petLevelUp: new Map(),
    coinGoals: new Map(),
    nextAbilityProc: new Map(),
  },
  comparisons: {
    xpGain: { thisSession: { value: 0, label: 'This session' }, lastSession: null, percentChange: 0 },
    procCount: { thisSession: { value: 0, label: 'This session' }, lastSession: null, percentChange: 0 },
    sessionValue: { thisSession: { value: 0, label: 'This session' }, lastSession: null, percentChange: 0 },
    speciesRankings: [],
    topSpecies: null,
  },
  mutations: {
    byWeather: [],
    totalMutations: 0,
    mostValuableWeather: null,
    bestTimeForMutations: null,
  },
  updatedAt: Date.now(),
};

const sessionHistory = {
  xpGain: [] as number[],
  procCount: [] as number[],
  value: [] as number[],
};

let initialized = false;
const listeners = new Set<(snapshot: ComprehensiveSnapshot) => void>();

// ============================================
// GOALS MANAGEMENT
// ============================================

export function addGoal(goal: Omit<Goal, 'id' | 'createdAt' | 'completedAt' | 'estimatedCompletion'>): string {
  const id = `goal-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const newGoal: Goal = {
    ...goal,
    id,
    createdAt: Date.now(),
    completedAt: null,
    estimatedCompletion: null,
  };

  snapshot.goals.push(newGoal);
  recalculateAll();
  return id;
}

export function removeGoal(id: string): void {
  snapshot.goals = snapshot.goals.filter(g => g.id !== id);
  scheduleSave();
  notifyListeners();
}

export function updateGoalProgress(id: string, current: number): void {
  const goal = snapshot.goals.find(g => g.id === id);
  if (goal) {
    goal.current = current;
    if (current >= goal.target && !goal.completedAt) {
      goal.completedAt = Date.now();
    }
    recalculateAll();
  }
}

// ============================================
// RECORDS TRACKING
// ============================================

function checkAndUpdateRecords(): void {
  const now = Date.now();
  const stats = getStatsSnapshot();
  const historySnapshot = getAbilityHistorySnapshot();
  const pets = getActivePetsDebug();

  // Most procs in session
  let maxProcs = 0;
  let maxProcAbility = '';

  for (const history of historySnapshot.values()) {
    if (history.events.length > maxProcs) {
      maxProcs = history.events.length;
      maxProcAbility = history.abilityId;
    }
  }

  if (!snapshot.records.mostProcsInSession || maxProcs > snapshot.records.mostProcsInSession.count) {
    snapshot.records.mostProcsInSession = {
      count: maxProcs,
      abilityId: maxProcAbility,
      recordedAt: now,
    };
  }

  // Calculate session duration
  const sessionDuration = now - stats.meta.initializedAt;
  if (!snapshot.records.longestSession || sessionDuration > snapshot.records.longestSession.duration) {
    snapshot.records.longestSession = {
      duration: sessionDuration,
      recordedAt: now,
    };
  }

  // Note: fastestLevelUp, highestValueMutation, and bestXpGainRate would require
  // more sophisticated tracking that monitors specific events. For now, these
  // remain null or are updated by external calls.
}

export function recordLevelUp(species: string, fromLevel: number, toLevel: number, timeMs: number): void {
  if (!snapshot.records.fastestLevelUp || timeMs < snapshot.records.fastestLevelUp.timeMs) {
    snapshot.records.fastestLevelUp = {
      species,
      timeMs,
      fromLevel,
      toLevel,
      recordedAt: Date.now(),
    };
    scheduleSave();
  }
}

export function recordMutation(type: 'gold' | 'rainbow', species: string, estimatedValue: number): void {
  if (!snapshot.records.highestValueMutation || estimatedValue > snapshot.records.highestValueMutation.estimatedValue) {
    snapshot.records.highestValueMutation = {
      type,
      species,
      estimatedValue,
      recordedAt: Date.now(),
    };
    scheduleSave();
  }
}

// ============================================
// ETA PREDICTIONS
// ============================================

function calculatePredictions(): void {
  const pets = getActivePetsDebug();
  const xpSnapshots = getPetXpSnapshots();

  snapshot.predictions.petLevelUp.clear();

  // Predict pet level-ups based on recent XP gain
  // This is simplified - real implementation would track XP over time
  for (const pet of pets) {
    if (!pet.species || !pet.level || !pet.xp) continue;

    // Find species XP data
    const speciesData = xpSnapshots.find(s => s.key === (pet.species || '').toLowerCase());
    if (!speciesData) continue;

    const currentLevel = pet.level || 0;
    const nextLevelData = speciesData.levels.find(l => l.level === currentLevel + 1);
    if (!nextLevelData) continue;

    const xpNeeded = nextLevelData.xp - pet.xp;
    if (xpNeeded <= 0) continue;

    // Estimate XP rate (this would be tracked over time in reality)
    const estimatedXpPerHour = 1000; // Placeholder

    if (estimatedXpPerHour > 0) {
      const estimatedHours = xpNeeded / estimatedXpPerHour;
      snapshot.predictions.petLevelUp.set(pet.species, {
        currentLevel: pet.level,
        nextLevel: pet.level + 1,
        currentXp: pet.xp,
        targetXp: nextLevelData.xp,
        xpNeeded,
        xpPerHour: estimatedXpPerHour,
        estimatedHours,
        estimatedTimestamp: Date.now() + (estimatedHours * HOUR_MS),
      });
    }
  }

  // Predict next ability procs based on historical timing
  snapshot.predictions.nextAbilityProc.clear();
  const historySnapshot = getAbilityHistorySnapshot();

  for (const history of historySnapshot.values()) {
    if (history.events.length < 2) continue;

    const sortedEvents = [...history.events].sort((a, b) => a.performedAt - b.performedAt);
    const timeBetweenProcs: number[] = [];

    for (let i = 1; i < sortedEvents.length; i++) {
      timeBetweenProcs.push(sortedEvents[i]!.performedAt - sortedEvents[i - 1]!.performedAt);
    }

    if (timeBetweenProcs.length === 0) continue;

    const avgTime = timeBetweenProcs.reduce((sum, t) => sum + t, 0) / timeBetweenProcs.length;
    const lastProc = sortedEvents[sortedEvents.length - 1]!.performedAt;

    snapshot.predictions.nextAbilityProc.set(history.abilityId, {
      abilityId: history.abilityId,
      abilityName: history.abilityId, // Would map to actual name in real impl
      avgTimeBetweenProcs: avgTime,
      lastProcAt: lastProc,
      estimatedNextProc: lastProc + avgTime,
    });
  }
}

// ============================================
// COMPARATIVE ANALYTICS
// ============================================

function calculateComparisons(): void {
  const stats = getStatsSnapshot();
  const pets = getActivePetsDebug();

  // Calculate current session metrics
  const currentXp = 0; // Would track this over time
  const currentProcs = Array.from(getAbilityHistorySnapshot().values())
    .reduce((sum, h) => sum + h.events.length, 0);
  const currentValue = 0; // Would calculate from mutation tracking

  snapshot.comparisons.xpGain.thisSession = {
    value: currentXp,
    label: 'This session',
  };

  snapshot.comparisons.procCount.thisSession = {
    value: currentProcs,
    label: 'This session',
  };

  snapshot.comparisons.sessionValue.thisSession = {
    value: currentValue,
    label: 'This session',
  };

  // Compare with previous sessions (if available)
  if (sessionHistory.xpGain.length > 1) {
    const lastXp = sessionHistory.xpGain[sessionHistory.xpGain.length - 2] || 0;
    snapshot.comparisons.xpGain.lastSession = { value: lastXp, label: 'Last session' };
    snapshot.comparisons.xpGain.percentChange = lastXp > 0
      ? ((currentXp - lastXp) / lastXp) * 100
      : 0;
  }

  // Species comparisons (simplified)
  const speciesMap = new Map<string, { totalXp: number; totalValue: number; count: number }>();

  for (const pet of pets) {
    if (!pet.species) continue;

    const existing = speciesMap.get(pet.species) || { totalXp: 0, totalValue: 0, count: 0 };
    existing.totalXp += pet.xp ?? 0;
    existing.count += 1;
    speciesMap.set(pet.species, existing);
  }

  snapshot.comparisons.speciesRankings = Array.from(speciesMap.entries())
    .map(([species, data]) => ({
      species,
      avgXpRate: data.totalXp / Math.max(1, data.count),
      avgAbilityValue: data.totalValue / Math.max(1, data.count),
      sampleSize: data.count,
    }))
    .sort((a, b) => b.avgXpRate - a.avgXpRate);

  snapshot.comparisons.topSpecies = snapshot.comparisons.speciesRankings[0] || null;
}

// ============================================
// MUTATION ANALYTICS
// ============================================

function calculateMutationAnalytics(): void {
  const mutationData = getMutationSummary();

  // This would analyze mutations by weather type
  // Simplified implementation
  snapshot.mutations.totalMutations = mutationData?.overallPendingFruitCount ?? 0;
  snapshot.mutations.byWeather = [];

  // Would need historical weather correlation data for full implementation
  snapshot.mutations.mostValuableWeather = 'amber'; // Placeholder
  snapshot.mutations.bestTimeForMutations = 14; // Placeholder (2 PM)
}

// ============================================
// MAIN RECALCULATION
// ============================================

function recalculateAll(): void {
  checkAndUpdateRecords();
  calculatePredictions();
  calculateComparisons();
  calculateMutationAnalytics();

  // Update goal progress and ETAs
  for (const goal of snapshot.goals) {
    if (goal.completedAt) continue;

    // Estimate completion time based on current progress rate
    // This is simplified - real implementation would track historical progress
    const progressRate = 1; // units per hour (placeholder)
    const remaining = goal.target - goal.current;

    if (progressRate > 0 && remaining > 0) {
      const hoursNeeded = remaining / progressRate;
      goal.estimatedCompletion = Date.now() + (hoursNeeded * HOUR_MS);
    }
  }

  snapshot.updatedAt = Date.now();
  scheduleSave();
  notifyListeners();
}

const scheduleSave = debounce(() => {
  try {
    storage.set(STORAGE_KEY, serializeSnapshot());
  } catch (error) {
    console.error('[comprehensiveAnalytics] Failed to save:', error);
  }
}, SAVE_DEBOUNCE_MS);

function serializeSnapshot(): PersistedSnapshot {
  return {
    version: 1,
    records: snapshot.records,
    goals: snapshot.goals,
    sessionHistory,
    updatedAt: snapshot.updatedAt,
  };
}

function restoreSnapshot(persisted: PersistedSnapshot | null): void {
  if (!persisted || persisted.version !== 1) return;

  snapshot.records = persisted.records;
  snapshot.goals = persisted.goals;

  if (persisted.sessionHistory) {
    sessionHistory.xpGain = persisted.sessionHistory.xpGain;
    sessionHistory.procCount = persisted.sessionHistory.procCount;
    sessionHistory.value = persisted.sessionHistory.value;
  }
}

function notifyListeners(): void {
  for (const listener of listeners) {
    try {
      listener(snapshot);
    } catch (error) {
      console.error('[comprehensiveAnalytics] Listener error:', error);
    }
  }
}

export function initializeComprehensiveAnalytics(): void {
  if (initialized) return;
  initialized = true;

  try {
    const persisted = storage.get<PersistedSnapshot | null>(STORAGE_KEY, null);
    restoreSnapshot(persisted);
  } catch (error) {
    console.error('[comprehensiveAnalytics] Failed to restore:', error);
  }

  // Recalculate on init
  recalculateAll();

  // Recalculate periodically (every 60 seconds)
  setInterval(() => {
    recalculateAll();
  }, 60000);
}

export function getComprehensiveSnapshot(): ComprehensiveSnapshot {
  return JSON.parse(JSON.stringify(snapshot)); // Deep clone
}

export function subscribeToComprehensiveAnalytics(
  listener: (snapshot: ComprehensiveSnapshot) => void
): () => void {
  listeners.add(listener);
  listener(getComprehensiveSnapshot()); // Immediate callback
  return () => listeners.delete(listener);
}

export function resetComprehensiveAnalytics(keepRecords = false): void {
  if (!keepRecords) {
    snapshot.records = {
      fastestLevelUp: null,
      mostProcsInSession: null,
      highestValueMutation: null,
      bestXpGainRate: null,
      longestSession: null,
    };
  }

  snapshot.goals = [];
  sessionHistory.xpGain = [];
  sessionHistory.procCount = [];
  sessionHistory.value = [];

  scheduleSave();
  notifyListeners();
}
