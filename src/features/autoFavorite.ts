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
  enabled: false,
  autoFavoriteRarePets: false,
  autoFavoriteRareProduce: false,
};

const listeners = new Set<(config: AutoFavoriteConfig) => void>();
let intervalId: number | null = null;
let lastInventoryCount = 0;

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

function checkAndFavoriteNewItems(inventory: any): void {
  if (!inventory?.items) return;

  if (!config.autoFavoriteRarePets && !config.autoFavoriteRareProduce) return;

  const favoritedIds = new Set(inventory.favoritedItemIds || []);
  let cropCount = 0;
  let petCount = 0;

  for (const item of inventory.items) {
    if (favoritedIds.has(item.id)) continue; // Already favorited

    // Check if it's a pet
    if (item.itemType === 'Pet' && config.autoFavoriteRarePets) {
      // Check pet mutations for Gold or Rainbow
      const petMutations = item.mutations || [];
      const hasGoldMutation = petMutations.includes('Gold');
      const hasRainbowMutation = petMutations.includes('Rainbow');

      // Also check abilities array for granter abilities
      const petAbilities = item.abilities || [];
      const hasGoldGranterAbility = petAbilities.some((a: any) => {
        const abilityStr = typeof a === 'string' ? a : a?.type || a?.abilityType || '';
        return abilityStr.toLowerCase().includes('gold') && abilityStr.toLowerCase().includes('grant');
      });
      const hasRainbowGranterAbility = petAbilities.some((a: any) => {
        const abilityStr = typeof a === 'string' ? a : a?.type || a?.abilityType || '';
        return abilityStr.toLowerCase().includes('rainbow') && abilityStr.toLowerCase().includes('grant');
      });

      if (hasGoldMutation || hasRainbowMutation || hasGoldGranterAbility || hasRainbowGranterAbility) {
        if (favoriteGameItem(item.id)) {
          log(`🌟 Auto-favorited pet: ${item.species || 'unknown'} (${hasGoldMutation || hasGoldGranterAbility ? 'Gold' : 'Rainbow'})`);
          petCount++;
        }
      }
      continue;
    }

    // Check if it's produce (CRITICAL: Exclude eggs and tools)
    if (config.autoFavoriteRareProduce) {
      // Only auto-favorite crops beyond this point
      if (item.itemType !== 'Produce') continue;

      // CRITICAL: Explicitly exclude eggs and tools - CROPS ONLY
      if (item.itemType === 'Egg' || item.itemType === 'Tool') continue;
      if (item.category === 'Egg' || item.category === 'Tool') continue;
      if (item.species && (item.species.includes('Pet') || item.species.includes('Egg'))) continue;

      // Check item mutations for Gold or Rainbow
      const itemMutations = item.mutations || [];
      const hasGoldMutation = itemMutations.some((mut: string) =>
        mut.toLowerCase().includes('gold')
      );
      const hasRainbowMutation = itemMutations.some((mut: string) =>
        mut.toLowerCase().includes('rainbow')
      );

      if (hasGoldMutation || hasRainbowMutation) {
        if (favoriteGameItem(item.id)) {
          log(`🌟 Auto-favorited crop: ${item.species || 'unknown'} (${hasGoldMutation ? 'Gold' : 'Rainbow'})`);
          cropCount++;
        }
      }
    }
  }

  if (cropCount > 0) {
    log(`✨ Auto-favorited ${cropCount} new gold/rainbow crops`);
  }
  if (petCount > 0) {
    log(`✨ Auto-favorited ${petCount} new gold/rainbow pets`);
  }
}

function startAutoFavoritePolling(): void {
  if (intervalId !== null) return;

  intervalId = window.setInterval(() => {
    // Early exit if auto-favorite is disabled
    if (!config.enabled) {
      return;
    }

    if (!config.autoFavoriteRarePets && !config.autoFavoriteRareProduce) {
      return;
    }

    const pageWindow = (typeof window !== 'undefined' ? window : global) as any;
    if (!pageWindow?.myData?.inventory?.items) {
      return;
    }

    const currentCount = pageWindow.myData.inventory.items.length;
    // Only process if inventory count increased (new items added)
    if (currentCount > lastInventoryCount) {
      checkAndFavoriteNewItems(pageWindow.myData.inventory);
    }
    lastInventoryCount = currentCount;
  }, 2000); // Check every 2 seconds

  log('✅ Auto-favorite polling started (2 second interval)');
}

function stopAutoFavoritePolling(): void {
  if (intervalId !== null) {
    window.clearInterval(intervalId);
    intervalId = null;
    log('⏹️ Auto-favorite polling stopped');
  }
}

export function initializeAutoFavorite(): void {
  loadConfig();
  startAutoFavoritePolling();
  log('✅ Auto-favorite initialized', config);
}

export function getAutoFavoriteConfig(): AutoFavoriteConfig {
  return { ...config };
}

export function updateAutoFavoriteConfig(updates: Partial<AutoFavoriteConfig>): void {
  config = { ...config, ...updates };
  saveConfig();

  // Restart polling if config changed
  if (config.enabled && (config.autoFavoriteRarePets || config.autoFavoriteRareProduce)) {
    startAutoFavoritePolling();
  }
}

export function subscribeToAutoFavoriteConfig(listener: (config: AutoFavoriteConfig) => void): () => void {
  listeners.add(listener);
  listener({ ...config });
  return () => listeners.delete(listener);
}

// Function to actually favorite an item in the game via websocket
function favoriteGameItem(itemId: string): boolean {
  try {
    const pageWindow = (typeof window !== 'undefined' ? window : global) as any;
    const maybeConnection = pageWindow?.MagicCircle_RoomConnection;

    if (maybeConnection && typeof maybeConnection.sendMessage === 'function') {
      maybeConnection.sendMessage({
        scopePath: ['Room', 'Quinoa'],
        type: 'ToggleFavoriteItem',
        itemId
      });
      return true;
    }
    return false;
  } catch (error) {
    log(`⚠️ Failed to favorite item ${itemId}`, error);
    return false;
  }
}
