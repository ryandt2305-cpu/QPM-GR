// src/websocket/api.ts
// Centralized send facade for room WebSocket actions.

import { pageWindow } from '../core/pageContext';

export type RoomActionType =
  | 'ToggleLockItem'
  | 'ToggleFavoriteItem'
  | 'FeedPet'
  | 'StorePet'
  | 'PickupPet'
  | 'PlacePet'
  | 'SellPet'
  | 'PlayerPosition'
  | 'RetrieveItemFromStorage'
  | 'PutItemInStorage'
  | 'SwapPet';

export type WebSocketSendFailureReason =
  | 'no_connection'
  | 'invalid_payload'
  | 'throttled'
  | 'send_failed';

export interface WebSocketSendResult {
  ok: boolean;
  reason?: WebSocketSendFailureReason;
}

interface RoomConnection {
  sendMessage: (payload: unknown) => void;
}

interface PageWithRoomConnection extends Window {
  MagicCircle_RoomConnection?: RoomConnection;
  __mga_lastScopePath?: string[];
}

type PlacePetPayload = {
  itemId: string;
  position: { x: number; y: number };
  tileType: string;
  localTileIndex: number;
};

type PlayerPositionPayload = {
  position: { x: number; y: number };
};

type RetrievePayload = { itemId: string; storageId: string; toInventoryIndex?: number };
type PutInStoragePayload = { itemId: string; storageId: string; toStorageIndex?: number };
type PickupPetPayload = { petId: string };
type SwapPayload = { petSlotId: string; petInventoryId: string };

const DEFAULT_SCOPE_PATH = ['Room', 'Quinoa'] as const;
const DEFAULT_THROTTLE_MS = 100;
const lastSentAt = new Map<string, number>();

function getRoomConnection(): RoomConnection | null {
  return (pageWindow as PageWithRoomConnection).MagicCircle_RoomConnection ?? null;
}

export function hasRoomConnection(): boolean {
  return getRoomConnection() !== null;
}

function getScopePath(): string[] {
  const dynamic = (pageWindow as PageWithRoomConnection).__mga_lastScopePath;
  if (Array.isArray(dynamic) && dynamic.length > 0) return dynamic.slice();
  return [...DEFAULT_SCOPE_PATH];
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function validatePayload(type: RoomActionType, payload: Record<string, unknown>): boolean {
  switch (type) {
    case 'ToggleLockItem':
    case 'ToggleFavoriteItem':
      return isNonEmptyString(payload.itemId);
    case 'FeedPet':
      return isNonEmptyString(payload.petItemId) && isNonEmptyString(payload.cropItemId);
    case 'PickupPet': {
      const p = payload as PickupPetPayload;
      return isNonEmptyString(p.petId);
    }
    case 'StorePet':
    case 'SellPet':
      return isNonEmptyString(payload.itemId);
    case 'PlacePet': {
      const p = payload as PlacePetPayload;
      return (
        isNonEmptyString(p.itemId) &&
        !!p.position &&
        isFiniteNumber(p.position.x) &&
        isFiniteNumber(p.position.y) &&
        isNonEmptyString(p.tileType) &&
        isFiniteNumber(p.localTileIndex)
      );
    }
    case 'PlayerPosition': {
      const p = payload as PlayerPositionPayload;
      return !!p.position && isFiniteNumber(p.position.x) && isFiniteNumber(p.position.y);
    }
    case 'RetrieveItemFromStorage': {
      const p = payload as RetrievePayload;
      const hasIndex = p.toInventoryIndex == null || isFiniteNumber(p.toInventoryIndex);
      return isNonEmptyString(p.itemId) && isNonEmptyString(p.storageId) && hasIndex;
    }
    case 'PutItemInStorage': {
      const p = payload as PutInStoragePayload;
      const hasIndex = p.toStorageIndex == null || isFiniteNumber(p.toStorageIndex);
      return isNonEmptyString(p.itemId) && isNonEmptyString(p.storageId) && hasIndex;
    }
    case 'SwapPet': {
      const p = payload as SwapPayload;
      return isNonEmptyString(p.petSlotId) && isNonEmptyString(p.petInventoryId);
    }
    default:
      return false;
  }
}

function getThrottleKey(type: RoomActionType, payload: Record<string, unknown>): string {
  switch (type) {
    case 'ToggleLockItem':
    case 'ToggleFavoriteItem':
    case 'StorePet':
    case 'SellPet':
    case 'RetrieveItemFromStorage':
    case 'PutItemInStorage':
      return `${type}:${String(payload.itemId ?? '')}`;
    case 'PickupPet':
      return `${type}:${String(payload.petId ?? '')}`;
    case 'FeedPet':
      return `${type}:${String(payload.petItemId ?? '')}:${String(payload.cropItemId ?? '')}`;
    case 'PlacePet':
      return `${type}:${String(payload.itemId ?? '')}`;
    case 'PlayerPosition':
      return type;
    case 'SwapPet':
      return `${type}:${String(payload.petSlotId ?? '')}:${String(payload.petInventoryId ?? '')}`;
    default:
      return type;
  }
}

export function sendRoomAction(
  type: RoomActionType,
  payload: Record<string, unknown>,
  options?: { throttleMs?: number; skipThrottle?: boolean },
): WebSocketSendResult {
  if (!validatePayload(type, payload)) {
    return { ok: false, reason: 'invalid_payload' };
  }

  const connection = getRoomConnection();
  if (!connection) {
    return { ok: false, reason: 'no_connection' };
  }

  const throttleMs = Math.max(0, Math.floor(options?.throttleMs ?? DEFAULT_THROTTLE_MS));
  if (!options?.skipThrottle && throttleMs > 0) {
    const key = getThrottleKey(type, payload);
    const now = Date.now();
    const prev = lastSentAt.get(key) ?? 0;
    if (now - prev < throttleMs) {
      return { ok: false, reason: 'throttled' };
    }
    lastSentAt.set(key, now);
  }

  try {
    connection.sendMessage({
      scopePath: getScopePath(),
      type,
      ...payload,
    });
    return { ok: true };
  } catch {
    return { ok: false, reason: 'send_failed' };
  }
}
