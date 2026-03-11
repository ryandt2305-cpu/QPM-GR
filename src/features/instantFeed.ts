// src/features/instantFeed.ts
// WebSocket-based instant pet feeding using discovered FeedPet message format.

import { log } from '../utils/logger';
import { getActivePetInfos, type ActivePetInfo } from '../store/pets';
import { readInventoryDirect } from '../store/inventory';
import { getFeedPolicy } from '../store/petTeams';
import {
  buildFoodInventorySnapshot,
  evaluateFoodAvailabilityForPet,
  getPetFoodRules,
  type FoodSelection,
  type SpeciesOverride,
} from './petFoodRules';
import { hasRoomConnection, sendRoomAction } from '../websocket/api';

export interface InstantFeedResult {
  success: boolean;
  petName: string | null;
  petSpecies: string | null;
  foodSpecies: string | null;
  error?: string;
}

export interface InstantFeedPlan {
  ok: boolean;
  petIndex: number;
  petName: string | null;
  petSpecies: string | null;
  petId: string | null;
  slotId: string | null;
  respectFoodRules: boolean;
  avoidFavorited: boolean;
  availableCount: number;
  foodSelection: FoodSelection | null;
  error?: string;
}

function resolvePetForFeed(
  pets: ActivePetInfo[],
  petSlotOrIndex: number,
): ActivePetInfo | null {
  if (!Number.isFinite(petSlotOrIndex)) return null;
  const normalized = Math.max(0, Math.round(petSlotOrIndex));

  // Primary path: callers should pass the active slot index (0-2).
  const bySlot = pets.find((pet) => pet.slotIndex === normalized);
  if (bySlot) return bySlot;

  // Backward compatibility: older callers may still pass array index.
  return pets[normalized] ?? null;
}

function resolvePetForFeedById(
  pets: ActivePetInfo[],
  petId: string,
): ActivePetInfo | null {
  const normalizedPetId = String(petId ?? '').trim();
  if (!normalizedPetId) return null;
  return pets.find((pet) => pet.petId === normalizedPetId) ?? null;
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

function toItemOverride(pet: ActivePetInfo): SpeciesOverride | null {
  if (!pet.slotId) return null;
  const feedPolicy = getFeedPolicy();
  const raw = feedPolicy.petItemOverrides[pet.slotId];
  if (!raw) return null;

  const normalized: SpeciesOverride = {};
  if (Array.isArray(raw.allowed) && raw.allowed.length > 0) normalized.allowed = [...raw.allowed];
  if (Array.isArray(raw.forbidden) && raw.forbidden.length > 0) normalized.forbidden = [...raw.forbidden];
  if (typeof raw.preferred === 'string' && raw.preferred.length > 0) normalized.preferred = raw.preferred;

  if (!normalized.allowed && !normalized.forbidden && !normalized.preferred) return null;
  return normalized;
}

function makeMissingPetPlan(petIndex: number, error: string): InstantFeedPlan {
  return {
    ok: false,
    petIndex,
    petName: null,
    petSpecies: null,
    petId: null,
    slotId: null,
    respectFoodRules: false,
    avoidFavorited: true,
    availableCount: 0,
    foodSelection: null,
    error,
  };
}

async function buildPlanForPet(
  pet: ActivePetInfo,
  petSlotOrIndex: number,
  respectFoodRules?: boolean,
): Promise<InstantFeedPlan> {
  const rules = getPetFoodRules();
  const resolvedRespectRules = typeof respectFoodRules === 'boolean' ? respectFoodRules : rules.respectRules;
  const override = toItemOverride(pet);

  const inventoryData = await readInventoryDirect();
  const snapshot = buildFoodInventorySnapshot(inventoryData);
  if (!snapshot || snapshot.items.length === 0) {
    return {
      ok: false,
      petIndex: petSlotOrIndex,
      petName: pet.name,
      petSpecies: pet.species,
      petId: pet.petId,
      slotId: pet.slotId,
      respectFoodRules: resolvedRespectRules,
      avoidFavorited: rules.avoidFavorited,
      availableCount: 0,
      foodSelection: null,
      error: 'No feedable produce found in inventory',
    };
  }

  const availability = evaluateFoodAvailabilityForPet(
    pet.species,
    snapshot,
    {
      respectRules: resolvedRespectRules,
      avoidFavorited: rules.avoidFavorited,
      itemOverride: override,
    },
  );

  return {
    ok: !!availability.selected,
    petIndex: petSlotOrIndex,
    petName: pet.name,
    petSpecies: pet.species,
    petId: pet.petId,
    slotId: pet.slotId,
    respectFoodRules: resolvedRespectRules,
    avoidFavorited: rules.avoidFavorited,
    availableCount: availability.availableCount,
    foodSelection: availability.selected,
    ...(availability.selected ? {} : { error: 'No suitable food found in inventory' }),
  };
}

function resultFromPlanFailure(plan: InstantFeedPlan): InstantFeedResult {
  return {
    success: false,
    petName: plan.petName,
    petSpecies: plan.petSpecies,
    foodSpecies: null,
    error: plan.error ?? 'No suitable food found in inventory',
  };
}

function executeFeedPlan(plan: InstantFeedPlan): InstantFeedResult {
  if (!plan.ok || !plan.foodSelection) {
    return resultFromPlanFailure(plan);
  }

  if (!plan.petId) {
    return {
      success: false,
      petName: plan.petName,
      petSpecies: plan.petSpecies,
      foodSpecies: null,
      error: 'Pet has no petId (UUID)',
    };
  }

  const crop = plan.foodSelection.item;
  if (!crop.id) {
    return {
      success: false,
      petName: plan.petName,
      petSpecies: plan.petSpecies,
      foodSpecies: crop.species ?? crop.name,
      error: 'Crop has no ID',
    };
  }

  log(
    `Attempting to feed ${plan.petName || plan.petSpecies || 'pet'} ` +
    `with ${crop.species || crop.name || 'food'} ` +
    `(rules: ${plan.respectFoodRules ? 'on' : 'off'}, available: ${plan.availableCount})`,
  );

  const sent = sendFeedPetMessage(plan.petId, crop.id);
  if (!sent) {
    return {
      success: false,
      petName: plan.petName,
      petSpecies: plan.petSpecies,
      foodSpecies: crop.species ?? crop.name,
      error: 'Failed to send WebSocket message',
    };
  }

  log(`Fed ${plan.petName || plan.petSpecies || 'pet'} with ${crop.species || crop.name || 'food'}`);
  return {
    success: true,
    petName: plan.petName,
    petSpecies: plan.petSpecies,
    foodSpecies: crop.species ?? crop.name,
  };
}

export async function getInstantFeedPlan(
  petSlotOrIndex: number,
  respectFoodRules?: boolean,
): Promise<InstantFeedPlan> {
  const pets = getActivePetInfos();
  if (pets.length === 0) {
    return makeMissingPetPlan(petSlotOrIndex, 'No active pets found');
  }

  const pet = resolvePetForFeed(pets, petSlotOrIndex);
  if (!pet) {
    return makeMissingPetPlan(
      petSlotOrIndex,
      `Pet for slot/index ${petSlotOrIndex} not found`,
    );
  }

  return buildPlanForPet(pet, petSlotOrIndex, respectFoodRules);
}

export async function getInstantFeedPlanByPetId(
  petId: string,
  respectFoodRules?: boolean,
): Promise<InstantFeedPlan> {
  const pets = getActivePetInfos();
  if (pets.length === 0) {
    return makeMissingPetPlan(-1, 'No active pets found');
  }

  const pet = resolvePetForFeedById(pets, petId);
  if (!pet) {
    return makeMissingPetPlan(-1, `Pet with id ${petId} not found`);
  }

  return buildPlanForPet(pet, pet.slotIndex, respectFoodRules);
}

/**
 * Feed a pet instantly using WebSocket (bypasses DOM clicks).
 *
 * @param petSlotOrIndex - Active slot index (preferred), with array-index fallback for legacy callers
 * @param respectFoodRules - Whether to respect pet food preferences
 * @returns Result of the feed operation
 */
export async function feedPetInstantly(
  petSlotOrIndex: number,
  respectFoodRules?: boolean,
): Promise<InstantFeedResult> {
  try {
    const plan = await getInstantFeedPlan(petSlotOrIndex, respectFoodRules);
    return executeFeedPlan(plan);
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

export async function feedPetInstantlyByPetId(
  petId: string,
  respectFoodRules?: boolean,
): Promise<InstantFeedResult> {
  try {
    const plan = await getInstantFeedPlanByPetId(petId, respectFoodRules);
    return executeFeedPlan(plan);
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
  respectFoodRules?: boolean,
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
    const result = await feedPetInstantly(pet.slotIndex, respectFoodRules);
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
