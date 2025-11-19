// src/features/shopTracking.ts
// Shop restock tracking and stats

import { SHOP_CATEGORIES, type ShopCategory } from '../types/shops';

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

// Tracking implementations
export function getRestockInfo(): RestockInfo {
  return {
    nextRestockAt: {
      seeds: null,
      eggs: null,
      tools: null,
      decor: null,
    },
  };
}

export function setRestockInfoCallback(callback: (info: RestockInfo) => void): void {
  // Callback registration
}

export function getShopStats(): ShopStats {
  return {
    totalPurchasedCount: 0,
    totalSpent: 0,
    purchasesByCategory: {
      seeds: 0,
      eggs: 0,
      tools: 0,
      decor: 0,
    },
  };
}

export function getNextSchedules(): Record<ShopCategory, number | null> {
  return {
    seeds: null,
    eggs: null,
    tools: null,
    decor: null,
  };
}

export function getConfig(): AutoShopConfig {
  return {
    enabled: false,
    seeds: {},
    eggs: {},
    tools: {},
    decor: {},
  };
}

export function getShopBuyCount(): number {
  return 0;
}

export function getShopSpendTotal(): number {
  return 0;
}

export function resetShopStats(): void {
  // Stats reset
}

export function setItemEnabled(category: ShopCategory, itemId: string, enabled: boolean): void {
  // Item configuration
}

export function addShopItems(category: ShopCategory, items: Record<string, boolean>): void {
  // Item addition
}

export function setAutoShopEnabled(enabled: boolean): void {
  // Shop configuration
}

export function setShopStatusCallback(callback: (status: string) => void): void {
  // Callback registration
}

export function setShopUIRefreshCallback(callback: () => void): void {
  // UI callback registration
}

export function startAutoShop(): void {
  // Shop initialization
}
