// src/features/xpPotion.ts — XP Potion feature (inventory check, eligibility, WS send, ghost-step)

import { getInventoryItems, onInventoryChange } from '../store/inventory';
import { calculateMaxStrength } from '../store/xpTracker';
import { sendRoomAction, type WebSocketSendResult } from '../websocket/api';
import { getAtomByLabel, readAtomValue } from '../core/jotaiBridge';
import type { ActivePetInfo } from '../store/pets';

// ---------------------------------------------------------------------------
// Position resolution (for ghost-step XP Potion)
// ---------------------------------------------------------------------------

interface XY { x: number; y: number }

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object';
}

function asXY(v: unknown): XY | null {
  if (!isRecord(v)) return null;
  const x = v.x, y = v.y;
  if (typeof x !== 'number' || !Number.isFinite(x)) return null;
  if (typeof y !== 'number' || !Number.isFinite(y)) return null;
  return { x: Math.round(x), y: Math.round(y) };
}

/**
 * Compute a pet's current grid tile from its motion state.
 * Simplified port of the game's `petTileAt(motion, nowMs)`.
 */
function petTileFromMotion(motion: unknown): XY | null {
  if (!isRecord(motion)) return null;

  if (motion.kind === 'idle') {
    return asXY(motion.at);
  }

  if (motion.kind === 'walking') {
    const path = motion.path as unknown[];
    const stepMs = motion.stepDurationMs as number;
    const startMs = motion.startedAtMs as number;
    if (!Array.isArray(path) || !path.length || typeof stepMs !== 'number' || typeof startMs !== 'number') return null;

    const elapsed = Math.max(0, Date.now() - startMs);
    const stepIdx = Math.min(Math.floor(elapsed / stepMs), path.length - 1);
    return asXY(path[stepIdx]);
  }

  return null;
}

/**
 * Read the player's current grid position from `playerAtom`.
 */
async function getPlayerPosition(): Promise<XY | null> {
  const atom = getAtomByLabel('playerAtom');
  if (!atom) return null;
  const player = await readAtomValue<unknown>(atom).catch(() => null);
  if (!isRecord(player)) return null;

  for (const key of ['position', 'coords', 'playerPosition', 'location'] as const) {
    const pos = asXY(player[key]);
    if (pos) return pos;
  }
  return null;
}

/**
 * Read a pet's current grid position from `stateAtom → child.data.userSlots → petSlotInfos`.
 */
async function getPetPosition(petSlotId: string): Promise<XY | null> {
  const atom = getAtomByLabel('stateAtom');
  if (!atom) return null;
  const state = await readAtomValue<unknown>(atom).catch(() => null);
  if (!isRecord(state)) return null;

  const child = state.child;
  if (!isRecord(child)) return null;
  const data = child.data;
  if (!isRecord(data)) return null;
  const userSlots = data.userSlots;
  if (!Array.isArray(userSlots)) return null;

  for (const slot of userSlots) {
    if (!isRecord(slot)) continue;
    const infos = slot.petSlotInfos;
    if (!isRecord(infos)) continue;
    const info = infos[petSlotId];
    if (!isRecord(info)) continue;
    const pos = petTileFromMotion(info.motion);
    if (pos) return pos;
  }
  return null;
}

/**
 * Get the current number of XP potions in the player's inventory.
 * Looks for items where `raw.toolId === 'XPPotion'`.
 */
export function getXpPotionCount(): number {
  const items = getInventoryItems();
  for (const item of items) {
    const raw = item.raw as Record<string, unknown> | null;
    if (raw && raw.toolId === 'XPPotion') {
      return item.quantity ?? item.count ?? item.amount ?? 1;
    }
  }
  return 0;
}

/**
 * Subscribe to XP potion count changes. Calls `cb` only when the count
 * actually differs from the previous value. Returns an unsubscribe function.
 */
export function onXpPotionCountChange(cb: (count: number) => void): () => void {
  let lastCount = getXpPotionCount();

  return onInventoryChange(() => {
    const current = getXpPotionCount();
    if (current !== lastCount) {
      lastCount = current;
      cb(current);
    }
  });
}

/**
 * Check whether a pet is eligible to receive an XP potion.
 * Returns true when the pet has the required fields and is not yet at max strength.
 */
export function isPetEligibleForXpPotion(pet: ActivePetInfo): boolean {
  if (!pet.slotId) return false;
  if (!pet.species || pet.targetScale == null || pet.strength == null) return false;

  const maxStr = calculateMaxStrength(pet.targetScale, pet.species);
  if (maxStr == null) return false;

  return pet.strength < maxStr;
}

/** Fixed XP granted per potion use (from game toolsDex). */
export const XP_POTION_AMOUNT = 20_000;

export interface XpPotionProjection {
  newXp: number;
  newStrength: number;
  levelsGained: number;
  reachesMax: boolean;
  /** XP progress within the new level (0 … xpPerLevel). */
  xpIntoLevel: number;
  /** Fraction 0–1 of the new level completed. */
  pctOfLevel: number;
}

/**
 * Project the result of using an XP potion on a pet.
 *
 * Works with deltas from the current state rather than absolute XP→strength
 * conversion, because the game's strength formula includes a species-specific
 * starting offset that QPM doesn't replicate. Each `xpPerLevel` of XP equals
 * one strength point.
 */
export function projectXpPotion(
  currentXp: number,
  currentStrength: number,
  xpPerLevel: number,
  maxStrength: number,
): XpPotionProjection {
  const xpInCurrentLevel = currentXp % xpPerLevel;
  const totalFromLevelStart = xpInCurrentLevel + XP_POTION_AMOUNT;
  const additionalLevels = Math.floor(totalFromLevelStart / xpPerLevel);
  const cappedStrength = Math.min(currentStrength + additionalLevels, maxStrength);
  const levelsGained = cappedStrength - currentStrength;
  const reachesMax = cappedStrength >= maxStrength;

  const xpIntoLevel = reachesMax ? xpPerLevel : totalFromLevelStart % xpPerLevel;
  const pctOfLevel = reachesMax ? 100 : (xpIntoLevel / xpPerLevel) * 100;

  return {
    newXp: currentXp + XP_POTION_AMOUNT,
    newStrength: cappedStrength,
    levelsGained,
    reachesMax,
    xpIntoLevel,
    pctOfLevel,
  };
}

/**
 * Send the XPPotion room action for a given pet slot ID.
 *
 * The server requires the player to be on the same tile as the pet.
 * This function automatically ghost-steps (sends a temporary PlayerPosition
 * to the pet's tile, fires XPPotion, then moves back) so the user doesn't
 * have to walk there manually. If positions can't be resolved, it sends
 * the action directly (the server will reject if not on the same tile).
 */
export async function sendUseXpPotion(petSlotId: string): Promise<WebSocketSendResult> {
  const [playerPos, petPos] = await Promise.all([
    getPlayerPosition(),
    getPetPosition(petSlotId),
  ]);

  const onSameTile = playerPos && petPos &&
    playerPos.x === petPos.x && playerPos.y === petPos.y;

  // Ghost-step: teleport to pet's tile before sending XPPotion
  if (petPos && !onSameTile) {
    sendRoomAction('PlayerPosition', { position: petPos }, { skipThrottle: true });
  }

  const result = sendRoomAction('XPPotion', { petItemId: petSlotId }, { throttleMs: 200 });

  // Step back to original position
  if (petPos && !onSameTile && playerPos) {
    sendRoomAction('PlayerPosition', { position: playerPos }, { skipThrottle: true });
  }

  return result;
}
