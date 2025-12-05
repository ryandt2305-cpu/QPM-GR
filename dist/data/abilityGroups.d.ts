import { AbilityStats } from '../utils/petDataTester';
/**
 * Ability Group Definition
 * Groups abilities that can be meaningfully compared despite having different effects
 */
export interface AbilityGroup {
    id: string;
    name: string;
    displayName: string;
    description: string;
    abilityIds: string[];
    comparisonMetric: 'value_per_hour' | 'garden_impact' | 'procs_per_hour';
    /**
     * Calculate comparable value for an ability within this group
     * Returns value in coins per hour for comparison purposes
     */
    calculateComparableValue: (ability: AbilityStats, currentStrength: number | null) => number | null;
}
/**
 * All ability groups
 */
export declare const ABILITY_GROUPS: AbilityGroup[];
/**
 * Get the ability group for a given ability ID
 */
export declare function getAbilityGroup(abilityId: string): AbilityGroup | null;
/**
 * Check if two abilities belong to the same group
 */
export declare function abilitiesShareGroup(abilityIdA: string, abilityIdB: string): boolean;
/**
 * Get all ability IDs in a specific group
 */
export declare function getAbilitiesInGroup(groupId: string): string[];
/**
 * Get group display name for filtering
 */
export declare function getGroupDisplayName(groupId: string): string | null;
/**
 * Calculate comparable values for two abilities in the same group
 * Returns normalized comparison data
 */
export interface AbilityComparison {
    abilityA: AbilityStats;
    abilityB: AbilityStats;
    group: AbilityGroup;
    valueA: number | null;
    valueB: number | null;
    winner: 'A' | 'B' | null;
    comparisonLabel: string;
}
export declare function compareAbilitiesInGroup(abilityA: AbilityStats, abilityB: AbilityStats, strengthA: number | null, strengthB: number | null): AbilityComparison | null;
//# sourceMappingURL=abilityGroups.d.ts.map