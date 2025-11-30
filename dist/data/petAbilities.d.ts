export type AbilityCategory = 'plantGrowth' | 'eggGrowth' | 'xp' | 'coins' | 'misc';
type AbilityTrigger = 'continuous' | 'hatchEgg' | 'sellAllCrops' | 'sellPet' | 'harvest';
export interface AbilityDefinition {
    id: string;
    name: string;
    aliases?: readonly string[];
    category: AbilityCategory;
    trigger: AbilityTrigger;
    baseProbability?: number;
    rollPeriodMinutes?: number;
    effectValuePerProc?: number;
    effectUnit?: 'minutes' | 'xp' | 'coins';
    notes?: string;
    effectLabel?: string;
    effectBaseValue?: number;
    effectSuffix?: string;
}
export declare function getAbilityDefinition(raw: string | null | undefined): AbilityDefinition | null;
export declare function getAllAbilityDefinitions(): AbilityDefinition[];
export interface AbilityStats {
    multiplier: number;
    chancePerRoll: number;
    rollPeriodMinutes: number;
    procsPerHour: number;
    chancePerSecond: number;
    chancePerMinute: number;
}
export declare function computeAbilityStats(definition: AbilityDefinition, strength: number | null | undefined): AbilityStats;
export declare function computeEffectPerHour(definition: AbilityDefinition, stats: AbilityStats): number;
export declare const abilityDefinitions: AbilityDefinition[];
export {};
//# sourceMappingURL=petAbilities.d.ts.map