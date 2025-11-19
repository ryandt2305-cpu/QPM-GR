// src/features/autoShop.ts
// STUB FILE - Automation removed in General Release v5.0.0
// This file now only exports types and empty functions needed for shop restock tracking

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

// Stub implementations that return empty/default values
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
  // No-op in General Release
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
  // No-op in General Release
}

export function setItemEnabled(category: ShopCategory, itemId: string, enabled: boolean): void {
  // No-op in General Release
}

export function addShopItems(category: ShopCategory, items: Record<string, boolean>): void {
  // No-op in General Release
}

export function setAutoShopEnabled(enabled: boolean): void {
  // No-op in General Release
}

export function setShopStatusCallback(callback: (status: string) => void): void {
  // No-op in General Release
}

export function setShopUIRefreshCallback(callback: () => void): void {
  // No-op in General Release
}

export function startAutoShop(): void {
  // No-op in General Release
}
