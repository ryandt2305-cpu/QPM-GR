// src/features/autoFavorite.ts
// Automatically favorites rare (gold/rainbow) pets and produce when detected

import { storage } from '../utils/storage';
import { log } from '../utils/logger';

const STORAGE_KEY = 'qpm.autoFavorite.v1';

export interface AutoFavoriteConfig {
  enabled: boolean;
  autoFavoriteRarePets: boolean; // Gold and Rainbow pets
  autoFavoriteRareProduce: boolean; // Gold and Rainbow crops
}

let config: AutoFavoriteConfig = {
  enabled: true,
  autoFavoriteRarePets: true,
  autoFavoriteRareProduce: true,
};

const listeners = new Set<(config: AutoFavoriteConfig) => void>();

function loadConfig(): void {
  try {
    const stored = storage.get<Partial<AutoFavoriteConfig> | null>(STORAGE_KEY, null);
    if (stored && typeof stored === 'object') {
      config = {
        enabled: stored.enabled ?? config.enabled,
        autoFavoriteRarePets: stored.autoFavoriteRarePets ?? config.autoFavoriteRarePets,
        autoFavoriteRareProduce: stored.autoFavoriteRareProduce ?? config.autoFavoriteRareProduce,
      };
    }
  } catch (error) {
    log('⚠️ Failed to load auto-favorite config', error);
  }
}

function saveConfig(): void {
  try {
    storage.set(STORAGE_KEY, config);
    notifyListeners();
  } catch (error) {
    log('⚠️ Failed to save auto-favorite config', error);
  }
}

function notifyListeners(): void {
  for (const listener of listeners) {
    try {
      listener({ ...config });
    } catch (error) {
      log('⚠️ Auto-favorite listener error', error);
    }
  }
}

export function initializeAutoFavorite(): void {
  loadConfig();
  log('✅ Auto-favorite initialized', config);
}

export function getAutoFavoriteConfig(): AutoFavoriteConfig {
  return { ...config };
}

export function updateAutoFavoriteConfig(updates: Partial<AutoFavoriteConfig>): void {
  config = { ...config, ...updates };
  saveConfig();
}

export function subscribeToAutoFavoriteConfig(listener: (config: AutoFavoriteConfig) => void): () => void {
  listeners.add(listener);
  listener({ ...config });
  return () => listeners.delete(listener);
}

// Helper function to determine if auto-favoriting should occur
export function shouldAutoFavoritePet(rarity: string): boolean {
  if (!config.enabled || !config.autoFavoriteRarePets) {
    return false;
  }

  const rarityLower = String(rarity).toLowerCase();
  return rarityLower.includes('gold') || rarityLower.includes('rainbow');
}

export function shouldAutoFavoriteProduce(rarity: string): boolean {
  if (!config.enabled || !config.autoFavoriteRareProduce) {
    return false;
  }

  const rarityLower = String(rarity).toLowerCase();
  return rarityLower.includes('gold') || rarityLower.includes('rainbow');
}

// Function to actually favorite an item in the game via websocket
// Uses the same mechanism as crop type locking
export function favoriteGameItem(itemId: string, itemType: 'pet' | 'produce'): boolean {
  try {
    // Access the game's websocket connection (same as crop locking)
    const pageWindow = (typeof window !== 'undefined' ? window : global) as any;
    const maybeConnection = pageWindow?.MagicCircle_RoomConnection;

    if (maybeConnection && typeof maybeConnection.sendMessage === 'function') {
      // Send the ToggleFavoriteItem message
      maybeConnection.sendMessage({
        scopePath: ['Room', 'Quinoa'],
        type: 'ToggleFavoriteItem',
        itemId
      });

      log(`🌟 Auto-favorited ${itemType}: ${itemId}`);
      return true;
    } else {
      log(`⚠️ MagicCircle_RoomConnection not available for favoriting ${itemType}`);
      return false;
    }
  } catch (error) {
    log(`⚠️ Failed to favorite ${itemType} ${itemId}`, error);
    return false;
  }
}

// Check if an item is already favorited
function isItemFavorited(itemId: string): boolean {
  try {
    const pageWindow = (typeof window !== 'undefined' ? window : global) as any;
    const inventory = pageWindow?.myData?.inventory;

    if (inventory && Array.isArray(inventory.favoritedItemIds)) {
      return inventory.favoritedItemIds.includes(itemId);
    }

    return false;
  } catch (error) {
    return false;
  }
}

// Favorite item only if not already favorited
export function autoFavoriteIfNeeded(itemId: string, itemType: 'pet' | 'produce', rarity: string): boolean {
  const shouldFavorite = itemType === 'pet'
    ? shouldAutoFavoritePet(rarity)
    : shouldAutoFavoriteProduce(rarity);

  if (!shouldFavorite) {
    return false;
  }

  // Check if already favorited
  if (isItemFavorited(itemId)) {
    log(`ℹ️ ${itemType} ${itemId} already favorited, skipping`);
    return true;
  }

  // Favorite the item
  return favoriteGameItem(itemId, itemType);
}
