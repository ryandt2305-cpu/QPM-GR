// src/features/petTeamActions.ts
// WebSocket message helpers for pet team operations.
// SwapPet is handled by existing swapPetIntoActiveSlot() in petSwap.ts.

import { log } from '../utils/logger';
import { sendRoomAction, type WebSocketSendResult } from '../websocket/api';

function sendAction(type: 'StorePet' | 'PlacePet' | 'ToggleFavoriteItem' | 'ToggleLockItem' | 'SellPet', payload: Record<string, unknown>): WebSocketSendResult {
  const sent = sendRoomAction(type, payload, { throttleMs: 90 });
  if (!sent.ok && sent.reason !== 'throttled') {
    log(`[PetTeamActions] send failed (${type})`, sent.reason);
  }
  return sent;
}

/**
 * Send an active pet to the hutch.
 * itemId = ActivePetInfo.slotId (the pet item UUID).
 */
export function sendStorePet(itemId: string): WebSocketSendResult {
  return sendAction('StorePet', { itemId });
}

/**
 * Place a pet from inventory into an EMPTY active slot.
 * Only needed when the player has fewer active pets than the team requires.
 *
 * position/tileType/localTileIndex are unverified defaults from Aries source.
 */
export function sendPlacePet(
  itemId: string,
  position: { x: number; y: number },
  tileType: string,
  localTileIndex: number,
): WebSocketSendResult {
  return sendAction('PlacePet', { itemId, position, tileType, localTileIndex });
}

/**
 * Toggle the favorited state of an item.
 * itemId = inventory item UUID.
 */
export function sendToggleFavoriteItem(itemId: string): boolean {
  return sendAction('ToggleFavoriteItem', { itemId }).ok;
}

/**
 * Unlock a locked item (ToggleLockItem).
 * itemId = inventory item UUID.
 */
export function sendToggleLockItem(itemId: string): boolean {
  return sendAction('ToggleLockItem', { itemId }).ok;
}

/**
 * Sell a pet directly.
 * itemId = inventory item UUID (pet must be in inventory to sell).
 */
export function sendSellPet(itemId: string): WebSocketSendResult {
  return sendAction('SellPet', { itemId });
}

/**
 * PlacePet position constants sourced from Aries mod.
 */
export const PLACE_PET_DEFAULTS = {
  position: { x: 0, y: 0 } as { x: number; y: number },
  tileType: 'Boardwalk',
  localTileIndex: 64,
} as const;
