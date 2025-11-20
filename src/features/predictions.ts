// src/features/predictions.ts
// Simple linear predictions for pet levels, goals, and ability procs

import { getActivePetsDebug, type ActivePetInfo } from '../store/pets';
import { estimatePetLevel } from '../store/petLevelCalculator';
import { getComprehensiveSnapshot, type Goal } from './comprehensiveAnalytics';
import { getProcRateSnapshot, type AbilityProcRateStats } from './procRateAnalytics';
import { storage } from '../utils/storage';
import { debounce } from '../utils/helpers';

const STORAGE_KEY = 'qpm.predictions.v1';
const SAVE_DEBOUNCE_MS = 5000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export interface PetLevelPrediction {
  petId: string;
  petName: string;
  species: string;
  currentLevel: number;
  maxLevel: number;
  currentXP: number;
  totalXPNeeded: number;
  xpGainRate: number; // XP per second
  xpRemaining: number;
  estimatedCompletionAt: number | null; // timestamp when max level is reached
  confidence: 'high' | 'medium' | 'low' | 'none';
}

export interface GoalPrediction {
  goalId: string;
  description: string;
  type: string;
  current: number;
  target: number;
  remaining: number;
  progressRate: number; // units per second
  estimatedCompletionAt: number | null; // timestamp
  confidence: 'high' | 'medium' | 'low' | 'none';
}

export interface AbilityPrediction {
  abilityId: string;
  abilityName: string;
  currentProcs: number;
  procsPerHour: number;
  milestones: Array<{
    target: number; // e.g., 100, 500, 1000 procs
    estimatedAt: number | null; // timestamp when milestone is reached
  }>;
}

export interface PredictionsSnapshot {
  petPredictions: PetLevelPrediction[];
  goalPredictions: GoalPrediction[];
  abilityPredictions: AbilityPrediction[];
  updatedAt: number;
}

interface PersistedSnapshot {
  version: number;
  updatedAt: number;
  // Store historical data for rate calculations
  goalProgressHistory: Map<string, Array<{ timestamp: number; value: number }>>;
}

let snapshot: PredictionsSnapshot = {
  petPredictions: [],
  goalPredictions: [],
  abilityPredictions: [],
  updatedAt: Date.now(),
};

// Track goal progress over time for rate calculation
const goalProgressHistory = new Map<string, Array<{ timestamp: number; value: number }>>();
const MAX_HISTORY_POINTS = 20;

let initialized = false;
const listeners = new Set<(snapshot: PredictionsSnapshot) => void>();

function calculatePetPredictions(): PetLevelPrediction[] {
  const pets = getActivePetsDebug();
  const predictions: PetLevelPrediction[] = [];

  for (const pet of pets) {
    if (!pet.petId || pet.xp == null) continue;

    const levelEstimate = estimatePetLevel(pet);

    if (!levelEstimate.xpGainRate || !levelEstimate.totalXPNeeded || !levelEstimate.currentLevel) {
      continue;
    }

    const xpRemaining = levelEstimate.totalXPNeeded - pet.xp;
    let estimatedCompletionAt: number | null = null;

    if (xpRemaining > 0 && levelEstimate.xpGainRate > 0) {
      const secondsRemaining = xpRemaining / levelEstimate.xpGainRate;
      estimatedCompletionAt = Date.now() + secondsRemaining * 1000;
    }

    predictions.push({
      petId: pet.petId,
      petName: pet.name || pet.species || 'Unknown Pet',
      species: pet.species || 'Unknown',
      currentLevel: levelEstimate.currentLevel,
      maxLevel: levelEstimate.maxLevel,
      currentXP: pet.xp,
      totalXPNeeded: levelEstimate.totalXPNeeded,
      xpGainRate: levelEstimate.xpGainRate,
      xpRemaining,
      estimatedCompletionAt,
      confidence: levelEstimate.confidence,
    });
  }

  return predictions;
}

function updateGoalProgress(goal: Goal): void {
  const goalId = goal.id;
  let history = goalProgressHistory.get(goalId);

  if (!history) {
    history = [];
    goalProgressHistory.set(goalId, history);
  }

  const now = Date.now();

  // Add current progress point
  history.push({
    timestamp: now,
    value: goal.current,
  });

  // Keep only recent history
  if (history.length > MAX_HISTORY_POINTS) {
    history.shift();
  }
}

function calculateGoalProgressRate(goalId: string): { rate: number; confidence: 'high' | 'medium' | 'low' | 'none' } {
  const history = goalProgressHistory.get(goalId);

  if (!history || history.length < 2) {
    return { rate: 0, confidence: 'none' };
  }

  // Use first and last points for linear rate
  const first = history[0]!;
  const last = history[history.length - 1]!;

  const progressMade = last.value - first.value;
  const timeElapsed = (last.timestamp - first.timestamp) / 1000; // seconds

  if (timeElapsed <= 0 || progressMade <= 0) {
    return { rate: 0, confidence: 'none' };
  }

  const rate = progressMade / timeElapsed; // units per second

  // Determine confidence based on sample size and time span
  let confidence: 'high' | 'medium' | 'low' = 'low';

  const timeSpanMinutes = timeElapsed / 60;

  if (history.length >= 10 && timeSpanMinutes >= 10) {
    confidence = 'high';
  } else if (history.length >= 5 && timeSpanMinutes >= 5) {
    confidence = 'medium';
  }

  return { rate, confidence };
}

function calculateGoalPredictions(): GoalPrediction[] {
  const analyticsSnapshot = getComprehensiveSnapshot();
  const predictions: GoalPrediction[] = [];

  for (const goal of analyticsSnapshot.goals) {
    if (goal.completedAt) continue; // Skip completed goals

    // Update progress history
    updateGoalProgress(goal);

    const remaining = goal.target - goal.current;
    const { rate, confidence } = calculateGoalProgressRate(goal.id);

    let estimatedCompletionAt: number | null = null;

    if (remaining > 0 && rate > 0) {
      const secondsRemaining = remaining / rate;
      estimatedCompletionAt = Date.now() + secondsRemaining * 1000;
    }

    predictions.push({
      goalId: goal.id,
      description: goal.description,
      type: goal.type,
      current: goal.current,
      target: goal.target,
      remaining,
      progressRate: rate,
      estimatedCompletionAt,
      confidence,
    });
  }

  return predictions;
}

function calculateAbilityPredictions(): AbilityPrediction[] {
  const procRateSnapshot = getProcRateSnapshot();
  const predictions: AbilityPrediction[] = [];

  const MILESTONES = [50, 100, 250, 500, 1000, 2500, 5000, 10000];

  for (const [abilityId, stats] of procRateSnapshot.abilities) {
    const procsPerHour = stats.procsPerHour;

    if (procsPerHour <= 0) continue;

    const milestones = MILESTONES.map((target) => {
      const remaining = target - stats.totalProcs;

      if (remaining <= 0) {
        return { target, estimatedAt: null }; // Already reached
      }

      const hoursRemaining = remaining / procsPerHour;
      const estimatedAt = Date.now() + hoursRemaining * HOUR_MS;

      return { target, estimatedAt };
    }).filter((m) => m.estimatedAt !== null); // Only include future milestones

    if (milestones.length > 0) {
      predictions.push({
        abilityId,
        abilityName: stats.abilityName,
        currentProcs: stats.totalProcs,
        procsPerHour,
        milestones,
      });
    }
  }

  return predictions;
}

function recalculatePredictions(): void {
  const now = Date.now();

  snapshot = {
    petPredictions: calculatePetPredictions(),
    goalPredictions: calculateGoalPredictions(),
    abilityPredictions: calculateAbilityPredictions(),
    updatedAt: now,
  };

  scheduleSave();
  notifyListeners();
}

const scheduleSave = debounce(() => {
  try {
    storage.set(STORAGE_KEY, serializeSnapshot());
  } catch (error) {
    console.error('[predictions] Failed to save:', error);
  }
}, SAVE_DEBOUNCE_MS);

function serializeSnapshot(): PersistedSnapshot {
  return {
    version: 1,
    updatedAt: snapshot.updatedAt,
    goalProgressHistory,
  };
}

function restoreSnapshot(persisted: PersistedSnapshot | null): void {
  if (!persisted || persisted.version !== 1) return;

  // Restore goal progress history
  if (persisted.goalProgressHistory) {
    for (const [goalId, history] of persisted.goalProgressHistory) {
      goalProgressHistory.set(goalId, history);
    }
  }
}

function notifyListeners(): void {
  for (const listener of listeners) {
    try {
      listener(snapshot);
    } catch (error) {
      console.error('[predictions] Listener error:', error);
    }
  }
}

export function initializePredictions(): void {
  if (initialized) return;
  initialized = true;

  try {
    const persisted = storage.get<PersistedSnapshot | null>(STORAGE_KEY, null);
    restoreSnapshot(persisted);
  } catch (error) {
    console.error('[predictions] Failed to restore:', error);
  }

  // Initial calculation
  recalculatePredictions();

  // Recalculate periodically (every 10 seconds)
  setInterval(() => {
    recalculatePredictions();
  }, 10000);
}

export function getPredictionsSnapshot(): PredictionsSnapshot {
  return {
    petPredictions: [...snapshot.petPredictions],
    goalPredictions: [...snapshot.goalPredictions],
    abilityPredictions: snapshot.abilityPredictions.map((p) => ({
      ...p,
      milestones: [...p.milestones],
    })),
    updatedAt: snapshot.updatedAt,
  };
}

export function subscribeToPredictions(
  listener: (snapshot: PredictionsSnapshot) => void
): () => void {
  listeners.add(listener);
  listener(getPredictionsSnapshot()); // Immediate callback
  return () => listeners.delete(listener);
}

export function forceRecalculatePredictions(): void {
  recalculatePredictions();
}

export function resetPredictions(): void {
  goalProgressHistory.clear();
  recalculatePredictions();
}

/**
 * Format ETA timestamp into human-readable string
 */
export function formatETA(timestamp: number | null): string {
  if (!timestamp) return 'N/A';

  const now = Date.now();
  const diff = timestamp - now;

  if (diff <= 0) return 'Now';

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h`;
  } else if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}
