// src/store/shopStock.ts
// Stub for shop stock state (feature not currently active)

export interface ShopStockState {
  categories?: Record<string, {
    items: Array<{
      id: string | number;
      orderIndex?: number;
    }>;
  }>;
}

export function getShopStockState(): ShopStockState {
  return {
    categories: {},
  };
}
