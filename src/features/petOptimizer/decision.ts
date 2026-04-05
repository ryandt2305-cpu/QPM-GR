import { getAbilityDefinition } from '../../data/petAbilities';
import {
  HIGH_VALUE_ABILITIES,
  LOW_VALUE_ABILITIES,
  MAX_BETTER_ALTERNATIVES,
  RAINBOW_AUTO_KEEP_MAX_RANK,
  RAINBOW_AUTO_KEEP_MIN_MAX_STRENGTH,
  RAINBOW_AUTO_KEEP_MIN_SCORE,
  isRarePlus,
} from './constants';
import { hasHighValueAbilities } from './scoring';
import type {
  CollectedPet,
  FamilyCompetitionPool,
  OptimizerCompareSnapshot,
  OptimizerConfig,
  PetComparison,
  PetScore,
  TurtleCompositeSnapshot,
} from './types';
import { getMaxStrengthValue } from './ranking/common';
import {
  collectFamilyCompetitionResults,
  toFamilyRankSnapshots,
} from './ranking/specialist';
import {
  collectSlotEfficiencyCompetitionResults,
  toSlotEfficiencyFamilySummaries,
} from './ranking/slotEfficiency';

function getOnlySourceAbility(pet: CollectedPet, allPets: CollectedPet[]): string | null {
  const highValueAbilitiesOnPet = pet.abilityIds.filter((abilityId) => HIGH_VALUE_ABILITIES.has(abilityId));
  if (highValueAbilitiesOnPet.length === 0) return null;

  for (const abilityId of highValueAbilitiesOnPet) {
    const petsWithAbility = allPets.filter((otherPet) =>
      otherPet.id !== pet.id && otherPet.abilityIds.includes(abilityId));
    if (petsWithAbility.length === 0) {
      return abilityId;
    }
  }

  return null;
}

export function analyzePet(
  pet: CollectedPet,
  score: PetScore,
  allPets: CollectedPet[],
  specialistPools: Map<string, FamilyCompetitionPool>,
  slotEfficiencyPools: Map<string, FamilyCompetitionPool>,
  compareByPetId: Map<string, OptimizerCompareSnapshot>,
  turtleCompositeByPetId: Map<string, TurtleCompositeSnapshot>,
  cfg: OptimizerConfig,
): PetComparison {
  const compareSnapshot = compareByPetId.get(pet.id);
  const turtleComposite = turtleCompositeByPetId.get(pet.id);
  const specialistFamilyResults = collectFamilyCompetitionResults(pet.id, compareSnapshot, specialistPools);
  const slotEfficiencyFamilyResults = collectSlotEfficiencyCompetitionResults(pet.id, compareSnapshot, slotEfficiencyPools);
  const specialistFamilyRanks = toFamilyRankSnapshots(specialistFamilyResults);
  const slotEfficiencyFamilyRanks = toFamilyRankSnapshots(slotEfficiencyFamilyResults);
  const slotEfficiencySummaries = toSlotEfficiencyFamilySummaries(compareSnapshot);

  const activeMode = cfg.recommendationMode;
  const familyResults = activeMode === 'specialist' ? specialistFamilyResults : slotEfficiencyFamilyResults;
  const familyRanks = activeMode === 'specialist' ? specialistFamilyRanks : slotEfficiencyFamilyRanks;

  const buildComparison = (partial: Omit<PetComparison, 'pet' | 'score'>): PetComparison => ({
    pet,
    score,
    familyRanks,
    specialistFamilyRanks,
    slotEfficiencyFamilyRanks,
    slotEfficiencySummaries,
    turtleComposite,
    ...partial,
  });

  if (cfg.protectedPetIds.has(pet.id)) {
    return buildComparison({
      status: 'keep',
      reason: 'Protected by user',
      betterAlternatives: [],
      decisionMode: 'rule',
    });
  }

  const onlySourceAbility = getOnlySourceAbility(pet, allPets);
  if (onlySourceAbility) {
    const def = getAbilityDefinition(onlySourceAbility);
    const abilityName = def?.name || onlySourceAbility;
    return buildComparison({
      status: 'keep',
      reason: `Only source of ${abilityName}`,
      betterAlternatives: [],
      decisionMode: 'rule',
    });
  }

  const hasProtection = hasHighValueAbilities(pet) || pet.hasRainbow || onlySourceAbility !== null;

  if (compareSnapshot?.reviewCount && compareSnapshot.reviewCount > 0) {
    return buildComparison({
      status: 'review',
      reason: 'Review required: unknown or unmapped abilities detected',
      betterAlternatives: [],
      decisionMode: 'rule',
    });
  }

  if (cfg.onlyRarePlus && !hasProtection && !isRarePlus(pet.species)) {
    return buildComparison({
      status: 'sell',
      reason: 'Common/Uncommon species (filter: Rare+ only)',
      betterAlternatives: [],
      decisionMode: 'rule',
    });
  }

  if (!hasProtection && pet.abilityIds.length < cfg.minAbilityCount) {
    return buildComparison({
      status: 'sell',
      reason: `Only ${pet.abilityIds.length} ability(ies) (need ${cfg.minAbilityCount}+)`,
      betterAlternatives: [],
      decisionMode: 'rule',
    });
  }

  if (cfg.minMaxStrength > 0 && !hasProtection) {
    const maxStr = pet.maxStrength || pet.strength;
    if (maxStr < cfg.minMaxStrength) {
      return buildComparison({
        status: 'sell',
        reason: `Max strength too low (${maxStr} < ${cfg.minMaxStrength})`,
        betterAlternatives: [],
        decisionMode: 'rule',
      });
    }
  }

  if (cfg.minTargetScale > 1.0 && !hasProtection && pet.targetScale) {
    if (pet.targetScale < cfg.minTargetScale) {
      return buildComparison({
        status: 'sell',
        reason: `Target scale too low (${pet.targetScale.toFixed(2)} < ${cfg.minTargetScale.toFixed(2)})`,
        betterAlternatives: [],
        decisionMode: 'rule',
      });
    }
  }

  if (cfg.markLowValueAbilities && !hasProtection && (!pet.hasGold || cfg.dislikeGold)) {
    const hasOnlyLowValue = pet.abilityIds.every((abilityId) => LOW_VALUE_ABILITIES.has(abilityId));
    if (hasOnlyLowValue && pet.abilityIds.length > 0) {
      return buildComparison({
        status: 'sell',
        reason: 'Only has low-value abilities (Tier I or unwanted)',
        betterAlternatives: [],
        decisionMode: 'rule',
      });
    }
  }

  if (familyResults.length === 0) {
    return buildComparison({
      status: 'keep',
      reason: 'Best available',
      betterAlternatives: [],
      decisionMode: 'rule',
    });
  }

  const topFamilies = familyResults
    .filter((result) => result.rank < 3)
    .map((result) => result.familyLabel);

  if (topFamilies.length > 0) {
    const reason = activeMode === 'slot_efficiency'
      ? (topFamilies.length === 1
          ? `Top 3 slot-efficient for ${topFamilies[0]}`
          : `Top 3 slot-efficient in ${topFamilies.length} ability families`)
      : (topFamilies.length === 1
          ? `Top 3 for ${topFamilies[0]}`
          : `Top 3 in ${topFamilies.length} ability families`);

    return buildComparison({
      status: 'keep',
      reason,
      betterAlternatives: [],
      decisionMode: activeMode,
      topFamilies,
    });
  }

  const decision = [...familyResults]
    .sort((a, b) => {
      const diff = b.betterEntries.length - a.betterEntries.length;
      if (diff !== 0) return diff;
      if (b.rank !== a.rank) return b.rank - a.rank;
      return a.familyLabel.localeCompare(b.familyLabel);
    })[0];

  if (!decision || decision.betterEntries.length === 0) {
    return buildComparison({
      status: 'keep',
      reason: 'Best available',
      betterAlternatives: [],
      decisionMode: 'rule',
    });
  }

  let shouldProtect = false;
  let mutationType = '';
  if (cfg.mutationProtection === 'both') {
    shouldProtect = pet.hasRainbow || (pet.hasGold && !cfg.dislikeGold);
    mutationType = pet.hasRainbow ? 'Rainbow' : (pet.hasGold && !cfg.dislikeGold ? 'Gold' : '');
  } else if (cfg.mutationProtection === 'rainbow') {
    shouldProtect = pet.hasRainbow;
    mutationType = 'Rainbow';
  }

  const betterPets = decision.betterEntries.map((entry) => entry.pet);
  const rankingLabel = activeMode === 'slot_efficiency' ? 'slot-efficiency' : 'specialist';
  const maxStrengthValue = getMaxStrengthValue(pet);
  const rainbowProtectionEnabled = pet.hasRainbow && cfg.mutationProtection !== 'none';
  const goldProtectionEnabled = pet.hasGold && cfg.mutationProtection === 'both' && !cfg.dislikeGold;
  const competitiveRainbowFamilies = familyResults.filter((result) => result.rank < RAINBOW_AUTO_KEEP_MAX_RANK);
  const rainbowKeepSignals: string[] = [];

  if (score.total >= RAINBOW_AUTO_KEEP_MIN_SCORE) {
    rainbowKeepSignals.push(`score ${Math.round(score.total)}`);
  }
  if (maxStrengthValue >= RAINBOW_AUTO_KEEP_MIN_MAX_STRENGTH) {
    rainbowKeepSignals.push(`max STR ${maxStrengthValue}`);
  }
  if (competitiveRainbowFamilies.length > 0) {
    rainbowKeepSignals.push(
      competitiveRainbowFamilies.length === 1
        ? `top ${RAINBOW_AUTO_KEEP_MAX_RANK} for ${competitiveRainbowFamilies[0]?.familyLabel ?? 'its family'}`
        : `top ${RAINBOW_AUTO_KEEP_MAX_RANK} in ${competitiveRainbowFamilies.length} families`,
    );
  }

  if (rainbowProtectionEnabled && rainbowKeepSignals.length > 0) {
    return buildComparison({
      status: 'keep',
      reason: `Rainbow protection: keep (${rainbowKeepSignals.join(', ')})`,
      betterAlternatives: [],
      decisionMode: activeMode,
      decisionFamilyKey: decision.familyKey,
      decisionFamilyLabel: decision.familyLabel,
    });
  }

  if (rainbowProtectionEnabled) {
    return buildComparison({
      status: 'review',
      reason: `Rainbow protection: lower ${decision.familyLabel} ${rankingLabel} ranking - review before selling`,
      betterAlternatives: betterPets.slice(0, MAX_BETTER_ALTERNATIVES),
      decisionMode: activeMode,
      decisionFamilyKey: decision.familyKey,
      decisionFamilyLabel: decision.familyLabel,
    });
  }

  if (goldProtectionEnabled) {
    return buildComparison({
      status: 'review',
      reason: `Gold protection: lower ${decision.familyLabel} ${rankingLabel} ranking - review before selling`,
      betterAlternatives: betterPets.slice(0, MAX_BETTER_ALTERNATIVES),
      decisionMode: activeMode,
      decisionFamilyKey: decision.familyKey,
      decisionFamilyLabel: decision.familyLabel,
    });
  }

  const reason = shouldProtect
    ? `Lower ${decision.familyLabel} ${rankingLabel} ranking but has ${mutationType} mutation - consider keeping`
    : `${decision.betterEntries.length} better ${decision.familyLabel} ${rankingLabel} pet${decision.betterEntries.length > 1 ? 's' : ''} available`;

  return buildComparison({
    status: 'sell',
    reason,
    betterAlternatives: betterPets.slice(0, MAX_BETTER_ALTERNATIVES),
    decisionMode: activeMode,
    decisionFamilyKey: decision.familyKey,
    decisionFamilyLabel: decision.familyLabel,
  });
}
