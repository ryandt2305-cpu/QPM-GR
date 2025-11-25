export interface InventoryItem {
    id: string;
    itemId?: string;
    species?: string | null;
    name?: string | null;
    displayName?: string | null;
    itemType?: string | null;
    quantity?: number;
    count?: number;
    amount?: number;
    stackSize?: number;
    abilities?: any[];
    strength?: number;
    raw: unknown;
}
export interface InventoryData {
    items: InventoryItem[];
    favoritedItemIds?: string[];
}
export declare function startInventoryStore(): Promise<void>;
export declare function stopInventoryStore(): void;
/**
 * Get current inventory items (synchronous)
 * Returns cached data from the subscribed atom
 */
export declare function getInventoryItems(): InventoryItem[];
/**
 * Get current favorited item IDs (synchronous)
 */
export declare function getFavoritedItemIds(): Set<string>;
/**
 * Check if inventory store is running
 */
export declare function isInventoryStoreActive(): boolean;
/**
 * Read inventory directly from atom (async, bypasses cache)
 * Useful for one-time reads without subscribing
 */
export declare function readInventoryDirect(): Promise<InventoryData | null>;
//# sourceMappingURL=inventory.d.ts.map