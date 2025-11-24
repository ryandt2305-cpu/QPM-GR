import { ShopInventoryEntry, ShopCategorySnapshot } from '../types/gameAtoms';
import { ShopCategory } from '../types/shops';
export interface ShopStockItem {
    category: ShopCategory;
    id: string;
    label: string;
    orderIndex: number;
    initialStock: number | null;
    currentStock: number | null;
    remaining: number | null;
    purchased: number;
    canSpawn: boolean;
    isAvailable: boolean;
    priceCoins: number | null;
    priceCredits: number | null;
    quantityPerPurchase: number;
    raw: ShopInventoryEntry;
}
export interface ShopStockCategoryState {
    category: ShopCategory;
    secondsUntilRestock: number | null;
    nextRestockAt: number | null;
    restockIntervalMs: number | null;
    items: ShopStockItem[];
    availableCount: number;
    signature: string;
    updatedAt: number;
    raw: ShopCategorySnapshot | null;
}
export interface ShopStockState {
    updatedAt: number;
    categories: Record<ShopCategory, ShopStockCategoryState>;
}
export declare function startShopStockStore(): Promise<void>;
export declare function stopShopStockStore(): void;
export declare function getShopStockState(): ShopStockState;
export declare function onShopStock(callback: (state: ShopStockState) => void, fireImmediately?: boolean): () => void;
export declare function getAvailableItems(category: ShopCategory): ShopStockItem[];
export declare function describeItemForLog(item: ShopStockItem): string;
//# sourceMappingURL=shopStock.d.ts.map