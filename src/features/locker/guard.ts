// src/features/locker/guard.ts
// Native sendMessage hook + preflight function for the Locker.

import { pageWindow } from '../../core/pageContext';
import { notify } from '../../core/notifications';
import { getInventoryItems } from '../../store/inventory';
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

function getInventorySnapshot(): InventorySnapshot {
  const items = getInventoryItems();
  return { itemCount: items.length, capacity: GAME_INVENTORY_CAP };
}

// ── Tile context resolution ────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Resolve a slot number from a native WS message to tile context.
 *
 * Garden data layout:
 *   tileObjects:          Record<slot, { objectType, eggId?, slots?[{ species }] }>
 *   boardwalkTileObjects: Record<slot, { objectType, eggId?, slots?[{ species }] }>
 */
function resolveTileContext(slot: unknown): TileContext | undefined {
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

  if (Array.isArray(tile.slots) && isRecord(tile.slots[0])) {
    const raw = tile.slots[0].species;
    if (typeof raw === 'string' && raw.length > 0) species = raw;

    // Extract mutations from slot — can be string[], Record<string, unknown>, or nested
    const slotMutations = tile.slots[0].mutations;
    if (slotMutations) {
      const collected: string[] = [];
      if (Array.isArray(slotMutations)) {
        for (const m of slotMutations) {
          if (typeof m === 'string' && m.length > 0) collected.push(m);
        }
      } else if (isRecord(slotMutations)) {
        for (const k of Object.keys(slotMutations)) {
          if (k.length > 0) collected.push(k);
        }
      }
      if (collected.length > 0) mutations = collected;
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

  const tile = resolveTileContext(payload.slot);
  const result = evaluateAction(actionType, payload, config, getInventorySnapshot(), tile);
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
