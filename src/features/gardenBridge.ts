// src/features/gardenBridge.ts
import { ensureJotaiStore, getAtomByLabel, readAtomValue, subscribeAtom } from '../core/jotaiBridge';
import { shareGlobal, readSharedGlobal } from '../core/pageContext';
import { log } from '../utils/logger';

const MY_DATA_ATOM_LABEL = 'myDataAtom';
const GLOBAL_CACHE_KEY = '__qpmGardenSnapshot__';

export interface GardenState {
  tileObjects?: Record<string, unknown>;
  boardwalkTileObjects?: Record<string, unknown>;
  [key: string]: unknown;
}

export type GardenSnapshot = GardenState | null;

let initialized = false;
let cachedGarden: GardenSnapshot = readSharedGlobal<GardenSnapshot>(GLOBAL_CACHE_KEY) ?? null;
let unsubscribe: (() => void) | null = null;
const listeners = new Set<(state: GardenSnapshot) => void>();
let retryTimer: number | null = null;

const RETRY_DELAY_MS = 1500;

function notifyListeners() {
  shareGlobal(GLOBAL_CACHE_KEY, cachedGarden);
  for (const listener of listeners) {
    try {
      listener(cachedGarden);
    } catch (error) {
      log('⚠️ Garden listener error', error);
    }
  }
}

function updateCache(next: GardenSnapshot) {
  if (cachedGarden === next) return;
  cachedGarden = next;
  notifyListeners();
}

function extractGarden(value: Record<string, unknown> | null | undefined): GardenSnapshot {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const garden = (value as Record<string, unknown>).garden;
  return (garden as GardenState | null | undefined) ?? null;
}

async function resolveGardenSnapshot(): Promise<GardenSnapshot> {
  const myDataAtom = getAtomByLabel(MY_DATA_ATOM_LABEL);
  if (!myDataAtom) {
    throw new Error('Unable to locate myDataAtom in jotaiAtomCache');
  }

  const myData = await readAtomValue<Record<string, unknown> | null>(myDataAtom).catch((error) => {
    log('⚠️ Failed to read myDataAtom', error);
    return null;
  });
  return extractGarden(myData ?? undefined);
}

export async function startGardenBridge(): Promise<void> {
  if (initialized) return;
  initialized = true;

  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }

  try {
    await ensureJotaiStore();
  } catch (error) {
    log('⚠️ Jotai store unavailable, garden bridge deferred', error);
    initialized = false;
    if (!retryTimer) {
      retryTimer = window.setTimeout(() => {
        retryTimer = null;
        void startGardenBridge();
      }, RETRY_DELAY_MS);
    }
    return;
  }

  try {
    const initial = await resolveGardenSnapshot();
    updateCache(initial);
  } catch (error) {
    log('⚠️ Unable to prime garden snapshot', error);
    if (!retryTimer) {
      retryTimer = window.setTimeout(() => {
        retryTimer = null;
        initialized = false;
        void startGardenBridge();
      }, RETRY_DELAY_MS);
    }
  }

  const myDataAtom = getAtomByLabel(MY_DATA_ATOM_LABEL);
  if (!myDataAtom) {
    log('⚠️ myDataAtom missing after initialization');
    initialized = false;
    if (!retryTimer) {
      retryTimer = window.setTimeout(() => {
        retryTimer = null;
        void startGardenBridge();
      }, RETRY_DELAY_MS);
    }
    return;
  }

  unsubscribe = await subscribeAtom<Record<string, unknown> | null>(myDataAtom, (value) => {
    updateCache(extractGarden(value ?? undefined));
  });
}

export function stopGardenBridge(): void {
  unsubscribe?.();
  unsubscribe = null;
  initialized = false;
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
}

export function getGardenSnapshot(): GardenSnapshot {
  return cachedGarden;
}

export function onGardenSnapshot(cb: (state: GardenSnapshot) => void, fireImmediately = true): () => void {
  listeners.add(cb);
  if (fireImmediately) {
    try {
      cb(cachedGarden);
    } catch (error) {
      log('⚠️ Garden listener immediate call failed', error);
    }
  }
  return () => {
    listeners.delete(cb);
  };
}

export function isGardenBridgeReady(): boolean {
  return initialized && !!unsubscribe;
}
