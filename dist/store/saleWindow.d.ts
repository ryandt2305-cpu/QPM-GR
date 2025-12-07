type SaleWindowCounts = {
    unique60s: number;
    unique10m: number;
};
export declare function getSaleWindowCounts(now?: number): SaleWindowCounts;
export declare function startSellWindowTracking(onUpdate: () => void): Promise<void>;
export declare function stopSellWindowTracking(): void;
export {};
//# sourceMappingURL=saleWindow.d.ts.map