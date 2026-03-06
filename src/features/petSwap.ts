import { pageWindow } from '../core/pageContext';
import { getAtomByLabel, readAtomValue } from '../core/jotaiBridge';
import { getActivePetInfos } from '../store/pets';
import { log } from '../utils/logger';
import { delay } from '../utils/scheduling';

export type SwapPetFailureReason =
  | 'missing_connection'
  | 'missing_ids'
  | 'retrieve_failed_or_inventory_full'
  | 'swap_failed_or_timeout';

export interface SwapPetIntoActiveSlotArgs {
  source: 'inventory' | 'hutch';
  itemId: string;
  targetSlotId: string;
  storageId?: string | null;
}

export interface SwapPetIntoActiveSlotResult {
  ok: boolean;
  reason?: SwapPetFailureReason;
}

interface RoomConnection {
  sendMessage: (payload: unknown) => void;
}

interface SwapPageWindow extends Window {
  MagicCircle_RoomConnection?: RoomConnection;
  __mga_lastScopePath?: string[];
}

const INVENTORY_ATOM_LABEL = 'myInventoryAtom';
const HUTCH_RETRIEVE_TIMEOUT_MS = 3500;
const SWAP_TIMEOUT_MS = 2500;
const POLL_INTERVAL_MS = 100;
const DEFAULT_STORAGE_ID = 'PetHutch';

function normalizeId(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function getRoomConnection(): RoomConnection | null {
  const global = pageWindow as SwapPageWindow;
  return global.MagicCircle_RoomConnection ?? null;
}

function getScopePath(): string[] {
  const global = pageWindow as SwapPageWindow;
  return global.__mga_lastScopePath?.slice() ?? ['Room', 'Quinoa'];
}

function sendAction(type: string, payload: Record<string, unknown>): boolean {
  const connection = getRoomConnection();
  if (!connection) {
    return false;
  }

  try {
    connection.sendMessage({
      scopePath: getScopePath(),
      type,
      ...payload,
    });
    return true;
  } catch (error) {
    log('⚠️ petSwap send failed', { type, payload, error });
    return false;
  }
}

function extractInventoryItems(raw: unknown): unknown[] {
  if (Array.isArray(raw)) {
    return raw;
  }
  if (raw && typeof raw === 'object') {
    const record = raw as Record<string, unknown>;
    if (Array.isArray(record.items)) {
      return record.items;
    }
  }
  return [];
}

function extractCandidateIds(entry: Record<string, unknown>): string[] {
  const nestedPet = entry.pet && typeof entry.pet === 'object'
    ? (entry.pet as Record<string, unknown>)
    : null;
  const nestedRaw = entry.raw && typeof entry.raw === 'object'
    ? (entry.raw as Record<string, unknown>)
    : null;

  const candidates = [
    normalizeId(entry.id),
    normalizeId(entry.itemId),
    normalizeId(entry.petId),
    normalizeId(entry.slotId),
    normalizeId(nestedPet?.id),
    normalizeId(nestedPet?.itemId),
    normalizeId(nestedPet?.petId),
    normalizeId(nestedRaw?.id),
    normalizeId(nestedRaw?.itemId),
    normalizeId(nestedRaw?.petId),
  ];

  return candidates.filter((value): value is string => Boolean(value));
}

async function readInventoryIdSet(): Promise<Set<string>> {
  const result = new Set<string>();
  const atom = getAtomByLabel(INVENTORY_ATOM_LABEL);
  if (!atom) {
    return result;
  }

  try {
    const raw = await readAtomValue(atom);
    const items = extractInventoryItems(raw);
    for (const item of items) {
      if (!item || typeof item !== 'object') {
        continue;
      }
      extractCandidateIds(item as Record<string, unknown>).forEach((id) => result.add(id));
    }
  } catch (error) {
    log('⚠️ petSwap inventory read failed', error);
  }

  return result;
}

async function waitForInventoryContains(itemId: string, timeoutMs: number): Promise<boolean> {
  const expected = normalizeId(itemId);
  if (!expected) {
    return false;
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    const inventoryIds = await readInventoryIdSet();
    if (inventoryIds.has(expected)) {
      return true;
    }
    await delay(POLL_INTERVAL_MS);
  }

  return false;
}

async function waitForSwapApplied(targetSlotId: string, itemId: string, timeoutMs: number): Promise<boolean> {
  const expectedTargetSlotId = normalizeId(targetSlotId);
  const expectedItemId = normalizeId(itemId);
  if (!expectedTargetSlotId || !expectedItemId) {
    return false;
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    const activePets = getActivePetInfos();
    const targetSlotPet = activePets.find((pet) => (
      normalizeId(pet.slotId) === expectedTargetSlotId ||
      normalizeId(pet.petId) === expectedTargetSlotId
    ));

    if (targetSlotPet) {
      const activePetId = normalizeId(targetSlotPet.petId);
      const activeSlotId = normalizeId(targetSlotPet.slotId);
      if (activePetId === expectedItemId || activeSlotId === expectedItemId) {
        return true;
      }
    }

    await delay(POLL_INTERVAL_MS);
  }

  return false;
}

export async function swapPetIntoActiveSlot(args: SwapPetIntoActiveSlotArgs): Promise<SwapPetIntoActiveSlotResult> {
  const itemId = normalizeId(args.itemId);
  const targetSlotId = normalizeId(args.targetSlotId);

  if (!itemId || !targetSlotId) {
    return { ok: false, reason: 'missing_ids' };
  }

  if (!getRoomConnection()) {
    return { ok: false, reason: 'missing_connection' };
  }

  if (args.source === 'hutch') {
    const storageId = normalizeId(args.storageId) ?? DEFAULT_STORAGE_ID;
    const retrieveSent = sendAction('RetrieveItemFromStorage', {
      itemId,
      storageId,
    });

    if (!retrieveSent) {
      return { ok: false, reason: 'retrieve_failed_or_inventory_full' };
    }

    const retrieved = await waitForInventoryContains(itemId, HUTCH_RETRIEVE_TIMEOUT_MS);
    if (!retrieved) {
      return { ok: false, reason: 'retrieve_failed_or_inventory_full' };
    }
  }

  const swapSent = sendAction('SwapPet', {
    petSlotId: targetSlotId,
    petInventoryId: itemId,
  });

  if (!swapSent) {
    return { ok: false, reason: 'swap_failed_or_timeout' };
  }

  const applied = await waitForSwapApplied(targetSlotId, itemId, SWAP_TIMEOUT_MS);
  if (!applied) {
    return { ok: false, reason: 'swap_failed_or_timeout' };
  }

  return { ok: true };
}
