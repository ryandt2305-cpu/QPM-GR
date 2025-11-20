export interface ExtendedAbilityLogEntry {
    petId: string;
    petName: string;
    petSpecies: string;
    petLevel: number;
    timestamp: number;
    timestampISO: string;
    abilityId: string;
    abilityName: string;
    abilityLevel: number;
    details: string;
    rawData?: unknown;
}
export declare function initializeExtendedAbilityHistory(): void;
export declare function getExtendedAbilityHistory(): ExtendedAbilityLogEntry[];
export declare function getExtendedAbilityHistoryForPet(petId: string): ExtendedAbilityLogEntry[];
export declare function getExtendedAbilityHistoryForAbility(abilityId: string): ExtendedAbilityLogEntry[];
export declare function clearExtendedAbilityHistory(): void;
//# sourceMappingURL=abilityHistoryExtended.d.ts.map