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

// Function to actually favorite an item in the game
// This needs to interact with the game's favorite system
export function favoriteGameItem(itemId: string, itemType: 'pet' | 'produce'): boolean {
  try {
    // This would need to interact with the game's favorite system
    // For now, this is a placeholder that would need game-specific implementation
    log(`🌟 Auto-favoriting ${itemType}: ${itemId}`);

    // TODO: Implement actual game interaction to favorite items
    // This might involve:
    // 1. Finding the item in the UI
    // 2. Clicking the favorite button/icon
    // 3. Or directly modifying game state if accessible

    return true;
  } catch (error) {
    log(`⚠️ Failed to favorite ${itemType} ${itemId}`, error);
    return false;
  }
}
