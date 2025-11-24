export interface GardenState {
    tileObjects?: Record<string, unknown>;
    boardwalkTileObjects?: Record<string, unknown>;
    [key: string]: unknown;
}
export type GardenSnapshot = GardenState | null;
export declare function startGardenBridge(): Promise<void>;
export declare function stopGardenBridge(): void;
export declare function getGardenSnapshot(): GardenSnapshot;
export declare function onGardenSnapshot(cb: (state: GardenSnapshot) => void, fireImmediately?: boolean): () => void;
export declare function isGardenBridgeReady(): boolean;
//# sourceMappingURL=gardenBridge.d.ts.map