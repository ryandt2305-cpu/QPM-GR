type UnknownMap = Record<string, unknown>;
export interface AbilityEvent {
    abilityId: string;
    performedAt: number;
    data: unknown;
    position: UnknownMap | null;
}
export interface AbilityHistory {
    abilityId: string;
    petId: string | null;
    slotId: string | null;
    slotIndex: number | null;
    events: AbilityEvent[];
    lastPerformedAt: number;
    lookupKeys: Set<string>;
}
export declare function startAbilityTriggerStore(): Promise<void>;
export declare function stopAbilityTriggerStore(): void;
export declare function findAbilityHistoryForIdentifiers(abilityId: string, identifiers: {
    petId?: string | null;
    slotId?: string | null;
    slotIndex?: number | null;
    fallbackKeys?: string[];
}): AbilityHistory | null;
export declare function onAbilityHistoryUpdate(cb: (snapshot: ReadonlyMap<string, AbilityHistory>) => void): () => void;
export declare function getAbilityHistorySnapshot(): ReadonlyMap<string, AbilityHistory>;
export declare function isAbilityTriggerStoreStarted(): boolean;
export {};
//# sourceMappingURL=abilityLogs.d.ts.map