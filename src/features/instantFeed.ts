// src/features/instantFeed.ts
// WebSocket-based instant pet feeding using discovered FeedPet message format.

import { log } from '../utils/logger';
import { getActivePetInfos } from '../store/pets';
import { readInventoryDirect } from '../store/inventory';
import { selectFoodForPet, type InventorySnapshot } from './petFoodRules';
import { hasRoomConnection, sendRoomAction } from '../websocket/api';

export interface InstantFeedResult {
  success: boolean;
  petName: string | null;
  petSpecies: string | null;
  foodSpecies: string | null;
  error?: string;
}

/**
 * Send a FeedPet WebSocket message.
 */
function sendFeedPetMessage(petItemId: string, cropItemId: string): boolean {
  const sent = sendRoomAction('FeedPet', { petItemId, cropItemId }, { throttleMs: 120 });
  if (!sent.ok && sent.reason !== 'throttled') {
    log(`Failed to send FeedPet message (${sent.reason ?? 'unknown'})`);
    return false;
  }

  // Dispatch event so petTeamsLogs can record feed events without direct coupling.
  try {
    window.dispatchEvent(new CustomEvent('qpm:feedPet', { detail: { petItemId, cropItemId } }));
  } catch {
    // no-op
  }

  return sent.ok;
}

/**
 * Feed a pet instantly using WebSocket (bypasses DOM clicks).
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

    // 2. Get inventory and select appropriate food.
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

    // IMPORTANT: Only include Produce/Crop items that are feedable.
    const feedableItems = inventoryData.items.filter((item) => (
      item.itemType === 'Produce' || item.itemType === 'Crop'
    ));

    const inventory: InventorySnapshot = {
      items: feedableItems.map((item) => ({
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

    const hungerInfo = pet.hungerPct !== null
      ? `hunger: ${pet.hungerPct}%`
      : 'hunger: unknown';
    log(`Attempting to feed ${pet.name || pet.species || 'pet'} (${hungerInfo}) with ${crop.species || 'food'}`);

    // 3. Send WebSocket FeedPet message.
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

    log(`Fed ${pet.name || pet.species || 'pet'} with ${crop.species || 'food'}`);
    return {
      success: true,
      petName: pet.name,
      petSpecies: pet.species,
      foodSpecies: crop.species,
    };
  } catch (error) {
    log('Instant feed error', error);
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
 * Feed a specific pet by petId.
 */
export async function feedPetByIds(
  petId: string,
  cropId: string,
): Promise<InstantFeedResult> {
  try {
    const pets = getActivePetInfos();
    const pet = pets.find((p) => p.petId === petId);

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

    log(`Fed pet ${petId} with crop ${cropId}`);
    return {
      success: true,
      petName: pet?.name ?? null,
      petSpecies: pet?.species ?? null,
      foodSpecies: null,
    };
  } catch (error) {
    log('Feed by IDs error', error);
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
 * Feed all active pets that are below hunger threshold.
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
      log(`Skipping ${pet.name || pet.species} - hunger ${hungerPct}% >= ${hungerThreshold}%`);
      continue;
    }

    log(`Feeding ${pet.name || pet.species} - hunger ${hungerPct}%`);
    const result = await feedPetInstantly(i, respectFoodRules);
    results.push(result);

    // Small delay between feeds to avoid overwhelming the server.
    if (i < pets.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  return results;
}

/**
 * Check if instant feed is available (RoomConnection exists).
 */
export function isInstantFeedAvailable(): boolean {
  return hasRoomConnection();
}
