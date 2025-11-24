export interface InstantFeedResult {
    success: boolean;
    petName: string | null;
    petSpecies: string | null;
    foodSpecies: string | null;
    error?: string;
}
export interface RoomConnection {
    sendMessage: (payload: unknown) => void;
}
declare global {
    interface Window {
        MagicCircle_RoomConnection?: RoomConnection;
        __mga_lastScopePath?: string[];
    }
}
/**
 * Feed a pet instantly using WebSocket (bypasses DOM clicks)
 *
 * @param petIndex - Index of the pet in active slots (0-2)
 * @param respectFoodRules - Whether to respect pet food preferences
 * @returns Result of the feed operation
 */
export declare function feedPetInstantly(petIndex: number, respectFoodRules?: boolean): Promise<InstantFeedResult>;
/**
 * Feed a specific pet by petId
 *
 * @param petId - UUID of the pet to feed
 * @param cropId - UUID of the crop to feed
 * @returns Result of the feed operation
 */
export declare function feedPetByIds(petId: string, cropId: string): Promise<InstantFeedResult>;
/**
 * Feed all active pets that are below hunger threshold
 *
 * @param hungerThreshold - Feed pets below this hunger percentage (0-100)
 * @param respectFoodRules - Whether to respect pet food preferences
 * @returns Array of feed results
 */
export declare function feedAllPetsInstantly(hungerThreshold?: number, respectFoodRules?: boolean): Promise<InstantFeedResult[]>;
/**
 * Check if instant feed is available (RoomConnection exists)
 */
export declare function isInstantFeedAvailable(): boolean;
//# sourceMappingURL=instantFeed.d.ts.map