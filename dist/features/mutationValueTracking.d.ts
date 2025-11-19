export interface MutationValueStats {
    goldProcs: number;
    goldPerHour: number;
    goldTotalValue: number;
    goldLastProcAt: number | null;
    rainbowProcs: number;
    rainbowPerHour: number;
    rainbowTotalValue: number;
    rainbowLastProcAt: number | null;
    cropBoostProcs: number;
    cropBoostPerHour: number;
    cropBoostTotalValue: number;
    cropBoostLastProcAt: number | null;
    sessionValue: number;
    sessionStart: number;
    bestHourValue: number;
    bestHourTime: number | null;
    bestSessionValue: number;
    bestSessionTime: number | null;
}
export interface SessionHistory {
    date: string;
    value: number;
    goldProcs: number;
    rainbowProcs: number;
    cropBoostProcs: number;
    duration: number;
}
export interface MutationValueSnapshot {
    stats: MutationValueStats;
    sessions: SessionHistory[];
    hourlyBreakdown: Map<number, number>;
    updatedAt: number;
}
export declare function initializeMutationValueTracking(): void;
export declare function getMutationValueSnapshot(): MutationValueSnapshot;
export declare function subscribeToMutationValueTracking(listener: (snapshot: MutationValueSnapshot) => void): () => void;
export declare function forceRecalculateMutationValue(): void;
export declare function resetMutationValueTracking(): void;
export declare function getWeekTrend(): {
    current: number;
    previous: number;
    percentChange: number;
};
//# sourceMappingURL=mutationValueTracking.d.ts.map