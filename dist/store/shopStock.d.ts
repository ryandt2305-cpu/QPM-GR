export interface ShopStockState {
    categories?: Record<string, {
        items: Array<{
            id: string | number;
            orderIndex?: number;
        }>;
    }>;
}
export declare function getShopStockState(): ShopStockState;
//# sourceMappingURL=shopStock.d.ts.map