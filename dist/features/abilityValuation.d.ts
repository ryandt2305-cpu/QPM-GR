import { GardenSnapshot } from './gardenBridge';
declare const FRIEND_BONUS_MULTIPLIER = 1.5;
interface MatureCrop {
    species: string;
    scale: number;
    maxScale: number;
    sizePercent: number;
    mutations: string[];
    currentValue: number;
    hasColorMutation: boolean;
    fruitCount: number;
    isMature: boolean;
}
export interface AbilityValuationContext {
    crops: MatureCrop[];
    uncoloredCrops: MatureCrop[];
    uncoloredFruitSlots: number;
    totalMatureValue: number;
    friendBonus: number;
}
export interface DynamicAbilityEffect {
    effectPerProc: number;
    detail: string;
}
export declare function buildAbilityValuationContext(snapshot?: GardenSnapshot | null): AbilityValuationContext;
export declare function resolveDynamicAbilityEffect(abilityId: string, context: AbilityValuationContext, strength: number | null | undefined): DynamicAbilityEffect | null;
export { FRIEND_BONUS_MULTIPLIER };
//# sourceMappingURL=abilityValuation.d.ts.map