// src/features/locker/guard.ts
// Native sendMessage hook + preflight function for the Locker.

import { pageWindow } from '../../core/pageContext';
import { notify } from '../../core/notifications';
import { getInventoryItems, type InventoryItem } from '../../store/inventory';
import { getGardenSnapshot } from '../gardenBridge';
import { getLockerConfig } from './state';
import { evaluateAction, type InventorySnapshot, type TileContext } from './rules';
import { criticalInterval } from '../../utils/timerManager';

// ── Types ──────────────────────────────────────────────────────────────────

interface RoomConnectionLike {
  sendMessage: (payload: unknown) => unknown;
}

interface PageWindowWithRoomConnection extends Window {
  MagicCircle_RoomConnection?: RoomConnectionLike;
}

// ── Notification throttle ──────────────────────────────────────────────────

const NOTIFY_COOLDOWN_MS = 3000;
const lastNotifyAt = new Map<string, number>();

function throttledNotify(rule: string, reason: string): void {
  const now = Date.now();
  const prev = lastNotifyAt.get(rule) ?? 0;
  if (now - prev < NOTIFY_COOLDOWN_MS) return;
  lastNotifyAt.set(rule, now);
  notify({ feature: 'Locker', level: 'warn', message: reason });
}

// ── Inventory snapshot ─────────────────────────────────────────────────────

const GAME_INVENTORY_CAP = 100;

const PURCHASE_FIELD_MAP: Record<string, string> = {
  PurchaseSeed:  'species',
  PurchaseEgg:   'eggId',
  PurchaseTool:  'toolId',
  PurchaseDecor: 'decorId',
};

/**
 * Check whether a purchase will stack into an existing inventory slot rather
 * than consuming a new one.  Seeds/eggs/tools/decor stack when the player
 * already owns items of the same type, so the inventory reserve check should
 * not block them.
 */
function checkPurchaseWillStack(
  items: InventoryItem[],
  actionType: string,
  payload: Record<string, unknown>,
): boolean {
  const field = PURCHASE_FIELD_MAP[actionType];
  if (!field) return false;

  const value = payload[field];
  if (typeof value !== 'string' || value.length === 0) return false;

  return items.some((item) => {
    if (!item.raw || typeof item.raw !== 'object') return false;
    return (item.raw as Record<string, unknown>)[field] === value;
  });
}

function getInventorySnapshot(
  actionType?: string,
  payload?: Record<string, unknown>,
): InventorySnapshot {
  const items = getInventoryItems();
  const snapshot: InventorySnapshot = { itemCount: items.length, capacity: GAME_INVENTORY_CAP };
  if (actionType && payload && actionType in PURCHASE_FIELD_MAP) {
    snapshot.purchaseWillStack = checkPurchaseWillStack(items, actionType, payload);
  }
  return snapshot;
}

// ── Tile context resolution ────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Extract mutations from a single grow slot record.
 * Handles both string[] and Record<string, unknown> formats.
 */
function extractSlotMutations(slotRecord: Record<string, unknown>): string[] | undefined {
  const raw = slotRecord.mutations;
  if (!raw) return undefined;

  const collected: string[] = [];
  if (Array.isArray(raw)) {
    for (const m of raw) {
      if (typeof m === 'string' && m.length > 0) collected.push(m);
    }
  } else if (isRecord(raw)) {
    for (const k of Object.keys(raw)) {
      if (k.length > 0) collected.push(k);
    }
  }
  return collected.length > 0 ? collected : undefined;
}

/**
 * Resolve a slot number from a native WS message to tile context.
 *
 * Garden data layout:
 *   tileObjects:          Record<slot, { objectType, eggId?, slots?[{ species, mutations, slotId }] }>
 *   boardwalkTileObjects: Record<slot, { objectType, eggId?, slots?[{ species, mutations, slotId }] }>
 *
 * For HarvestCrop, `slotsIndex` identifies the specific grow slot being
 * harvested (matches GrowSlot.slotId). Mutations are read from that slot
 * so that per-mutation rules apply to the targeted fruit, not slot 0.
 */
function resolveTileContext(slot: unknown, slotsIndex?: unknown): TileContext | undefined {
  if (typeof slot !== 'number' || !Number.isFinite(slot)) return undefined;

  const garden = getGardenSnapshot();
  if (!garden) return undefined;

  const key = String(slot);
  const tile =
    (garden.tileObjects as Record<string, unknown> | undefined)?.[key]
    ?? (garden.boardwalkTileObjects as Record<string, unknown> | undefined)?.[key];

  if (!isRecord(tile)) return undefined;

  const objectType = typeof tile.objectType === 'string' ? tile.objectType : undefined;
  const eggId = typeof tile.eggId === 'string' ? tile.eggId : undefined;

  let species: string | undefined;
  let mutations: string[] | undefined;
  let decorId: string | undefined;

  if (Array.isArray(tile.slots) && tile.slots.length > 0) {
    // Species is the same across all slots on a plant — read from first.
    const firstSlot = tile.slots[0];
    if (isRecord(firstSlot)) {
      const raw = firstSlot.species;
      if (typeof raw === 'string' && raw.length > 0) species = raw;
    }

    // Mutations are per-slot. When slotsIndex is provided (HarvestCrop),
    // resolve from the targeted slot so the guard evaluates the correct fruit.
    let targetSlot: Record<string, unknown> | undefined;
    if (typeof slotsIndex === 'number' && Number.isFinite(slotsIndex)) {
      for (const s of tile.slots) {
        if (isRecord(s) && s.slotId === slotsIndex) {
          targetSlot = s;
          break;
        }
      }
    }
    // Fall back to first slot when no specific slot was requested or found.
    if (!targetSlot && isRecord(firstSlot)) {
      targetSlot = firstSlot;
    }
    if (targetSlot) {
      mutations = extractSlotMutations(targetSlot);
    }
  }

  // For decor tiles, the objectType itself is the decor ID
  if (objectType && objectType !== 'plant' && objectType !== 'egg') {
    decorId = objectType;
  }

  return { objectType, species, eggId, decorId, mutations };
}

// ── Core evaluate helper ───────────────────────────────────────────────────

function evaluate(
  actionType: string,
  payload: Record<string, unknown>,
): { blocked: boolean; rule?: string; reason?: string } {
  const config = getLockerConfig();
  if (!config.enabled) return { blocked: false };

  const tile = resolveTileContext(payload.slot, payload.slotsIndex);
  const result = evaluateAction(actionType, payload, config, getInventorySnapshot(actionType, payload), tile);
  return result;
}

// ── Preflight (for sendRoomAction) ─────────────────────────────────────────

export function lockerPreflight(
  type: string,
  payload: Record<string, unknown>,
): { ok: boolean; reason?: string } {
  const result = evaluate(type, payload);
  if (!result.blocked) return { ok: true };

  if (result.rule && result.reason) {
    throttledNotify(result.rule, result.reason);
  }
  return { ok: false, reason: result.reason };
}

// ── Native sendMessage hook ────────────────────────────────────────────────

const RECONNECT_POLL_MS = 2000;
let patchedConnection: RoomConnectionLike | null = null;
let originalSendMessage: ((payload: unknown) => unknown) | null = null;
let stopReconnectTimer: (() => void) | null = null;

function restoreNativePatch(): void {
  if (!patchedConnection || !originalSendMessage) return;
  try {
    patchedConnection.sendMessage = originalSendMessage;
  } catch { /* noop */ }
  patchedConnection = null;
  originalSendMessage = null;
}

function ensureNativeHookPatched(): void {
  const room = (pageWindow as PageWindowWithRoomConnection).MagicCircle_RoomConnection;
  if (!room || typeof room.sendMessage !== 'function') return;
  if (patchedConnection === room) return;

  restoreNativePatch();

  const original = room.sendMessage.bind(room);
  const wrapped = (payload: unknown): unknown => {
    if (payload && typeof payload === 'object') {
      const rec = payload as Record<string, unknown>;
      const actionType = typeof rec.type === 'string' ? rec.type : null;
      if (actionType) {
        const result = evaluate(actionType, rec);
        if (result.blocked) {
          if (result.rule && result.reason) {
            throttledNotify(result.rule, result.reason);
          }
          return undefined;
        }
      }
    }
    return original(payload);
  };

  try {
    room.sendMessage = wrapped;
    patchedConnection = room;
    originalSendMessage = original;
  } catch {
    patchedConnection = null;
    originalSendMessage = null;
  }
}

// ── Public lifecycle ───────────────────────────────────────────────────────

export function startNativeHook(): void {
  ensureNativeHookPatched();
  if (stopReconnectTimer) return;
  stopReconnectTimer = criticalInterval('locker-reconnect', ensureNativeHookPatched, RECONNECT_POLL_MS);
}

export function stopNativeHook(): void {
  if (stopReconnectTimer) {
    stopReconnectTimer();
    stopReconnectTimer = null;
  }
  restoreNativePatch();
  lastNotifyAt.clear();
}
