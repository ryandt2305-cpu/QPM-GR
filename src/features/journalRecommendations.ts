// src/features/journalRecommendations.ts
// Smart recommendations for completing journal collection

import { log } from '../utils/logger';
import { getJournalSummary, type JournalSummary } from './journalChecker';
import { getHarvestStrategy } from '../data/cropOptimization';
import { getVariantTimeEstimate } from '../data/gameData';
import { readInventoryDirect } from '../store/inventory';
import { getAtomByLabel, readAtomValue } from '../core/jotaiBridge';

// ============================================================================
// Types
// ============================================================================

export type VariantDifficulty = 'easy' | 'medium' | 'hard' | 'very-hard' | 'impossible';

export interface SpeciesRecommendation {
  species: string;
  type: 'produce' | 'pet';
  priority: 'high' | 'medium' | 'low';
  missingVariants: string[];
  completionPct: number;
  difficulty: VariantDifficulty;
  estimatedTime: string;
  strategy: string;
  reasons: string[];
  harvestAdvice?: string; // For crops: freeze-and-sell vs sell-when-mature
}

export interface JournalStrategy {
  recommendedFocus: SpeciesRecommendation[];
  fastestPath: {
    steps: SpeciesRecommendation[];
    estimatedTime: string;
    expectedCompletion: number; // Percentage gain
  };
  lowHangingFruit: SpeciesRecommendation[];
  longTermGoals: SpeciesRecommendation[];
}

interface PlayerResources {
  hasRainbowGranter: boolean;
  hasGoldGranter: boolean;
  hasMutationBoost: boolean;
  hasDawnbinder: boolean;
  hasMoonbinder: boolean;
  granterCount: number;
  granterStrengthAvg: number;
}

// ============================================================================
// Resource Detection
// ============================================================================

/**
 * Check player's available resources (pets with special abilities)
 */
async function detectPlayerResources(): Promise<PlayerResources> {
  const resources: PlayerResources = {
    hasRainbowGranter: false,
    hasGoldGranter: false,
    hasMutationBoost: false,
    hasDawnbinder: false,
    hasMoonbinder: false,
    granterCount: 0,
    granterStrengthAvg: 0,
  };

  try {
    // Check inventory for pets
    const inventory = await readInventoryDirect();
    if (!inventory?.items) {
      log('⚠️ Could not read inventory for resource detection');
      return resources;
    }

    let granterStrengthSum = 0;

    for (const item of inventory.items) {
      if (item.itemType !== 'Pet') continue;

      const abilities = item.abilities || [];
      const strength = item.strength ?? 100;

      // Check for special abilities
      if (abilities.includes('Rainbow Granter')) {
        resources.hasRainbowGranter = true;
        resources.granterCount++;
        granterStrengthSum += strength;
      }
      if (abilities.includes('Gold Granter')) {
        resources.hasGoldGranter = true;
        resources.granterCount++;
        granterStrengthSum += strength;
      }
      if (abilities.includes('Crop Mutation Boost I') || abilities.includes('Crop Mutation Boost II')) {
        resources.hasMutationBoost = true;
      }

      // Check for binder plants
      if (item.species === 'Dawnbinder') {
        resources.hasDawnbinder = true;
      }
      if (item.species === 'Moonbinder') {
        resources.hasMoonbinder = true;
      }
    }

    // Check hutch for pets
    const hutchAtom = getAtomByLabel('myPetHutchAtom');
    if (hutchAtom) {
      const hutch = await readAtomValue<any>(hutchAtom);
      const hutchPets = hutch?.pets || [];

      for (const pet of hutchPets) {
        const abilities = pet.abilities || [];
        const strength = pet.strength ?? 100;

        if (abilities.includes('Rainbow Granter')) {
          resources.hasRainbowGranter = true;
          resources.granterCount++;
          granterStrengthSum += strength;
        }
        if (abilities.includes('Gold Granter')) {
          resources.hasGoldGranter = true;
          resources.granterCount++;
          granterStrengthSum += strength;
        }
        if (abilities.includes('Crop Mutation Boost I') || abilities.includes('Crop Mutation Boost II')) {
          resources.hasMutationBoost = true;
        }
      }
    }

    // Calculate average granter strength
    if (resources.granterCount > 0) {
      resources.granterStrengthAvg = granterStrengthSum / resources.granterCount;
    }

    log(`[JOURNAL] Player resources: Rainbow=${resources.hasRainbowGranter}, Gold=${resources.hasGoldGranter}, Granters=${resources.granterCount}`);
  } catch (error) {
    log('❌ Error detecting player resources:', error);
  }

  return resources;
}

// ============================================================================
// Difficulty Assessment
// ============================================================================

/**
 * Assess difficulty of getting a specific variant
 */
function assessVariantDifficulty(
  variant: string,
  species: string,
  type: 'produce' | 'pet',
  resources: PlayerResources,
): VariantDifficulty {
  // Normal variants are trivial
  if (variant === 'Normal') return 'easy';

  // Max Weight requires Crop Size Boost ability
  if (variant === 'Max Weight') {
    // For now, mark as hard (requires specific ability)
    return 'hard';
  }

  // Color mutations (Rainbow/Gold)
  if (variant === 'Rainbow') {
    if (type === 'pet') {
      // Pet rainbow from hatching - 0.1% chance
      return 'very-hard';
    }
    // Crop rainbow
    if (resources.hasRainbowGranter) {
      return 'medium'; // Easier with Granter pets
    }
    return 'very-hard'; // Without Granter, extremely rare
  }

  if (variant === 'Gold') {
    if (type === 'pet') {
      // Pet gold from hatching - 1% chance
      return 'hard';
    }
    // Crop gold
    if (resources.hasGoldGranter) {
      return 'medium'; // Easier with Granter pets
    }
    return 'very-hard'; // Without Granter, very rare
  }

  // Weather mutations (Wet, Chilled, Frozen)
  if (variant === 'Wet' || variant === 'Chilled') {
    // Rain/Snow occur every 20-35min, fairly common
    return 'easy';
  }

  if (variant === 'Frozen') {
    // Requires Wet+Chilled or Chilled+Wet combo, ~30-45min
    return 'medium';
  }

  // Lunar mutations (Dawnlit, Amberlit)
  if (variant === 'Dawnlit' || variant === 'Ambershine') {
    // Lunar every 4 hours, 1% base chance, Dawn is 67% chance
    return 'medium';
  }

  if (variant === 'Amberlit') {
    // Lunar every 4 hours, 1% base chance, Amber is 33% chance (less common)
    return 'hard';
  }

  // Charged mutations (Dawncharged, Ambercharged)
  if (variant === 'Dawncharged') {
    // Requires Dawnbinder pod + lunar event
    if (!resources.hasDawnbinder) return 'impossible';
    return 'hard'; // 25%/min once placed, but requires lunar timing
  }

  if (variant === 'Ambercharged') {
    // Requires Moonbinder pod + lunar event
    if (!resources.hasMoonbinder) return 'impossible';
    return 'hard'; // 25%/min once placed, but Amber is less common (33%)
  }

  // Default
  return 'medium';
}

/**
 * Calculate overall difficulty for a species (hardest missing variant)
 */
function calculateSpeciesDifficulty(
  missingVariants: string[],
  species: string,
  type: 'produce' | 'pet',
  resources: PlayerResources,
): VariantDifficulty {
  if (missingVariants.length === 0) return 'easy';

  const difficulties = missingVariants.map(v =>
    assessVariantDifficulty(v, species, type, resources)
  );

  // Return the hardest difficulty
  const order: VariantDifficulty[] = ['easy', 'medium', 'hard', 'very-hard', 'impossible'];
  return difficulties.reduce((hardest, current) =>
    order.indexOf(current) > order.indexOf(hardest) ? current : hardest
  );
}

// ============================================================================
// Strategy Generation
// ============================================================================

/**
 * Generate strategy description based on missing variants
 */
function generateStrategy(
  missingVariants: string[],
  species: string,
  type: 'produce' | 'pet',
  resources: PlayerResources,
): string {
  if (missingVariants.length === 0) return 'Complete!';

  const strategies: string[] = [];

  // Check for color mutations
  const needsRainbow = missingVariants.includes('Rainbow');
  const needsGold = missingVariants.includes('Gold');

  if (needsRainbow || needsGold) {
    if (type === 'produce') {
      if (resources.hasRainbowGranter || resources.hasGoldGranter) {
        strategies.push('Plant with Rainbow/Gold Granter pets active');
      } else {
        strategies.push('⚠️ Very rare without Granter pets - consider hatching for Granter abilities');
      }
    } else {
      // Pet color variants from hatching
      strategies.push('Hatch eggs (Rainbow 0.1%, Gold 1% chance)');
    }
  }

  // Check for weather mutations
  const needsWet = missingVariants.includes('Wet');
  const needsChilled = missingVariants.includes('Chilled');
  const needsFrozen = missingVariants.includes('Frozen');

  if (needsWet) strategies.push('Wait for rain weather (~20-35min avg)');
  if (needsChilled) strategies.push('Wait for snow weather (~20-35min avg)');
  if (needsFrozen) {
    strategies.push('Get Wet/Chilled first, then wait for opposite weather (~30-45min total)');
  }

  // Check for lunar mutations
  const needsDawnlit = missingVariants.includes('Dawnlit') || missingVariants.includes('Ambershine');
  const needsAmberlit = missingVariants.includes('Amberlit');
  const needsDawncharged = missingVariants.includes('Dawncharged');
  const needsAmbercharged = missingVariants.includes('Ambercharged');

  if (needsDawnlit) {
    strategies.push('Plant before Dawn event (every 4hr from 12AM AEST, 1% base chance)');
  }
  if (needsAmberlit) {
    strategies.push('Plant before Amber event (every 4hr from 12AM AEST, 33% chance vs Dawn 67%)');
  }
  if (needsDawncharged) {
    if (resources.hasDawnbinder) {
      strategies.push('Place Dawnlit crop next to Dawnbinder during Dawn (25%/min)');
    } else {
      strategies.push('⚠️ IMPOSSIBLE - Need Dawnbinder plant in garden');
    }
  }
  if (needsAmbercharged) {
    if (resources.hasMoonbinder) {
      strategies.push('Place Amberlit crop next to Moonbinder during Amber (25%/min)');
    } else {
      strategies.push('⚠️ IMPOSSIBLE - Need Moonbinder plant in garden');
    }
  }

  // Check for Max Weight
  const needsMaxWeight = missingVariants.includes('Max Weight');
  if (needsMaxWeight) {
    strategies.push('Requires Crop Size Boost I/II ability to reach max size');
  }

  return strategies.join(' | ') || 'Grow normally';
}

/**
 * Generate reasons for prioritizing this species
 */
function generateReasons(
  species: string,
  type: 'produce' | 'pet',
  completionPct: number,
  difficulty: VariantDifficulty,
  missingCount: number,
): string[] {
  const reasons: string[] = [];

  // Completion-based reasons
  if (completionPct >= 90) {
    reasons.push(`Almost complete (${completionPct.toFixed(0)}%)`);
  } else if (completionPct >= 70) {
    reasons.push(`Good progress (${completionPct.toFixed(0)}%)`);
  }

  // Missing variant count
  if (missingCount === 1) {
    reasons.push('Just 1 variant away from completion');
  } else if (missingCount === 2) {
    reasons.push('Only 2 variants remaining');
  } else if (missingCount <= 4) {
    reasons.push(`${missingCount} variants remaining`);
  }

  // Difficulty-based reasons
  if (difficulty === 'easy') {
    reasons.push('Quick and easy to complete');
  } else if (difficulty === 'medium') {
    reasons.push('Moderate effort required');
  } else if (difficulty === 'hard') {
    reasons.push('Challenging but achievable');
  } else if (difficulty === 'very-hard') {
    reasons.push('Very difficult - requires rare conditions');
  }

  // Harvest strategy advice for crops
  if (type === 'produce') {
    const harvestStrat = getHarvestStrategy(species);
    if (harvestStrat === 'freeze-and-sell') {
      reasons.push('💎 High-value crop - worth freezing');
    } else if (harvestStrat === 'sell-when-mature') {
      reasons.push('Low-value crop - sell when mature');
    }
  }

  return reasons;
}

// ============================================================================
// Priority Calculation
// ============================================================================

/**
 * Calculate priority score for a species (0-100)
 * Higher score = higher priority
 */
function calculatePriorityScore(
  completionPct: number,
  missingCount: number,
  difficulty: VariantDifficulty,
): number {
  // Weight factors:
  // 1. Completion % (40%) - favor nearly complete species
  // 2. Missing count (30%) - favor fewer missing items
  // 3. Difficulty (30%) - favor easier items

  const completionScore = completionPct * 0.4;

  const missingScore = missingCount <= 2 ? 30 : missingCount <= 4 ? 20 : 10;

  const difficultyScore =
    difficulty === 'easy' ? 30 :
    difficulty === 'medium' ? 20 :
    difficulty === 'hard' ? 10 :
    difficulty === 'very-hard' ? 5 :
    0; // impossible

  return completionScore + missingScore + difficultyScore;
}

/**
 * Convert priority score to priority level
 */
function getPriorityLevel(score: number): 'high' | 'medium' | 'low' {
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

// ============================================================================
// Time Estimation
// ============================================================================

/**
 * Estimate time to complete all missing variants for a species
 */
function estimateCompletionTime(
  missingVariants: string[],
  difficulty: VariantDifficulty,
): string {
  if (missingVariants.length === 0) return 'Complete';

  // Base time from difficulty
  const baseTime = getVariantTimeEstimate(difficulty);

  // Multiply by number of missing variants (rough estimate)
  if (missingVariants.length === 1) {
    return baseTime;
  } else if (missingVariants.length === 2) {
    return difficulty === 'easy' ? '30-60 minutes' :
           difficulty === 'medium' ? '1-2 hours' :
           difficulty === 'hard' ? '1-2 days' :
           '1-2 weeks';
  } else if (missingVariants.length <= 4) {
    return difficulty === 'easy' ? '1-2 hours' :
           difficulty === 'medium' ? '2-4 hours' :
           difficulty === 'hard' ? '2-4 days' :
           '2-4 weeks';
  } else {
    return difficulty === 'easy' ? '2-4 hours' :
           difficulty === 'medium' ? '4-8 hours' :
           difficulty === 'hard' ? '1 week' :
           '1+ month';
  }
}

// ============================================================================
// Recommendation Generation
// ============================================================================

/**
 * Generate species recommendation
 */
function createRecommendation(
  species: string,
  type: 'produce' | 'pet',
  missingVariants: string[],
  totalVariants: number,
  resources: PlayerResources,
): SpeciesRecommendation {
  const collectedCount = totalVariants - missingVariants.length;
  const completionPct = (collectedCount / totalVariants) * 100;

  const difficulty = calculateSpeciesDifficulty(missingVariants, species, type, resources);
  const priorityScore = calculatePriorityScore(completionPct, missingVariants.length, difficulty);
  const priority = getPriorityLevel(priorityScore);

  const strategy = generateStrategy(missingVariants, species, type, resources);
  const reasons = generateReasons(species, type, completionPct, difficulty, missingVariants.length);
  const estimatedTime = estimateCompletionTime(missingVariants, difficulty);

  const recommendation: SpeciesRecommendation = {
    species,
    type,
    priority,
    missingVariants,
    completionPct,
    difficulty,
    estimatedTime,
    strategy,
    reasons,
  };

  // Add harvest advice for crops
  if (type === 'produce') {
    const harvestStrat = getHarvestStrategy(species);
    if (harvestStrat) {
      if (harvestStrat === 'freeze-and-sell') {
        recommendation.harvestAdvice = 'Freeze before selling (high value gain)';
      } else if (harvestStrat === 'freeze-if-gold') {
        recommendation.harvestAdvice = 'Freeze only if Gold mutation';
      } else {
        recommendation.harvestAdvice = 'Sell when mature (low frozen value)';
      }
    }
  }

  return recommendation;
}

/**
 * Generate all recommendations from journal summary
 */
async function generateRecommendations(summary: JournalSummary): Promise<SpeciesRecommendation[]> {
  const resources = await detectPlayerResources();
  const recommendations: SpeciesRecommendation[] = [];

  // Process produce species
  for (const speciesData of summary.produce) {
    const missingVariants = speciesData.variants
      .filter(v => !v.collected)
      .map(v => v.variant);

    if (missingVariants.length === 0) continue; // Skip complete species

    const rec = createRecommendation(
      speciesData.species,
      'produce',
      missingVariants,
      speciesData.variants.length,
      resources,
    );
    recommendations.push(rec);
  }

  // Process pet species
  for (const speciesData of summary.pets) {
    const missingVariants = speciesData.variants
      .filter(v => !v.collected)
      .map(v => v.variant);

    if (missingVariants.length === 0) continue; // Skip complete species

    const rec = createRecommendation(
      speciesData.species,
      'pet',
      missingVariants,
      speciesData.variants.length,
      resources,
    );
    recommendations.push(rec);
  }

  return recommendations;
}

// ============================================================================
// Fastest Path Algorithm
// ============================================================================

/**
 * Calculate fastest path to maximum journal completion
 * Uses greedy algorithm: prioritize easiest species with highest completion %
 */
function calculateFastestPath(recommendations: SpeciesRecommendation[]): {
  steps: SpeciesRecommendation[];
  estimatedTime: string;
  expectedCompletion: number;
} {
  // Sort by priority score (completion % + ease)
  const sorted = [...recommendations].sort((a, b) => {
    const scoreA = calculatePriorityScore(a.completionPct, a.missingVariants.length, a.difficulty);
    const scoreB = calculatePriorityScore(b.completionPct, b.missingVariants.length, b.difficulty);
    return scoreB - scoreA; // Descending
  });

  // Take top 10 easiest completions
  const steps = sorted
    .filter(r => r.difficulty !== 'impossible')
    .slice(0, 10);

  // Calculate total expected variants to gain
  const totalVariantsGain = steps.reduce((sum, s) => sum + s.missingVariants.length, 0);

  // Rough time estimate (sum of individual times - not accurate but illustrative)
  const hasAnyVeryHard = steps.some(s => s.difficulty === 'very-hard');
  const hasAnyHard = steps.some(s => s.difficulty === 'hard');

  let estimatedTime = '1-2 weeks';
  if (hasAnyVeryHard) {
    estimatedTime = '2-4 weeks';
  } else if (hasAnyHard) {
    estimatedTime = '1-2 weeks';
  } else if (steps.every(s => s.difficulty === 'easy')) {
    estimatedTime = '2-3 days';
  } else {
    estimatedTime = '4-7 days';
  }

  return {
    steps,
    estimatedTime,
    expectedCompletion: totalVariantsGain,
  };
}

// ============================================================================
// Category Filtering
// ============================================================================

/**
 * Identify low-hanging fruit (easy wins)
 */
function getLowHangingFruit(recommendations: SpeciesRecommendation[]): SpeciesRecommendation[] {
  return recommendations
    .filter(r =>
      r.missingVariants.length <= 2 &&
      (r.difficulty === 'easy' || r.difficulty === 'medium')
    )
    .sort((a, b) => a.missingVariants.length - b.missingVariants.length)
    .slice(0, 10);
}

/**
 * Identify long-term goals (hard/rare variants)
 */
function getLongTermGoals(recommendations: SpeciesRecommendation[]): SpeciesRecommendation[] {
  return recommendations
    .filter(r =>
      r.difficulty === 'hard' || r.difficulty === 'very-hard'
    )
    .sort((a, b) => {
      // Sort by difficulty (hardest first)
      const diffOrder: VariantDifficulty[] = ['easy', 'medium', 'hard', 'very-hard', 'impossible'];
      return diffOrder.indexOf(b.difficulty) - diffOrder.indexOf(a.difficulty);
    })
    .slice(0, 10);
}

// ============================================================================
// Main API
// ============================================================================

/**
 * Generate complete journal strategy with recommendations
 */
export async function generateJournalStrategy(): Promise<JournalStrategy | null> {
  try {
    const summary = await getJournalSummary();
    if (!summary) {
      log('⚠️ Could not get journal summary');
      return null;
    }

    const recommendations = await generateRecommendations(summary);

    // Sort by priority
    const sortedRecommendations = recommendations.sort((a, b) => {
      const scoreA = calculatePriorityScore(a.completionPct, a.missingVariants.length, a.difficulty);
      const scoreB = calculatePriorityScore(b.completionPct, b.missingVariants.length, b.difficulty);
      return scoreB - scoreA;
    });

    const strategy: JournalStrategy = {
      recommendedFocus: sortedRecommendations.slice(0, 10), // Top 10
      fastestPath: calculateFastestPath(recommendations),
      lowHangingFruit: getLowHangingFruit(recommendations),
      longTermGoals: getLongTermGoals(recommendations),
    };

    log(`[JOURNAL] Generated strategy: ${strategy.recommendedFocus.length} recommendations, ${strategy.fastestPath.steps.length} fastest path steps`);
    return strategy;
  } catch (error) {
    log('❌ Error generating journal strategy:', error);
    return null;
  }
}

/**
 * Get difficulty badge emoji
 */
export function getDifficultyEmoji(difficulty: VariantDifficulty): string {
  switch (difficulty) {
    case 'easy': return '🟢';
    case 'medium': return '🟡';
    case 'hard': return '🟠';
    case 'very-hard': return '🔴';
    case 'impossible': return '⛔';
  }
}

/**
 * Get difficulty description
 */
export function getDifficultyDescription(difficulty: VariantDifficulty): string {
  switch (difficulty) {
    case 'easy': return 'Easy';
    case 'medium': return 'Medium';
    case 'hard': return 'Hard';
    case 'very-hard': return 'Very Hard';
    case 'impossible': return 'Impossible';
  }
}

/**
 * Get priority badge emoji
 */
export function getPriorityEmoji(priority: 'high' | 'medium' | 'low'): string {
  switch (priority) {
    case 'high': return '🔴';
    case 'medium': return '🟡';
    case 'low': return '⚪';
  }
}
