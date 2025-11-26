export interface ShopRestockWindowState {
    root: HTMLElement;
    contentContainer: HTMLElement;
    countdownInterval: number | null;
    resizeListener: (() => void) | null;
}
/**
 * Create Shop Restock Tracker window
 */
export declare function createShopRestockWindow(): ShopRestockWindowState;
/**
 * Show shop restock window
 */
export declare function showShopRestockWindow(state: ShopRestockWindowState): void;
/**
 * Hide shop restock window
 */
export declare function hideShopRestockWindow(state: ShopRestockWindowState): void;
/**
 * Destroy shop restock window
 */
export declare function destroyShopRestockWindow(state: ShopRestockWindowState): void;
//# sourceMappingURL=shopRestockWindow.d.ts.map