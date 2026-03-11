// src/data/petCompareRules.ts
// Shared compare rule labels/types used by compare UI surfaces.

import {
  areAbilityGroupsComparable,
  type CompareAbilityGroup,
  type ProgressionStage,
} from '../features/petCompareEngine';

export type CompareStage = ProgressionStage;
export type CompareGroupId = CompareAbilityGroup;

export function areCompareGroupsCompatible(groupA: CompareGroupId, groupB: CompareGroupId): boolean {
  return areAbilityGroupsComparable(groupA, groupB);
}

export function getCompareGroupLabel(groupId: CompareGroupId): string {
  switch (groupId) {
    case 'per_hour':
      return 'Per-Hour';
    case 'sale':
      return 'Sale';
    case 'hatch_dollar':
      return 'Hatch-$';
    case 'food':
      return 'Food';
    case 'hatch_trio':
      return 'Hatch Trio';
    default:
      return 'Review';
  }
}

export function getCompareMetricLabel(groupId: CompareGroupId, isAction: boolean): string {
  if (isAction) return 'Value/Trigger';
  switch (groupId) {
    case 'per_hour':
    case 'sale':
    case 'hatch_dollar':
      return '$/hr';
    case 'food':
      return '$ saved/hr';
    case 'hatch_trio':
      return 'hatch/hr';
    default:
      return 'Review';
  }
}
