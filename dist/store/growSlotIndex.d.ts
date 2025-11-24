export declare function startGrowSlotIndexTracker(): Promise<void>;
export declare function stopGrowSlotIndexTracker(): void;
export declare function onGrowSlotIndex(listener: (index: number | null) => void, fireImmediately?: boolean): () => void;
export declare function getGrowSlotIndex(): number | null;
export declare function isGrowSlotIndexTrackerReady(): boolean;
//# sourceMappingURL=growSlotIndex.d.ts.map