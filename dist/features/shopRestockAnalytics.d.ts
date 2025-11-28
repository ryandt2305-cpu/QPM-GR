/**
 * Interval statistics for an item
 */
interface IntervalStats {
    itemName: string;
    appearances: number;
    intervals: number[];
    mean: number;
    median: number;
    stdDev: number;
    min: number;
    max: number;
    percentile25: number;
    percentile75: number;
    percentile95: number;
    coefficient_of_variation: number;
    skewness: number;
}
/**
 * Comprehensive analytics report
 */
interface AnalyticsReport {
    totalRestocks: number;
    dateRange: {
        start: number;
        end: number;
    };
    trackedItems: Map<string, IntervalStats>;
    celestialAnalysis: {
        items: string[];
        perItemStats: Map<string, {
            meanDays: number;
            medianDays: number;
            minDays: number;
            maxDays: number;
            appearances: number;
        }>;
    };
    clusteringAnalysis: {
        description: string;
        multipleRaresWithin24h: number;
        multipleRaresWithin7d: number;
    };
}
/**
 * Generate comprehensive analytics report
 */
export declare function generateAnalyticsReport(): AnalyticsReport | null;
/**
 * Print detailed analytics report to console
 */
export declare function printAnalyticsReport(): void;
/**
 * Get detailed interval data for export
 */
export declare function exportIntervalData(itemName: string): {
    intervals: number[];
    timestamps: number[];
} | null;
export {};
//# sourceMappingURL=shopRestockAnalytics.d.ts.map