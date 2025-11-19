export interface ProcStreak {
    type: 'hot' | 'cold';
    startTime: number;
    endTime: number;
    procCount: number;
    expectedProcs: number;
    variance: number;
    duration: number;
}
export interface AbilityProcRateStats {
    abilityId: string;
    abilityName: string;
    totalProcs: number;
    firstProcAt: number | null;
    lastProcAt: number | null;
    procsPerHour: number;
    procsPerDay: number;
    expectedProcsPerHour: number;
    variance: number;
    avgTimeBetweenProcs: number;
    minTimeBetweenProcs: number;
    maxTimeBetweenProcs: number;
    currentStreak: ProcStreak | null;
    hotStreaks: ProcStreak[];
    coldStreaks: ProcStreak[];
    recentProcs: number;
    recentVariance: number;
}
export interface ProcRateSnapshot {
    abilities: Map<string, AbilityProcRateStats>;
    updatedAt: number;
    sessionStart: number;
}
export declare function initializeProcRateAnalytics(): void;
export declare function getProcRateSnapshot(): ProcRateSnapshot;
export declare function getAbilityProcStats(abilityId: string): AbilityProcRateStats | null;
export declare function subscribeToProcRateAnalytics(listener: (snapshot: ProcRateSnapshot) => void): () => void;
export declare function forceRecalculateProcRates(): void;
export declare function resetProcRateAnalytics(): void;
//# sourceMappingURL=procRateAnalytics.d.ts.map