// src/features/petTeamActions.ts
// WebSocket message helpers for pet team operations.
// SwapPet is handled by the existing swapPetIntoActiveSlot() in petSwap.ts.
// This file only covers: StorePet, PlacePet, ToggleFavoriteItem.

import { pageWindow } from '../core/pageContext';
import { log } from '../utils/logger';

interface RoomConnection {
  sendMessage: (payload: unknown) => void;
}

interface TeamActionsPageWindow extends Window {
  MagicCircle_RoomConnection?: RoomConnection;
  __mga_lastScopePath?: string[];
}

function getRoomConnection(): RoomConnection | null {
  return (pageWindow as TeamActionsPageWindow).MagicCircle_RoomConnection ?? null;
}

function getScopePath(): string[] {
  return (pageWindow as TeamActionsPageWindow).__mga_lastScopePath?.slice() ?? ['Room', 'Quinoa'];
}

function sendAction(type: string, payload: Record<string, unknown>): boolean {
  const connection = getRoomConnection();
  if (!connection) {
    log('[PetTeamActions] RoomConnection unavailable');
    return false;
  }
  try {
    connection.sendMessage({ scopePath: getScopePath(), type, ...payload });
    return true;
  } catch (error) {
    log('⚠️ PetTeamActions send failed', { type, payload, error });
    return false;
  }
}

/**
 * Send an active pet to the hutch.
 * itemId = ActivePetInfo.slotId (the pet item UUID).
 */
export function sendStorePet(itemId: string): boolean {
  return sendAction('StorePet', { itemId });
}

/**
 * Place a pet from inventory into an EMPTY active slot.
 * Only needed when the player has fewer active pets than the team requires.
 *
 * ⚠️ position/tileType/localTileIndex are unverified defaults from Aries source.
 * Verify via live network capture before relying on this path.
 */
export function sendPlacePet(
  itemId: string,
  position: { x: number; y: number },
  tileType: string,
  localTileIndex: number,
): boolean {
  return sendAction('PlacePet', { itemId, position, tileType, localTileIndex });
}

/**
 * Toggle the favorited state of an item.
 * itemId = inventory item UUID.
 */
export function sendToggleFavoriteItem(itemId: string): boolean {
  return sendAction('ToggleFavoriteItem', { itemId });
}

/**
 * PlacePet position constants sourced from Aries mod.
 * ⚠️ UNVERIFIED — confirm via live WS capture before using PlacePet in production.
 */
export const PLACE_PET_DEFAULTS = {
  position: { x: 0, y: 0 } as { x: number; y: number },
  tileType: 'Boardwalk',
  localTileIndex: 64,
} as const;
