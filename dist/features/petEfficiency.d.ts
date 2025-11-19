export interface PetEfficiencyMetrics {
    petId: string;
    slotIndex: number;
    species: string;
    name: string | null;
    level: number;
    xpGainRate: number;
    xpSessionTotal: number;
    xpSince: number | null;
    totalAbilityProcs: number;
    procsPerHour: number;
    abilityValuePerHour: number;
    topAbility: string | null;
    efficiencyScore: number;
    firstSeenAt: number;
    lastSeenAt: number;
    activeTime: number;
}
export interface PetRankings {
    byXpRate: PetEfficiencyMetrics[];
    byAbilityValue: PetEfficiencyMetrics[];
    byEfficiencyScore: PetEfficiencyMetrics[];
    byProcsPerHour: PetEfficiencyMetrics[];
}
export interface DailyBest {
    date: string;
    pet: {
        species: string;
        name: string | null;
        score: number;
        reason: string;
    };
}
export interface WeeklyBest {
    weekStart: string;
    pet: {
        species: string;
        name: string | null;
        score: number;
        reason: string;
    };
}
export interface PetEfficiencySnapshot {
    pets: Map<string, PetEfficiencyMetrics>;
    rankings: PetRankings;
    dailyBest: DailyBest[];
    weeklyBest: WeeklyBest[];
    updatedAt: number;
}
export declare function initializePetEfficiency(): void;
export declare function getPetEfficiencySnapshot(): PetEfficiencySnapshot;
export declare function subscribeToPetEfficiency(listener: (snapshot: PetEfficiencySnapshot) => void): () => void;
export declare function resetPetEfficiency(): void;
//# sourceMappingURL=petEfficiency.d.ts.map