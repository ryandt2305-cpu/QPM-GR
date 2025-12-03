import { formatTimeWindow, getItemConfig, WindowBasedPrediction, PredictionWindow } from './shopRestockPredictions';
/**
 * Restock event data structure
 */
export interface RestockEvent {
    id: string;
    timestamp: number;
    dateString: string;
    items: RestockItem[];
    source: 'discord' | 'live' | 'manual';
}
/**
 * Individual item in a restock
 */
export interface RestockItem {
    name: string;
    quantity: number;
    type: 'seed' | 'crop' | 'egg' | 'weather' | 'unknown';
}
/**
 * Item statistics
 */
export interface ItemStats {
    name: string;
    type: string;
    totalRestocks: number;
    totalQuantity: number;
    avgQuantity: number;
    lastSeen: number;
    firstSeen: number;
    appearanceRate: number;
    rarity: 'common' | 'uncommon' | 'rare' | 'mythic' | 'divine' | 'celestial';
}
/**
 * Prediction accuracy record
 */
export interface PredictionRecord {
    itemName: string;
    predictedTime: number | null;
    predictionMadeAt: number | null;
    actualTime: number | null;
    differenceMinutes: number | null;
    differenceMs: number | null;
}
/**
 * Initialize restock tracker from storage
 * Only loads once - subsequent calls are ignored to prevent data loss
 */
export declare function initializeRestockTracker(): void;
/**
 * Add a restock event
 */
export declare function addRestockEvent(event: RestockEvent): void;
/**
 * Add multiple restock events (bulk import)
 */
export declare function addRestockEvents(events: RestockEvent[]): void;
/**
 * Get all restock events
 */
export declare function getAllRestockEvents(): RestockEvent[];
/**
 * Get restocks within a time range
 */
export declare function getRestocksInRange(startTime: number, endTime: number): RestockEvent[];
/**
 * Calculate item statistics (with aggressive caching)
 */
export declare function calculateItemStats(): Map<string, ItemStats>;
/**
 * Get summary statistics
 */
export declare function getSummaryStats(): {
    totalRestocks: number;
    totalItems: number;
    dateRange: {
        start: number;
        end: number;
    } | null;
    avgRestockInterval: number;
    uniqueItems: number;
};
/**
 * Predict next restock time
 */
export declare function predictNextRestock(): {
    nextRestockTime: number | null;
    timeUntilRestock: number | null;
    confidence: 'high' | 'medium' | 'low' | 'none';
};
/**
 * Get item appearance probability
 */
export declare function getItemProbability(itemName: string): number;
/**
 * Get top likely items for next restock
 */
export declare function getTopLikelyItems(limit?: number): Array<{
    name: string;
    probability: number;
    rarity: string;
}>;
/**
 * Predict when a specific item will appear next
 * Uses item-specific algorithms based on statistical analysis:
 * - Highly variable items (CV > 1.0): Use median with confidence intervals
 * - Moderate variability (CV 0.5-1.0): Use median with tighter intervals
 * - Consistent items (CV < 0.5): Use simple median prediction
 */
export declare function predictItemNextAppearance(itemName: string): number | null;
/**
 * Predict item next appearance using simpler QPM-GR method (for comparison)
 * Uses appearance rate without clustering filters - typically more optimistic
 */
export declare function predictItemNextAppearanceSimple(itemName: string): number | null;
/**
 * Get dual predictions (optimistic QPM-GR and conservative MGQPM)
 * Returns both predictions for display as a range
 */
export interface DualPrediction {
    optimistic: number | null;
    conservative: number | null;
}
export declare function predictItemDual(itemName: string): DualPrediction;
/**
 * Detailed prediction statistics for an item
 */
export interface DetailedPredictionStats {
    itemName: string;
    predictedTime: number | null;
    confidence: 'high' | 'medium' | 'low' | 'none';
    median: number | null;
    mean: number | null;
    stdDev: number | null;
    coefficientOfVariation: number | null;
    interval25th: number | null;
    interval75th: number | null;
    interval95th: number | null;
    probabilityNext6h: number | null;
    probabilityNext24h: number | null;
    probabilityNext7d: number | null;
    sampleSize: number;
    lastSeen: number | null;
    variability: 'highly_variable' | 'moderate' | 'consistent';
    recommendedApproach: string;
}
/**
 * Get detailed prediction statistics for an item
 * This provides comprehensive data for the "Show Detailed Stats" UI toggle
 */
export declare function getDetailedPredictionStats(itemName: string): DetailedPredictionStats;
/**
 * Generate and store predictions for tracked items
 */
export declare function generatePredictions(): void;
/**
 * Check if a restock matches any active predictions and record accuracy
 */
export declare function checkPredictionAccuracy(event: RestockEvent): void;
/**
 * Get prediction history for an item (up to 3 most recent)
 */
export declare function getPredictionHistory(itemName: string): PredictionRecord[];
/**
 * Get all prediction histories
 */
export declare function getAllPredictionHistories(): Map<string, PredictionRecord[]>;
/**
 * Get the current active prediction timestamp for an item (if any)
 */
export declare function getActivePrediction(itemName: string): number | null;
/**
 * Clear all shop restock data (restocks, predictions, config)
 * Only clears shop restock specific keys, not all QPM data
 */
export declare function clearAllRestocks(): void;
/**
 * Subscribe to restock updates
 */
export declare function onRestockUpdate(callback: () => void): () => void;
/**
 * Mark a file as imported
 */
export declare function markFileAsImported(fileName: string): void;
/**
 * Check if file has been imported
 */
export declare function isFileImported(fileName: string): boolean;
/**
 * Get watched items
 */
export declare function getWatchedItems(): string[];
/**
 * Add item to watch list
 */
export declare function addWatchedItem(itemName: string): void;
/**
 * Remove item from watch list
 */
export declare function removeWatchedItem(itemName: string): void;
/**
 * Get window-based predictions for tracked items
 */
export declare function getWindowPredictions(): Map<string, WindowBasedPrediction>;
/**
 * Get current monitoring alerts
 */
export declare function getCurrentMonitoringAlerts(): Array<{
    itemName: string;
    message: string;
    urgency: 'high' | 'medium' | 'low';
}>;
export type { WindowBasedPrediction, PredictionWindow };
export { formatTimeWindow, getItemConfig };
//# sourceMappingURL=shopRestockTracker.d.ts.map