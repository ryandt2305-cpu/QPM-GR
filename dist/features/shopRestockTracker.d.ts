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
 * Calculate item statistics
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
 * Based on item's last appearance, restock interval, and appearance rate
 */
export declare function predictItemNextAppearance(itemName: string): number | null;
/**
 * Clear all restock data and ALL QPM storage
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
//# sourceMappingURL=shopRestockTracker.d.ts.map