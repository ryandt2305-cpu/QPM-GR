import { InventoryItem } from './inventory';
export declare function startSellSnapshotWatcher(): Promise<void>;
export declare function stopSellSnapshotWatcher(): void;
export declare function subscribeSellSnapshot(listener: (payload: {
    items: InventoryItem[];
    timestamp: number;
}) => void): () => void;
export declare function getLastProduceSnapshot(): InventoryItem[];
export declare function getLastProduceSnapshotTimestamp(): number | null;
//# sourceMappingURL=sellSnapshot.d.ts.map