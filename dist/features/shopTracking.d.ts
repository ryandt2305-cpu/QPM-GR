import { ShopCategory } from '../types/shops';
export interface AutoShopItemConfig {
    label: string;
    displayLabel?: string;
    enabled: boolean;
    rarity?: string;
    rarityRank?: number;
}
export type AutoShopCategoryConfig = Record<string, AutoShopItemConfig>;
export interface AutoShopConfig {
    enabled: boolean;
    seeds: AutoShopCategoryConfig;
    eggs: AutoShopCategoryConfig;
    tools: AutoShopCategoryConfig;
    decor: AutoShopCategoryConfig;
}
export type { ShopCategory };
export interface RestockInfo {
    nextRestockAt: Record<ShopCategory, number | null>;
}
export interface ShopStats {
    totalPurchasedCount: number;
    totalSpent: number;
    purchasesByCategory: Record<ShopCategory, number>;
}
export declare function getRestockInfo(): RestockInfo;
export declare function setRestockInfoCallback(callback: (info: RestockInfo) => void): void;
export declare function getShopStats(): ShopStats;
export declare function getNextSchedules(): Record<ShopCategory, number | null>;
export declare function getConfig(): AutoShopConfig;
export declare function getShopBuyCount(): number;
export declare function getShopSpendTotal(): number;
export declare function resetShopStats(): void;
export declare function setItemEnabled(category: ShopCategory, itemId: string, enabled: boolean): void;
export declare function addShopItems(category: ShopCategory, items: Record<string, boolean>): void;
export declare function setAutoShopEnabled(enabled: boolean): void;
export declare function setShopStatusCallback(callback: (status: string) => void): void;
export declare function setShopUIRefreshCallback(callback: () => void): void;
export declare function startAutoShop(): void;
//# sourceMappingURL=shopTracking.d.ts.map