export type StrategyCategory = 'growth' | 'coins' | 'mutations' | 'xp' | 'harvest' | 'specialty' | 'general';
export interface StrategyDefinition {
    id: StrategyCategory;
    name: string;
    icon: string;
    description: string;
}
export declare const STRATEGY_DEFINITIONS: StrategyDefinition[];
/**
 * Get strategy category for an ability
 */
export declare function getAbilityStrategy(abilityId: string): StrategyCategory;
/**
 * Abilities that don't stack (only the highest tier applies)
 */
export declare const NON_STACKING_ABILITIES: Set<string>;
//# sourceMappingURL=abilityStrategies.d.ts.map