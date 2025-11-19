export interface FeedStatEntry {
    count: number;
    lastFeed: number;
    lastBaseline: number | null;
    lastPostFeed: number | null;
    averageFill: number | null;
    averageDrainPerHour: number | null;
    fillSamples: number;
    drainSamples: number;
    lastFillAmount: number | null;
    lastDrainRate: number | null;
}
export interface FeedStats {
    [petName: string]: FeedStatEntry;
}
export type FeedRateSource = 'events' | 'model' | 'none';
export interface SessionStatsSummary {
    uptime: string;
    feedsPerHour: string;
    feedSampleCount: number;
    feedWindowMinutes: number;
    feedRateSource: FeedRateSource;
    modelPetSamples: number;
}
export declare function getSessionStats(): SessionStatsSummary;
export declare function resetFeedSession(): void;
export declare function getFeedStats(): FeedStats;
//# sourceMappingURL=feedTracking.d.ts.map