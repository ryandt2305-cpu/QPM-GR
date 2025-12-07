// src/features/instantFeed.ts
// WebSocket-based instant pet feeding using discovered FeedPet message format

import { log } from '../utils/logger';
import { pageWindow } from '../core/pageContext';
import { getActivePetInfos, type ActivePetInfo } from '../store/pets';
import { recordInstantFeedUse } from '../store/achievements';
import { readInventoryDirect, type InventoryItem } from '../store/inventory';
import { selectFoodForPet, type InventorySnapshot } from './petFoodRules';

export interface InstantFeedResult {
  success: boolean;
  petName: string | null;
  petSpecies: string | null;
  foodSpecies: string | null;
  error?: string;
}

export interface RoomConnection {
  sendMessage: (payload: unknown) => void;
}

declare global {
  interface Window {
    MagicCircle_RoomConnection?: RoomConnection;
    __mga_lastScopePath?: string[];
  }
}

/**
 * Get the RoomConnection object from the page window
 */
function getRoomConnection(): RoomConnection | null {
  const global = pageWindow as Window;
  return global.MagicCircle_RoomConnection ?? null;
}

/**
 * Get the current scope path for WebSocket messages
 */
function getScopePath(): string[] {
  const global = pageWindow as Window;
  return global.__mga_lastScopePath?.slice() ?? ['Room', 'Quinoa'];
}

/**
 * Send a FeedPet WebSocket message
 *
 * Message format (discovered 2025-11-16):
 * {
 *   "type": "FeedPet",
 *   "petItemId": "<pet-uuid>",
 *   "cropItemId": "<crop-uuid>",
 *   "scopePath": ["Room", "Quinoa"]
 * }
 */
function sendFeedPetMessage(petItemId: string, cropItemId: string): boolean {
  try {
    const connection = getRoomConnection();
    if (!connection) {
      log('⚠️ MagicCircle_RoomConnection not found');
      return false;
    }

    const payload = {
      type: 'FeedPet',
      petItemId,
      cropItemId,
      scopePath: getScopePath(),
    };

    log('📤 Sending FeedPet WebSocket message', payload);
    connection.sendMessage(payload);
    return true;
  } catch (error) {
    log('❌ Failed to send FeedPet message', error);
    return false;
  }
}

/**
 * Feed a pet instantly using WebSocket (bypasses DOM clicks)
 *
 * @param petIndex - Index of the pet in active slots (0-2)
 * @param respectFoodRules - Whether to respect pet food preferences
 * @returns Result of the feed operation
 */
export async function feedPetInstantly(
  petIndex: number,
  respectFoodRules = false,
): Promise<InstantFeedResult> {
  try {
    // 1. Get active pets
    const pets = getActivePetInfos();
    if (pets.length === 0) {
      return {
        success: false,
        petName: null,
        petSpecies: null,
        foodSpecies: null,
        error: 'No active pets found',
      };
    }

    const pet = pets[petIndex];
    if (!pet) {
      return {
        success: false,
        petName: null,
        petSpecies: null,
        foodSpecies: null,
        error: `Pet at index ${petIndex} not found`,
      };
    }

    if (!pet.petId) {
      return {
        success: false,
        petName: pet.name,
        petSpecies: pet.species,
        foodSpecies: null,
        error: 'Pet has no petId (UUID)',
      };
    }

    // 2. Get inventory and select appropriate food
    const inventoryData = await readInventoryDirect();
    if (!inventoryData || !inventoryData.items || inventoryData.items.length === 0) {
      return {
        success: false,
        petName: pet.name,
        petSpecies: pet.species,
        foodSpecies: null,
        error: 'Failed to read inventory',
      };
    }

    // Convert to InventorySnapshot format for selectFoodForPet
    // IMPORTANT: Only include Produce items (harvested crops that can be fed to pets)
    // Filter out: Plants (growing in garden), Seeds, and other non-feedable items
    const feedableItems = inventoryData.items.filter(item =>
      item.itemType === 'Produce' || item.itemType === 'Crop'
    );

    const inventory: InventorySnapshot = {
      items: feedableItems.map(item => ({
        id: item.id,
        species: item.species ?? null,
        itemType: item.itemType ?? null,
        name: item.name ?? null,
      })),
      favoritedIds: new Set(inventoryData.favoritedItemIds ?? []),
      source: 'myInventoryAtom',
    };

    const foodSelection = selectFoodForPet(
      pet.species,
      inventory,
      { avoidFavorited: true },
    );

    if (!foodSelection) {
      return {
        success: false,
        petName: pet.name,
        petSpecies: pet.species,
        foodSpecies: null,
        error: 'No suitable food found in inventory',
      };
    }

    const crop = foodSelection.item;
    if (!crop.id) {
      return {
        success: false,
        petName: pet.name,
        petSpecies: pet.species,
        foodSpecies: crop.species,
        error: 'Crop has no ID',
      };
    }

    // 3. Log pet state before feeding
    const hungerInfo = pet.hungerPct !== null
      ? `hunger: ${pet.hungerPct}%`
      : 'hunger: unknown';
    log(`🍖 Attempting to feed ${pet.name || pet.species || 'pet'} (${hungerInfo}) with ${crop.species || 'food'}`);

    // 4. Send WebSocket FeedPet message
    const sent = sendFeedPetMessage(pet.petId, crop.id);
    if (!sent) {
      return {
        success: false,
        petName: pet.name,
        petSpecies: pet.species,
        foodSpecies: crop.species,
        error: 'Failed to send WebSocket message',
      };
    }

    log(`✅ Fed ${pet.name || pet.species || 'pet'} with ${crop.species || 'food'}`);
    recordInstantFeedUse(1);
    return {
      success: true,
      petName: pet.name,
      petSpecies: pet.species,
      foodSpecies: crop.species,
    };
  } catch (error) {
    log('❌ Instant feed error', error);
    return {
      success: false,
      petName: null,
      petSpecies: null,
      foodSpecies: null,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Feed a specific pet by petId
 *
 * @param petId - UUID of the pet to feed
 * @param cropId - UUID of the crop to feed
 * @returns Result of the feed operation
 */
export async function feedPetByIds(
  petId: string,
  cropId: string,
): Promise<InstantFeedResult> {
  try {
    // Find the pet to get metadata for logging
    const pets = getActivePetInfos();
    const pet = pets.find(p => p.petId === petId);

    const sent = sendFeedPetMessage(petId, cropId);
    if (!sent) {
      return {
        success: false,
        petName: pet?.name ?? null,
        petSpecies: pet?.species ?? null,
        foodSpecies: null,
        error: 'Failed to send WebSocket message',
      };
    }

    log(`✅ Fed pet ${petId} with crop ${cropId}`);
    recordInstantFeedUse(1);
    return {
      success: true,
      petName: pet?.name ?? null,
      petSpecies: pet?.species ?? null,
      foodSpecies: null,
    };
  } catch (error) {
    log('❌ Feed by IDs error', error);
    return {
      success: false,
      petName: null,
      petSpecies: null,
      foodSpecies: null,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Feed all active pets that are below hunger threshold
 *
 * @param hungerThreshold - Feed pets below this hunger percentage (0-100)
 * @param respectFoodRules - Whether to respect pet food preferences
 * @returns Array of feed results
 */
export async function feedAllPetsInstantly(
  hungerThreshold: number = 40,
  respectFoodRules = false,
): Promise<InstantFeedResult[]> {
  const pets = getActivePetInfos();
  const results: InstantFeedResult[] = [];

  for (let i = 0; i < pets.length; i++) {
    const pet = pets[i];
    if (!pet) continue;

    const hungerPct = pet.hungerPct ?? 100;
    if (hungerPct >= hungerThreshold) {
      log(`⏭️ Skipping ${pet.name || pet.species} - hunger ${hungerPct}% >= ${hungerThreshold}%`);
      continue;
    }

    log(`🍖 Feeding ${pet.name || pet.species} - hunger ${hungerPct}%`);
    const result = await feedPetInstantly(i, respectFoodRules);
    results.push(result);

    // Small delay between feeds to avoid overwhelming the server
    if (i < pets.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  return results;
}

/**
 * Check if instant feed is available (RoomConnection exists)
 */
export function isInstantFeedAvailable(): boolean {
  return getRoomConnection() !== null;
}
