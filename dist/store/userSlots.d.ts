export interface UserSlotsInventorySnapshot {
    items: any[];
    favoritedItemIds: string[];
    source: string;
    hasSlotData: boolean;
}
export declare function readUserSlotsInventorySnapshot(): Promise<UserSlotsInventorySnapshot | null>;
//# sourceMappingURL=userSlots.d.ts.map