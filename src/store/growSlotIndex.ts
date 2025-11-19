// src/store/growSlotIndex.ts
// Track the currently selected grow slot by subscribing to the game's jotai atom.

import {
  ensureJotaiStore,
  findAtomsByLabel,
  getAtomByLabel,
  readAtomValue,
  subscribeAtom,
} from '../core/jotaiBridge';
import { pageWindow } from '../core/pageContext';
import { log } from '../utils/logger';

const SLOT_INDEX_ATOM_LABEL = 'myCurrentGrowSlotIndexAtom';
const SLOT_INDEX_REGEX = /myCurrentGrowSlotIndex/i;
const RETRY_DELAY_MS = 2500;

let initialized = false;
let initializing = false;
let slotIndex: number | null = null;
let unsubscribe: (() => void) | null = null;
let retryHandle: number | null = null;

const listeners = new Set<(index: number | null) => void>();

function normalizeSlotIndex(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return Math.max(0, Math.trunc(value));
}

function notify(index: number | null): void {
  for (const listener of listeners) {
    try {
      listener(index);
    } catch (error) {
      log('⚠️ Grow slot index listener error', error);
    }
  }
}

function publish(index: number | null): void {
  const normalized = normalizeSlotIndex(index);
  if (slotIndex === normalized) {
    return;
  }
  slotIndex = normalized;

  try {
    (pageWindow as Window & { __qpmCurrentGrowSlotIndex?: number | null }).__qpmCurrentGrowSlotIndex = normalized;
    if (typeof window !== 'undefined') {
      (window as Window & { __qpmCurrentGrowSlotIndex?: number | null }).__qpmCurrentGrowSlotIndex = normalized;
    }
  } catch {}

  notify(slotIndex);
}

async function locateSlotIndexAtom(): Promise<any | null> {
  let atom = getAtomByLabel(SLOT_INDEX_ATOM_LABEL);
  if (atom) {
    return atom;
  }

  const candidates = findAtomsByLabel(SLOT_INDEX_REGEX);
  return candidates[0] ?? null;
}

async function beginSubscription(): Promise<void> {
  try {
    await ensureJotaiStore();
  } catch (error) {
    log('⚠️ Grow slot index tracker: jotai store unavailable', error);
    throw error;
  }

  const atom = await locateSlotIndexAtom();
  if (!atom) {
    throw new Error('myCurrentGrowSlotIndexAtom not found');
  }

  try {
    const initial = await readAtomValue<number | null>(atom).catch(() => null);
    publish(initial);
  } catch (error) {
    log('⚠️ Grow slot index tracker: failed to read initial value', error);
  }

  unsubscribe = await subscribeAtom<number | null>(atom, (value) => {
    publish(value);
  });
}

function scheduleRetry(): void {
  if (retryHandle != null) {
    return;
  }
  if (typeof window === 'undefined') {
    return;
  }
  retryHandle = window.setTimeout(() => {
    retryHandle = null;
    initializing = false;
    void startGrowSlotIndexTracker();
  }, RETRY_DELAY_MS);
}

export async function startGrowSlotIndexTracker(): Promise<void> {
  if (initialized || initializing) {
    return;
  }
  initializing = true;

  try {
    await beginSubscription();
    initialized = true;
  } catch (error) {
    log('⚠️ Grow slot index tracker initialization failed', error);
    scheduleRetry();
    return;
  } finally {
    initializing = false;
  }
}

export function stopGrowSlotIndexTracker(): void {
  if (retryHandle != null) {
    clearTimeout(retryHandle);
    retryHandle = null;
  }
  unsubscribe?.();
  unsubscribe = null;
  initialized = false;
}

export function onGrowSlotIndex(listener: (index: number | null) => void, fireImmediately = true): () => void {
  listeners.add(listener);
  if (fireImmediately) {
    try {
      listener(slotIndex);
    } catch (error) {
      log('⚠️ Grow slot index immediate listener error', error);
    }
  }
  return () => {
    listeners.delete(listener);
  };
}

export function getGrowSlotIndex(): number | null {
  return slotIndex;
}

export function isGrowSlotIndexTrackerReady(): boolean {
  return initialized;
}
