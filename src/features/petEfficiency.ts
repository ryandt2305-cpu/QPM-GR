// src/features/petEfficiency.ts
// Ranks pets by XP gain rate and ability value generated per hour.

import { onActivePetInfos, type ActivePetInfo } from '../store/pets';
import { getAbilityHistorySnapshot, type AbilityHistory } from '../store/abilityLogs';
import { abilityDefinitions, getAbilityDefinition, computeAbilityStats, computeEffectPerHour } from '../data/petAbilities';
import { storage } from '../utils/storage';
import { debounce } from '../utils/helpers';
import { buildAbilityValuationContext, resolveDynamicAbilityEffect } from './abilityValuation';

const STORAGE_KEY = 'qpm.petEfficiency.v1';
const SAVE_DEBOUNCE_MS = 3000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;

export interface PetEfficiencyMetrics {
  petId: string;
  slotIndex: number;
  species: string;
  name: string | null;
  level: number;

  // XP Efficiency
  xpGainRate: number; // XP per hour
  xpSessionTotal: number;
  xpSince: number | null;

  // Ability Performance
  totalAbilityProcs: number;
  procsPerHour: number;
  abilityValuePerHour: number; // Gold equivalent/hour
  topAbility: string | null; // Most valuable ability

  // Overall efficiency score (0-100)
  efficiencyScore: number;

  // Time tracking
  firstSeenAt: number;
  lastSeenAt: number;
  activeTime: number; // milliseconds
}

export interface PetRankings {
  byXpRate: PetEfficiencyMetrics[];
  byAbilityValue: PetEfficiencyMetrics[];
  byEfficiencyScore: PetEfficiencyMetrics[];
  byProcsPerHour: PetEfficiencyMetrics[];
}

export interface DailyBest {
  date: string; // YYYY-MM-DD
  pet: {
    species: string;
    name: string | null;
    score: number;
    reason: string;
  };
}

export interface WeeklyBest {
  weekStart: string; // YYYY-MM-DD
  pet: {
    species: string;
    name: string | null;
    score: number;
    reason: string;
  };
}

export interface PetEfficiencySnapshot {
  pets: Map<string, PetEfficiencyMetrics>;
  rankings: PetRankings;
  dailyBest: DailyBest[];
  weeklyBest: WeeklyBest[];
  updatedAt: number;
}

interface PersistedMetrics {
  petId: string;
  slotIndex: number;
  species: string;
  name: string | null;
  level: number;
  xpGainRate: number;
  xpSessionTotal: number;
  xpSince: number | null;
  totalAbilityProcs: number;
  procsPerHour: number;
  abilityValuePerHour: number;
  topAbility: string | null;
  efficiencyScore: number;
  firstSeenAt: number;
  lastSeenAt: number;
  activeTime: number;
}

interface PersistedSnapshot {
  version: number;
  pets: PersistedMetrics[];
  dailyBest: DailyBest[];
  weeklyBest: WeeklyBest[];
  updatedAt: number;
}

interface TrackedXP {
  initialXp: number;
  currentXp: number;
  firstSeenAt: number;
}

const xpTracking = new Map<string, TrackedXP>();

let snapshot: PetEfficiencySnapshot = {
  pets: new Map(),
  rankings: {
    byXpRate: [],
    byAbilityValue: [],
    byEfficiencyScore: [],
    byProcsPerHour: [],
  },
  dailyBest: [],
  weeklyBest: [],
  updatedAt: Date.now(),
};

let initialized = false;
let unsubscribe: (() => void) | null = null;
const listeners = new Set<(snapshot: PetEfficiencySnapshot) => void>();

function estimateAbilityValue(abilityId: string, strength: number | null | undefined, petId: string): number {
  // Get ability definition
  const def = getAbilityDefinition(abilityId);
  if (!def) return 0;

  // For abilities with static effectValuePerProc, use real calculation
  if (def.effectValuePerProc && def.effectUnit === 'coins') {
    const stats = computeAbilityStats(def, strength);
    return def.effectValuePerProc; // Coins per proc
  }

  // For coin finders, use the exact values from the definition
  if (def.id === 'CoinFinderI' || def.id === 'CoinFinder') {
    return 120000; // 0-120k range, use midpoint ~60k average
  }
  if (def.id === 'CoinFinderII' || def.id === 'CoinFinder II') {
    return 1200000; // 0-1.2M range, use midpoint ~600k average
  }
  if (def.id === 'CoinFinderIII' || def.id === 'CoinFinder III') {
    return 10000000; // 0-10M range, use midpoint ~5M average
  }

  // For dynamic abilities (Gold/Rainbow Granter, Crop Size Boost), use live garden data
  const gardenContext = buildAbilityValuationContext();
  const dynamicEffect = resolveDynamicAbilityEffect(abilityId, gardenContext, strength);
  if (dynamicEffect && dynamicEffect.effectPerProc > 0) {
    return dynamicEffect.effectPerProc;
  }

  // XP abilities have NO coin value (don't count towards garden value)
  if (def.category === 'xp' || def.effectUnit === 'xp') {
    return 0;
  }

  // Growth boosters (time savings) - minimal direct coin value
  if (def.category === 'plantGrowth' || def.category === 'eggGrowth') {
    return 0; // Time savings, not coins
  }

  // Default fallback for unknown abilities
  return 0;
}

function calculateAbilityMetrics(
  petId: string,
  slotIndex: number,
  abilities: string[],
  strength: number | null | undefined,
  now: number
): {
  totalProcs: number;
  procsPerHour: number;
  valuePerHour: number;
  topAbility: string | null;
} {
  const historySnapshot = getAbilityHistorySnapshot();
  let totalProcs = 0;
  let oldestProc: number | null = null;
  let newestProc: number | null = null;
  const abilityValues = new Map<string, number>();

  for (const abilityId of abilities) {
    // Skip Crop Mutation Boost abilities - they only proc during weather events
    if (abilityId === 'ProduceMutationBoost' || abilityId === 'ProduceMutationBoostII') {
      continue;
    }

    // Try to find history by slotIndex or petId
    const lookupKeys = [
      `slotIndex:${slotIndex}::${abilityId}`,
      `petId:${petId}::${abilityId}`,
      `slotId:${petId}::${abilityId}`,
    ];

    let history: AbilityHistory | null = null;
    for (const key of lookupKeys) {
      history = historySnapshot.get(key) ?? null;
      if (history) break;
    }

    if (!history || history.events.length === 0) continue;

    // Include ALL events (don't filter by session start)
    const procCount = history.events.length;
    totalProcs += procCount;

    // Track timestamp range of actual procs for accurate rate calculation
    const firstProc = Math.min(...history.events.map(e => e.performedAt));
    const lastProc = Math.max(...history.events.map(e => e.performedAt));

    if (oldestProc === null || firstProc < oldestProc) {
      oldestProc = firstProc;
    }
    if (newestProc === null || lastProc > newestProc) {
      newestProc = lastProc;
    }

    const valueEstimate = estimateAbilityValue(abilityId, strength, petId);
    abilityValues.set(abilityId, procCount * valueEstimate);
  }

  if (totalProcs === 0) {
    return {
      totalProcs: 0,
      procsPerHour: 0,
      valuePerHour: 0,
      topAbility: null,
    };
  }

  // Calculate accurate duration from first proc to last proc
  // This gives true procs-per-hour rate based on actual event timespan
  let duration: number;
  if (oldestProc !== null && newestProc !== null && oldestProc !== newestProc) {
    // Use actual timespan between first and last proc
    duration = newestProc - oldestProc;
  } else {
    // Only one proc or all at same time - use time since that proc
    duration = now - (oldestProc ?? now);
  }

  // Ensure minimum duration to avoid division issues
  duration = Math.max(duration, 60 * 1000); // Minimum 1 minute
  const hours = duration / HOUR_MS;

  const procsPerHour = totalProcs / hours;

  // Sum all ability values
  let totalValue = 0;
  for (const value of abilityValues.values()) {
    totalValue += value;
  }

  const valuePerHour = totalValue / hours;

  // Find top ability by value
  let topAbility: string | null = null;
  let topValue = 0;
  for (const [abilityId, value] of abilityValues.entries()) {
    if (value > topValue) {
      topValue = value;
      topAbility = abilityId;
    }
  }

  return {
    totalProcs,
    procsPerHour,
    valuePerHour,
    topAbility,
  };
}

function calculateEfficiencyScore(
  xpGainRate: number,
  procsPerHour: number,
  abilityValuePerHour: number
): number {
  // Normalize each metric to 0-100 scale (using reasonable max values)
  const maxXpRate = 5000; // 5000 XP/hour is excellent
  const maxProcsRate = 20; // 20 procs/hour is great
  const maxValueRate = 1000000; // 1M coins/hour is excellent

  const xpScore = Math.min(100, (xpGainRate / maxXpRate) * 100);
  const procScore = Math.min(100, (procsPerHour / maxProcsRate) * 100);
  const valueScore = Math.min(100, (abilityValuePerHour / maxValueRate) * 100);

  // Weighted average: Value is most important, then XP, then proc count
  return (valueScore * 0.5) + (xpScore * 0.3) + (procScore * 0.2);
}

function updatePetMetrics(pets: ActivePetInfo[]): void {
  const now = Date.now();
  const updatedPets = new Map<string, PetEfficiencyMetrics>();

  for (const pet of pets) {
    const petId = pet.petId || pet.slotId || `slot-${pet.slotIndex}`;
    const xp = pet.xp ?? 0;

    // Track XP changes
    let xpTracked = xpTracking.get(petId);
    if (!xpTracked) {
      xpTracked = {
        initialXp: xp,
        currentXp: xp,
        firstSeenAt: now,
      };
      xpTracking.set(petId, xpTracked);
    } else {
      xpTracked.currentXp = xp;
    }

    // Calculate XP gain rate (require at least 5 minutes of data)
    const xpGained = Math.max(0, xpTracked.currentXp - xpTracked.initialXp);
    const xpDuration = Math.max(1, now - xpTracked.firstSeenAt);
    const xpHours = xpDuration / HOUR_MS;
    const MIN_TRACKING_TIME = 5 * 60 * 1000; // 5 minutes minimum
    const xpGainRate = (xpDuration >= MIN_TRACKING_TIME && xpHours > 0) ? xpGained / xpHours : 0;

    // Calculate ability metrics
    const abilityMetrics = calculateAbilityMetrics(
      petId,
      pet.slotIndex,
      pet.abilities,
      pet.strength,
      now
    );

    // Calculate efficiency score
    const efficiencyScore = calculateEfficiencyScore(
      xpGainRate,
      abilityMetrics.procsPerHour,
      abilityMetrics.valuePerHour
    );

    // Get or create metrics
    const existing = snapshot.pets.get(petId);
    const firstSeenAt = existing?.firstSeenAt ?? xpTracked.firstSeenAt;
    const activeTime = Math.max(0, now - firstSeenAt);

    const metrics: PetEfficiencyMetrics = {
      petId,
      slotIndex: pet.slotIndex,
      species: pet.species || 'Unknown',
      name: pet.name,
      level: pet.level ?? 0,
      xpGainRate,
      xpSessionTotal: xpGained,
      xpSince: xpTracked.firstSeenAt,
      totalAbilityProcs: abilityMetrics.totalProcs,
      procsPerHour: abilityMetrics.procsPerHour,
      abilityValuePerHour: abilityMetrics.valuePerHour,
      topAbility: abilityMetrics.topAbility,
      efficiencyScore,
      firstSeenAt,
      lastSeenAt: now,
      activeTime,
    };

    updatedPets.set(petId, metrics);
  }

  snapshot.pets = updatedPets;
  updateRankings();
  updateDailyWeeklyBest();
  scheduleSave();
  notifyListeners();
}

function updateRankings(): void {
  const allPets = Array.from(snapshot.pets.values());

  snapshot.rankings = {
    byXpRate: [...allPets].sort((a, b) => b.xpGainRate - a.xpGainRate),
    byAbilityValue: [...allPets].sort((a, b) => b.abilityValuePerHour - a.abilityValuePerHour),
    byEfficiencyScore: [...allPets].sort((a, b) => b.efficiencyScore - a.efficiencyScore),
    byProcsPerHour: [...allPets].sort((a, b) => b.procsPerHour - a.procsPerHour),
  };
}

function updateDailyWeeklyBest(): void {
  const now = Date.now();
  const today = new Date(now).toISOString().split('T')[0]!;

  // Get best pet of the day
  const topPet = snapshot.rankings.byEfficiencyScore[0];
  if (topPet && topPet.efficiencyScore > 0) {
    // Check if we already have an entry for today
    const existingDaily = snapshot.dailyBest.find(d => d.date === today);
    if (!existingDaily) {
      snapshot.dailyBest.push({
        date: today,
        pet: {
          species: topPet.species,
          name: topPet.name,
          score: topPet.efficiencyScore,
          reason: getBestReason(topPet),
        },
      });

      // Keep only last 30 days
      if (snapshot.dailyBest.length > 30) {
        snapshot.dailyBest = snapshot.dailyBest.slice(-30);
      }
    }
  }

  // Get best pet of the week
  const weekStart = getWeekStart(now);
  const existingWeekly = snapshot.weeklyBest.find(w => w.weekStart === weekStart);
  if (topPet && topPet.efficiencyScore > 0 && !existingWeekly) {
    snapshot.weeklyBest.push({
      weekStart,
      pet: {
        species: topPet.species,
        name: topPet.name,
        score: topPet.efficiencyScore,
        reason: getBestReason(topPet),
      },
    });

    // Keep only last 12 weeks
    if (snapshot.weeklyBest.length > 12) {
      snapshot.weeklyBest = snapshot.weeklyBest.slice(-12);
    }
  }
}

function getBestReason(pet: PetEfficiencyMetrics): string {
  const reasons: string[] = [];

  if (pet.xpGainRate > 1000) {
    reasons.push(`${Math.round(pet.xpGainRate)} XP/hr`);
  }

  if (pet.abilityValuePerHour > 100000) {
    reasons.push(`${(pet.abilityValuePerHour / 1000).toFixed(0)}K coins/hr`);
  }

  if (pet.procsPerHour > 5) {
    reasons.push(`${pet.procsPerHour.toFixed(1)} procs/hr`);
  }

  return reasons.length > 0 ? reasons.join(', ') : 'All-around performance';
}

function getWeekStart(timestamp: number): string {
  const date = new Date(timestamp);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Monday as week start
  const weekStart = new Date(date.setDate(diff));
  weekStart.setHours(0, 0, 0, 0);
  return weekStart.toISOString().split('T')[0]!;
}

const scheduleSave = debounce(() => {
  try {
    storage.set(STORAGE_KEY, serializeSnapshot());
  } catch (error) {
    console.error('[petEfficiency] Failed to save:', error);
  }
}, SAVE_DEBOUNCE_MS);

function serializeSnapshot(): PersistedSnapshot {
  const pets: PersistedMetrics[] = Array.from(snapshot.pets.values()).map(p => ({
    petId: p.petId,
    slotIndex: p.slotIndex,
    species: p.species,
    name: p.name,
    level: p.level,
    xpGainRate: p.xpGainRate,
    xpSessionTotal: p.xpSessionTotal,
    xpSince: p.xpSince,
    totalAbilityProcs: p.totalAbilityProcs,
    procsPerHour: p.procsPerHour,
    abilityValuePerHour: p.abilityValuePerHour,
    topAbility: p.topAbility,
    efficiencyScore: p.efficiencyScore,
    firstSeenAt: p.firstSeenAt,
    lastSeenAt: p.lastSeenAt,
    activeTime: p.activeTime,
  }));

  return {
    version: 1,
    pets,
    dailyBest: snapshot.dailyBest,
    weeklyBest: snapshot.weeklyBest,
    updatedAt: snapshot.updatedAt,
  };
}

function restoreSnapshot(persisted: PersistedSnapshot | null): void {
  if (!persisted || persisted.version !== 1) return;

  const pets = new Map<string, PetEfficiencyMetrics>();
  for (const p of persisted.pets) {
    pets.set(p.petId, {
      petId: p.petId,
      slotIndex: p.slotIndex,
      species: p.species,
      name: p.name,
      level: p.level,
      xpGainRate: p.xpGainRate,
      xpSessionTotal: p.xpSessionTotal,
      xpSince: p.xpSince,
      totalAbilityProcs: p.totalAbilityProcs,
      procsPerHour: p.procsPerHour,
      abilityValuePerHour: p.abilityValuePerHour,
      topAbility: p.topAbility,
      efficiencyScore: p.efficiencyScore,
      firstSeenAt: p.firstSeenAt,
      lastSeenAt: p.lastSeenAt,
      activeTime: p.activeTime,
    });

    // Restore XP tracking
    if (p.xpSince) {
      xpTracking.set(p.petId, {
        initialXp: 0, // Will be updated on next pet info update
        currentXp: 0,
        firstSeenAt: p.xpSince,
      });
    }
  }

  snapshot = {
    pets,
    rankings: {
      byXpRate: [],
      byAbilityValue: [],
      byEfficiencyScore: [],
      byProcsPerHour: [],
    },
    dailyBest: persisted.dailyBest,
    weeklyBest: persisted.weeklyBest,
    updatedAt: persisted.updatedAt,
  };

  updateRankings();
}

function notifyListeners(): void {
  snapshot.updatedAt = Date.now();
  for (const listener of listeners) {
    try {
      listener(snapshot);
    } catch (error) {
      console.error('[petEfficiency] Listener error:', error);
    }
  }
}

export function initializePetEfficiency(): void {
  if (initialized) return;
  initialized = true;

  try {
    const persisted = storage.get<PersistedSnapshot | null>(STORAGE_KEY, null);
    restoreSnapshot(persisted);
  } catch (error) {
    console.error('[petEfficiency] Failed to restore:', error);
  }

  // Subscribe to pet info updates
  unsubscribe = onActivePetInfos(updatePetMetrics);

  // Periodic refresh (every 60 seconds)
  setInterval(() => {
    // Recalculate rankings in case ability logs updated
    updateRankings();
    notifyListeners();
  }, 60000);
}

export function getPetEfficiencySnapshot(): PetEfficiencySnapshot {
  return {
    pets: new Map(snapshot.pets),
    rankings: {
      byXpRate: [...snapshot.rankings.byXpRate],
      byAbilityValue: [...snapshot.rankings.byAbilityValue],
      byEfficiencyScore: [...snapshot.rankings.byEfficiencyScore],
      byProcsPerHour: [...snapshot.rankings.byProcsPerHour],
    },
    dailyBest: [...snapshot.dailyBest],
    weeklyBest: [...snapshot.weeklyBest],
    updatedAt: snapshot.updatedAt,
  };
}

export function subscribeToPetEfficiency(
  listener: (snapshot: PetEfficiencySnapshot) => void
): () => void {
  listeners.add(listener);
  listener(getPetEfficiencySnapshot()); // Immediate callback
  return () => listeners.delete(listener);
}

export function resetPetEfficiency(): void {
  xpTracking.clear();
  snapshot = {
    pets: new Map(),
    rankings: {
      byXpRate: [],
      byAbilityValue: [],
      byEfficiencyScore: [],
      byProcsPerHour: [],
    },
    dailyBest: [],
    weeklyBest: [],
    updatedAt: Date.now(),
  };
  scheduleSave();
  notifyListeners();
}
