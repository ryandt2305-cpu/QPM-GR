// src/features/petEfficiency.ts
// Ranks pets by XP gain rate and ability value generated per hour.

import { onActivePetInfos, type ActivePetInfo } from '../store/pets';
import { getAbilityHistorySnapshot, type AbilityHistory } from '../store/abilityLogs';
import { abilityDefinitions } from '../data/petAbilities';
import { storage } from '../utils/storage';
import { debounce } from '../utils/helpers';

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

// Simplified ability value estimation (coin values based on common abilities)
const ABILITY_VALUE_ESTIMATES: Record<string, number> = {
  // Coin finders (average coin value)
  'CoinFinder': 60000, // Coin Finder I: avg ~60k per proc
  'CoinFinderII': 600000, // Coin Finder II: avg ~600k per proc
  'CoinFinderIII': 5000000, // Coin Finder III: avg ~5M per proc

  // Gold/Rainbow granters (very valuable - estimate based on crop value)
  'GoldGranter': 500000, // Assuming avg gold crop worth ~500k
  'RainbowGranter': 1000000, // Assuming avg rainbow crop worth ~1M

  // Crop size boost (harder to estimate, conservative)
  'ProduceScaleBoost': 50000, // Conservative estimate
  'ProduceScaleBoostII': 80000,

  // XP boost (value in terms of progression)
  'XPBoost': 30000, // XP valued at ~100 coins per point (300 XP * 100)
  'XPBoostII': 40000, // 400 XP * 100

  // Growth boosters (time savings, lower direct coin value)
  'PlantGrowthBoost': 20000,
  'PlantGrowthBoostII': 30000,
  'EggGrowthBoost': 25000,
  'EggGrowthBoostII': 35000,

  // Sell boosts (depends on selling, medium value)
  'SellBoostI': 40000,
  'SellBoostII': 50000,
  'SellBoostIII': 60000,
  'SellBoostIV': 70000,

  // Other abilities
  'DoubleHarvest': 100000, // Very valuable on proc
  'ProduceEater': 80000, // Eats crops but generates coins
  'ProduceRefund': 50000,
};

function estimateAbilityValue(abilityId: string): number {
  // Check direct match
  if (ABILITY_VALUE_ESTIMATES[abilityId]) {
    return ABILITY_VALUE_ESTIMATES[abilityId];
  }

  // Find ability definition to categorize
  const def = abilityDefinitions.find(d => d.id === abilityId);
  if (!def) return 10000; // Default low value

  // Categorize by type
  if (def.category === 'coins') return 100000;
  if (def.category === 'xp') return 30000;
  if (def.category === 'plantGrowth') return 20000;
  if (def.category === 'eggGrowth') return 25000;

  return 10000; // Default for misc
}

function calculateAbilityMetrics(
  petId: string,
  slotIndex: number,
  abilities: string[],
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
  const abilityValues = new Map<string, number>();

  for (const abilityId of abilities) {
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

    const procCount = history.events.length;
    totalProcs += procCount;

    const firstProc = Math.min(...history.events.map(e => e.performedAt));
    if (oldestProc === null || firstProc < oldestProc) {
      oldestProc = firstProc;
    }

    const valueEstimate = estimateAbilityValue(abilityId);
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

  const duration = oldestProc ? now - oldestProc : HOUR_MS;
  const hours = Math.max(0.01, duration / HOUR_MS);

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
