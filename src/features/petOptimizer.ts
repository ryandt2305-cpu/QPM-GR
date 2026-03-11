// src/features/petOptimizer.ts
// Smart pet management analyzer - identifies obsolete pets, upgrades, and optimization opportunities

import { log } from '../utils/logger';
import { storage } from '../utils/storage';
import { getActivePetInfos, type ActivePetInfo } from '../store/pets';
import { getAtomByLabel, readAtomValue } from '../core/jotaiBridge';
import { getAbilityDefinition } from '../data/petAbilities';
import { calculateMaxStrength, getSpeciesXpPerLevel } from '../store/xpTracker';
import {
  buildPetCompareProfile,
  captureProgressionStage,
  createValuationContext,
  type CompareAbilityGroup,
  type ComparePetInput,
  type ProgressionStageSnapshot,
} from './petCompareEngine';
import {
  COMPARE_GROUP_FILTER_OPTIONS,
  isCompareGroupId,
} from '../data/petCompareRules';

/**
 * Parse max level from pet name (e.g., "Food (99)" -> 99, "Worm [100]" -> 100)
 * Users often put max level in parentheses or brackets
 */
function parseMaxLevelFromName(name: string | null | undefined): number | null {
  if (!name) return null;
  const match = name.match(/[\(\[](\d+)[\)\]]/);
  return match && match[1] ? parseInt(match[1], 10) : null;
}

/**
 * High-value abilities that make a pet worth keeping even if other abilities could be upgraded
 * These are typically rare, unique, or extremely useful abilities
 */
const HIGH_VALUE_ABILITIES = new Set([
  // Mutation granters (extremely rare and valuable)
  'RainbowGranter',
  'GoldGranter',

  // Sell boosts (high value for coins)
  'SellBoostIII',
  'SellBoostIV',

  // XP boosts (valuable for leveling)
  'PetXpBoost',
  'PetXpBoostII',

  // Crop size boost (valuable for journal)
  'ProduceScaleBoost',
  'ProduceScaleBoostII',

  // Growth boosts (valuable for speed)
  'PlantGrowthBoostII',
  'EggGrowthBoostII_NEW',
  'EggGrowthBoostII',

  // Mutation boosts (rare)
  'ProduceMutationBoostII',
  'PetMutationBoostII',

  // Max strength boost (valuable for breeding)
  'PetHatchSizeBoost',
  'PetHatchSizeBoostII',

  // Hatch XP boost (valuable for breeding)
  'PetAgeBoostII',

  // Coin/Seed finders (higher tiers)
  'CoinFinderIII',
  'SeedFinderIII',
  'SeedFinderIV',

  // Special rare abilities
  'DoubleHarvest',
  'RainDance',
]);

/**
 * Check if a pet has high-value abilities that make it worth keeping
 */
function hasHighValueAbilities(pet: CollectedPet): boolean {
  return pet.abilityIds.some(id => HIGH_VALUE_ABILITIES.has(id));
}

/**
 * Low-value abilities (primarily Tier I abilities and unwanted ones)
 * These are generally replaceable and not worth keeping late-game
 */
const LOW_VALUE_ABILITIES = new Set([
  // Tier I abilities (all replaceable)
  'PlantGrowthBoost', // Tier I
  'EggGrowthBoost', // Tier I
  'CoinFinder', // Tier I
  'SeedFinder', // Tier I (also marked as SeedFinderI)
  'SeedFinderI',
  'SellBoostI',
  'ProduceMutationBoost', // Tier I
  'PetMutationBoost', // Tier I
  'PetXpBoost', // Tier I
  'ProduceScaleBoost', // Tier I
  'PetHatchSizeBoost', // Tier I

  // Unwanted abilities
  'ProduceEater', // Crop Eater - generally unwanted
]);

/**
 * Species rarity classification (from game source)
 */
const COMMON_SPECIES = new Set(['Worm', 'Snail', 'Bee']);
const UNCOMMON_SPECIES = new Set(['Chicken', 'Bunny', 'Dragonfly']);
const RARE_SPECIES = new Set(['Pig', 'Cow', 'Turkey']);
const LEGENDARY_SPECIES = new Set(['Squirrel', 'Turtle', 'Goat']);
const MYTHICAL_SPECIES = new Set(['Butterfly', 'Peacock', 'Capybara']);

function isRarePlus(species: string | null): boolean {
  if (!species) return false;
  return RARE_SPECIES.has(species) || LEGENDARY_SPECIES.has(species) || MYTHICAL_SPECIES.has(species);
}

// ============================================================================
// Types
// ============================================================================

export type PetLocation = 'active' | 'inventory' | 'hutch';
export type PetStatus = 'keep' | 'consider' | 'obsolete' | 'upgrade' | 'review';

export interface CollectedPet {
  // Identity
  id: string;
  name: string | null;
  species: string | null;
  location: PetLocation;
  slotIndex: number;

  // Stats
  strength: number;
  maxStrength: number | null; // CRITICAL: Higher max STR = more potential
  targetScale: number | null;
  xp: number | null;
  level: number | null;

  // Abilities & Mutations
  abilities: string[]; // Ability names from game
  abilityIds: string[]; // Mapped to ability IDs
  mutations: string[];
  hasGold: boolean;
  hasRainbow: boolean;

  // Raw data
  raw: unknown;
}

export interface PetScore {
  total: number; // 0-1000
  granterBonus: number; // Rainbow/Gold Granter contribution (0-95)
  granterType: 'rainbow' | 'gold' | null; // Which granter provided the bonus
  breakdown: {
    currentStrength: number; // 0-200 (STR × 2)
    maxStrength: number; // 0-200 (Max STR × 2)
    potential: number; // 0-100 (room for growth)
    abilityTier: number; // 0-300 (sum of tier scores)
    abilityRarity: number; // 0-100 (rare abilities bonus)
    mutation: number; // 0-100 (Rainbow=100, Gold=50)
  };
}

export interface PetComparison {
  pet: CollectedPet;
  score: PetScore;
  status: PetStatus;
  reason: string;
  betterAlternatives: CollectedPet[]; // Pets that make this one obsolete
  upgradeOpportunities: string[]; // Higher tier abilities available
}

export type OptimizerCompareFilter = CompareAbilityGroup | 'all';

export interface OptimizerAnalysis {
  allPets: CollectedPet[];
  comparisons: PetComparison[];

  // Grouped by status
  keep: PetComparison[];
  consider: PetComparison[];
  obsolete: PetComparison[];
  upgrades: PetComparison[];
  review: PetComparison[];

  // Compare-group filtered
  strategyPets: Map<CompareAbilityGroup, PetComparison[]>;

  // Summary stats
  totalPets: number;
  activePets: number;
  inventoryPets: number;
  hutchPets: number;
  obsoleteCount: number;
  upgradeCount: number;
  reviewCount: number;
}

export interface OptimizerConfig {
  selectedStrategy: OptimizerCompareFilter;
  showObsoleteOnly: boolean;
  groupBySpecies: boolean; // Group pets by species within each status section
  sortBy: 'strength' | 'maxStrength' | 'score' | 'location';
  sortDirection: 'asc' | 'desc';
  minStrengthThreshold: number; // Only show pets below this STR (deprecated - use minMaxStrength)
  protectedPetIds: Set<string>; // User-marked as protected

  // STRICTNESS CONTROLS
  mutationProtection: 'both' | 'rainbow' | 'none'; // Which mutations to protect from obsolete status
  minMaxStrength: number; // 0-100, pets below this max strength are obsolete (0 = disabled)
  minTargetScale: number; // 1.0-2.5, pets below this target scale are obsolete (1.0 = disabled)
  minAbilityCount: 1 | 2 | 3; // Minimum number of abilities required
  onlyRarePlus: boolean; // Only keep Rare/Legendary/Mythical species
  markLowValueAbilities: boolean; // Mark pets with ONLY low-value abilities as obsolete
  prioritizeActivePets: boolean; // Give active pets priority in ranking
}

// ============================================================================
// State
// ============================================================================

const DEFAULT_CONFIG: OptimizerConfig = {
  selectedStrategy: 'all',
  showObsoleteOnly: false,
  groupBySpecies: false,
  sortBy: 'score',
  sortDirection: 'desc',
  minStrengthThreshold: 100,
  protectedPetIds: new Set(),

  mutationProtection: 'both',
  minMaxStrength: 0,
  minTargetScale: 1.0,
  minAbilityCount: 1,
  onlyRarePlus: false,
  markLowValueAbilities: false,
  prioritizeActivePets: true,
};

let config: OptimizerConfig = { ...DEFAULT_CONFIG, protectedPetIds: new Set() };
let cachedAnalysis: OptimizerAnalysis | null = null;
let analysisTimestamp = 0;
const ANALYSIS_CACHE_TTL_MS = 30000; // 30 seconds

const listeners = new Set<(analysis: OptimizerAnalysis) => void>();

// ============================================================================
// Configuration
// ============================================================================

export function getOptimizerConfig(): OptimizerConfig {
  return { ...config, protectedPetIds: new Set(config.protectedPetIds) };
}

export function setOptimizerConfig(updates: Partial<OptimizerConfig>): void {
  config = { ...config, ...updates };
  saveConfig();
  invalidateCache();
}

export function protectPet(petId: string): void {
  config.protectedPetIds.add(petId);
  saveConfig();
  invalidateCache();
}

export function unprotectPet(petId: string): void {
  config.protectedPetIds.delete(petId);
  saveConfig();
  invalidateCache();
}

function saveConfig(): void {
  storage.set('petOptimizer:config.v2', {
    ...config,
    protectedPetIds: Array.from(config.protectedPetIds),
  });
}

function normalizeStoredStrategy(value: unknown): OptimizerCompareFilter {
  if (typeof value !== 'string') return 'all';
  if (value === 'all') return 'all';
  return isCompareGroupId(value) ? value : 'all';
}

function loadConfig(): void {
  const stored = storage.get<Partial<OptimizerConfig> & { selectedStrategy?: unknown }>('petOptimizer:config.v2');
  if (stored) {
    config = {
      ...DEFAULT_CONFIG,
      ...stored,
      selectedStrategy: normalizeStoredStrategy(stored.selectedStrategy),
      protectedPetIds: new Set(stored.protectedPetIds || []),
    };
  }
}

function invalidateCache(): void {
  cachedAnalysis = null;
  analysisTimestamp = 0;
}

// ============================================================================
// Data Collection
// ============================================================================

/**
 * Collect all pets from active slots, inventory, and hutch
 */
export async function collectAllPets(): Promise<CollectedPet[]> {
  const pets: CollectedPet[] = [];

  try {
    // 1. Active pets (3 slots)
    const activePets = getActivePetInfos();
    for (const pet of activePets) {
      const collected = activePetToCollected(pet);
      if (collected) pets.push(collected);
    }

    // 2. Inventory pets
    const inventoryPets = await getInventoryPets();
    pets.push(...inventoryPets);

    // 3. Hutch pets
    const hutchPets = await getHutchPets();
    pets.push(...hutchPets);
  } catch (error) {
    log('❌ Pet Optimizer: Error during collection:', error);
    throw error;
  }

  return pets;
}

function activePetToCollected(pet: ActivePetInfo): CollectedPet | null {
  if (!pet.species) return null;

  const abilityIds = pet.abilities.map(name => {
    const def = getAbilityDefinition(name);
    return def?.id || name;
  });

  const maxStr = pet.species && pet.targetScale
    ? calculateMaxStrength(pet.targetScale, pet.species)
    : null;

  return {
    id: pet.petId || `active-${pet.slotIndex}`,
    name: pet.name,
    species: pet.species,
    location: 'active',
    slotIndex: pet.slotIndex,
    strength: pet.strength || 0,
    maxStrength: maxStr,
    targetScale: pet.targetScale,
    xp: pet.xp,
    level: pet.level,
    abilities: pet.abilities,
    abilityIds,
    mutations: pet.mutations,
    hasGold: pet.mutations.some(m => m.toLowerCase().includes('gold')),
    hasRainbow: pet.mutations.some(m => m.toLowerCase().includes('rainbow')),
    raw: pet.raw,
  };
}

async function getInventoryPets(): Promise<CollectedPet[]> {
  try {
    const atom = getAtomByLabel('myInventoryAtom');
    if (!atom) {
      log('⚠️ Pet Optimizer: myInventoryAtom not found');
      return [];
    }

    const inventory = await readAtomValue(atom) as { items?: unknown[] } | null;
    if (!inventory || !Array.isArray(inventory.items)) {
      return [];
    }

    const pets: CollectedPet[] = [];
    for (const item of inventory.items) {
      if (typeof item !== 'object' || item === null) continue;
      const itemObj = item as Record<string, unknown>;

      // STRICT filter: Only include items that are explicitly pets
      // Check for itemType === 'Pet' OR petSpecies field (pets have petSpecies, crops have species)
      if (
        itemObj.itemType === 'Pet' ||
        'petSpecies' in itemObj
      ) {
        const collected = inventoryItemToCollected(itemObj, 'inventory');
        if (collected) pets.push(collected);
      }
    }

    return pets;
  } catch (error) {
    log('⚠️ Pet Optimizer: Failed to get inventory pets:', error);
    return [];
  }
}

async function getHutchPets(): Promise<CollectedPet[]> {
  try {
    const atom = getAtomByLabel('myPetHutchPetItemsAtom');
    if (!atom) {
      log('⚠️ Pet Optimizer: myPetHutchPetItemsAtom not found');
      return [];
    }

    const hutchItems = await readAtomValue(atom);
    if (!hutchItems || !Array.isArray(hutchItems)) {
      return [];
    }

    const pets: CollectedPet[] = [];
    for (const item of hutchItems) {
      const collected = inventoryItemToCollected(item, 'hutch');
      if (collected) pets.push(collected);
    }

    return pets;
  } catch (error) {
    log('⚠️ Pet Optimizer: Failed to get hutch pets:', error);
    return [];
  }
}

function inventoryItemToCollected(
  item: Record<string, unknown>,
  location: PetLocation
): CollectedPet | null {
  const species = (item.petSpecies as string) || (item.species as string) || null;
  if (!species) return null;

  const name = (item.name as string) || null;
  const id = (item.id as string) || `${location}-${Math.random()}`;

  // Extract abilities
  const abilitiesRaw = item.abilities || item.ability || [];
  const abilities = Array.isArray(abilitiesRaw)
    ? abilitiesRaw.filter((a): a is string => typeof a === 'string')
    : [];

  const abilityIds = abilities.map(name => {
    const def = getAbilityDefinition(name);
    return def?.id || name;
  });

  // Extract stats
  const targetScale = typeof item.targetScale === 'number' ? item.targetScale : null;
  const xp = typeof item.xp === 'number' ? item.xp : null;
  const level = typeof item.level === 'number' ? item.level : null;

  // Calculate current strength and max strength using XP tracker formulas
  let currentStrength: number;
  let maxStr: number | null = null;

  const xpPerLevel = getSpeciesXpPerLevel(species);

  // Try to get current strength from game data first
  if (typeof item.strength === 'number' && item.strength > 0) {
    currentStrength = item.strength;

    // Calculate max level from current strength and XP
    if (xp !== null && xpPerLevel) {
      const levelsGainedFromXp = Math.floor(xp / xpPerLevel);
      const actualLevelsGained = Math.min(30, levelsGainedFromXp); // Cap at 30
      const hatchLevel = currentStrength - actualLevelsGained;
      maxStr = Math.min(hatchLevel + 30, 100); // Cap at 100
    } else if (targetScale) {
      maxStr = calculateMaxStrength(targetScale, species);
    }
  } else {
    // If no strength data, calculate from XP and max level in name
    const parsedMaxLevel = parseMaxLevelFromName(name);

    if (parsedMaxLevel && parsedMaxLevel >= 80 && parsedMaxLevel <= 100 && xp !== null && xpPerLevel) {
      // Valid max level found in name - calculate current strength
      maxStr = parsedMaxLevel;
      const hatchLevel = maxStr - 30;
      const levelsGainedFromXp = Math.floor(xp / xpPerLevel);
      const actualLevelsGained = Math.min(30, levelsGainedFromXp);
      currentStrength = hatchLevel + actualLevelsGained;
    } else if (targetScale) {
      // Fallback to targetScale if available
      maxStr = calculateMaxStrength(targetScale, species);
      currentStrength = maxStr !== null ? maxStr : 0; // Assume at max if no other info
    } else {
      // Final fallback
      currentStrength = 0;
      maxStr = null;
    }
  }

  // Extract mutations
  const mutationsRaw = item.mutations || [];
  const mutations = Array.isArray(mutationsRaw)
    ? mutationsRaw.filter((m): m is string => typeof m === 'string')
    : [];

  return {
    id,
    name,
    species,
    location,
    slotIndex: -1,
    strength: currentStrength,
    maxStrength: maxStr,
    targetScale,
    xp,
    level,
    abilities,
    abilityIds,
    mutations,
    hasGold: mutations.some(m => m.toLowerCase().includes('gold')),
    hasRainbow: mutations.some(m => m.toLowerCase().includes('rainbow')),
    raw: item,
  };
}

// ============================================================================
// Pet Scoring
// ============================================================================

/**
 * Calculate comprehensive score for a pet
 * Higher score = more valuable
 */
export function calculatePetScore(pet: CollectedPet): PetScore {
  const breakdown = {
    currentStrength: pet.strength * 2, // 0-200
    maxStrength: (pet.maxStrength || pet.strength) * 2, // 0-200
    potential: 0,
    abilityTier: 0,
    abilityRarity: 0,
    mutation: 0,
  };

  // Potential score: room for growth
  if (pet.maxStrength && pet.maxStrength > pet.strength) {
    const growthRoom = pet.maxStrength - pet.strength;
    breakdown.potential = Math.min(100, growthRoom * 3); // Up to 100 points
  }

  // Filter out unwanted abilities on mutation pets (Crop Eater, Seed Finder I)
  const UNWANTED_MUTATION_ABILITIES = new Set(['ProduceEater', 'SeedFinderI']);
  const abilitiesToScore = (pet.hasRainbow || pet.hasGold)
    ? pet.abilityIds.filter(id => !UNWANTED_MUTATION_ABILITIES.has(id))
    : pet.abilityIds;

  // Ability tier scoring
  breakdown.abilityTier = calculateAbilityTierScore(abilitiesToScore);

  // Ability rarity scoring
  breakdown.abilityRarity = calculateAbilityRarityScore(abilitiesToScore);

  // Mutation bonus
  if (pet.hasRainbow) {
    breakdown.mutation = 100;
  } else if (pet.hasGold) {
    breakdown.mutation = 50;
  }

  // Track granter bonus separately for display purposes
  let granterBonus = 0;
  let granterType: 'rainbow' | 'gold' | null = null;

  if (pet.abilityIds.includes('RainbowGranter')) {
    granterBonus = SPECIAL_ABILITY_SCORES['RainbowGranter'] || 95;
    granterType = 'rainbow';
  } else if (pet.abilityIds.includes('GoldGranter')) {
    granterBonus = SPECIAL_ABILITY_SCORES['GoldGranter'] || 85;
    granterType = 'gold';
  }

  const total =
    breakdown.currentStrength +
    breakdown.maxStrength +
    breakdown.potential +
    breakdown.abilityTier +
    breakdown.abilityRarity +
    breakdown.mutation;

  return { total, breakdown, granterBonus, granterType };
}

const TIER_SCORES: Record<string, number> = {
  I: 25,
  II: 50,
  III: 75,
  IV: 100,
};

const SPECIAL_ABILITY_SCORES: Record<string, number> = {
  Copycat: 100,
  RainDance: 80,
  DoubleHatch: 90,
  DoubleHarvest: 85,
  RainbowGranter: 95,
  GoldGranter: 85,
  SeedFinderIV: 100,
  CoinFinderIII: 100,
};

function calculateAbilityTierScore(abilityIds: string[]): number {
  let total = 0;

  for (const abilityId of abilityIds) {
    // Check for special abilities
    if (abilityId in SPECIAL_ABILITY_SCORES) {
      const score = SPECIAL_ABILITY_SCORES[abilityId];
      if (score !== undefined) {
        total += score;
        continue;
      }
    }

    // Extract tier from ability ID (e.g., "SellBoostII" → "II")
    const tierMatch = abilityId.match(/(I{1,3}|IV)$/);
    if (tierMatch && tierMatch[1]) {
      const tier = tierMatch[1];
      const tierScore = TIER_SCORES[tier];
      total += tierScore !== undefined ? tierScore : 25;
    } else {
      // No tier = base score
      total += 50;
    }
  }

  return Math.min(300, total); // Cap at 300
}

function calculateAbilityRarityScore(abilityIds: string[]): number {
  // Bonus for having 3 abilities (max)
  if (abilityIds.length === 3) return 100;
  if (abilityIds.length === 2) return 60;
  if (abilityIds.length === 1) return 30;
  return 0;
}

// ============================================================================
// Pet Comparison & Analysis
// ============================================================================

interface OptimizerCompareSnapshot {
  score: number;
  reviewCount: number;
  groupSignature: string;
  groups: CompareAbilityGroup[];
}

function toCompareInput(pet: CollectedPet): ComparePetInput {
  return {
    id: pet.id,
    species: pet.species ?? 'Unknown',
    strength: pet.strength,
    targetScale: pet.targetScale,
    abilities: pet.abilityIds,
    mutations: pet.mutations,
  };
}

function createCompareSnapshotMap(
  pets: CollectedPet[],
): { stage: ProgressionStageSnapshot; byPetId: Map<string, OptimizerCompareSnapshot> } {
  const stage = captureProgressionStage(pets.map((pet) => toCompareInput(pet)));
  const valuationContext = createValuationContext();
  const byPetId = new Map<string, OptimizerCompareSnapshot>();

  for (const pet of pets) {
    const profile = buildPetCompareProfile(toCompareInput(pet), stage, valuationContext);
    const groups = profile.abilities
      .filter((entry) => !entry.isIgnored && !entry.isReview)
      .map((entry) => entry.group)
      .filter((group, index, all) => all.indexOf(group) === index)
      .sort();
    const grouped = groups.join('|');

    byPetId.set(pet.id, {
      score: profile.score,
      reviewCount: profile.reviewCount,
      groupSignature: grouped || 'review',
      groups: groups.length > 0 ? groups : ['isolated'],
    });
  }

  return { stage, byPetId };
}

/**
 * Analyze all collected pets and determine status (ASYNC version for better performance)
 * Breaks work into chunks to prevent blocking the main thread
 */
export async function analyzePetsAsync(pets: CollectedPet[], onProgress?: (percent: number) => void): Promise<OptimizerAnalysis> {
  const comparisons: PetComparison[] = [];
  const CHUNK_SIZE = 10; // Process 10 pets at a time

  // Calculate scores for all pets (fast, synchronous)
  const petScores = new Map<string, PetScore>();
  for (const pet of pets) {
    petScores.set(pet.id, calculatePetScore(pet));
  }

  const compareSnapshots = createCompareSnapshotMap(pets);

  // Group pets by species + ability combination (fast, synchronous)
  const groups = groupPetsByAbilities(pets, compareSnapshots.byPetId);

  // Analyze pets in chunks to avoid blocking UI
  for (let i = 0; i < pets.length; i += CHUNK_SIZE) {
    const chunk = pets.slice(i, i + CHUNK_SIZE);

    for (const pet of chunk) {
      const score = petScores.get(pet.id)!;
      const comparison = analyzePet(pet, score, pets, groups, compareSnapshots.byPetId, compareSnapshots.stage);
      comparisons.push(comparison);
    }

    // Report progress
    if (onProgress) {
      onProgress(Math.min(100, Math.round(((i + CHUNK_SIZE) / pets.length) * 100)));
    }

    // Yield control back to browser every chunk
    if (i + CHUNK_SIZE < pets.length) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  // Categorize by status (fast, synchronous)
  const keep = comparisons.filter(c => c.status === 'keep');
  const consider = comparisons.filter(c => c.status === 'consider');
  const obsolete = comparisons.filter(c => c.status === 'obsolete');
  const upgrades = comparisons.filter(c => c.status === 'upgrade');
  const review = comparisons.filter(c => c.status === 'review');

  // Group by compare category (fast, synchronous)
  const strategyPets = new Map<CompareAbilityGroup, PetComparison[]>();
  for (const option of COMPARE_GROUP_FILTER_OPTIONS) {
    const filtered = comparisons.filter((comparison) => {
      const snapshot = compareSnapshots.byPetId.get(comparison.pet.id);
      return !!snapshot?.groups.includes(option.id);
    });
    strategyPets.set(option.id, filtered);
  }

  return {
    allPets: pets,
    comparisons,
    keep,
    consider,
    obsolete,
    upgrades,
    review,
    strategyPets,
    totalPets: pets.length,
    activePets: pets.filter(p => p.location === 'active').length,
    inventoryPets: pets.filter(p => p.location === 'inventory').length,
    hutchPets: pets.filter(p => p.location === 'hutch').length,
    obsoleteCount: obsolete.length,
    upgradeCount: upgrades.length,
    reviewCount: review.length,
  };
}

/**
 * Analyze all collected pets and determine status (SYNCHRONOUS version - kept for compatibility)
 * NOTE: Use analyzePetsAsync() for better performance to avoid blocking the UI
 */
export function analyzePets(pets: CollectedPet[]): OptimizerAnalysis {
  const comparisons: PetComparison[] = [];

  // Calculate scores for all pets
  const petScores = new Map<string, PetScore>();
  for (const pet of pets) {
    petScores.set(pet.id, calculatePetScore(pet));
  }

  const compareSnapshots = createCompareSnapshotMap(pets);

  // Group pets by species + ability combination
  const groups = groupPetsByAbilities(pets, compareSnapshots.byPetId);

  // Analyze each pet
  for (const pet of pets) {
    const score = petScores.get(pet.id)!;
    const comparison = analyzePet(pet, score, pets, groups, compareSnapshots.byPetId, compareSnapshots.stage);
    comparisons.push(comparison);
  }

  // Categorize by status
  const keep = comparisons.filter(c => c.status === 'keep');
  const consider = comparisons.filter(c => c.status === 'consider');
  const obsolete = comparisons.filter(c => c.status === 'obsolete');
  const upgrades = comparisons.filter(c => c.status === 'upgrade');
  const review = comparisons.filter(c => c.status === 'review');

  // Group by compare category
  const strategyPets = new Map<CompareAbilityGroup, PetComparison[]>();
  for (const option of COMPARE_GROUP_FILTER_OPTIONS) {
    const filtered = comparisons.filter((comparison) => {
      const snapshot = compareSnapshots.byPetId.get(comparison.pet.id);
      return !!snapshot?.groups.includes(option.id);
    });
    strategyPets.set(option.id, filtered);
  }

  return {
    allPets: pets,
    comparisons,
    keep,
    consider,
    obsolete,
    upgrades,
    review,
    strategyPets,
    totalPets: pets.length,
    activePets: pets.filter(p => p.location === 'active').length,
    inventoryPets: pets.filter(p => p.location === 'inventory').length,
    hutchPets: pets.filter(p => p.location === 'hutch').length,
    obsoleteCount: obsolete.length,
    upgradeCount: upgrades.length,
    reviewCount: review.length,
  };
}

interface PetGroup {
  species: string;
  abilitySignature: string;
  pets: CollectedPet[];
}

function getMaxStrengthValue(pet: CollectedPet): number {
  return pet.maxStrength ?? pet.strength;
}

function hasRainbowGranter(pet: CollectedPet): boolean {
  return pet.abilityIds.includes('RainbowGranter');
}

function shouldPreferLateGameStrength(
  incumbent: CollectedPet,
  challenger: CollectedPet,
  stage: ProgressionStageSnapshot,
): boolean {
  // Late-game preference lock: +3 max STR outweighs Rainbow Granter pressure.
  if (stage.stage !== 'late') return false;
  if (!hasRainbowGranter(challenger) || hasRainbowGranter(incumbent)) return false;

  const maxStrDelta = getMaxStrengthValue(incumbent) - getMaxStrengthValue(challenger);
  return maxStrDelta >= 3;
}

function groupPetsByAbilities(
  pets: CollectedPet[],
  compareByPetId: Map<string, OptimizerCompareSnapshot>,
): Map<string, PetGroup> {
  const groups = new Map<string, PetGroup>();

  for (const pet of pets) {
    if (!pet.species) continue;

    const compare = compareByPetId.get(pet.id);
    const signature = compare?.groupSignature || [...pet.abilityIds].sort().join(',');
    const key = `${pet.species}:${signature}`;

    if (!groups.has(key)) {
      groups.set(key, {
        species: pet.species,
        abilitySignature: signature,
        pets: [],
      });
    }

    groups.get(key)!.pets.push(pet);
  }

  return groups;
}

/**
 * Check if this pet is the only source of any of its abilities
 * Returns the ability ID if it's the only source, null otherwise
 */
function getOnlySourceAbility(pet: CollectedPet, allPets: CollectedPet[]): string | null {
  // Only check high-value abilities for "only source" protection
  const highValueAbilitiesOnPet = pet.abilityIds.filter(id => HIGH_VALUE_ABILITIES.has(id));

  if (highValueAbilitiesOnPet.length === 0) {
    return null; // No high-value abilities to protect
  }

  // Check each high-value ability
  for (const abilityId of highValueAbilitiesOnPet) {
    // Count how many pets have this ability
    const petsWithAbility = allPets.filter(p =>
      p.id !== pet.id && p.abilityIds.includes(abilityId)
    );

    if (petsWithAbility.length === 0) {
      // This pet is the ONLY source of this ability!
      return abilityId;
    }
  }

  return null; // Not the only source of any ability
}

function analyzePet(
  pet: CollectedPet,
  score: PetScore,
  allPets: CollectedPet[],
  groups: Map<string, PetGroup>,
  compareByPetId: Map<string, OptimizerCompareSnapshot>,
  stage: ProgressionStageSnapshot,
): PetComparison {
  // Check if protected by user
  if (config.protectedPetIds.has(pet.id)) {
    return {
      pet,
      score,
      status: 'keep',
      reason: '🔒 Protected by user',
      betterAlternatives: [],
      upgradeOpportunities: [],
    };
  }

  // Check if this pet is the only source of a high-value ability
  const onlySourceAbility = getOnlySourceAbility(pet, allPets);
  if (onlySourceAbility) {
    const def = getAbilityDefinition(onlySourceAbility);
    const abilityName = def?.name || onlySourceAbility;
    return {
      pet,
      score,
      status: 'keep',
      reason: `⭐ Only source of ${abilityName}`,
      betterAlternatives: [],
      upgradeOpportunities: [],
    };
  }

  // === STRICTNESS FILTERS ===
  // Apply configured filters to mark pets obsolete early
  // Skip filters if pet has high-value abilities, rainbow mutation, or is only source

  const hasProtection = hasHighValueAbilities(pet) || pet.hasRainbow || onlySourceAbility !== null;
  const compareSnapshot = compareByPetId.get(pet.id);

  if (compareSnapshot?.reviewCount && compareSnapshot.reviewCount > 0) {
    return {
      pet,
      score,
      status: 'review',
      reason: 'Review required: unknown or unmapped abilities detected',
      betterAlternatives: [],
      upgradeOpportunities: [],
    };
  }

  // Filter 1: Species rarity (only keep Rare+)
  if (config.onlyRarePlus && !hasProtection && !isRarePlus(pet.species)) {
    return {
      pet,
      score,
      status: 'obsolete',
      reason: '❌ Common/Uncommon species (filter: Rare+ only)',
      betterAlternatives: [],
      upgradeOpportunities: [],
    };
  }

  // Filter 2: Minimum ability count
  if (!hasProtection && pet.abilityIds.length < config.minAbilityCount) {
    return {
      pet,
      score,
      status: 'obsolete',
      reason: `❌ Only ${pet.abilityIds.length} ability(ies) (need ${config.minAbilityCount}+)`,
      betterAlternatives: [],
      upgradeOpportunities: [],
    };
  }

  // Filter 3: Minimum max strength
  if (config.minMaxStrength > 0 && !hasProtection) {
    const maxStr = pet.maxStrength || pet.strength;
    if (maxStr < config.minMaxStrength) {
      return {
        pet,
        score,
        status: 'obsolete',
        reason: `❌ Max strength too low (${maxStr} < ${config.minMaxStrength})`,
        betterAlternatives: [],
        upgradeOpportunities: [],
      };
    }
  }

  // Filter 4: Minimum target scale
  if (config.minTargetScale > 1.0 && !hasProtection && pet.targetScale) {
    if (pet.targetScale < config.minTargetScale) {
      return {
        pet,
        score,
        status: 'obsolete',
        reason: `❌ Target scale too low (${pet.targetScale.toFixed(2)} < ${config.minTargetScale.toFixed(2)})`,
        betterAlternatives: [],
        upgradeOpportunities: [],
      };
    }
  }

  // Filter 5: Low-value abilities only (no mutations to protect)
  if (config.markLowValueAbilities && !hasProtection && !pet.hasGold) {
    const hasOnlyLowValue = pet.abilityIds.every(id => LOW_VALUE_ABILITIES.has(id));
    if (hasOnlyLowValue && pet.abilityIds.length > 0) {
      return {
        pet,
        score,
        status: 'obsolete',
        reason: '❌ Only has low-value abilities (Tier I or unwanted)',
        betterAlternatives: [],
        upgradeOpportunities: [],
      };
    }
  }

  const petCompareScore = compareSnapshot?.score ?? 0;
  const betterPets: CollectedPet[] = allPets
    .filter((other) => {
      if (other.id === pet.id) return false;
      if (other.species !== pet.species) return false;
      const otherSnapshot = compareByPetId.get(other.id);
      if (!otherSnapshot || otherSnapshot.reviewCount > 0) return false;
      if (otherSnapshot.groupSignature !== compareSnapshot?.groupSignature) return false;
      if (shouldPreferLateGameStrength(pet, other, stage)) return false;
      if (otherSnapshot.score > petCompareScore) return true;
      return isPetStrictlyBetter(other, pet);
    })
    .sort((a, b) => {
      const aScore = compareByPetId.get(a.id)?.score ?? 0;
      const bScore = compareByPetId.get(b.id)?.score ?? 0;
      return bScore - aScore;
    });

  // If no better alternatives, keep it
  if (betterPets.length === 0) {
    return {
      pet,
      score,
      status: 'keep',
      reason: '✅ Best available for this ability set',
      betterAlternatives: [],
      upgradeOpportunities: [],
    };
  }

  // Find pet's group (same species + abilities)
  const groupKey = `${pet.species}:${compareSnapshot?.groupSignature ?? [...pet.abilityIds].sort().join(',')}`;
  const group = groups.get(groupKey);

  // For pets in same group, check top 3 pattern
  let isInTop3 = false;
  if (group && group.pets.length > 1) {
    const sortedGroup = [...group.pets].sort((a, b) => {
      const aPreferredForStrength = shouldPreferLateGameStrength(a, b, stage);
      const bPreferredForStrength = shouldPreferLateGameStrength(b, a, stage);
      if (aPreferredForStrength !== bPreferredForStrength) {
        return aPreferredForStrength ? -1 : 1;
      }

      // Priority 1: Active pets get bonus if prioritizeActivePets is enabled
      if (config.prioritizeActivePets) {
        const aIsActive = a.location === 'active' ? 1 : 0;
        const bIsActive = b.location === 'active' ? 1 : 0;
        if (bIsActive !== aIsActive) return bIsActive - aIsActive;
      }

      // Priority 2: Stage-aware compare score.
      const aCompare = compareByPetId.get(a.id)?.score ?? 0;
      const bCompare = compareByPetId.get(b.id)?.score ?? 0;
      if (bCompare !== aCompare) return bCompare - aCompare;

      // Priority 3: Sort by mutation (rainbow > gold > none)
      const aMutScore = a.hasRainbow ? 3 : a.hasGold ? 2 : 1;
      const bMutScore = b.hasRainbow ? 3 : b.hasGold ? 2 : 1;
      if (bMutScore !== aMutScore) return bMutScore - aMutScore;

      // Priority 4: Then by max STR
      const aMaxStr = a.maxStrength || a.strength;
      const bMaxStr = b.maxStrength || b.strength;
      if (bMaxStr !== aMaxStr) return bMaxStr - aMaxStr;

      // Priority 5: Finally by current STR
      return b.strength - a.strength;
    });

    const petRank = sortedGroup.findIndex(p => p.id === pet.id);
    isInTop3 = petRank < 3;
  }

  // Determine status based on better alternatives and top 3 status
  if (betterPets.length > 0 && !isInTop3) {
    // Pet has better alternatives AND is not in top 3
    // Apply mutation protection based on config
    let shouldProtect = false;
    let mutationType = '';

    if (config.mutationProtection === 'both') {
      shouldProtect = pet.hasRainbow || pet.hasGold;
      mutationType = pet.hasRainbow ? 'Rainbow' : 'Gold';
    } else if (config.mutationProtection === 'rainbow') {
      shouldProtect = pet.hasRainbow;
      mutationType = 'Rainbow';
    }
    // 'none' = no protection

    const reason = shouldProtect
      ? `💎 Lower stats but has ${mutationType} mutation - consider keeping`
      : `❌ ${betterPets.length} better pet${betterPets.length > 1 ? 's' : ''} available`;

    return {
      pet,
      score,
      status: shouldProtect ? 'consider' : 'obsolete',
      reason,
      betterAlternatives: betterPets.slice(0, 1),
      upgradeOpportunities: [],
    };
  }

  return {
    pet,
    score,
    status: 'keep',
    reason: isInTop3 ? '✅ Top 3 for this ability set' : '✅ Best available',
    betterAlternatives: [],
    upgradeOpportunities: [],
  };
}

/**
 * Check if petA is strictly better than petB
 * Considers mutations, ability tiers, and strength
 */
function isPetStrictlyBetter(petA: CollectedPet, petB: CollectedPet): boolean {
  // Must be same species
  if (petA.species !== petB.species) return false;

  // Mutation value: Rainbow > Gold > None
  const mutA = petA.hasRainbow ? 3 : petA.hasGold ? 2 : 1;
  const mutB = petB.hasRainbow ? 3 : petB.hasGold ? 2 : 1;

  // Case 1: Same abilities, petA has better mutation or better stats
  const abilitiesA = [...petA.abilityIds].sort().join(',');
  const abilitiesB = [...petB.abilityIds].sort().join(',');

  if (abilitiesA === abilitiesB) {
    // Same abilities - compare mutations first, then stats
    if (mutA > mutB) return true;
    if (mutA < mutB) return false;

    // Same mutation - compare stats
    const maxStrA = petA.maxStrength || petA.strength;
    const maxStrB = petB.maxStrength || petB.strength;

    if (maxStrA > maxStrB) return true;
    if (maxStrA < maxStrB) return false;

    return petA.strength > petB.strength;
  }

  // Case 2: petA has all higher-tier versions of petB's abilities AND equal/better mutation
  // This covers: Seed Finder II/III is better than Seed Finder I
  if (mutA >= mutB) {
    const hasAllUpgrades = petB.abilityIds.every(bAbility => {
      // Check if petA has a higher tier of this ability
      return petA.abilityIds.some(aAbility => {
        return isAbilityUpgrade(aAbility, bAbility);
      });
    });

    if (hasAllUpgrades) return true;
  }

  // Case 3: Mutation pet replaces regular pet with unwanted abilities
  // Example: Rainbow Seed Finder I worm replaces regular Seed Finder I worm
  const UNWANTED_MUTATION_ABILITIES = new Set(['ProduceEater', 'SeedFinderI']);

  if (mutA > mutB) {
    // petA has better mutation (rainbow/gold vs regular)
    // Check if petB only has unwanted abilities that petA also has
    const bHasOnlyUnwanted = petB.abilityIds.every(id => UNWANTED_MUTATION_ABILITIES.has(id));
    const aHasAllOfB = petB.abilityIds.every(bId => petA.abilityIds.includes(bId));

    if (bHasOnlyUnwanted && aHasAllOfB) {
      // Mutation pet can do everything the regular pet can (even though those abilities are unwanted)
      // The mutation itself makes it better
      return true;
    }
  }

  return false;
}

function findUpgradeOpportunities(pet: CollectedPet, allPets: CollectedPet[]): string[] {
  const upgrades: string[] = [];

  for (const abilityId of pet.abilityIds) {
    const tier = extractTier(abilityId);
    if (!tier) continue;

    const nextTier = getNextTier(tier);
    if (!nextTier) continue;

    const baseAbility = abilityId.replace(tier, '');
    const upgradedAbilityId = baseAbility + nextTier;

    // Check if any pet has the upgraded ability
    const hasUpgrade = allPets.some(other =>
      other.abilityIds.includes(upgradedAbilityId)
    );

    if (hasUpgrade) {
      const def = getAbilityDefinition(abilityId);
      const abilityName = def?.name || abilityId;
      upgrades.push(`${abilityName} → Tier ${nextTier}`);
    }
  }

  return upgrades;
}

function extractTier(abilityId: string): string | null {
  const match = abilityId.match(/(I{1,3}|IV)$/);
  return match && match[1] ? match[1] : null;
}

function getNextTier(tier: string): string | null {
  const tierMap: Record<string, string> = {
    I: 'II',
    II: 'III',
    III: 'IV',
  };
  return tierMap[tier] || null;
}

/**
 * Check if abilityA is an upgrade (higher tier) of abilityB
 * Example: isAbilityUpgrade('SeedFinderII', 'SeedFinderI') -> true
 */
function isAbilityUpgrade(abilityA: string, abilityB: string): boolean {
  // Extract base ability names (without tiers)
  const baseA = abilityA.replace(/(I{1,3}|IV)$/, '');
  const baseB = abilityB.replace(/(I{1,3}|IV)$/, '');

  // Must be same base ability
  if (baseA !== baseB) return false;

  // Extract tiers
  const tierA = extractTier(abilityA);
  const tierB = extractTier(abilityB);

  // If either has no tier, not comparable
  if (!tierA || !tierB) return false;

  // Map tiers to numbers for comparison
  const tierValues: Record<string, number> = { 'I': 1, 'II': 2, 'III': 3, 'IV': 4 };

  const valueA = tierValues[tierA];
  const valueB = tierValues[tierB];

  if (valueA === undefined || valueB === undefined) return false;

  return valueA > valueB;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Get full analysis with caching
 */
export async function getOptimizerAnalysis(forceRefresh = false, onProgress?: (percent: number) => void): Promise<OptimizerAnalysis> {
  const now = Date.now();

  if (!forceRefresh && cachedAnalysis && now - analysisTimestamp < ANALYSIS_CACHE_TTL_MS) {
    return cachedAnalysis;
  }

  const pets = await collectAllPets();
  // Use async chunked analysis to prevent UI blocking
  const analysis = await analyzePetsAsync(pets, onProgress);

  cachedAnalysis = analysis;
  analysisTimestamp = now;

  notifyListeners(analysis);

  return analysis;
}

export function onAnalysisUpdate(callback: (analysis: OptimizerAnalysis) => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function notifyListeners(analysis: OptimizerAnalysis): void {
  for (const listener of listeners) {
    try {
      listener(analysis);
    } catch (error) {
      log('⚠️ Pet Optimizer listener error:', error);
    }
  }
}

// ============================================================================
// Initialization
// ============================================================================

export function startPetOptimizer(): void {
  loadConfig();
  log('✅ Pet Optimizer initialized');
}
